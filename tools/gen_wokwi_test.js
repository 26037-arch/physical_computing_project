// tools/gen_wokwi_test.js — JS 풀이기의 결과로 Wokwi 교차검증 시나리오를 만든다.
//   node tools/gen_wokwi_test.js [seed=1]  →  tests/solve_seed<seed>.test.yaml
// 펌웨어가 같은 시드로 섞고 풀면 단계별 수열이 JS 와 글자 단위로 같아야 통과한다.
// V4: 가상 모드(Q 1)에서도 기구 절차(뒤집기·지지 전환)를 계획하므로 flips/regrips 횟수도 JS 기구 모델과 같아야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../sim/cube.js');
const R = require('../sim/robot_contract.js');
const { Solver } = require('../sim/solver.js');
const { Mechanism } = require('../sim/mechanism.js');
const seed = parseInt(process.argv[2] || '1', 10);
const scr = C.scramble(seed, R.scrambleLength);
const r = new Solver().solve(new C.Cube().apply(scr));
const mech = new Mechanism({ virtual: true });                 // 가상 모드 시작 상태: 모두 후퇴, orient 1
mech.planSeq(scr);
const scrStats = `flips=${mech.flips} regrips=${mech.regrips}`;
mech.resetCounters();
mech.planSeq(r.moves);
const solStats = `flips=${mech.flips} regrips=${mech.regrips}`;
const q = (s) => JSON.stringify(s);
const steps = [
  `  - wait-serial: "READY"`,
  `  - write-serial: ${q("Q 1" + String.fromCharCode(10))}`,
  `  - wait-serial: "MOTORS OFF"`,
  `  - write-serial: ${q("S " + seed + String.fromCharCode(10))}`,
  `  - wait-serial: ${q(`SCRAMBLE seed=${seed} (${R.scrambleLength}): ${C.seqToString(scr)}`)}`,
  `  - wait-serial: ${q(`SCRAMBLED exec=`)}`,
  `  - wait-serial: ${q(`ms ${scrStats}`)}`,
  `  - write-serial: ${q("V" + String.fromCharCode(10))}`,
];
for (const s of r.stages) steps.push(`  - wait-serial: ${q(`${s.name} (${s.moves.length}): ${C.seqToString(s.moves)}`)}`);
steps.push(`  - wait-serial: ${q(`TOTAL ${r.moves.length}: ${C.seqToString(r.moves)}`)}`);
steps.push(`  - wait-serial: "SOLVED ok=1 moves=${r.moves.length} ${solStats}"`);
const yaml = `# 자동 생성: node tools/gen_wokwi_test.js ${seed} — JS 풀이기(sim/solver.js)와 펌웨어 풀이의 교차검증
name: 시드 ${seed} 섞기 → 보드 풀이가 JS 풀이기와 단계별로 일치하고 큐브가 풀린다 (기구 절차 횟수 포함)
version: 1
author: physical_computing_project
steps:
${steps.join('\n')}
`;
const out = path.join(__dirname, '..', 'tests', `solve_seed${seed}.test.yaml`);
fs.writeFileSync(out, yaml);
console.log(out, `(${r.moves.length} moves, ${r.nodes} nodes, scramble ${scrStats}, solve ${solStats})`);
