"""Document Studio: browser editing, structured export, optional server-side LLM."""
import json
import os
import secrets
import ssl
import tempfile
from pathlib import Path
from threading import BoundedSemaphore
from typing import Annotated, Literal
from urllib.request import Request as URLRequest, urlopen
from urllib.error import URLError

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator
from generate import render

if os.environ.get('APP_REQUIRE_AUTH')=='1' and not os.environ.get('APP_ACCESS_TOKEN'):
    raise RuntimeError('APP_REQUIRE_AUTH=1 requires APP_ACCESS_TOKEN')

ROOT = Path(__file__).parent
app = FastAPI(title='문서공방', docs_url=None, redoc_url=None)
allowed_origins=[s.strip().rstrip('/') for s in os.environ.get('STUDIO_ALLOWED_ORIGINS','').split(',') if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_methods=['GET','POST'], allow_headers=['Authorization','Content-Type'])
@app.get('/assets/config.js')
def backend_frontend_config():
    # The FastAPI deployment uses server export; static builds use local export.
    return Response("window.STUDIO_API_BASE = ''; window.STUDIO_LOCAL_EXPORT = false;",media_type='application/javascript')

app.mount('/assets', StaticFiles(directory=ROOT/'web'), name='assets')
slots = BoundedSemaphore(2)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Settings(StrictModel):
    font_main: Annotated[str, Field(min_length=1,max_length=60)] = '나눔명조'
    font_note: Annotated[str, Field(min_length=1,max_length=60)] = '나눔고딕'
    font_size: Annotated[int,Field(ge=10,le=24)] = 16
    note_size: Annotated[int,Field(ge=8,le=20)] = 14
    line_spacing: Annotated[int,Field(ge=100,le=220)] = 160
    letter_spacing: Annotated[int,Field(ge=-5,le=5)] = 0
    margin_x: Annotated[int,Field(ge=10,le=35)] = 20
    margin_y: Annotated[int,Field(ge=10,le=35)] = 10
    gap_scale: Annotated[float,Field(ge=0.25,le=2)] = 1


class Point(StrictModel):
    label: Annotated[str,Field(min_length=1,max_length=12)]
    value: Annotated[float,Field(ge=0,le=1e9)]


class Block(StrictModel):
    type: Literal['paragraph','table','chart'] = 'paragraph'
    bullet: Literal['□','○','-','*'] = '○'
    summary: Annotated[str,Field(max_length=150)] = ''
    body: Annotated[str,Field(max_length=2500)] = ''
    page_break_before: bool = False
    headers: Annotated[list[Annotated[str,Field(max_length=100)]],Field(max_length=6)] = []
    rows: Annotated[list[list[Annotated[str,Field(max_length=300)]]],Field(max_length=12)] = []
    title: Annotated[str,Field(max_length=100)] = ''
    unit: Annotated[str,Field(max_length=60)] = ''
    points: Annotated[list[Point],Field(max_length=10)] = []

    @model_validator(mode='after')
    def check_structure(self):
        if self.type=='table' and (not self.headers or not self.rows or any(len(r)!=len(self.headers) for r in self.rows)):
            raise ValueError('표는 머리글과 각 행의 열 수가 같아야 합니다.')
        if self.type=='chart' and not self.points:
            raise ValueError('차트에 값이 필요합니다.')
        # Braces mark formatting in paragraphs only. Web data is already filled.
        if self.type=='paragraph' and ('{{' in self.body or '{{' in self.summary):
            raise ValueError('문서의 {{변수}}를 실제 내용으로 채워주세요.')
        return self


class Document(StrictModel):
    title: Annotated[str,Field(min_length=1,max_length=100)] = '업무 보고서'
    settings: Settings = Field(default_factory=Settings)
    blocks: Annotated[list[Block],Field(min_length=1,max_length=40)]


class DraftRequest(StrictModel):
    instruction: Annotated[str,Field(min_length=5,max_length=4000)]


@app.middleware('http')
async def guard(request: Request, call_next):
    if request.url.path.startswith('/api/'):
        token=os.environ.get('APP_ACCESS_TOKEN','')
        supplied=request.headers.get('Authorization','').removeprefix('Bearer ')
        if request.method!='OPTIONS' and token and not secrets.compare_digest(supplied, token):
            return Response('접속 키를 확인해 주세요.',status_code=401)
        origin=request.headers.get('Origin')
        if request.method=='POST' and origin and origin!=str(request.base_url).rstrip('/') and origin not in allowed_origins:
            return Response('다른 사이트의 요청은 허용하지 않습니다.',status_code=403)
        try:
            length=int(request.headers.get('content-length','0'))
        except ValueError:
            return Response(status_code=400)
        if length>250_000:
            return Response('요청이 너무 큽니다.',status_code=413)
        # Enforce the same cap for chunked requests before Pydantic parses JSON.
        if request.method=='POST':
            body=bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body)>250_000:
                    return Response('요청이 너무 큽니다.',status_code=413)
            request._body=bytes(body)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    return response


@app.get('/')
def index():
    return FileResponse(ROOT/'web/index.html')


@app.get('/health')
def health():
    return {'status':'ok'}


@app.get('/api/config')
def config():
    return {'llm_configured':bool(os.environ.get('LLM_API_KEY')), 'model':os.environ.get('LLM_MODEL','gpt-4.1-mini')}


@app.post('/api/export/{format}')
def export(format: Literal['hwp','hwpx'], document: Document):
    if not slots.acquire(blocking=False):
        raise HTTPException(429,'다른 문서를 처리 중입니다. 잠시 후 다시 시도해 주세요.')
    try:
        settings=document.settings.model_dump()
        template={'font_main':settings.pop('font_main'),'font_note':settings.pop('font_note'),
                  'settings':settings,'items':[b.model_dump() for b in document.blocks]}
        with tempfile.TemporaryDirectory() as directory:
            path=render(template,{},Path(directory)/('document.'+format))
            data=path.read_bytes()
        return Response(data,media_type='application/octet-stream',headers={
            'Content-Disposition':f'attachment; filename="document.{format}"'})
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from None
    finally:
        slots.release()


@app.post('/api/draft')
def draft(payload: DraftRequest):
    key=os.environ.get('LLM_API_KEY')
    if not key:
        raise HTTPException(503,'서버에 LLM_API_KEY를 연결하면 문구 생성을 사용할 수 있습니다.')
    if not slots.acquire(blocking=False):
        raise HTTPException(429,'처리 중입니다. 잠시 후 다시 시도해 주세요.')
    try:
        system='''한국어 업무 보고서 초안을 만든다. 사용자 자료에 없는 수치·일정·기관명은 만들지 말고 [확인 필요]라고 쓴다.
JSON 객체만 반환한다: {"blocks":[{"type":"paragraph","bullet":"□","summary":"추진목적","body":"내용"}]}.
8~12개 문단으로 구성하며 bullet은 □, ○, -, * 중 선택한다. 중요 문구는 {굵게}, 부연은 (괄호)로 표시한다.
중괄호를 두 번 겹친 변수는 쓰지 않는다. 표와 차트는 생성하지 않는다. 사실 확인과 최종 승인 전의 초안이다.'''
        body=json.dumps({'model':os.environ.get('LLM_MODEL','gpt-4.1-mini'),
            'messages':[{'role':'system','content':system},{'role':'user','content':payload.instruction}],
            'response_format':{'type':'json_object'},'max_tokens':2400},ensure_ascii=False).encode()
        request=URLRequest('https://api.openai.com/v1/chat/completions',data=body,
            headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
        with urlopen(request,timeout=45,context=ssl.create_default_context()) as response:
            result=json.loads(response.read(100_000))
        result=json.loads(result['choices'][0]['message']['content'])
        document=Document(blocks=result['blocks'])
        if any(b.type!='paragraph' for b in document.blocks):
            raise ValueError('Unexpected block type')
        return {'blocks':[b.model_dump() for b in document.blocks], 'notice':'AI 초안입니다. 사실·수치·표현을 확인하세요.'}
    except (URLError, TimeoutError):
        raise HTTPException(502,'LLM 연결에 실패했습니다. 서버의 API 설정과 네트워크를 확인해 주세요.') from None
    except (ValueError,KeyError,IndexError,TypeError):
        raise HTTPException(502,'문구 생성 결과의 형식이 올바르지 않습니다. 다시 시도해 주세요.') from None
    finally:
        slots.release()
