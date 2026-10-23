# 개발 파이프라인

> 한 줄 요약: **공식표·거리표는 PC(Node)에서 생성 → 같은 알고리즘을 JS와 C++로 → Arduino CLI 컴파일 → Wokwi에서 보드 출력과 JS 출력을 글자 단위로 교차검증 → Fusion 360 API로 부품 생성·STL → 같은 STL을 JS 3D 시뮬레이터에 임베드.**

```
tools/algs.js (OLL 57 · PLL 21, 사람 표기)      sim/cube.js (큐브 모델, 18수, 표기 변환)
          │                                              │
          └────────────► node tools/gen_tables.js ◄──────┘
                         ├─ 공식 → 겉면 6면 수열 변환(wide/슬라이스/회전 제거)
                         ├─ 역연산으로 OLL/PLL 인식 키 생성, 216/288 전 경우 커버리지 검증
                         └─ BFS 로 크로스·F2L 쌍 거리표 생성
                 ┌─────────────────┴──────────────────┐
     firmware/main/tables.h (PROGMEM ≈10.8 KB)  sim/tables.js
                 │                                     │
   firmware/main/{cube,solver,motors}.cpp + main.ino   sim/solver.js (같은 IDA*·같은 순서)
                 │                                     │
   scripts/build.ps1 (arduino-cli, Uno)                node tools/test_solver.js (300회 회귀)
   arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --output-dir build/r4 firmware/main (실물)
                                                       node tools/gen_wokwi_test.js <seed>
                 │                                     │  → tests/solve_seed<seed>.test.yaml
                 └──────────► scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml
                              (Wokwi: A4988×6 + NEMA17×6 + LCD + 버튼 + 부저, diagram.json)
                              보드 시리얼 출력 == JS 풀이 출력 ⇒ 통과

tools/build_robot_v2.py (CadQuery) ──► models/robot_v2/{cube,head}/*.stl|step, parameters.json
  (V1: fusion/scripts/cube_robot_parts.py ──(MCP fusion_exec)──► models/*.stl)   │
                                                     node tools/embed_models_v4.js ─► sim/models.js (헤드 STL 7종 + 매개변수)
                                                                                   │
                                            sim/index.html + sim/app.js (Three.js 3D 시뮬레이터: 큐브 + 핀 구동 헤드 6개 + 결합/후퇴 전환)
```

## 단계별 명령

| 단계 | 명령 | 결과물 |
|---|---|---|
| 1. 표 생성 | `node tools/gen_tables.js` | `firmware/main/tables.h`, `sim/tables.js` (커버리지 검증 포함, 실패 시 종료코드 1) |
| 2. 풀이기 회귀 | `node tools/test_solver.js 300 1` | 300 섞기 전부 풀림 + 수/노드/시간 통계 |
| 3. 컴파일(시뮬) | `powershell -ExecutionPolicy Bypass -File scripts/build.ps1` | `build/main.ino.hex` (Uno) |
| 3'. 컴파일(실물) | `arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --output-dir build/r4 firmware/main` | R4 WiFi 바이너리 |
| 4. 교차검증 시나리오 | `node tools/gen_wokwi_test.js 1` | `tests/solve_seed1.test.yaml` |
| 5. 시뮬레이션 | `powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000` | `Scenario completed successfully` |
| 5'. 버튼 시나리오 | `... -Scenario tests/buttons.test.yaml -TimeoutMs 180000` | 무작위 시드로 섞고 풀어 `SOLVED ok=1` |
| 5''. V4 기구 절차 | `node tools/gen_mechanism_test.js` → `... -Scenario tests/mechanism_v4.test.yaml -TimeoutMs 150000` | 실제 모드: LOAD 장착 → `M F R U D`(지지 전환·막대·뒤집기, 시나리오가 결합 스위치를 눌러 줌) → 결합 실패 중단 → 배출 |
| 6. 3D 부품 (V4) | `.venv-cad\Scripts\python.exe tools/build_robot_v4.py` → `check_robot_v4.py` → `render_robot_v4.py` (CadQuery 2.7, Python 3.12 venv) | `models/robot_v4/**` STL·STEP·GLB, `parameters.json`, `mechanical_checks.json` |
| 6'. 3D 부품 (V2, 이력) | `python tools/build_robot_v2.py` → `check_robot_v2.py` → `render_robot_v2.py` | `models/robot_v2/**` |
| 6'. 3D 부품 (V1) | Claude Code 에서 `fusion_exec` 로 `fusion/scripts/cube_robot_parts.py` 실행 | `models/center_coupler.stl`, `center_cap.stl`, `motor_mount.stl` |
| 7. STL 임베드 | `node tools/embed_models_v4.js` | `sim/models.js` (V4 출력 부품 STL + `parameters.json` 의 `print_offsets`/`purchased`) |
| 8. 시뮬레이터 | `node tools/serve.js` → http://localhost:8765/sim/ (또는 `sim/index.html` 더블클릭) | 3D 시연 |
| 9. 업로드 | `powershell -ExecutionPolicy Bypass -File scripts/upload.ps1 -Port COMx -Fqbn arduino:renesas_uno:unor4wifi` | 실물 보드 |

## 에이전트 도구 사용

| 도구 | 쓰임 |
|---|---|
| Arduino CLI | Uno / UNO R4 WiFi 두 보드 컴파일, 플래시·RAM 사용량 확인 |
| Wokwi (CLI + MCP) | A4988·스테퍼 6세트 회로 시뮬레이션, `write-serial`/`wait-serial` 시나리오로 자동 검증 |
| Fusion 360 (MCP `fusion_exec`) | Python API 로 부품 3종 생성, 치수 검사, STL 내보내기 (`CubeRobotParts` 문서로 저장) |
| Codex 플러그인 | AVR 핫패스 최적화(solver.cpp), 3D 부품 설계 검토(`docs/DESIGN_REVIEW.md`), 시뮬레이터·보고서 리뷰 |

## 자동 생성 파일 (직접 수정하지 않음)

- `firmware/main/tables.h`, `sim/tables.js` ← `tools/gen_tables.js`
- `sim/models.js` ← `tools/embed_models.js` (입력: `models/robot_v2/head/*.stl`, `models/robot_v2/parameters.json`)
- `tests/solve_seed*.test.yaml` ← `tools/gen_wokwi_test.js` (풀이 + 뒤집기/결합 횟수), `tests/mechanism_v4.test.yaml` ← `tools/gen_mechanism_test.js`

핀 배치를 바꾸면 `diagram.json` 과 `firmware/main/motors.h`(STEP/DIR), `mechanism.h`(서보·결합 스위치), `main.ino`(버튼·부저), `docs/HARDWARE_V4.md` 4절을 함께 바꾼다. 기구 절차는 `sim/mechanism.js` 와 `firmware/main/mechanism.cpp` 를 함께 바꾼다.
