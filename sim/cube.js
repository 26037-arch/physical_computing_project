// sim/cube.js — 3x3 큐브의 큐비(cubie) 모델. 펌웨어 firmware/main/cube.h 와 1:1 대응한다.
//
// 상태: 코너 8개(위치 cp, 방향 co∈{0,1,2}), 엣지 12개(위치 ep, 방향 eo∈{0,1}).
// 한 수(move) M 을 적용하면
//   cp'[i] = cp[M.cp[i]],  co'[i] = (co[M.cp[i]] + M.co[i]) % 3   (엣지도 같고 방향은 mod 2)
// 수 번호: m = face*3 + (회전수-1).  face: U=0 R=1 F=2 D=3 L=4 B=5,  회전수 1=시계, 2=180°, 3=반시계(')
//
// 브라우저(<script>)와 Node(require) 양쪽에서 쓰기 위해 전역 CubeLib 로 노출한다.
(function (global) {
  'use strict';
  const FACES = 'URFDLB';
  const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
  const URF = 0, UFL = 1, ULB = 2, UBR = 3, DFR = 4, DLF = 5, DBL = 6, DRB = 7;
  const UR = 0, UF = 1, UL = 2, UB = 3, DR = 4, DF = 5, DL = 6, DB = 7, FR = 8, FL = 9, BL = 10, BR = 11;
  const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
  const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

  const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
  const Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  // 기본 6수 (Kociemba 표기). 각 면을 시계 방향으로 90° 돌렸을 때의 치환.
  const BASIC = [
    { cp: [UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB], co: Z8, ep: [UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR], eo: Z12 },
    { cp: [DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR], eo: Z12 },
    { cp: [UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
    { cp: [URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR], co: Z8, ep: [UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR], eo: Z12 },
    { cp: [URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR], eo: Z12 },
    { cp: [URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
  ];

  function mult(a, b) { // a 다음 b
    const r = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
    for (let i = 0; i < 8; i++) { r.cp[i] = a.cp[b.cp[i]]; r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3; }
    for (let i = 0; i < 12; i++) { r.ep[i] = a.ep[b.ep[i]]; r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2; }
    return r;
  }

  const MOVES = []; // 18수
  for (let f = 0; f < 6; f++) {
    let m = BASIC[f];
    for (let k = 0; k < 3; k++) { MOVES.push(m); m = mult(m, BASIC[f]); }
  }

  class Cube {
    constructor() {
      this.cp = [0, 1, 2, 3, 4, 5, 6, 7]; this.co = Z8.slice();
      this.ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; this.eo = Z12.slice();
    }
    reset() { const s = new Cube(); this.cp = s.cp; this.co = s.co; this.ep = s.ep; this.eo = s.eo; return this; }
    clone() { const c = new Cube(); c.cp = this.cp.slice(); c.co = this.co.slice(); c.ep = this.ep.slice(); c.eo = this.eo.slice(); return c; }
    move(m) {
      const M = MOVES[m], cp = new Array(8), co = new Array(8), ep = new Array(12), eo = new Array(12);
      for (let i = 0; i < 8; i++) { cp[i] = this.cp[M.cp[i]]; co[i] = (this.co[M.cp[i]] + M.co[i]) % 3; }
      for (let i = 0; i < 12; i++) { ep[i] = this.ep[M.ep[i]]; eo[i] = (this.eo[M.ep[i]] + M.eo[i]) % 2; }
      this.cp = cp; this.co = co; this.ep = ep; this.eo = eo;
      return this;
    }
    apply(seq) { for (const m of seq) this.move(m); return this; }
    isSolved() {
      for (let i = 0; i < 8; i++) if (this.cp[i] !== i || this.co[i] !== 0) return false;
      for (let i = 0; i < 12; i++) if (this.ep[i] !== i || this.eo[i] !== 0) return false;
      return true;
    }
    equals(o) {
      for (let i = 0; i < 8; i++) if (this.cp[i] !== o.cp[i] || this.co[i] !== o.co[i]) return false;
      for (let i = 0; i < 12; i++) if (this.ep[i] !== o.ep[i] || this.eo[i] !== o.eo[i]) return false;
      return true;
    }
    // 54개 스티커 색(면 번호). 면 순서 U R F D L B, 각 면 9칸(왼위→오른아래).
    toFacelets() {
      const fc = new Array(54);
      for (let f = 0; f < 6; f++) fc[f * 9 + 4] = f;
      for (let i = 0; i < 8; i++) {
        const j = this.cp[i], o = this.co[i];
        for (let n = 0; n < 3; n++) fc[CORNER_FACELET[i][(n + o) % 3]] = CORNER_COLOR[j][n];
      }
      for (let i = 0; i < 12; i++) {
        const j = this.ep[i], o = this.eo[i];
        for (let n = 0; n < 2; n++) fc[EDGE_FACELET[i][(n + o) % 2]] = EDGE_COLOR[j][n];
      }
      return fc;
    }
  }

  // 스티커 위치표 (U1..U9=0..8, R=9.., F=18.., D=27.., L=36.., B=45..)
  const CORNER_FACELET = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
  const EDGE_FACELET = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
  const CORNER_COLOR = [[U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B]];
  const EDGE_COLOR = [[U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]];

  // ---- 표기법 ----
  const SUFFIX = ['', '2', "'"];
  function moveName(m) { return FACES[(m / 3) | 0] + SUFFIX[m % 3]; }
  function seqToString(seq) { return seq.map(moveName).join(' '); }
  function inverseMove(m) { return ((m / 3) | 0) * 3 + (2 - (m % 3)); }
  function inverseSeq(seq) { return seq.slice().reverse().map(inverseMove); }
  function oppositeFace(f) { return (f + 3) % 6; }

  // 같은 면이 연속되면 합친다 (U U2 → U'). 펌웨어 simplifySeq 와 같은 규칙.
  function simplifySeq(seq) {
    const out = [];
    for (const m of seq) {
      if (out.length && ((out[out.length - 1] / 3) | 0) === ((m / 3) | 0)) {
        const f = (m / 3) | 0;
        const t = ((out[out.length - 1] % 3) + 1 + (m % 3) + 1) % 4;
        out.pop();
        if (t !== 0) out.push(f * 3 + t - 1);
      } else out.push(m);
    }
    return out;
  }

  // 겉면 수만 있는 문자열 → 수 번호 배열 ("R U R' U2")
  function parseMoves(str) {
    const seq = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok) continue;
      const f = FACES.indexOf(tok[0]);
      if (f < 0) throw new Error('bad move ' + tok);
      const s = tok.slice(1);
      const k = s === '' ? 0 : s === '2' ? 1 : (s === "'" || s === '3') ? 2 : -1;
      if (k < 0) throw new Error('bad move ' + tok);
      seq.push(f * 3 + k);
    }
    return seq;
  }

  // 사람 공식(wide r/l/u/d/f/b, 슬라이스 M/E/S, 회전 x/y/z 포함)을
  // 로봇이 돌릴 수 있는 겉면 6면 수열로 변환한다.
  //   r = L + x,  l = R + x',  u = D + y,  d = U + y',  f = B + z,  b = F + z'
  //   M = R L' + x',  E = U D' + y',  S = F' B + z
  // 전체 회전은 '지금 표기의 면 → 실제 모터 면' 표(phys)만 바꾸고 수는 내보내지 않는다.
  // 풀린 상태는 전체 회전에 불변이므로, 변환된 수열은 원래 공식과 같은 경우를 푼다.
  function expandAlg(str) {
    const phys = [U, R, F, D, L, B];
    const out = [];
    const emit = (face, amt) => { out.push(phys[face] * 3 + amt - 1); }; // amt ∈ {1,2,3}
    const rot = {
      x: (p) => [p[F], p[R], p[D], p[B], p[L], p[U]],  // new U=old F, F=old D, D=old B, B=old U
      y: (p) => [p[U], p[B], p[R], p[D], p[F], p[L]],  // new F=old R, R=old B, B=old L, L=old F
      z: (p) => [p[L], p[U], p[F], p[R], p[D], p[B]],  // new U=old L, R=old U, D=old R, L=old D
    };
    const rotate = (axis, amt) => { let p = phys.slice(); for (let i = 0; i < ((amt % 4) + 4) % 4; i++) p = rot[axis](p); for (let i = 0; i < 6; i++) phys[i] = p[i]; };
    const WIDE = { r: [L, 'x', 1], l: [R, 'x', -1], u: [D, 'y', 1], d: [U, 'y', -1], f: [B, 'z', 1], b: [F, 'z', -1] };
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok) continue;
      const mt = /^([URFDLBurfdlbMESxyz])(2'|'2|2|'|3)?$/.exec(tok);
      if (!mt) throw new Error('bad token ' + tok);
      const ch = mt[1], s = mt[2] || '';
      const amt = s === '' ? 1 : (s === '2' || s === "2'" || s === "'2") ? 2 : 3;
      if ('URFDLB'.includes(ch)) emit(FACES.indexOf(ch), amt);
      else if (ch in WIDE) { const [face, axis, sign] = WIDE[ch]; emit(face, amt); rotate(axis, sign * amt); }
      else if (ch === 'M') { emit(R, amt); emit(L, 4 - amt); rotate('x', -amt); }
      else if (ch === 'E') { emit(U, amt); emit(D, 4 - amt); rotate('y', -amt); }
      else if (ch === 'S') { emit(F, 4 - amt); emit(B, amt); rotate('z', amt); }
      else rotate(ch, amt);
    }
    return out;
  }

  // 시드 기반 섞기 (xorshift32). 펌웨어와 같은 수열을 만든다.
  function scramble(seed, n, fixedFace = -1) {
    let s = (seed >>> 0) || 0x9E3779B9;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
    const seq = [];
    let last = -1;
    while (seq.length < n) {
      const f = next() % 6;
      if (f === last || f === fixedFace) continue;
      const k = next() % 3;
      seq.push(f * 3 + k);
      last = f;
    }
    return seq;
  }

  const api = {
    FACES, U, R, F, D, L, B, CORNER_NAMES, EDGE_NAMES, MOVES, BASIC, Cube, mult,
    CORNER_FACELET, EDGE_FACELET, CORNER_COLOR, EDGE_COLOR,
    moveName, seqToString, inverseMove, inverseSeq, oppositeFace, simplifySeq, parseMoves, expandAlg, scramble,
  };
  global.CubeLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
