// tools/host_check.js — 펌웨어 풀이기(cube.cpp, solver.cpp)를 PC 컴파일러(g++)로 빌드해 JS 풀이기와 시드별 출력을 글자 단위로 비교한다.
//   node tools/host_check.js [시드 시작=1] [개수=300]
// Wokwi 교차검증(tests/solve_seed*.test.yaml)과 같은 목적이지만 보드 없이 수백 개 시드를 몇 초 안에 돈다.
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const C = require('../sim/cube.js');
const { Solver } = require('../sim/solver.js');
const root = path.join(__dirname, '..');
const seed0 = parseInt(process.argv[2] || '1', 10), count = parseInt(process.argv[3] || '300', 10);
const exe = path.join(root, 'build', process.platform === 'win32' ? 'host_solver.exe' : 'host_solver');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const srcs = ['tools/host_solver/main.cpp', 'firmware/main/cube.cpp', 'firmware/main/solver.cpp'].map((f) => path.join(root, f));
const gxx = spawnSync('g++', ['-O2', '-std=c++17', '-I', path.join(root, 'tools/host_solver'), '-I', path.join(root, 'firmware/main'), ...srcs, '-o', exe], { stdio: 'inherit' });
if (gxx.status !== 0) { console.error('g++ 빌드 실패 (g++ 가 PATH 에 있어야 한다)'); process.exit(2); }
const fw = execFileSync(exe, [String(seed0), String(count)], { encoding: 'utf8', maxBuffer: 1 << 26 });
const solver = new Solver();
const lines = [];
for (let seed = seed0; seed < seed0 + count; seed++) {
  const scr = C.scramble(seed, 20);
  const r = solver.solve(new C.Cube().apply(scr));
  lines.push(`seed ${seed}`, ` SCRAMBLE ${C.seqToString(scr)}`);
  for (const s of r.stages) lines.push(` ${s.name} (${s.moves.length}): ${C.seqToString(s.moves)}  nodes=${s.nodes}`);
  lines.push(` TOTAL ${r.moves.length}: ${C.seqToString(r.moves)}`, ` SOLVED ok=1 nodes=${r.nodes}`);
}
const js = lines.join('\n') + '\n';
if (js === fw) { console.log(`host_check OK: 시드 ${seed0}..${seed0 + count - 1} 펌웨어 풀이기 출력 == JS 풀이기 출력 (${lines.length} 줄)`); }
else {
  const a = js.split('\n'), b = fw.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.error(`DIFF at line ${i + 1}\n JS: ${a[i]}\n FW: ${b[i]}`); break; }
  process.exit(1);
}
