> **현재 권장: 서버 없는 GitHub Pages MVP**
> 브라우저에서 실제 HWP/HWPX를 생성할 수 있게 업데이트했습니다.
> 별도 API가 필요 없는 배포는 [SERVERLESS.md](SERVERLESS.md)를 참고하세요.
> 아래는 LLM 직접 연결 등으로 Python API 서버를 추가할 때의 선택형 구성입니다.

# 문서공방 웹앱 실행과 배포

## 현재 범위

- 웹에서 문단·표·막대차트 추가, 순서 변경, 내용 수정 및 삭제
- 글꼴, 크기, 줄 간격, 자간, 여백, 항목 간격 설정
- HWP 5.0 / HWPX 다운로드
- 브라우저 자동 저장 및 JSON 파일로 내용·서식 저장/불러오기
- OpenAI 연결 시 문구 초안을 생성하여 기존 문서 뒤에 추가
- 표는 편집 가능한 표, 차트는 PNG 이미지로 내보내기

웹 미리보기는 한글 조판 결과가 아닙니다. 최종 화면과 페이지 수는 한글에서 확인합니다.
복잡한 병합 표, 자동 목차, 결재란, 다단 편집은 아직 없습니다.
자간은 사용자가 조절하며, 글자 폭이나 한글 렌더링에 기반한 자동 페이지 최적화는 아직 없습니다.
짧은 문단의 분할을 줄이고, 블록 앞 수동 페이지 나눔을 지원합니다.

## 로컬 / 클라우드 개발 환경

```sh
cd /workspace/hwp
python -m venv /workspace/hwp-env
/workspace/hwp-env/bin/python -m pip install -r requirements.txt
/workspace/hwp-env/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

차트 생성에는 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` 또는
`/usr/share/fonts/truetype/nanum/NanumGothic.ttf`가 필요합니다.
이 클라우드에는 Noto CJK가 설치되어 있습니다. Debian/Ubuntu에서는 `fonts-noto-cjk` 패키지를 설치합니다.
문서의 나눔명조·나눔고딕은 파일에 글꼴명으로 지정되므로, 최종 열람 PC에 해당 글꼴이 필요합니다.

## Docker 배포 준비

Dockerfile은 제공하지만 이 세션에서 이미지 빌드·외부 배포를 수행하지 않았습니다.
공개 서버에서는 HTTPS 리버스 프록시 뒤에 두고, 강한 무작위 `APP_ACCESS_TOKEN`을
호스팅의 비밀 설정으로 주입합니다. Docker 이미지는 이 값이 없으면 시작을 거부합니다.
환경 변수는 이미지 빌드 인수가 아니라 실행 시 주입하세요.

```sh
docker build -t document-studio .
# APP_ACCESS_TOKEN 등은 서버의 비밀 관리 기능 또는 체크아웃 밖의 env 파일에 저장
# 다음 경로는 배포 서버에서 준비한 비밀 파일로 바꾸세요.
docker run -d --name document-studio --restart unless-stopped \
  -p 127.0.0.1:8000:8000 --env-file /secure/document-studio.env document-studio
```

리버스 프록시에서 원래 Host와 X-Forwarded-Proto를 전달하고, Uvicorn의
`--forwarded-allow-ips`는 신뢰하는 프록시 주소만 설정하세요. POST Origin과 실제 서비스 주소가 같아야 합니다.
`/health`로 상태를 확인합니다. 프록시에서도 요청 크기를 250KB 이하로 제한하세요.
웹의 '접속 키'에 `APP_ACCESS_TOKEN`을 입력하면 같은 탭에서 API를 사용합니다.
이것은 소규모 비공개 시범 운영용 공유 접속 키입니다. 공개 다중 사용자 서비스에는
사용자 인증·사용량 제한·감사 기록·조직별 저장소를 추가해야 합니다.

## 선택 사항: LLM 문구 생성

서버 비밀 설정:

- `LLM_API_KEY`: OpenAI API 키. 브라우저에 보내거나 저장소에 기록하지 않습니다.
- `LLM_MODEL`: 사용할 모델. 기본값 `gpt-4.1-mini`.

현재 연결 대상은 `https://api.openai.com/v1/chat/completions`입니다.
네트워크 제한 환경에서는 `api.openai.com` HTTPS 접근을 허용해야 합니다.
사용자가 AI 초안 생성 버튼을 누를 때 요청 내용이 OpenAI로 전달됩니다.
새로운 사실·수치·일정을 추측하지 않도록 지시하며 결과는 사용자가 확인해야 합니다.
키가 없으면 AI 버튼을 비활성화합니다. 실제 API 호출은 이 세션에서 검증하지 않았고,
공급자 응답 모형으로 응답 파싱·입력 검증·오류 처리를 확인했습니다.

## 저장과 검증

문서는 사용자 브라우저의 localStorage와 내보낸 JSON에 저장됩니다.
서버는 다운로드 파일을 임시 디렉터리에서 생성한 후 제거하고, 문서를 DB에 보관하지 않습니다.
공유 기기에서는 '저장 내용 지우기'를 사용하세요. 클라우드 동기화와 계정 간 공유는 없습니다.

```sh
/workspace/hwp-env/bin/python -m unittest -v
```

브라우저 검증: 내용·서식 편집, 표·차트 추가, 실제 HWP 다운로드, 자동 저장 복구,
LLM 미연결 표시 및 모바일 폭에서 가로 넘침 여부 확인.
자동 API 검증: 두 출력 형식, 표 셀, 차트 포함 여부, 자간, 페이지 나눔, 잘못된 입력,
접속 키, 요청 크기, 외부 Origin 차단, LLM 모의 응답 처리.

한글 2010의 실제 렌더링은 검증하지 않았습니다. 호스팅 설정·외부 URL 발급·TLS 인증서·실제 LLM 연결은 배포 단계에서 확인해야 합니다.

## GitHub Pages로 화면 배포

가능한 구조: **GitHub Pages = 웹 편집기 / 별도 Python 서버 = HWP 생성·LLM**.
Pages만으로 Python 서버를 실행할 수는 없습니다. 단, 현재 기본 버전은 Pyodide로 브라우저에서 HWP/HWPX를 생성하므로 서버가 필요 없습니다.
아래 단계는 LLM 직접 호출 등으로 API 서버를 선택한 경우에만 적용합니다.

1. 이 코드를 GitHub 저장소에 푸시합니다. 현재 세션에서는 푸시하지 않았습니다.
2. 저장소 Settings → Pages → Source를 GitHub Actions로 설정합니다.
3. 별도 서버에 Docker 또는 Python으로 API를 실행하고 HTTPS 주소를 확보합니다.
4. API 서버에 `STUDIO_ALLOWED_ORIGINS=https://kisupahn.github.io`를 설정합니다.
   Origin에는 `/hwp` 등 경로를 넣지 않습니다. 사용자 지정 도메인을 쓰면 해당 Origin을 설정합니다.
5. GitHub 저장소 Settings → Secrets and variables → Actions → Variables에
   `STUDIO_API_BASE`를 API 서버의 HTTPS 주소로 설정합니다. 이것은 공개 주소이며 비밀 키가 아닙니다.
6. 포함된 `Publish editor to GitHub Pages` 워크플로를 실행합니다. main 푸시에도 실행됩니다.

`APP_ACCESS_TOKEN`, `LLM_API_KEY`는 API 서버의 비밀 설정에만 둡니다.
GitHub Pages 파일·공개 변수·JavaScript에는 넣지 않습니다.
API 서버는 허용한 웹 Origin의 교차 출처 요청과 접속 키를 확인합니다.
브라우저는 Pages에 HTTPS로 접속하므로 API 서버 역시 HTTPS여야 합니다.

기본 Pages 주소는 `https://kisupahn.github.io/hwp/`가 예상되지만,
이 세션에서 실제 Pages 활성화·워크플로 실행·URL 발급을 확인하지 않았습니다.
