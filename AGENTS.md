# 컴과2 피지컬 컴퓨팅 수행평가 — 에이전트 작업 규칙

Claude Code와 Codex가 함께 쓰는 공용 규칙 (CLAUDE.md는 이 파일을 불러온다).

## 도구 체인
| 단계 | 도구 | 사용법 |
|---|---|---|
| 회로/코드 시뮬레이션 | Wokwi (CLI + MCP `wokwi`) | `.\scripts\simulate.ps1 -ExpectText READY`, `-Scenario tests\button.test.yaml` |
| 컴파일·라이브러리·업로드 | Arduino CLI | `.\scripts\build.ps1`, `.\scripts\upload.ps1 -Port COM3` |
| 3D 하우징 설계 | Fusion 360 API (MCP `fusion`) | `fusion_exec` 도구로 Python 실행, 스크립트는 `fusion/scripts/` |

## 프로젝트: 3×3 큐브 풀이 로봇 (6면 직결 스텝모터, 보드 내 CFOP 풀이)
전체 흐름은 `docs/PIPELINE.md`, 보고서는 `docs/REPORT.md`.

## 폴더 구조
- `firmware/main/` — 펌웨어 (스케치 폴더명 = 파일명 `main`). `cube.*` 큐브 모델, `solver.*` IDA*+OLL/PLL, `motors.*` A4988 ×6, `tables.h` **자동 생성(수정 금지)**
- `sim/` — JS 시뮬레이터. `cube.js`/`solver.js` 는 펌웨어와 같은 알고리즘(결과 문자열 동일해야 함), `tables.js`·`models.js` 자동 생성, `index.html`+`app.js` Three.js 3D
- `tools/` — `gen_tables.js`(표 생성+OLL/PLL 전수 검증), `test_solver.js`(300회 회귀), `gen_wokwi_test.js`(교차검증 시나리오 생성), `embed_models.js`(STL→models.js), `serve.js`(미리보기), `algs.js`(공식 원본)
- `diagram.json`, `wokwi.toml` — Wokwi 회로도(UNO R3: R4 WiFi 와 헤더 핀 배치 동일), `build/main.ino.hex|elf` 를 시뮬레이션
- `fusion/scripts/cube_robot_parts.py` — Fusion 부품 3종(커플러·센터 캡·모터 브래킷) 생성 + STL/f3d 내보내기 (단위 cm, 상수는 mm). `fusion_exec` 실행 시 `adsk, app, ui, design, root` 가 미리 정의됨, 반환값은 `result` 에 대입. 파일을 통째로 실행하려면 `exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), {...미리 정의된 이름...})`
- `models/` — 내보낸 STL 3종 + `CubeRobotParts.f3d`
- `tools/fusion-bridge/` — Fusion 애드인(HTTP 127.0.0.1:7432, 메인 스레드 대기 120 s) + MCP 서버
- `tests/*.test.yaml` — Wokwi 시나리오 (`solve_seed*.test.yaml` 은 생성 파일, `buttons.test.yaml` 은 버튼 흐름)
- `docs/` — REPORT(보고서), PIPELINE, HIGHLIGHTS(자랑 기술), MATH(상태 표현·거리표 허용성·OLL/PLL 키·공식 변환의 수학적 정리), DESIGN_REVIEW(Codex 3D 검토), SETUP

## 변경 시 지켜야 할 불변 조건
- `sim/solver.js` 와 `firmware/main/solver.cpp` 는 같은 탐색 순서·같은 규칙이어야 한다. 한쪽을 바꾸면 다른 쪽도 바꾸고 `node tools/gen_wokwi_test.js 1` → `scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000` 으로 재확인
- `tools/algs.js` 나 거리표 정의를 바꾸면 `node tools/gen_tables.js` 재실행 (커버리지 실패 시 종료코드 1)
- Fusion 스크립트 상수를 바꾸면 Fusion 에서 재실행 → `node tools/embed_models.js`
- Codex 플러그인은 최적화·설계 검토·리뷰에 꾸준히 쓴다 (결과는 `docs/` 에 기록)

## 작업 순서
1. 회로를 `diagram.json` 에 반영 → 코드 작성 → `build.ps1` 로 컴파일 오류 0 확인
2. Wokwi로 동작 검증 (시리얼 출력은 `--expect-text`, 입력 시나리오는 `--scenario`)
3. 실제 부품 크기를 기준으로 Fusion 하우징 설계 → STL 내보내기
4. 실제 보드에 업로드 후 테스트, 결과를 `docs/` 에 기록

## 규칙
- PowerShell 실행 정책 때문에 스크립트는 `powershell -ExecutionPolicy Bypass -File scripts/<이름>.ps1 ...` 로 실행한다 (시스템 정책은 바꾸지 않음)
- 기본 보드 FQBN: `arduino:avr:uno` (다르면 스크립트 `-Fqbn` 인자로 지정)
- 라이브러리 추가 시 `arduino-cli lib install "<이름>"` 후 `docs/SETUP.md` 의 목록 갱신
- 핀 배치를 바꾸면 `diagram.json` 과 코드 상단 상수를 함께 바꾼다
- `WOKWI_CLI_TOKEN` 등 비밀값은 저장소에 커밋하지 않는다
