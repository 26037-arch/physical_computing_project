# 컴과2 피지컬 컴퓨팅 수행평가 — 에이전트 작업 규칙

Claude Code와 Codex가 함께 쓰는 공용 규칙 (CLAUDE.md는 이 파일을 불러온다).

## 도구 체인
| 단계 | 도구 | 사용법 |
|---|---|---|
| 회로/코드 시뮬레이션 | Wokwi (CLI + MCP `wokwi`) | `.\scripts\simulate.ps1 -ExpectText READY`, `-Scenario tests\button.test.yaml` |
| 컴파일·라이브러리·업로드 | Arduino CLI | `.\scripts\build.ps1`, `.\scripts\upload.ps1 -Port COM3` |
| 3D 하우징 설계 | Fusion 360 API (MCP `fusion`) | `fusion_exec` 도구로 Python 실행, 스크립트는 `fusion/scripts/` |

## 프로젝트: 3×3 큐브 풀이 로봇 (V5: 시중 큐브 + 20° 기울어진 컵(NEMA17 1개) + 후드 서보 + 리프터 서보, 보드 내 CFOP 풀이)
전체 흐름은 `docs/PIPELINE.md`, 보고서는 `docs/REPORT.md`, **현재 기구 기준은 `docs/HARDWARE_V5.md`** (장치 목록·좌표·치수·절차·핀 배치. 펌웨어·시뮬레이터·CAD·2D 검사기가 공유하는 계약). 제작 순서는 `docs/BUILD_V5.md`. V4(`HARDWARE_V4.md`, `BUILD_V4*.md`, `models/robot_v4`)는 이력이다.

## 폴더 구조
- `firmware/main/` — 펌웨어 (스케치 폴더명 = 파일명 `main`). `cube.*` 큐브 모델, `solver.*` 크로스 IDA* + F2L 트리거 매크로 IDA* + OLL/PLL 조회, `motors.*` A4988 ×1(컵 모터, STEP D2/DIR D7/EN D6), `mechanism.*` 기구 절차(후드 CLOSE/OPEN/LOAD, 층 회전 TURN + 오버슈트, 스핀 SPIN y, 뒤집기 FLIP = x', 재배향 표 REORIENT, 장착/배출, `ori[6]` 물리 위치별 논리 면), `tables.h` **자동 생성(수정 금지)**
- `sim/` — JS 시뮬레이터. `cube.js`/`solver.js` 는 펌웨어와 같은 알고리즘(결과 문자열 동일해야 함), `mechanism.js` 는 `firmware/main/mechanism.cpp` 와 같은 절차·같은 출력 줄·같은 flips/spins 횟수, `tables.js`·`models.js` 자동 생성, `index.html`+`app.js` Three.js 3D. `app.js` 는 V5 기구(시중 큐브 + 컵 + 후드 + 리프터, 20° 기울기)를 `docs/HARDWARE_V5.md` 2절 좌표·치수(`tools/robot_v5_params.py` = `CubeModels.params`)로 그린다 — `models/robot_v5/parameters.json` 의 `print_offsets`/`purchased` 가 있으면 그 값을, 없으면 기본 도형을 쓴다
- `tools/` — `gen_tables.js`(표 생성 + OLL/PLL·F2L 전수 검증), `test_solver.js`(300회 회귀), `host_check.js`+`host_solver/`(g++ 로 펌웨어 풀이기를 PC 빌드해 JS 와 시드별 출력 비교), `gen_wokwi_test.js`(교차검증 시나리오 생성), `gen_mechanism_test.js`(V5 기구 실제 모드 시나리오), `robot_v5_params.py`(V5 치수 한 벌, 모든 V5 스크립트가 import), `check_robot_v5.py`(2D 운동학·준정적 물리 검사 → `models/robot_v5/kinematic_checks.json`), `build_robot_v5.py`/`check_robot_v5_cad.py`/`render_robot_v5.py`/`embed_models_v5.js`(V5 CAD 생성·3D 검사·렌더·models.js 임베드, CadQuery 2.7 — `.venv-cad`), `serve.js`(미리보기, `POST /__screenshot?name=x.png` 로 docs/images 저장), `algs.js`(공식 원본), V2/V3/V4 생성기·`embed_models*.js` 는 이력
- `diagram.json`, `wokwi.toml` — Wokwi 회로도(UNO R3: R4 WiFi 와 헤더 핀 배치 동일; A4988 1 + NEMA17 1 + 서보 2 + LCD + 버튼 + 부저), `build/main.ino.hex|elf` 를 시뮬레이션
- `fusion/scripts/cube_robot_parts.py` — Fusion 부품 3종(커플러·센터 캡·모터 브래킷) 생성 + STL/f3d 내보내기 (단위 cm, 상수는 mm). `fusion_exec` 실행 시 `adsk, app, ui, design, root` 가 미리 정의됨, 반환값은 `result` 에 대입. 파일을 통째로 실행하려면 `exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), {...미리 정의된 이름...})`
- `models/` — 내보낸 STL 3종 + `CubeRobotParts.f3d`
- `tools/fusion-bridge/` — Fusion 애드인(HTTP 127.0.0.1:7432, 메인 스레드 대기 120 s) + MCP 서버
- `tests/*.test.yaml` — Wokwi 시나리오 (`solve_seed*.test.yaml` 은 생성 파일(풀이 + flips/spins 교차검증), `buttons.test.yaml` 은 버튼 흐름, `mechanism_v5.test.yaml` 은 생성 파일(실제 모드 기구 절차: 장착·재배향·층 회전·시연 명령·배출))
- `docs/` — REPORT(보고서), PIPELINE, HIGHLIGHTS(자랑 기술), MATH(상태 표현·거리표 허용성·OLL/PLL 키·공식 변환의 수학적 정리), HARDWARE_V5(기구 계약)·BUILD_V5(하루 제작)·CAD_V5_BRIEF/SIM_V5_BRIEF(Codex 작업 지시), DESIGN_REVIEW(Codex 3D 검토), SETUP

## 변경 시 지켜야 할 불변 조건
- `sim/solver.js` 와 `firmware/main/solver.cpp` 는 같은 탐색 순서·같은 규칙(크로스 18수 IDA*, F2L 은 U 회전 + 트리거 `X U^k X'` 매크로 27개를 같은 번호 순서로 전개)이어야 한다. 한쪽을 바꾸면 다른 쪽도 바꾸고 `node tools/host_check.js 1 300`(g++ 호스트 비교) → `node tools/gen_wokwi_test.js 1` → `scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000` 으로 재확인
- `sim/mechanism.js` 와 `firmware/main/mechanism.cpp` 는 같은 절차(재배향 표 REORIENT 의 순서·후드 상태 전환·장착/배출)와 같은 시리얼 줄이어야 한다. 한쪽을 바꾸면 다른 쪽도 바꾸고 `node tools/gen_mechanism_test.js` → `simulate.ps1 -Scenario tests/mechanism_v5.test.yaml -TimeoutMs 240000`(실제 모드) 과 시드 시나리오(flips/spins 비교)를 재실행
- `tools/algs.js` 나 거리표 정의를 바꾸면 `node tools/gen_tables.js` 재실행 (커버리지 실패 시 종료코드 1)
- V5 치수를 바꾸면 `tools/robot_v5_params.py` 와 `docs/HARDWARE_V5.md` 2절을 먼저 고치고 `.venv-cad/Scripts/python.exe tools/check_robot_v5.py`(2D 검사 통과) → `build_robot_v5.py` → `check_robot_v5_cad.py` → `node tools/embed_models_v5.js` 를 재실행하고 `firmware/main/mechanism.h`(서보 각·오버슈트)·`sim/app.js` 기본값을 맞춘다
- Codex 플러그인은 검토뿐 아니라 **분업**에 쓴다: 작업 지시서를 `docs/*_BRIEF.md` 로 쓰고 `codex:rescue`(`task --background --write`)로 넘긴다. 결과는 `docs/` 에 기록

## 작업 순서
1. 회로를 `diagram.json` 에 반영 → 코드 작성 → `build.ps1` 로 컴파일 오류 0 확인
2. Wokwi로 동작 검증 (시리얼 출력은 `--expect-text`, 입력 시나리오는 `--scenario`)
3. 실제 부품 크기를 기준으로 Fusion 하우징 설계 → STL 내보내기
4. 실제 보드에 업로드 후 테스트, 결과를 `docs/` 에 기록

## 규칙
- PowerShell 실행 정책 때문에 스크립트는 `powershell -ExecutionPolicy Bypass -File scripts/<이름>.ps1 ...` 로 실행한다 (시스템 정책은 바꾸지 않음)
- 기본 보드 FQBN: `arduino:avr:uno` (다르면 스크립트 `-Fqbn` 인자로 지정)
- 라이브러리 추가 시 `arduino-cli lib install "<이름>"` 후 `docs/SETUP.md` 의 목록 갱신
- 핀 배치를 바꾸면 `diagram.json`, `firmware/main/motors.h`(STEP/DIR/EN), `mechanism.h`(서보 2), `main.ino`(버튼·부저), `docs/HARDWARE_V5.md` 4절을 함께 바꾼다
- `WOKWI_CLI_TOKEN` 등 비밀값은 저장소에 커밋하지 않는다
