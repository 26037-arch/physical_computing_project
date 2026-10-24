// sim/solver.js — CFOP 4단계 풀이기. 펌웨어 firmware/main/solver.cpp 와 같은 알고리즘·같은 순서로
// 동작하므로 같은 섞기에 대해 같은 풀이 문자열을 낸다 (Wokwi 시리얼 출력과 교차 검증에 쓴다).
//
//  Cross : IDA* 18수 (휴리스틱 = 크로스 엣지 쌍 거리표 6개의 최댓값). 크로스 엣지 4개의 상태만 추적.
//  F2L   : 사람의 직관 F2L 처럼 매크로 수만 쓴다 — U 회전(U U2 U') + 트리거 X U^k X' (슬롯마다 2종류 × k 3가지).
//          트리거는 정의상 크로스와 다른 슬롯을 보존하므로 탐색 상태는 끼우는 쌍의 (코너, 엣지) 2바이트뿐이고,
//          거리표 F2L_PAIR 는 그 매크로 그래프의 정확한 최단 거리(겉면 수)다. 완성된 슬롯의 트리거는 금지한다.
//          쌍 선택은 그리디: 거리표 값이 가장 작은(= 가장 짧게 끼울 수 있는) 슬롯부터, 한계를 1씩 올리며 후보를 번갈아 본다.
//  OLL   : 방향 키 조회 (사전 AUF 4가지)        PLL : 위치 키 조회 (사전 AUF 4가지 + 공식 뒤 AUF)
//
// 탐색 중에는 큐브 전체(40바이트)가 아니라 "관심 조각"의 (위치,방향) 상태만 추적한다.
//   엣지 상태 = 위치*2+방향 (24가지), 코너 상태 = 위치*3+방향 (24가지)
//   한 수에 조각당 표 2번 조회로 갱신되고, 휴리스틱도 그 상태로 바로 조회한다.
(function (global) {
  'use strict';
  const C = global.CubeLib || require('./cube.js');
  const T = global.CubeTables || require('./tables.js');
  const { Cube, U, oppositeFace, simplifySeq } = C;
  const MAX_DEPTH = 14;       // 크로스 안전 한계 (상단 고정 15수 크로스, 전수 BFS로 한계 검증)
  const F2L_MAX_BOUND = 20;   // F2L 한 쌍 안전 한계 (생성기 전수 검사: 최장 11수)
  const SLOT_NAMES = ['FR', 'FL', 'BL', 'BR'];

  const ollKey = (c) => ((((c.co[0] * 3 + c.co[1]) * 3 + c.co[2]) * 3 + c.co[3]) << 4) | (c.eo[0] << 3) | (c.eo[1] << 2) | (c.eo[2] << 1) | c.eo[3];
  const pllKey = (c) => (c.cp[0] << 14) | (c.cp[1] << 12) | (c.cp[2] << 10) | (c.cp[3] << 8) | (c.ep[0] << 6) | (c.ep[1] << 4) | (c.ep[2] << 2) | c.ep[3];
  const aufMove = (k) => (k ? [U * 3 + k - 1] : []);
  const eStep = (s, m) => (T.EDGE_TO[m][s >> 1] << 1) | ((s + T.EDGE_DO[m][s >> 1]) & 1);
  const cStep = (s, m) => { const p = (s / 3) | 0; return T.CORNER_TO[m][p] * 3 + (s - p * 3 + T.CORNER_DO[m][p]) % 3; };
  const invMove = (m) => ((m / 3) | 0) * 3 + 2 - (m % 3);

  // F2L 매크로 수 27개. 전개 순서 = 번호 순: 0..2 = U U2 U' (비용 1), 3 + (slot*2 + fam)*3 + k = 트리거 X U^(k+1) X' (비용 3).
  // 펌웨어 solver.cpp 의 macroMoves() 와 같은 번호·같은 수열이어야 한다.
  const MACROS = [];
  for (let k = 0; k < 3; k++) MACROS.push({ moves: [U * 3 + k], slot: -1, fam: 0, cost: 1 });
  for (let s = 0; s < 4; s++) for (let fam = 0; fam < 2; fam++) for (let k = 0; k < 3; k++) {
    const X = T.F2L_TRIG[s][fam];
    MACROS.push({ moves: [X, U * 3 + k, invMove(X)], slot: s, fam, cost: 3 });
  }

  class Solver {
    constructor() { this.nodes = 0; this.onStage = null; }

    edgeState(c, cubie) { for (let p = 0; p < 12; p++) if (c.ep[p] === cubie) return p * 2 + c.eo[p]; }
    cornerState(c, cubie) { for (let p = 0; p < 8; p++) if (c.cp[p] === cubie) return p * 3 + c.co[p]; }

    // ---- Cross: es[0..3] = 크로스 엣지 DR DF DL DB 의 상태 ----
    hCross(es) {
      let h = 0;
      for (let i = 0; i < 6; i++) {
        const [a, b] = T.CROSS_PAIRS[i];
        const d = T.CROSS_PAIR[i][es[a - 4] * 24 + es[b - 4]];
        if (d > h) h = d;
      }
      return h;
    }
    // IDA*: 같은 면 연속 금지, 반대면 쌍은 면 번호가 작은 쪽을 먼저 (U D 허용, D U 금지)
    searchCross(es, g, bound, lastFace, path) {
      const hv = this.hCross(es);
      if (g + hv > bound) return false;
      if (hv === 0) return true;
      for (let m = 0; m < 18; m++) {
        const f = (m / 3) | 0;
        if (f === C.D || f === lastFace) continue;
        if (lastFace >= 0 && f === oppositeFace(lastFace) && f < lastFace) continue;
        this.nodes++;
        const es2 = new Array(4);
        for (let i = 0; i < 4; i++) es2[i] = eStep(es[i], m);
        path.push(m);
        if (this.searchCross(es2, g + 1, bound, f, path)) return true;
        path.pop();
      }
      return false;
    }
    solveCross(c) {
      const es = [4, 5, 6, 7].map((e) => this.edgeState(c, e));
      const path = [];
      for (let bound = this.hCross(es); bound <= MAX_DEPTH; bound++) if (this.searchCross(es, 0, bound, -1, path)) return path;
      return null;
    }

    // ---- F2L: 상태 = (코너 상태 cs, 엣지 상태 es) 2바이트, 매크로 IDA* ----
    // allowed[q] = 슬롯 q 의 트리거 허용(미완성 슬롯). 같은 종류의 매크로 연속 금지: U U = 한 수, (X U^a X')(X U^b X') = X U^(a+b) X'.
    searchF2L(cs, es, g, bound, last, path, table, allowed) {
      const hv = table[cs * 24 + es];
      if (hv === 255 || g + hv > bound) return false;
      if (hv === 0) return true;
      for (let i = 0; i < MACROS.length; i++) {
        const M = MACROS[i];
        if (M.slot >= 0 && !allowed[M.slot]) continue;
        if (last >= 0 && MACROS[last].slot === M.slot && MACROS[last].fam === M.fam) continue;
        this.nodes++;
        let c2 = cs, e2 = es;
        for (const m of M.moves) { c2 = cStep(c2, m); e2 = eStep(e2, m); }
        path.push(i);
        if (this.searchF2L(c2, e2, g + M.cost, bound, i, path, table, allowed)) return true;
        path.pop();
      }
      return false;
    }
    // 미완성 슬롯 중 가장 짧게 끼울 수 있는 쌍을 고른다: 거리표 값 오름차순(같으면 번호 순)으로 후보를 두고,
    // 한계 B 를 가장 작은 값부터 1씩 올리며 B 안에 풀리는 첫 후보를 택한다 (완성 슬롯 트리거 금지로 표 값보다 길어질 수 있다).
    solveF2LPair(c, done) {
      const allowed = [0, 1, 2, 3].map((s) => !done.includes(s));
      const cand = [0, 1, 2, 3].filter((s) => allowed[s]).map((s) => {
        const cs = this.cornerState(c, 4 + s), es = this.edgeState(c, 8 + s);
        return { s, cs, es, d: T.F2L_PAIR[s][cs * 24 + es] };
      }).sort((a, b) => a.d - b.d || a.s - b.s);
      for (let B = cand[0].d; B <= F2L_MAX_BOUND; B++) {
        for (const cd of cand) {
          if (cd.d > B) continue;
          const path = [];
          if (this.searchF2L(cd.cs, cd.es, 0, B, -1, path, T.F2L_PAIR[cd.s], allowed)) {
            return { slot: cd.s, moves: simplifySeq(path.flatMap((i) => MACROS[i].moves)) }; // 트리거 경계의 같은 면 연속(R' R 등)을 합친다
          }
        }
      }
      return null;
    }

    now() { return global.performance ? performance.now() : Date.now(); }
    stage(name, moves, startNodes, t0) {
      const st = { name, moves, nodes: this.nodes - startNodes, ms: this.now() - t0 };
      if (this.onStage) this.onStage(st);
      return st;
    }

    solve(start) {
      const c = start.clone();
      const stages = [];
      this.nodes = 0;
      // 1. Cross
      let t0 = this.now(), n0 = this.nodes;
      let mv = this.solveCross(c);
      if (!mv) throw new Error('cross search failed');
      c.apply(mv); stages.push(this.stage('CROSS', mv, n0, t0));
      // 2. F2L — 쌍마다 가장 쉬운 슬롯부터 (그리디)
      const done = [];
      for (let k = 0; k < 4; k++) {
        t0 = this.now(); n0 = this.nodes;
        const r = this.solveF2LPair(c, done);
        if (!r) throw new Error('f2l search failed');
        c.apply(r.moves); done.push(r.slot);
        stages.push(this.stage('F2L ' + SLOT_NAMES[r.slot], r.moves, n0, t0));
      }
      // 3. OLL
      t0 = this.now(); n0 = this.nodes;
      let found = null;
      for (let r = 0; r < 4 && !found; r++) {
        const k = ollKey(c.clone().apply(aufMove(r)));
        if (k === ollKey(new Cube())) found = { name: 'OLL skip', moves: aufMove(r) };
        else { const e = T.OLL.find((o) => o.key === k); if (e) found = { name: e.name, moves: aufMove(r).concat(e.moves) }; }
      }
      if (!found) throw new Error('OLL lookup failed');
      c.apply(found.moves); stages.push(this.stage(found.name, found.moves, n0, t0));
      // 4. PLL
      t0 = this.now(); n0 = this.nodes;
      found = null;
      for (let r = 0; r < 4 && !found; r++) {
        const k = pllKey(c.clone().apply(aufMove(r)));
        if (k === pllKey(new Cube())) found = { name: 'PLL skip', moves: aufMove(r) };
        else { const e = T.PLL.find((o) => o.key === k); if (e) found = { name: 'PLL ' + e.name, moves: aufMove(r).concat(e.moves, aufMove(e.auf)) }; }
      }
      if (!found) throw new Error('PLL lookup failed');
      c.apply(found.moves); stages.push(this.stage(found.name, found.moves, n0, t0));
      if (!c.isSolved()) throw new Error('not solved after PLL');
      const all = simplifySeq(stages.flatMap((s) => s.moves));
      return { stages, moves: all, nodes: this.nodes };
    }
  }

  const api = { Solver, ollKey, pllKey, SLOT_NAMES, MACROS };
  global.CubeSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
