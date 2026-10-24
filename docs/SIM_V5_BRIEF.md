# 시뮬레이터 V5 작업 지시 (Codex 용)

`sim/app.js`(+ `sim/index.html`)를 **V5 기구**(docs/HARDWARE_V5.md)로 다시 쓴다. 지금 `sim/app.js` 는 V4(핀 헤드 5개·잠금 막대) 그림이라 전부 교체 대상이다.
건드리지 않는 것: `sim/cube.js`, `sim/solver.js`, `sim/tables.js`, `sim/mechanism.js`(이미 V5, 그대로 사용), `sim/models.js`(다른 작업이 `tools/embed_models_v5.js` 로 갱신한다 — 있으면 읽기만), `firmware/`, `tests/`, `tools/`, `docs/`(이 파일과 `docs/SIM_V5.md` 신규 작성 제외). 커밋하지 않는다.

## 기구 (HARDWARE_V5.md 1·2절, 숫자는 `tools/robot_v5_params.py` 의 P = `CubeModels.params`)
- 국소 홀더 좌표: 원점 = 큐브 아래면 중심, +y 앞(관중), +z 위. 장면 전체를 x축 둘레로 −20° 기울여(뒤가 낮게) 월드로 둔다. 책상면 z_w −72.
- 큐브: **시중 3×3** (57 mm, 조각 19, 스티커 색 6, 모서리 둥글기 1.5) — V4 도넛 큐브·소켓은 없다. `sim/cube.js` 상태로 스티커를 칠한다(기존 `paint` 재사용 가능).
- 컵 `cube_holder`: 판 66×66×4(노치 4), 기둥 4(안쪽 29.5, 높이 15, 모따기 5), 허브 Ø16. 그 아래 NEMA17(42.3 상자) 과 베이스(모터 상자 48×48 쐐기 + 뒤 데크 + 타워 2장 |x| 39.5~45.5, y −95~−30, z ~60).
- 후드 `hood`: 벽 바깥 66 안 60, z 21~61.5, 지붕 44×44 구멍, 팔 2장이 힌지 (y −82, z 14.4) 허브까지. 각 φ: CLOSE 0 / OPEN 60 / FLIP 70 / LOAD 150 (앞이 올라가는 방향 +, 힌지 x축 둘레 회전). 오른쪽 타워 바깥에 MG996R 상자.
- 리프터 `lifter`: 선반 앞끝 Q 최하 (−30.2, −6.5), 경로 방향 (−sin26°, cos26°), 행정 66. 갈고리 폭 16, 몸통, 크로스바 x ±41 (Q + (−14, −5)). 왼쪽 타워 바깥에 SG90 + 크랭크 33 + 링크 70(핀 중심 간, 크랭크 축 (−28, −45)): 슬라이더 위치 s 에 맞춰 크랭크 각을 역산해 그린다.
- `CubeModels.parts[이름].b64`(STL, XY 중심·바닥 z=0)와 `params.print_offsets[이름] = [x중심, y중심, z최소]` 가 있으면 그 메시를 국소 좌표에 놓고(V4 `stlGeometry` 재사용), 없으면 위 치수로 기본 도형(Box/Cylinder)을 그린다. 부품 이름: cube_holder, hood, lifter, base, crank, link. `params.purchased` 의 상자도 그린다.

## 동작 (sim/mechanism.js 의 동작 목록을 그대로 애니메이션)
`new CubeMechanism.Mechanism()`; `plan(m)`/`planSeq`/`load()`/`eject()`/`manualFlip()`/`manualSpin(k)` 가 `{type, line, ...}` 목록을 돌려준다. 각 동작의 애니메이션(시간은 `Mechanism.durationMs(a)`):
- `hood`: 후드를 현재 φ 에서 목표 φ(CLOSE 0/OPEN 60/LOAD 150)로 힌지 둘레 회전.
- `turn` (k 0/1/2 = D/D2/D'): 컵 + 큐브 **아래 층만** z축 둘레 회전(D = 위에서 봐서 반시계 90°, D2 180°, D' 시계 90°). 오버슈트 7°(2 스텝) 갔다가 돌아오는 모습을 포함하면 좋다. 큐브 모델 갱신은 기존처럼 `cube.move(m)` (논리 수).
- `spin` (k 1/2/3 = y/y2/y'): 컵 + 큐브 전체 z축 둘레 회전 (y = 위에서 봐서 시계 90°). 큐브 논리 상태는 바뀌지 않고 **물리 배치만** 바뀐다 → 큐브 그룹의 자세(quaternion)를 누적한다.
- `flip`: 후드 60→70° → 리프터 s 0→63(0.9 s) 동안 큐브는 `models/robot_v5/kinematic_checks.json` 의 `flip_trace` 처럼 뒤쪽 아래 모서리가 선반을 따라 올라가고 앞쪽 아래 모서리 yf 가 판 위를 미끄러져 −28.3 까지 간 뒤(바닥면 각 θ 0→65°), 65° 에서 앞으로 넘어져(θ 65→90°, 0.25 s, 중력 가속 느낌) 자리에 떨어진다 → 리프터 s→0(0.6 s) → 후드 70→60°. 큐브 전체 자세에 x' 회전(F→D)을 누적한다. 넘어지는 동안 큐브의 회전 중심은 앞쪽 아래 모서리(국소 (y −28.3, z 0), x축 평행)다. **큐브는 항상 기둥 안에 착지하므로 마지막 자세를 (0,0,0) 정렬 위치로 스냅**한다.
- `msg`/`loaded`/`ejected`: 로그·LCD 만.
로그 줄은 `a.line` 을 그대로 쓴다(펌웨어와 같은 출력). 끝 줄: `SCRAMBLED exec=<ms>ms flips=<n> spins=<n>`, `SOLVED ok=1 moves=<n> flips=<n> spins=<n> calc=<ms>ms exec=<ms>ms`, `MOVED <n> flips=.. spins=..` (regrips 는 없어졌다). LCD 문구는 HARDWARE_V5.md 3.4 표 그대로.

## UI (sim/index.html)
버튼: LOAD(한 단계: READY TO LOAD → LOADED → EJECT), SCRAMBLE(시드 입력), SOLVE, MOVES(수열 입력), RESET, FLIP(시연), SPIN(y 한 번). 카메라 프리셋: **관중(앞 약간 위)**, 옆, 위, 뒤(서보). 가시성 토글: 후드, 타워, 베이스. 상태 패널: hood/lifter/ori(물리 위치별 논리 면 글자 6개)/flips/spins/hoods/예상 시간. 기존 `tools/serve.js` 로 `http://localhost:8765/sim/` 에서 열린다 (Three.js 는 CDN 그대로).
`docs/SIM_V5.md` 에 사용법·동작 대응표·스크린샷 명령(`POST /__screenshot?name=sim_v5_robot.jpg` → `docs/images/`)을 적고, 실제로 `node tools/serve.js` 를 띄워 `docs/images/sim_v5_robot.jpg`(관중 시점, 큐브 장착·후드 OPEN)와 `sim_v5_flip.jpg`(뒤집기 중간)를 저장한다(가능하면 headless 브라우저 없이 `tools/serve.js` 의 스크린샷 엔드포인트가 쓰는 방식을 따른다; 안 되면 이유를 보고).

## 검증
`node -e "const M=require('./sim/mechanism.js');const C=require('./sim/cube.js');const m=new M.Mechanism();m.load();m.load();console.log(m.planSeq(C.parseMoves('R U R\\' U\\' F D2 B L')).map(a=>a.line).join('\\n'))"` 의 줄 순서대로 애니메이션이 재생되고, 300 시드 `S`→`V` 가 모두 `SOLVED ok=1` 로 끝나야 한다 (`node tools/test_solver.js 20 1` 로 수열만 먼저 확인). 브라우저 콘솔 오류 0.

## 보고
바꾼 파일, 애니메이션 대응표, 스크린샷 경로, 남은 문제.
