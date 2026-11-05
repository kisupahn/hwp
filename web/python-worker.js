/* HWP generation runs here, off the UI thread. No document is uploaded. */
'use strict';
let initialized;
function progress(text){self.postMessage({type:'progress',text});}
async function fetchAsset(path){const r=await fetch(new URL(path,self.location.href));if(!r.ok)throw Error('문서 생성 파일을 불러오지 못했어: '+path);return r;}
async function initialize(){
 progress('브라우저용 문서 엔진을 준비하는 중… 처음에는 다운로드 시간이 필요해.');
 importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js');
 const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/'});
 progress('문서 처리 라이브러리를 준비하는 중…');
 await py.loadPackage('lxml');
 const manifest=await (await fetchAsset('vendor/manifest.json')).json();
 const wheel=new Uint8Array(await (await fetchAsset('vendor/'+manifest.filename)).arrayBuffer());
 const digest=await crypto.subtle.digest('SHA-256',wheel);
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.sha256)throw Error('문서 라이브러리 무결성 검증에 실패했어. 새로고침 후 다시 시도해 줘.');
 py.FS.writeFile('/tmp/document-engine.whl',wheel);
 for(const name of ['generate.py','structured.py']){
  py.FS.writeFile('/tmp/'+name,await (await fetchAsset('python/'+name)).text());
 }
 await py.runPythonAsync(`
import sys, site, zipfile
from pathlib import PurePosixPath
with zipfile.ZipFile('/tmp/document-engine.whl') as wheel:
    for name in wheel.namelist():
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts:
            raise ValueError('Unsafe wheel entry')
    wheel.extractall(site.getsitepackages()[0])
sys.path.insert(0, '/tmp')
from generate import render
import json
`);
 return py;
}
self.onmessage=async(event)=>{
 const {id,document,format}=event.data;
 try{
  initialized ||= initialize().catch(error=>{initialized=null;throw error;});
  const py=await initialized;
  progress('문서 내용을 배치하고 '+format.toUpperCase()+' 파일을 만드는 중…');
  py.globals.set('browser_payload',JSON.stringify(document));
  py.globals.set('browser_format',format);
  await py.runPythonAsync(`
from pathlib import Path
payload = json.loads(browser_payload)
settings = payload['settings'].copy()
template = {'font_main': settings.pop('font_main'), 'font_note': settings.pop('font_note'),
            'settings': settings, 'items': payload['blocks']}
output_path = Path('/tmp/document.' + browser_format)
render(template, {}, output_path)
`);
  const data=py.FS.readFile('/tmp/document.'+format);
  py.FS.unlink('/tmp/document.'+format);
  py.globals.delete('browser_payload');
  // Do not retain the last document contents in Python globals after export.
  await py.runPythonAsync('del payload, template, settings');
  self.postMessage({type:'result',id,data},[data.buffer]);
 }catch(error){console.error('Local document generation:',error);self.postMessage({type:'error',id,message:'문서를 만들지 못했어. '+String(error.message).slice(0,400)});}
};
