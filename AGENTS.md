# 컴과2 피지컬 컴퓨팅 수행평가 — 에이전트 작업 규칙

Claude Code와 Codex가 함께 쓰는 공용 규칙 (CLAUDE.md는 이 파일을 불러온다).

## 도구 체인
| 단계 | 도구 | 사용법 |
|---|---|---|
| 회로/코드 시뮬레이션 | Wokwi (CLI + MCP `wokwi`) | `.\scripts\simulate.ps1 -ExpectText READY`, `-Scenario tests\button.test.yaml` |
| 컴파일·라이브러리·업로드 | Arduino CLI | `.\scripts\build.ps1`, `.\scripts\upload.ps1 -Port COM3` |
| 3D 하우징 설계 | Fusion 360 API (MCP `fusion`) | `fusion_exec` 도구로 Python 실행, 스크립트는 `fusion/scripts/` |

## 프로젝트: 3×3 큐브 풀이 로봇 (V4: 측면 2핀 헤드 4 + 아래 D 헤드 + 승강 잠금 막대, 서보 크랭크 이송, 뒤집기, 보드 내 CFOP 풀이)
전체 흐름은 `docs/PIPELINE.md`, 보고서는 `docs/REPORT.md`, **현재 기구 기준은 `docs/HARDWARE_V4.md`** (장치 목록·좌표·치수·절차·핀 배치. 펌웨어·시뮬레이터·CAD 가 공유하는 계약).

## 폴더 구조
- `firmware/main/` — 펌웨어 (스케치 폴더명 = 파일명 `main`). `cube.*` 큐브 모델, `solver.*` 크로스 IDA* + F2L 트리거 매크로 IDA* + OLL/PLL 조회, `motors.*` A4988 ×5(STEP 5 + DIR 공용, 뒤집기), `mechanism.*` 기구 절차(이송 유닛 FB/RL/D/LOCK 서보 크랭크·결합 스위치·뒤집기·장착), `tables.h` **자동 생성(수정 금지)**
- `sim/` — JS 시뮬레이터. `cube.js`/`solver.js` 는 펌웨어와 같은 알고리즘(결과 문자열 동일해야 함), `mechanism.js` 는 `firmware/main/mechanism.cpp` 와 같은 절차·같은 출력 줄·같은 flips/regrips 횟수, `tables.js`·`models.js` 자동 생성, `index.html`+`app.js` Three.js 3D. `app.js` 는 V4 기구(도넛 큐브 + 측면 2핀 헤드 4 + 아래 D 헤드(중공축·벨트) + 잠금 막대, 서보 6개·이송 명령 4유닛, 뒤집기, 장착/배출)를 `docs/HARDWARE_V4.md` 2절 좌표·치수로 그린다 — `models/robot_v4/parameters.json` 의 `print_offsets`/`purchased` 가 있으면 그 값을, 없으면 문서 기본값과 기본 도형을 쓴다
- `tools/` — `gen_tables.js`(표 생성 + OLL/PLL·F2L 전수 검증), `test_solver.js`(300회 회귀), `host_check.js`+`host_solver/`(g++ 로 펌웨어 풀이기를 PC 빌드해 JS 와 시드별 출력 비교), `gen_wokwi_test.js`(교차검증 시나리오 생성), `embed_models_v4.js`(V4 출력 STL+parameters.json→models.js; `embed_models.js`/`embed_models_v2.js` 는 V3/V2 이력), `gen_mechanism_test.js`(V4 기구 실제 모드 시나리오), `serve.js`(미리보기, `POST /__screenshot?name=x.png` 로 docs/images 저장), `algs.js`(공식 원본), `build_robot_v4.py`/`check_robot_v4.py`/`render_robot_v4.py`(V4 CAD 생성·검사·렌더, CadQuery 2.7 — `.venv-cad`), V2/V3 생성기는 이력
- `diagram.json`, `wokwi.toml` — Wokwi 회로도(UNO R3: R4 WiFi 와 헤더 핀 배치 동일), `build/main.ino.hex|elf` 를 시뮬레이션
- `fusion/scripts/cube_robot_parts.py` — Fusion 부품 3종(커플러·센터 캡·모터 브래킷) 생성 + STL/f3d 내보내기 (단위 cm, 상수는 mm). `fusion_exec` 실행 시 `adsk, app, ui, design, root` 가 미리 정의됨, 반환값은 `result` 에 대입. 파일을 통째로 실행하려면 `exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), {...미리 정의된 이름...})`
- `models/` — 내보낸 STL 3종 + `CubeRobotParts.f3d`
- `tools/fusion-bridge/` — Fusion 애드인(HTTP 127.0.0.1:7432, 메인 스레드 대기 120 s) + MCP 서버
- `tests/*.test.yaml` — Wokwi 시나리오 (`solve_seed*.test.yaml` 은 생성 파일(풀이 + flips/regrips 교차검증), `buttons.test.yaml` 은 버튼 흐름, `mechanism_v4.test.yaml` 은 생성 파일(실제 모드 기구 절차: 장착·지지 전환·뒤집기·결합 실패·배출))
- `docs/` — REPORT(보고서), PIPELINE, HIGHLIGHTS(자랑 기술), MATH(상태 표현·거리표 허용성·OLL/PLL 키·공식 변환의 수학적 정리), DESIGN_REVIEW(Codex 3D 검토), SETUP

## 변경 시 지켜야 할 불변 조건
- V4 제어 설정의 원본은 `config/robot_v4.json`, 형상 치수의 원본은 `models/robot_v4/parameters.json`이다. `node tools/gen_robot_contract.js`로 `firmware/main/robot_contract.h`와 `sim/robot_contract.js`를 생성한다. 생성 파일을 직접 수정하지 말고 `--check`와 `node tools/check_robot_contract.js`로 신선도·핀·6서보/4신호 회로를 검사한다.
- 기구·모터·명령 수신 변경은 `node tools/host_mechanism_check.js`(실제 스케치 C++ + 결정적 GPIO/센서/시간 어댑터)와 `node tools/test_sim_v4.js`(실제 웹 동작 큐·패널·회전축·스텝 시간)를 실행한다. 두 테스트는 Wokwi 전기 시뮬레이션이나 실물 강도/마찰 시험을 대신하지 않는다.

- `sim/solver.js` 와 `firmware/main/solver.cpp` 는 같은 탐색 순서·같은 규칙(크로스 18수 IDA*, F2L 은 U 회전 + 트리거 `X U^k X'` 매크로 27개를 같은 번호 순서로 전개)이어야 한다. 한쪽을 바꾸면 다른 쪽도 바꾸고 `node tools/host_check.js 1 300`(g++ 호스트 비교) → `node tools/gen_wokwi_test.js 1` → `scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000` 으로 재확인
- `sim/mechanism.js` 와 `firmware/main/mechanism.cpp` 는 같은 절차(지지 전환 순서·뒤집기 조건·장착/배출)와 같은 시리얼 줄이어야 한다. 한쪽을 바꾸면 다른 쪽도 바꾸고 `node tools/gen_mechanism_test.js` → `simulate.ps1 -Scenario tests/mechanism_v4.test.yaml -TimeoutMs 120000`(실제 모드, 센서 버튼 시나리오) 과 시드 시나리오(flips/regrips 비교)를 재실행
- `tools/algs.js` 나 거리표 정의를 바꾸면 `node tools/gen_tables.js` 재실행 (커버리지 실패 시 종료코드 1)
- V4 CAD(`tools/build_robot_v4.py`) 치수를 바꾸면 `docs/HARDWARE_V4.md` 2절을 먼저 고치고 `sim/app.js`(기본값·HEAD 오프셋)·`firmware/main/mechanism.h`(이송량·서보 각)·CAD 를 맞춘 뒤 `.venv-cad/Scripts/python.exe tools/build_robot_v4.py` → `check_robot_v4.py` → `node tools/embed_models_v4.js` 재실행
- Codex 플러그인은 최적화·설계 검토·리뷰에 꾸준히 쓴다 (결과는 `docs/` 에 기록)

## 작업 순서
1. 회로를 `diagram.json` 에 반영 → 코드 작성 → `build.ps1` 로 컴파일 오류 0 확인
2. Wokwi로 동작 검증 (시리얼 출력은 `--expect-text`, 입력 시나리오는 `--scenario`)
3. 실제 부품 크기를 기준으로 Fusion 하우징 설계 → STL 내보내기
4. 실제 보드에 업로드 후 테스트, 결과를 `docs/` 에 기록

## 규칙
- PowerShell 실행 정책 때문에 스크립트는 `powershell -ExecutionPolicy Bypass -File scripts/<이름>.ps1 ...` 로 실행한다 (시스템 정책은 바꾸지 않음)
- 기본 보드: 빌드/Wokwi는 계약의 `simulationBoard`(UNO R3), 실물 업로드는 `physicalBoard`(UNO R4 WiFi). `-Fqbn`으로 명시 변경 가능. 업로드 출력은 `build/physical`에 분리한다.
- 라이브러리 추가 시 `arduino-cli lib install "<이름>"` 후 `docs/SETUP.md` 의 목록 갱신
- 핀 배치를 바꾸면 `diagram.json`, `firmware/main/motors.h`(STEP/DIR), `mechanism.h`(서보·센서), `main.ino`(버튼·부저), `docs/HARDWARE_V4.md` 4절을 함께 바꾼다
- `WOKWI_CLI_TOKEN` 등 비밀값은 저장소에 커밋하지 않는다
