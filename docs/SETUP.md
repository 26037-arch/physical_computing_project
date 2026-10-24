# 개발 환경 준비 현황

## 설치 완료
- Arduino CLI 1.5.1 (`C:\Program Files\Arduino CLI`), 코어 `arduino:avr 1.8.8`, `arduino:renesas_uno 1.6.0`
- 라이브러리: Servo, LiquidCrystal I2C, DHT sensor library, Adafruit Unified Sensor
- Wokwi CLI 0.29.0 (`%USERPROFILE%\.wokwi\bin`, 사용자 PATH 등록됨)
- Codex CLI 0.163.0 (ChatGPT 로그인 완료)
- Fusion 360 + FusionMCPBridge 애드인 (`%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\FusionMCPBridge`)
- MCP 설정: Claude Code `.mcp.json`, Codex `.codex/config.toml` (wokwi, fusion)
- Claude Code 플러그인 등록: `.claude/settings.json` → `codex@openai-codex`

## 직접 해야 하는 일
1. ~~Wokwi 토큰~~ 완료 (사용자 환경변수 `WOKWI_CLI_TOKEN`)
2. ~~Fusion 애드인 실행~~ 완료 (Fusion 시작 시 자동 실행, 샘플 하우징 생성 확인)
3. **Codex 플러그인**: 이 폴더를 Claude Code에서 열 때 플러그인 설치를 묻는다면 승인 →
   `/codex:setup` 실행. 묻지 않으면 터미널 `claude` 에서
   `/plugin marketplace add openai/codex-plugin-cc` → `/plugin install codex@openai-codex`
4. **Codex에서 이 폴더 신뢰**: Codex로 처음 열 때 trust 승인 (그래야 `.codex/config.toml` 이 적용됨)
5. **실제 보드**: 연결 후 `arduino-cli board list` 로 포트 확인 → `.\scripts\upload.ps1 -Port COMx`
   (CH340 호환보드면 CH340 드라이버 필요할 수 있음)

## 확인 명령 (2026-10-23 모두 통과)
```
node tools/gen_tables.js
node tools/test_solver.js 300 1
node tools/host_check.js 1 300        # g++ 필요 (MinGW-w64/MSYS2 등). 펌웨어 풀이기 PC 빌드 → JS 와 출력 비교
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/buttons.test.yaml -TimeoutMs 180000
```
일반 PowerShell은 기본 실행 정책이 .ps1 실행을 막으므로 `-ExecutionPolicy Bypass` 를 붙인다.
UNO R4 WiFi 용 컴파일: `arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --output-dir build/r4 firmware/main`
시뮬레이터 미리보기: `node tools/serve.js` → http://localhost:8765/sim/ (Node 외 의존성 없음, Three.js 는 CDN)

## Fusion 브리지 사용 메모
- Fusion 은 시작 메뉴 `Autodesk Fusion` 으로 띄우면 애드인이 자동 실행된다 (`fusion_ping` 으로 확인).
- 긴 작업(STL High 품질 내보내기 등)은 메인 스레드 대기 120 s 를 넘길 수 있다. 부품 단위로 나눠 실행하고 STL 은 Medium 품질을 쓴다.
- 새 문서: `app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)` 후 `DirectDesignType` 으로 두면 타임라인 없이 빠르다. 클라우드 저장(`saveAs`) 대신 `createFusionArchiveExportOptions` 로 `.f3d` 를 저장소에 남긴다.

## V4 공통 제어 검증 (2026-10-24)

설정은 `config/robot_v4.json`에서 수정하고 `node tools/gen_robot_contract.js`로 생성한다.
기구 치수 변경 후에도 CAD 매개변수 생성 → 계약 생성 → STL 임베딩 순서로 갱신한다.

```sh
node tools/gen_robot_contract.js --check
node tools/check_robot_contract.js
node tools/host_check.js 1 300
node tools/host_mechanism_check.js
node tools/test_sim_v4.js
```

`upload.ps1`은 실제 UNO R4 WiFi가 기본이며 `build/physical`로 빌드한다.
`build.ps1`과 Wokwi는 UNO R3가 기본이다. 두 보드는 핀 신호·풀이·기구 절차를 공유한다.
현재 클라우드 세션에는 Wokwi CLI/토큰과 실물 보드가 없어 Wokwi 시나리오 실행과 업로드는 하지 않았다.
로컬 PC의 기존 설치 상태와 구분하며 상세 결과는 `CONSISTENCY_V4.md`에 기록한다.

## Rev D 재현 환경과 최신 결과 (2026-10-24)

위 Windows 설치 기록과 구분한다. 현재 클라우드에서는 Arduino CLI1.5.1,
AVR코어1.8.8, Renesas UNO코어1.6.0, Servo1.3.0, LiquidCrystal I2C1.1.2를 사용했다.

| 대상 | Flash | 정적 RAM | 판정 |
|---|---|---|---|
| UNO R3 | 30,926 / 32,256B | 1,294 / 2,048B, 잔여754B | 컴파일·링크 통과 |
| UNO R4 WiFi | 81,292 / 262,144B | 9,940 / 32,768B, 잔여22,828B | 컴파일·링크 통과 |

잔여 RAM은 스택 최고 사용량을 실측한 값이 아니다. R4에서는 LCD 라이브러리의
AVR 아키텍처 선언 경고가 있으며 실제 LCD 시험이 필요하다. 기본 실물 보드는 R4다.

```sh
arduino-cli compile --fqbn arduino:avr:uno --build-path build/avr-compile --output-dir build/avr firmware/main
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --build-path build/r4-compile --output-dir build/r4 firmware/main
node tools/check_five_face_solver.js
python tools/check_robot_v4_physics.py
node tools/gen_wokwi_test.js 1
node tools/gen_wokwi_test.js 2
node tools/gen_wokwi_test.js 3
node tools/gen_mechanism_test.js
python tools/make_robot_v4_report.py
python tools/check_robot_v4_manual.py
python tools/package_robot_v4.py
```

설치 위치가 다른 환경에서는 CLI 경로와 `--config-file`을 지정한다. 병렬 컴파일은
보드별로 다른 `--build-path`를 사용한다. CAD/제작 PDF 생성에는
`tools/requirements-robot-v4.txt`의 CadQuery 등 의존성이 필요하다.

Rev D는 P13/P29를 바깥 긴 레버 받침으로 바꾸고12접점·74HC165×2 배선을 쓴다.
이전 직렬 스위치 회로와 혼용하지 않는다. 사진의74HC595는 대체품이 아니다.
`I` 명령으로 F/B/R/L/D/LOCK 순서의 결합/후퇴 접점을 각각 확인한다.
`Q`는0/1, `T`는0..60000, `S`는32비트 부호 없는 정수만 허용한다.
`Q 1`은 전원 차단이 아니며, 동작 중 시리얼/버튼은 즉시 처리되지 않는다.
흰색 U 아래·논리D 고정15수 운전이며 F/FLIP과 수동 D를 거부한다.
서보1도/4ms·전체720ms는 충격 완화용으로, 힘 제한 기능이 아니다.

현재 결과는 `PHYSICS_V4.md`·`ARDUINO_REVIEW_V4.md`·`REPORT.md`를 따른다.
실제 스케치648오류 시나리오/4,860명령,4,096접점 조합 및 숫자 경계 입력,
JS/C++300시드/3,300줄, 웹360수/40,987프레임을 검증했다.
Cross190,080상태·마지막층62,208상태·일반6면 섞기1,000시드도 통과했다.
키트90그룹·출력33종93개·PDF42쪽63번호 검사는 통과했다.
전기 시뮬레이션(Wokwi)·실제 업로드·실물 부하/반복 시험은 이번 세션에서 미실행이다.
