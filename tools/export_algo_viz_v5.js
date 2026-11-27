// tools/export_algo_viz_v5.js — 영상·포스터용 알고리즘 실제 데이터 추출 (V5 풀이기 실행 결과)
//   node tools/export_algo_viz_v5.js [seed=1]  →  v5/video/data/algo_seed<seed>.json
// v5/sim 은 수정하지 않는다. 크로스 IDA* 는 solver.js 의 searchCross 를 같은 순서로 복제해 계측하고,
// 원본 결과(수열·노드 수)와 다르면 종료코드 1.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../v5/sim/cube.js');
const T = require('../v5/sim/tables.js');
const { Solver } = require('../v5/sim/solver.js');

const seed = parseInt(process.argv[2] || '1', 10);
const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };
const check = (cond, msg) => { if (!cond) fail(msg); };

const eStep = (s, m) => (T.EDGE_TO[m][s >> 1] << 1) | ((s + T.EDGE_DO[m][s >> 1]) & 1);
const edgeState = (c, cubie) => { for (let p = 0; p < 12; p++) if (c.ep[p] === cubie) return p * 2 + c.eo[p]; };
const hCross = (es) => {
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const [a, b] = T.CROSS_PAIRS[i];
    const d = T.CROSS_PAIR[i][es[a - 4] * 24 + es[b - 4]];
    if (d > h) h = d;
  }
  return h;
};

// ---- 크로스 IDA* 계측 복제 (solver.js searchCross / solveCross 와 같은 순서) ----
function tracedCross(cube) {
  const MAX_DEPTH = 14;
  const es0 = [4, 5, 6, 7].map((e) => edgeState(cube, e));
  const rootH = hCross(es0);
  const bounds = [];
  const trace = [];
  let nodes = 0;
  let cur = null;
  let nextId = 1;
  const path = [];
  // 반환: true 면 목표 도달
  function search(es, g, bound, lastFace, id) {
    const hv = hCross(es);
    // 이 노드가 prune/goal/expand 인지는 호출 전(자식 생성 시점)에 trace 에 기록한다. 여기서는 판정만.
    if (g + hv > bound) return false;
    if (hv === 0) return true;
    for (let m = 0; m < 18; m++) {
      const f = (m / 3) | 0;
      if (f === lastFace) { cur.skippedByRule++; continue; }
      if (lastFace >= 0 && f === C.oppositeFace(lastFace) && f < lastFace) { cur.skippedByRule++; continue; }
      nodes++; cur.visited++;
      const es2 = new Array(4);
      for (let i = 0; i < 4; i++) es2[i] = eStep(es[i], m);
      const h2 = hCross(es2);
      const cid = nextId++;
      const f2 = g + 1 + h2;
      let event = 'expand';
      if (f2 > bound) { event = 'prune'; cur.pruned++; } else if (h2 === 0) event = 'goal';
      trace.push({ id: cid, parent: id, depth: g + 1, move: C.moveName(m), g: g + 1, h: h2, f: f2, bound, event });
      path.push(m);
      if (search(es2, g + 1, bound, f, cid)) return true;
      path.pop();
    }
    return false;
  }
  let found = null;
  for (let bound = rootH; bound <= MAX_DEPTH; bound++) {
    cur = { bound, visited: 0, pruned: 0, skippedByRule: 0, goalFound: false };
    bounds.push(cur);
    trace.push({ id: 0, parent: -1, depth: 0, move: null, g: 0, h: rootH, f: rootH, bound, event: 'expand' });
    if (search(es0, 0, bound, -1, 0)) { cur.goalFound = true; found = path.slice(); break; }
  }
  return { moves: found, nodes, rootH, bounds, trace };
}

// ---- 실행 ----
const scr = C.scramble(seed, 20);
const start = new C.Cube().apply(scr);
const solver = new Solver();
const r = solver.solve(start);

const tc = tracedCross(start.clone());
const crossStage = r.stages[0];
check(tc.moves && C.seqToString(tc.moves) === C.seqToString(crossStage.moves), `복제 크로스 수열 불일치: ${tc.moves && C.seqToString(tc.moves)} vs ${C.seqToString(crossStage.moves)}`);
check(tc.nodes === crossStage.nodes, `복제 크로스 노드 불일치: ${tc.nodes} vs ${crossStage.nodes}`);

const stickers = (c) => c.toFacelets().map((f) => C.FACES[f]).join('');
const stickerSteps = [];
const cube = new C.Cube();
stickerSteps.push({ move: null, phase: 'solved', stickers: stickers(cube) });
for (const m of scr) { cube.move(m); stickerSteps.push({ move: C.moveName(m), phase: 'scramble', stickers: stickers(cube) }); }
const stickersAfterScramble = stickers(cube);
check(stickersAfterScramble === stickers(start), 'stickersAfterScramble 불일치');
const phaseOf = (name) => (name.startsWith('OLL') ? 'OLL' : name.startsWith('PLL') ? 'PLL' : name);
for (const st of r.stages) for (const m of st.moves) { cube.move(m); stickerSteps.push({ move: C.moveName(m), phase: phaseOf(st.name), stickers: stickers(cube) }); }
check(cube.isSolved(), '마지막 상태가 풀린 상태가 아님');
check(stickers(cube) === stickers(new C.Cube()), '마지막 스티커가 풀린 상태와 다름');

const stages = r.stages.map((s, i) => {
  const o = { name: s.name, moves: s.moves.map(C.moveName), nodes: s.nodes, ms: s.ms };
  if (i >= 5) o.case = s.name;
  return o;
});

// ---- 검증: solve_seed<seed>.test.yaml 과 대조 ----
const yamlPath = path.join(__dirname, '..', 'v5', 'tests', `solve_seed${seed}.test.yaml`);
if (fs.existsSync(yamlPath)) {
  const yaml = fs.readFileSync(yamlPath, 'utf8');
  const expectLine = (s) => check(yaml.includes(`wait-serial: ${JSON.stringify(s)}`), `yaml 에 없음: ${s}`);
  expectLine(`SCRAMBLE seed=${seed} (20): ${C.seqToString(scr)}`);
  for (const s of r.stages) expectLine(`${s.name} (${s.moves.length}): ${C.seqToString(s.moves)}`);
  expectLine(`TOTAL ${r.moves.length}: ${C.seqToString(r.moves)}`);
  console.log('verify: yaml 대조 통과 (섞기, 단계별 수열, TOTAL ' + r.moves.length + ')');
} else console.log(`warn: ${yamlPath} 없음 — yaml 대조 생략`);
console.log(`verify: 복제 크로스 == 원본 (수열 ${C.seqToString(tc.moves)}, 노드 ${tc.nodes})`);
console.log('verify: stickerSteps 마지막 = 풀린 상태');

const slotOf = (n) => n.slice(4);
const total = r.nodes;
const out = {
  seed,
  scramble: scr.map(C.moveName),
  stickerFormat: '54자, 면 순서 U R F D L B 각 9칸(왼위→오른아래, 면 안 순서 U1..U9 R1..R9 F D L B), 글자 = 그 색이 원래 속한 면(U R F D L B = 풀린 상태에서 그 면의 스티커 색)',
  stickersAfterScramble,
  stickerSteps,
  stages,
  cross: {
    ida: {
      note: 'visited = 반복 중 생성한 자식 수(solver.nodes 와 같은 방식, 루트 제외). pruned = g+h>bound 로 잘린 자식(visited 에 포함). skippedByRule = 같은 면 연속/반대면 순서 규칙으로 생성 전에 건너뜀(visited 미포함). trace 의 id 0 은 루트(반복마다 한 줄), prune 은 자식이 계산된 h 로 잘린 것.',
      heuristic: {
        description: '크로스 엣지 4개(DR DF DL DB)의 상태 (위치*2+방향, 24가지) 두 개씩 6쌍의 거리표(24x24) 조회 값의 최댓값 (solver.js hCross; 허용적 하한). 한 수에 엣지당 EDGE_TO/EDGE_DO 표 2번 조회로 상태 갱신.',
        pairs: T.CROSS_PAIRS,
        rootH: tc.rootH,
      },
      bounds: tc.bounds,
      trace: tc.trace,
      solution: tc.moves.map(C.moveName),
      nodes: tc.nodes,
    },
  },
  f2l: r.stages.filter((s) => s.name.startsWith('F2L')).map((s) => ({ slot: slotOf(s.name), nodes: s.nodes, moves: s.moves.map(C.moveName) })),
  oll: { case: r.stages[5].name, moves: r.stages[5].moves.map(C.moveName) },
  pll: { case: r.stages[6].name, moves: r.stages[6].moves.map(C.moveName) },
  totals: {
    moves: r.moves.length,
    nodes: total,
    crossNodes: crossStage.nodes,
    crossNodeRatio: total ? crossStage.nodes / total : 0,
    solution: C.seqToString(r.moves),
  },
};
const dir = path.join(__dirname, '..', 'v5', 'video', 'data');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `algo_seed${seed}.json`);
fs.writeFileSync(file, JSON.stringify(out));
console.log(`${file} (${fs.statSync(file).size} bytes, trace ${tc.trace.length} lines)`);
