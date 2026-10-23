// tools/test_solver.js — JS 풀이기 회귀 테스트 + 통계
//   node tools/test_solver.js [섞기 수=300] [시드 시작=1]
// 섞기(20수) → 풀이 → 풀렸는지 검증. 수 길이·노드 수·시간 통계와,
// Wokwi 교차검증용 기대 출력(시드 1~3)을 출력한다.
'use strict';
const C = require('../sim/cube.js');
const { Solver } = require('../sim/solver.js');
const N = parseInt(process.argv[2] || '300', 10), SEED0 = parseInt(process.argv[3] || '1', 10);
const SCRAMBLE_LEN = 20;

const solver = new Solver();
let maxMoves = 0, sumMoves = 0, maxNodes = 0, sumNodes = 0, maxMs = 0, sumMs = 0, worst = null;
const stageMax = {};
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i;
  const scr = C.scramble(seed, SCRAMBLE_LEN);
  const cube = new C.Cube().apply(scr);
  const t0 = performance.now();
  const r = solver.solve(cube);
  const ms = performance.now() - t0;
  if (!cube.clone().apply(r.moves).isSolved()) { console.error('FAIL seed', seed); process.exit(1); }
  for (const s of r.stages) { const key = s.name.split(' ')[0]; stageMax[key] = Math.max(stageMax[key] || 0, s.nodes); }
  sumMoves += r.moves.length; sumNodes += r.nodes; sumMs += ms;
  if (r.moves.length > maxMoves) maxMoves = r.moves.length;
  if (r.nodes > maxNodes) { maxNodes = r.nodes; worst = seed; }
  if (ms > maxMs) maxMs = ms;
}
console.log(`${N} scrambles OK. moves avg ${(sumMoves / N).toFixed(1)} max ${maxMoves} | nodes avg ${Math.round(sumNodes / N)} max ${maxNodes} (seed ${worst}) | ms avg ${(sumMs / N).toFixed(2)} max ${maxMs.toFixed(1)}`);
console.log('stage max nodes:', stageMax);

// 펌웨어 시리얼 출력과 비교할 기대값
for (const seed of [1, 2, 3]) {
  const scr = C.scramble(seed, SCRAMBLE_LEN);
  const r = solver.solve(new C.Cube().apply(scr));
  console.log(`\nseed ${seed}\n SCRAMBLE ${C.seqToString(scr)}`);
  for (const s of r.stages) console.log(` ${s.name} (${s.moves.length}): ${C.seqToString(s.moves)}  nodes=${s.nodes}`);
  console.log(` TOTAL ${r.moves.length}: ${C.seqToString(r.moves)}`);
}
