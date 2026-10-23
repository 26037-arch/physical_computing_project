// tools/gen_tables.js — 풀이기가 쓰는 모든 표를 오프라인에서 생성한다.
//   node tools/gen_tables.js
// 출력: firmware/main/tables.h (PROGMEM), sim/tables.js (브라우저/Node 공용)
//  1) 18수 치환표 MOVE_*               2) 조각 1개 거리표 (BFS)
//  3) 크로스 엣지 쌍 거리표 6개 (18수)   4) F2L 코너·엣지 쌍 거리표 4개 (D 제외 15수)
//  5) OLL/PLL 공식 → 겉면 수열 변환 → 역연산으로 인식 키 생성, 빠진 경우는 2-look 조합으로 보충
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../sim/cube.js');
const ALGS = require('./algs.js');
const { Cube, MOVES, U, D, expandAlg, inverseSeq, simplifySeq } = C;

const ALL18 = [...Array(18).keys()];
const NO_D15 = ALL18.filter((m) => ((m / 3) | 0) !== D);

// ---- 조각 이동표: 위치 p 에 있던 조각이 수 m 뒤 어디로 가고 방향이 얼마나 바뀌는지 ----
const edgeTo = [], edgeDo = [], cornTo = [], cornDo = [];
for (let m = 0; m < 18; m++) {
  const M = MOVES[m];
  edgeTo[m] = new Array(12); edgeDo[m] = new Array(12); cornTo[m] = new Array(8); cornDo[m] = new Array(8);
  for (let q = 0; q < 12; q++) { edgeTo[m][M.ep[q]] = q; edgeDo[m][M.ep[q]] = M.eo[q]; }
  for (let q = 0; q < 8; q++) { cornTo[m][M.cp[q]] = q; cornDo[m][M.cp[q]] = M.co[q]; }
}
const eStep = (s, m) => { const p = s >> 1, o = s & 1; return (edgeTo[m][p] << 1) | ((o + edgeDo[m][p]) & 1); };
const cStep = (s, m) => { const p = (s / 3) | 0, o = s % 3; return cornTo[m][p] * 3 + (o + cornDo[m][p]) % 3; };

// 일반 BFS: 상태 → 이웃 함수, 시작 상태, 상태 수
function bfs(size, start, neighbors) {
  const dist = new Uint8Array(size).fill(255);
  dist[start] = 0; let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const t of neighbors(s)) if (dist[t] === 255) { dist[t] = dist[s] + 1; next.push(t); }
    frontier = next;
  }
  return dist;
}
const edgeSingle = (cubie, moves) => bfs(24, cubie * 2, (s) => moves.map((m) => eStep(s, m)));
const cornSingle = (cubie, moves) => bfs(24, cubie * 3, (s) => moves.map((m) => cStep(s, m)));
const edgePair = (a, b, moves) => bfs(576, (a * 2) * 24 + b * 2, (s) => moves.map((m) => eStep((s / 24) | 0, m) * 24 + eStep(s % 24, m)));
const cornEdgePair = (c, e, moves) => bfs(576, (c * 3) * 24 + e * 2, (s) => moves.map((m) => cStep((s / 24) | 0, m) * 24 + eStep(s % 24, m)));

const EDGE1_18 = [], EDGE1_15 = [], CORNER1_15 = [];
for (let e = 0; e < 12; e++) { EDGE1_18.push(edgeSingle(e, ALL18)); EDGE1_15.push(edgeSingle(e, NO_D15)); }
for (let c = 0; c < 8; c++) CORNER1_15.push(cornSingle(c, NO_D15));
const CROSS_PAIRS = [[4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [6, 7]]; // DR DF DL DB 중 2개
const CROSS_PAIR = CROSS_PAIRS.map(([a, b]) => edgePair(a, b, ALL18));
const F2L_PAIR = [0, 1, 2, 3].map((s) => cornEdgePair(4 + s, 8 + s, NO_D15)); // (DFR,FR) (DLF,FL) (DBL,BL) (DRB,BR)
const clean = (t) => Array.from(t, (v) => (v === 255 ? 0 : v));

// ---- OLL / PLL ----
const ollKey = (c) => ((((c.co[0] * 3 + c.co[1]) * 3 + c.co[2]) * 3 + c.co[3]) << 4) | (c.eo[0] << 3) | (c.eo[1] << 2) | (c.eo[2] << 1) | c.eo[3];
const pllKey = (c) => (c.cp[0] << 14) | (c.cp[1] << 12) | (c.cp[2] << 10) | (c.cp[3] << 8) | (c.ep[0] << 6) | (c.ep[1] << 4) | (c.ep[2] << 2) | c.ep[3];
const f2lIntact = (c) => { for (let i = 4; i < 8; i++) if (c.cp[i] !== i || c.co[i]) return false; for (let i = 4; i < 12; i++) if (c.ep[i] !== i || c.eo[i]) return false; return true; };
const llOriented = (c) => c.co.every((v) => !v) && c.eo.every((v) => !v);
const aufMove = (k) => (k ? [U * 3 + k - 1] : []); // k=0 없음, 1=U, 2=U2, 3=U'

const problems = [];
const OLL = [], PLL = [];
for (const [num, alg] of ALGS.OLL) {
  const seq = simplifySeq(expandAlg(alg));
  const probe = new Cube().apply(seq);
  if (!f2lIntact(probe)) { problems.push(`OLL ${num} breaks F2L: ${alg}`); continue; }
  const state = new Cube().apply(inverseSeq(seq)); // 이 공식이 푸는 패턴
  if (llOriented(state)) { problems.push(`OLL ${num} does nothing to orientation: ${alg}`); continue; }
  OLL.push({ name: `OLL ${num}`, key: ollKey(state), moves: seq });
}
for (const [name, alg] of ALGS.PLL) {
  const seq = simplifySeq(expandAlg(alg));
  const probe = new Cube().apply(seq);
  if (!f2lIntact(probe) || !llOriented(probe)) { problems.push(`PLL ${name} is not a pure LL permutation: ${alg}`); continue; }
  for (let auf = 0; auf < 4; auf++) { // 공식 뒤에 U 조정(auf)이 따라오는 상태의 키도 저장
    const state = new Cube().apply(inverseSeq(aufMove(auf))).apply(inverseSeq(seq));
    PLL.push({ name, key: pllKey(state), moves: seq, auf });
  }
}
PLL.push(...[1, 2, 3].map((auf) => ({ name: 'AUF', key: pllKey(new Cube().apply(inverseSeq(aufMove(auf)))), moves: [], auf })));

// 조회 함수 (풀이기와 같은 규칙: 사전 AUF 0..3 순서로 첫 매치)
const SOLVED_OLL = ollKey(new Cube()), SOLVED_PLL = pllKey(new Cube());
function lookupOLL(c) {
  for (let r = 0; r < 4; r++) {
    const k = ollKey(c.clone().apply(aufMove(r)));
    if (k === SOLVED_OLL) return { moves: aufMove(r), name: 'OLL skip' };
    const e = OLL.find((o) => o.key === k);
    if (e) return { moves: aufMove(r).concat(e.moves), name: e.name };
  }
  return null;
}
function lookupPLL(c) {
  for (let r = 0; r < 4; r++) {
    const k = pllKey(c.clone().apply(aufMove(r)));
    if (k === SOLVED_PLL) return { moves: aufMove(r), name: 'PLL skip' };
    const e = PLL.find((o) => o.key === k);
    if (e) return { moves: aufMove(r).concat(e.moves, aufMove(e.auf)), name: e.name };
  }
  return null;
}

// ---- 커버리지 검사 + 2-look 조합으로 빠진 경우 보충 ----
const ollStates = [];
for (let co = 0; co < 81; co++) {
  const cos = [(co / 27) | 0, ((co / 9) | 0) % 3, ((co / 3) | 0) % 3, co % 3];
  if (cos.reduce((a, b) => a + b) % 3) continue;
  for (let eo = 0; eo < 16; eo++) {
    const eos = [(eo >> 3) & 1, (eo >> 2) & 1, (eo >> 1) & 1, eo & 1];
    if (eos.reduce((a, b) => a + b) % 2) continue;
    const c = new Cube(); for (let i = 0; i < 4; i++) { c.co[i] = cos[i]; c.eo[i] = eos[i]; }
    if (!llOriented(c)) ollStates.push(c);
  }
}
let ollFilled = 0;
const ollClasses = new Set();
for (const c of ollStates) {
  const r = lookupOLL(c);
  if (r && llOriented(c.clone().apply(r.moves))) { ollClasses.add(r.name); continue; }
  let found = null;
  outer: for (const e of [''].concat(ALGS.OLL_EDGE)) for (let r1 = 0; r1 < 4; r1++) for (const k of [''].concat(ALGS.OLL_CORNER)) for (let r2 = 0; r2 < 4; r2++) {
    const seq = simplifySeq(aufMove(r1).concat(e ? expandAlg(e) : [], aufMove(r2), k ? expandAlg(k) : []));
    if (!seq.length) continue;
    if (llOriented(c.clone().apply(seq))) { found = seq; break outer; }
  }
  if (!found) { problems.push('OLL uncovered: ' + JSON.stringify([c.co.slice(0, 4), c.eo.slice(0, 4)])); continue; }
  OLL.push({ name: 'OLL 2look', key: ollKey(c), moves: found }); ollFilled++;
}
const pllStates = [];
const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i)).map((p) => [x, ...p])));
const parity = (p) => { let s = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++; return s & 1; };
for (const cp of perms([0, 1, 2, 3])) for (const ep of perms([0, 1, 2, 3])) {
  if (parity(cp) !== parity(ep)) continue;
  const c = new Cube(); for (let i = 0; i < 4; i++) { c.cp[i] = cp[i]; c.ep[i] = ep[i]; }
  if (!c.isSolved()) pllStates.push(c);
}
let pllFilled = 0;
const pllClasses = new Set();
const basics = ALGS.PLL_BASIC.map((a) => expandAlg(a));
for (const c of pllStates) {
  const r = lookupPLL(c);
  if (r && c.clone().apply(r.moves).isSolved()) { pllClasses.add(r.name); continue; }
  let found = null;
  const rec = (prefix, d) => {
    if (found) return;
    if (d === 0) {
      for (let r2 = 0; r2 < 4; r2++) { const seq = simplifySeq(prefix.concat(aufMove(r2))); if (c.clone().apply(seq).isSolved()) { found = seq; return; } }
      return;
    }
    for (let r1 = 0; r1 < 4; r1++) for (const b of basics) rec(prefix.concat(aufMove(r1), b), d - 1);
  };
  for (let depth = 1; depth <= 3 && !found; depth++) rec([], depth);
  if (!found) { problems.push('PLL uncovered: ' + JSON.stringify([c.cp.slice(0, 4), c.ep.slice(0, 4)])); continue; }
  PLL.push({ name: 'PLL 2look', key: pllKey(c), moves: found, auf: 0 }); pllFilled++;
}
// 표에 있지만 어떤 패턴에도 쓰이지 않은 공식 = 같은 경우가 중복된 것 (오타 가능성)
for (const e of OLL) if (!ollClasses.has(e.name) && e.name !== 'OLL 2look') problems.push(`${e.name} never used (duplicate case?)`);
for (const n of new Set(PLL.map((e) => e.name))) if (!pllClasses.has(n) && n !== 'PLL 2look' && n !== 'AUF') problems.push(`PLL ${n} never used (duplicate case?)`);

// ---- 출력 ----
const root = path.join(__dirname, '..');
const lines = (name, type, arr2d, cols) => {
  const flat = arr2d.flat();
  const dims = `[${arr2d.length}][${arr2d[0].length}]`;
  const rows = [];
  for (let i = 0; i < flat.length; i += cols) rows.push('  ' + flat.slice(i, i + cols).join(','));
  return `static const ${type} ${name}${dims} PROGMEM = {\n${rows.join(',\n')}\n};\n`;
};
const MOVE_CP = MOVES.map((m) => m.cp), MOVE_CO = MOVES.map((m) => m.co), MOVE_EP = MOVES.map((m) => m.ep), MOVE_EO = MOVES.map((m) => m.eo);
let h = `// 자동 생성 파일 — 수정하지 말 것. 생성: node tools/gen_tables.js (${new Date().toISOString().slice(0, 10)})
// 큐브 치환표, IDA* 가지치기 거리표, OLL/PLL 인식 키와 공식 수열. 모두 PROGMEM(플래시)에 둔다.
#pragma once
#include <stdint.h>
#include <avr/pgmspace.h>  // AVR: 플래시 접근, UNO R4(Renesas): 호환 매크로

`;
h += lines('MOVE_CP', 'uint8_t', MOVE_CP, 8) + lines('MOVE_CO', 'uint8_t', MOVE_CO, 8) + lines('MOVE_EP', 'uint8_t', MOVE_EP, 12) + lines('MOVE_EO', 'uint8_t', MOVE_EO, 12);
h += `\n// 조각 이동표: 위치 p 의 조각은 수 m 뒤 EDGE_TO[m][p] 로 가고 방향에 EDGE_DO[m][p] 가 더해진다 (탐색 중 조각 추적용)\n`;
h += lines('EDGE_TO', 'uint8_t', edgeTo, 12) + lines('EDGE_DO', 'uint8_t', edgeDo, 12) + lines('CORNER_TO', 'uint8_t', cornTo, 8) + lines('CORNER_DO', 'uint8_t', cornDo, 8);
h += `\n// 조각 1개 거리표: [조각][위치*방향수+방향]. _18 = 18수, _15 = D 제외 15수(F2L)\n`;
h += lines('EDGE1_18', 'uint8_t', EDGE1_18.map(clean), 24) + lines('EDGE1_15', 'uint8_t', EDGE1_15.map(clean), 24) + lines('CORNER1_15', 'uint8_t', CORNER1_15.map(clean), 24);
h += `\n// 크로스 엣지 쌍 거리표 (18수): CROSS_PAIRS 순서, 인덱스 = 상태A*24+상태B\n`;
h += lines('CROSS_PAIRS', 'uint8_t', CROSS_PAIRS, 2) + lines('CROSS_PAIR', 'uint8_t', CROSS_PAIR.map(clean), 24);
h += `\n// F2L 쌍 거리표 (15수): 슬롯 s = (코너 4+s, 엣지 8+s), 인덱스 = 코너상태*24+엣지상태\n`;
h += lines('F2L_PAIR', 'uint8_t', F2L_PAIR.map(clean), 24);
const flatAlgs = (list) => { const off = [0], mv = []; for (const e of list) { mv.push(...e.moves); off.push(mv.length); } return { off, mv }; };
const o = flatAlgs(OLL), p = flatAlgs(PLL);
h += `\n// OLL: 인식 키(코너 방향 4개 base3 <<4 | 엣지 방향 4비트), 공식 수열은 OLL_MOVES[OLL_OFF[i]..OLL_OFF[i+1])\n#define OLL_COUNT ${OLL.length}\n`;
h += `static const uint16_t OLL_KEY[${OLL.length}] PROGMEM = {${OLL.map((e) => e.key).join(',')}};\n`;
h += `static const uint16_t OLL_OFF[${OLL.length + 1}] PROGMEM = {${o.off.join(',')}};\n`;
h += `static const uint8_t OLL_MOVES[${o.mv.length}] PROGMEM = {${o.mv.join(',')}};\n`;
h += `static const uint8_t OLL_NUM[${OLL.length}] PROGMEM = {${OLL.map((e) => (e.name.match(/\d+/) || [0])[0]).join(',')}}; // 0 = 2look 보충\n`;
h += `\n// PLL: 인식 키(코너 위치 4개 2비트씩 <<8 | 엣지 위치 4개 2비트씩), PLL_AUF = 공식 뒤 U 조정(0..3)\n#define PLL_COUNT ${PLL.length}\n`;
h += `static const uint16_t PLL_KEY[${PLL.length}] PROGMEM = {${PLL.map((e) => e.key).join(',')}};\n`;
h += `static const uint16_t PLL_OFF[${PLL.length + 1}] PROGMEM = {${p.off.join(',')}};\n`;
h += `static const uint8_t PLL_MOVES[${p.mv.length}] PROGMEM = {${p.mv.join(',')}};\n`;
h += `static const uint8_t PLL_AUF[${PLL.length}] PROGMEM = {${PLL.map((e) => e.auf).join(',')}};\n`;
const pllNames = [...new Set(PLL.map((e) => e.name))];
h += `static const uint8_t PLL_NAME_IDX[${PLL.length}] PROGMEM = {${PLL.map((e) => pllNames.indexOf(e.name)).join(',')}};\n`;
h += `#define PLL_NAME_COUNT ${pllNames.length}\n`;
h += `static const char PLL_NAMES[${pllNames.length}][10] PROGMEM = {${pllNames.map((n) => JSON.stringify(n)).join(',')}};\n`;
fs.writeFileSync(path.join(root, 'firmware/main/tables.h'), h);

const js = `// 자동 생성 파일 — 수정하지 말 것. 생성: node tools/gen_tables.js
(function (global) {
  const T = ${JSON.stringify({
    EDGE_TO: edgeTo, EDGE_DO: edgeDo, CORNER_TO: cornTo, CORNER_DO: cornDo,
    EDGE1_18: EDGE1_18.map(clean), EDGE1_15: EDGE1_15.map(clean), CORNER1_15: CORNER1_15.map(clean),
    CROSS_PAIRS, CROSS_PAIR: CROSS_PAIR.map(clean), F2L_PAIR: F2L_PAIR.map(clean), OLL, PLL,
  })};
  global.CubeTables = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(path.join(root, 'sim/tables.js'), js);

console.log(`OLL entries ${OLL.length} (2look 보충 ${ollFilled}, 인식된 OLL 경우 ${ollClasses.size}), PLL entries ${PLL.length} (2look 보충 ${pllFilled}, PLL 경우 ${pllClasses.size})`);
console.log(`cross pair table max ${Math.max(...CROSS_PAIR.map((t) => Math.max(...clean(t))))}, f2l pair max ${Math.max(...F2L_PAIR.map((t) => Math.max(...clean(t))))}`);
console.log(`PROGMEM bytes: moves ${(8 + 8 + 12 + 12) * 18}, dist ${24 * (12 + 12 + 8) + 576 * 10}, OLL moves ${o.mv.length}, PLL moves ${p.mv.length}`);
if (problems.length) { console.log('PROBLEMS:'); problems.forEach((x) => console.log('  ' + x)); process.exitCode = 1; }
else console.log('all OLL/PLL cases covered, tables written');
