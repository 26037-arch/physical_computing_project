# v5/video/data — 영상·포스터용 알고리즘 실제 데이터

생성: `node tools/export_algo_viz_v5.js [seed=1]` → `algo_seed<seed>.json` (V5 풀이기 `v5/sim/solver.js` 의 실제 실행 결과, 지어낸 값 없음)

## 필드
- `scramble`: 섞기 20수. `stickersAfterScramble`: 섞은 직후 54자. `stickerFormat`: 형식 설명(면 순서 U R F D L B, 면당 9칸 왼위→오른아래, 글자 = 색이 속한 면).
- `stickerSteps`: `{move, phase, stickers}` 배열. 풀린 상태(move null) → 섞기 각 수(`scramble`) → 풀이 각 수(`CROSS`, `F2L FL` 등, `OLL`, `PLL`).
- `stages`: 풀이기가 보고한 단계 `{name, moves, nodes, ms, case?}`. OLL/PLL 은 `case` 에 공식 이름. `ms` 는 실행 때마다 달라진다.
- `cross.ida`: 크로스 IDA* 추적.
  - `bounds[]`: 반복별 `{bound, visited, pruned, skippedByRule, goalFound}`. visited = 반복 중 생성한 자식 수(루트 제외, solver.nodes 와 같은 센 방식), pruned = g+h>bound 로 잘린 자식(visited 에 포함), skippedByRule = 같은 면 연속/반대면 순서 규칙으로 생성 전 건너뛴 수.
  - `trace[]`: `{id, parent, depth, move, g, h, f, bound, event}`, event = expand | prune | goal. id 0 은 루트(반복마다 한 줄).
  - `heuristic`: 하한 설명, 엣지 쌍 목록, `rootH`(루트 h). `solution`, `nodes`.
- `f2l[]`: `{slot, nodes, moves}`. `oll`/`pll`: `{case, moves}`.
- `totals`: 총 수, 총 노드, 크로스 노드, `crossNodeRatio`, 풀이 문자열.

## 검증 (스크립트가 자동 수행, 실패 시 종료코드 1)
- 크로스 탐색을 도구 안에 같은 순서로 복제해 계측하고, 원본 solver 의 크로스 수열·노드 수와 같은지 assert.
- 섞기·단계별 수열·TOTAL 이 `v5/tests/solve_seed<seed>.test.yaml` 의 문자열과 같은지 대조(파일이 있을 때).
- `stickerSteps` 마지막 상태가 풀린 상태인지 확인.
