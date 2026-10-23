// tools/gen_tables.js — 풀이기가 쓰는 모든 표를 오프라인에서 생성한다.
//   node tools/gen_tables.js
// 출력: firmware/main/tables.h (PROGMEM), sim/tables.js (브라우저/Node 공용)
//  1) 18수 치환표 MOVE_*               2) 조각 1개 거리표 (BFS)
//  3) 크로스 엣지 쌍 거리표 6개 (18수)   4) F2L 코너·엣지 쌍 거리표 4개 (사람 F2L 의 매크로 수: U 회전 + 트리거 X U^k X')
//  5) OLL/PLL 공식 → 겉면 수열 변환 → 역연산으로 인식 키 생성, 빠진 경우는 2-look 조합으로 보충
//  생성 시 F2L 트리거가 크로스·다른 슬롯을 보존하는지, 어떤 완성 슬롯 조합에서도 모든 쌍 상태가 풀리는지 전수 검사한다.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../sim/cube.js');
const ALGS = require('./algs.js');
const { Cube, MOVES, U, R, F, D, L, B, expandAlg, inverseSeq, simplifySeq } = C;

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
const clean = (t) => Array.from(t, (v) => (v === 255 ? 0 : v));
const problems = [];

// ---- F2L 매크로 수 (사람의 "직관 F2L"): U 회전 3가지 + 슬롯마다 트리거 X U^k X' 2종류 × k 3가지 ----
// 슬롯 s = (코너 4+s, 엣지 8+s) 의 인접 면 (a, b): FR=(R,F) FL=(F,L) BL=(L,B) BR=(B,R).
// 트리거는 a U^k a' (a 시계) 와 b' U^k b (b 반시계) — 둘 다 슬롯 s 의 내용물만 U층과 교환하고
// 크로스 엣지 4개와 나머지 슬롯 3개는 그대로 둔다 (켤레 X U^k X^-1 은 X 가 U층으로 올린 조각만 바꾼다). 아래에서 전수 검사.
// F2L_TRIG[s][fam] = 트리거의 첫 수 번호 X (마지막 수는 X 의 역수). 매크로 비용 = 겉면 수 개수 (U 1, 트리거 3).
const SLOT_FACES = [[R, F], [F, L], [L, B], [B, R]];
const F2L_TRIG = SLOT_FACES.map(([a, b]) => [a * 3, b * 3 + 2]);
const invMove = (m) => ((m / 3) | 0) * 3 + 2 - (m % 3);
const MACROS = []; // 순서 = 풀이기의 전개 순서: U, U2, U', 그 다음 슬롯 0..3 × 종류 0..1 × k 1..3
for (let k = 0; k < 3; k++) MACROS.push({ moves: [U * 3 + k], slot: -1, fam: 0, cost: 1 });
for (let s = 0; s < 4; s++) for (let fam = 0; fam < 2; fam++) for (let k = 0; k < 3; k++) {
  const X = F2L_TRIG[s][fam];
  MACROS.push({ moves: [X, U * 3 + k, invMove(X)], slot: s, fam, cost: 3 });
}
for (const M of MACROS) if (M.slot >= 0) { // 검사: 자기 슬롯만 건드리고 크로스·다른 슬롯은 보존
  const c = new Cube().apply(M.moves);
  for (let i = 4; i < 8; i++) if (i !== 4 + M.slot && (c.cp[i] !== i || c.co[i])) throw new Error(`trigger breaks corner ${i}: ${JSON.stringify(M)}`);
  for (let i = 4; i < 12; i++) if (i !== 8 + M.slot && (c.ep[i] !== i || c.eo[i])) throw new Error(`trigger breaks edge ${i}: ${JSON.stringify(M)}`);
  if (c.cp[4 + M.slot] === 4 + M.slot && c.ep[8 + M.slot] === 8 + M.slot) throw new Error(`trigger leaves its slot: ${JSON.stringify(M)}`);
}
const macroStep = (u, M) => { let cs = (u / 24) | 0, es = u % 24; for (const m of M.moves) { cs = cStep(cs, m); es = eStep(es, m); } return cs * 24 + es; };
// 매크로 그래프(간선 비용 1 또는 3)에서 풀린 쌍까지의 최단 거리 = 겉면 수 개수. 허용 매크로 집합을 바꿔 가며 쓴다.
function macroDist(s, macros) {
  const d = new Uint8Array(576).fill(255);
  const start = ((4 + s) * 3) * 24 + (8 + s) * 2;
  d[start] = 0;
  for (let changed = true; changed;) { // 간선 수가 적어 단순 완화 반복(벨만-포드)으로 충분
    changed = false;
    for (let u = 0; u < 576; u++) {
      if (d[u] === 255) continue;
      for (const M of macros) { const v = macroStep(u, M); if (d[u] + M.cost < d[v]) { d[v] = d[u] + M.cost; changed = true; } }
    }
  }
  return d;
}
// F2L_PAIR[s]: 모든 매크로(27개)를 허용한 거리. 풀이기는 완성된 슬롯의 트리거를 금지하므로 이 값은 하한(허용적)이다.
const F2L_PAIR = [0, 1, 2, 3].map((s) => macroDist(s, MACROS));
// 완전성 검사: 어떤 완성 슬롯 조합에서도(그 슬롯의 트리거 금지) 완성 슬롯 밖의 모든 쌍 상태(코너 24 × 엣지 U층·중간층 16)가 풀린다
let f2lMaxLen = 0;
for (let s = 0; s < 4; s++) for (let mask = 0; mask < 8; mask++) {
  const others = [0, 1, 2, 3].filter((x) => x !== s);
  const done = others.filter((_, i) => mask & (1 << i));
  const d = macroDist(s, MACROS.filter((M) => M.slot < 0 || !done.includes(M.slot)));
  for (let u = 0; u < 576; u++) {
    const cp = ((u / 24) | 0) / 3 | 0, ep = (u % 24) >> 1;
    if ((ep >= 4 && ep < 8) || (cp >= 4 && done.includes(cp - 4)) || (ep >= 8 && done.includes(ep - 8))) continue;
    if (d[u] === 255) problems.push(`F2L unsolvable: slot ${s} done ${JSON.stringify(done)} state ${u}`);
    else if (d[u] > f2lMaxLen) f2lMaxLen = d[u];
  }
}

// ---- OLL / PLL ----
const ollKey = (c) => ((((c.co[0] * 3 + c.co[1]) * 3 + c.co[2]) * 3 + c.co[3]) << 4) | (c.eo[0] << 3) | (c.eo[1] << 2) | (c.eo[2] << 1) | c.eo[3];
const pllKey = (c) => (c.cp[0] << 14) | (c.cp[1] << 12) | (c.cp[2] << 10) | (c.cp[3] << 8) | (c.ep[0] << 6) | (c.ep[1] << 4) | (c.ep[2] << 2) | c.ep[3];
const f2lIntact = (c) => { for (let i = 4; i < 8; i++) if (c.cp[i] !== i || c.co[i]) return false; for (let i = 4; i < 12; i++) if (c.ep[i] !== i || c.eo[i]) return false; return true; };
const llOriented = (c) => c.co.every((v) => !v) && c.eo.every((v) => !v);
const aufMove = (k) => (k ? [U * 3 + k - 1] : []); // k=0 없음, 1=U, 2=U2, 3=U'

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
//
// [수학적 정의 — docs/MATH.md]
//  MOVE_*[m]        : 수 M_m = (σ^M, o^M).  적용: σ'(i) = σ(σ^M(i)), o'(i) = o(σ^M(i)) + o^M(i)
//  EDGE_TO/DO[m][p] : 조각 상태 전이 T_M(p,o) = (q, o + o^M(q)), q = (σ^M)^-1(p)   (코너도 동일)
//  CROSS_PAIR[..]   : 조각 집합 P 의 사영 그래프에서 목표까지 BFS 거리 d_P(u). 실제 L수 해의 사영 경로도 길이 L
//                     이므로 d_P(π_P(s)) ≤ d*(s) — 허용적 휴리스틱 (18수 기준).
//  F2L_PAIR[s][..]  : 슬롯 s 의 코너·엣지 쌍이 매크로 수(U^k 비용 1, 트리거 X U^k X' 비용 3)로 풀리기까지의 최단 겉면 수.
//                     트리거는 크로스·다른 슬롯을 보존하므로 F2L 탐색은 쌍 2바이트만 추적한다. 255 = 도달 불가(크로스 자리).
//  F2L_TRIG[s][fam] : 슬롯 s 트리거의 첫 수 X (fam 0: a U^k a', fam 1: b' U^k b). 마지막 수는 X 의 역수.
//  OLL_KEY[i]       : key_OLL(I·A_i^-1) — 공식 A_i 의 역연산을 풀린 큐브에 적용한 상태의 방향 키.
//                     s·r·A 가 방향 0 ⇔ key_OLL(s·r) = OLL_KEY  (방향은 위치와 무관한 아핀 함수로 변하므로)
//  PLL_KEY[i]       : key_PLL(I·u^-1·A^-1), PLL_AUF[i] = u.   s·r·A·u = I ⇔ s·r = u^-1·A^-1
//  공식 수열은 wide/슬라이스/회전을 겉면 6면 수로 변환한 것: ρ X = X^ρ ρ 로 회전을 오른쪽으로 밀어 S = S'·ρ_net,
//                     풀린 상태는 회전 불변이므로 s·S = I ⇔ s·S' = I.  (sim/cube.js expandAlg)
//  생성 시 OLL 216 상태·PLL 288 상태 전부에 대해 "조회됨 ∧ 적용 후 목표 달성" 을, F2L 은 완성 슬롯 조합 8가지 × 쌍 상태 전부가
//  허용 매크로만으로 풀리는지를 검사한다.
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
h += `\n// F2L 쌍 거리표 (매크로 수 기준 겉면 수, 255 = 도달 불가): 슬롯 s = (코너 4+s, 엣지 8+s), 인덱스 = 코너상태*24+엣지상태\n`;
h += lines('F2L_PAIR', 'uint8_t', F2L_PAIR.map((t) => Array.from(t)), 24);
h += `// F2L 트리거 첫 수: [슬롯][종류] (FR: R U^k R', F' U^k F / FL: F U^k F', L' U^k L / BL: L U^k L', B' U^k B / BR: B U^k B', R' U^k R)\n`;
h += lines('F2L_TRIG', 'uint8_t', F2L_TRIG, 2);
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
    CROSS_PAIRS, CROSS_PAIR: CROSS_PAIR.map(clean), F2L_PAIR: F2L_PAIR.map((t) => Array.from(t)), F2L_TRIG, OLL, PLL,
  })};
  global.CubeTables = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(path.join(root, 'sim/tables.js'), js);

console.log(`OLL entries ${OLL.length} (2look 보충 ${ollFilled}, 인식된 OLL 경우 ${ollClasses.size}), PLL entries ${PLL.length} (2look 보충 ${pllFilled}, PLL 경우 ${pllClasses.size})`);
console.log(`cross pair table max ${Math.max(...CROSS_PAIR.map((t) => Math.max(...clean(t))))}, f2l pair max ${Math.max(...F2L_PAIR.map((t) => Math.max(...Array.from(t).filter((v) => v !== 255))))} (완성 슬롯 트리거 금지 시 최장 ${f2lMaxLen})`);
console.log(`PROGMEM bytes: moves ${(8 + 8 + 12 + 12) * 18}, dist ${24 * (12 + 12 + 8) + 576 * 10}, OLL moves ${o.mv.length}, PLL moves ${p.mv.length}`);
if (problems.length) { console.log('PROBLEMS:'); problems.forEach((x) => console.log('  ' + x)); process.exitCode = 1; }
else console.log('all OLL/PLL cases covered, tables written');
