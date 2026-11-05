# 문서공방 — 서버 없는 웹 MVP

현재 권장 방식은 **GitHub Pages만으로 편집하고 브라우저에서 HWP/HWPX를 생성하는 버전**입니다.
별도 생성 서버나 API 키가 필요 없습니다. [서버 없는 MVP 실행·배포](SERVERLESS.md)를 먼저 보세요.

```sh
python tools/build_static.py --output site
python -m http.server 8000 --directory site
```

기존 Python CLI와 선택형 API 서버도 아래와 같이 사용할 수 있습니다.

## Python CLI로 한글 보고서 자동 생성

한글 스크립트 매크로를 실행하지 않고, 원본 매크로의 서식을 Python으로 재현합니다.
JSON 템플릿과 데이터를 입력하면 실제 HWP 5.0 또는 HWPX 파일을 생성합니다.

## 설치·실행

```sh
python -m venv /workspace/hwp-env
/workspace/hwp-env/bin/python -m pip install -r requirements.txt
/workspace/hwp-env/bin/python generate.py --template templates/report.json --data examples/data.json --output report.hwp
/workspace/hwp-env/bin/python -m unittest -v
```

`--output report.hwpx`로 HWPX도 생성합니다. 확장자만 바꾸는 방식이 아닙니다.

## 템플릿 작성

`templates/report.json`의 items 배열에 문단을 작성합니다.
각 문단의 bullet은 `□`, `○`, `-`, `*` 중 하나입니다. summary는 선택 항목입니다.
본문의 `{내용}`은 굵게, `(내용)`은 2pt 축소합니다. 중첩 괄호도 축소됩니다.
`{{사업명}}` 같은 변수는 별도 데이터 JSON에서 가져옵니다. 누락된 변수는 오류로 처리합니다.
변수 값에는 서식 기호인 중괄호와 줄바꿈을 넣을 수 없습니다.

원본 서식: A4, 좌우 20mm, 위아래 및 머리말·꼬리말 10mm, 줄 간격 160%,
본문 나눔명조 16pt, 주석 나눔고딕 14pt, 요약 음영 #FFF2CC.
글머리표별 앞 공백·음수 첫 줄 들여쓰기·빈 문단 글자 크기를 원본대로 적용합니다.
원본의 음수 들여쓰기를 그대로 사용하므로 긴 문장의 줄바꿈·위치는 실제 한글에서 확인하세요.
필요하면 템플릿의 font_main/font_note를 바탕/돋움 등으로 바꿀 수 있습니다.
대상 PC에 해당 글꼴이 설치되어 있어야 의도한 서체로 보입니다.

## 검증 범위

자동 검사: 두 형식의 저장·재열기, 치환된 내용, 문단 수, 여백, 글자 크기,
음영·굵게 설정, 누락 변수 오류. HWP 출력의 바이너리 시그니처도 확인합니다.
한글 2010은 이 Linux 환경에 없어 실제 열림과 렌더링은 검증하지 못했습니다.
HWPX 직접 열기는 한글 2010의 업데이트 상태에 따라 다를 수 있으므로 해당 버전에서는 HWP 출력을 우선 사용하세요.
암호화 문서·기존 복잡한 양식의 완전한 변환·PDF 미리보기는 현재 범위에 포함되지 않습니다.

## 여러 보고서 일괄 생성

```sh
/workspace/hwp-env/bin/python batch.py --template templates/project-plan.json --records examples/projects.json --output-dir /workspace/hwp-deliverables/demo
```

같은 서식에 세 사업의 데이터를 넣어 HWP/HWPX 각각 3건을 생성합니다.
사업명, 목적, 기간, 예산, 현황, 단계별 계획, 성과지표, 위험 대응, 결정 요청을 바꿀 수 있습니다.
예시의 모든 수치·일정은 시연용 가상 설정입니다.
출력 경로에 같은 이름의 파일이 있으면 덮어쓰므로 별도 출력 디렉터리를 권장합니다.

## 웹앱

웹 편집기와 다운로드 API를 추가했습니다. 실행·배포·LLM 연결 및 현재 제약은 [DEPLOY.md](DEPLOY.md)를 참조하세요.

```sh
/workspace/hwp-env/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
```
