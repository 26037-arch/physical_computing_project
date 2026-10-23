// sim/solver.js — CFOP 4단계 풀이기. 펌웨어 firmware/main/solver.cpp 와 같은 알고리즘·같은 순서로
// 동작하므로 같은 섞기에 대해 같은 풀이 문자열을 낸다 (Wokwi 시리얼 출력과 교차 검증에 쓴다).
//
//  Cross : IDA*  (휴리스틱 = 크로스 엣지 쌍 거리표 6개의 최댓값)
//  F2L   : 쌍마다 IDA* (휴리스틱 = max(크로스 h, 대상·완성 슬롯의 코너·엣지 쌍 거리표)), D 수 제외.
//          깊이 8 안에 안 풀리는 쌍은 뒤로 미루고 다른 슬롯부터 푼다 (모두 실패하면 제한 없이 탐색)
//  OLL   : 방향 키 조회 (사전 AUF 4가지)        PLL : 위치 키 조회 (사전 AUF 4가지 + 공식 뒤 AUF)
//
// 탐색 중에는 큐브 전체(40바이트)가 아니라 "관심 조각"의 (위치,방향) 상태만 추적한다.
//   엣지 상태 = 위치*2+방향 (24가지), 코너 상태 = 위치*3+방향 (24가지)
//   한 수에 조각당 표 2번 조회로 갱신되고, 휴리스틱도 그 상태로 바로 조회한다.
(function (global) {
  'use strict';
  const C = global.CubeLib || require('./cube.js');
  const T = global.CubeTables || require('./tables.js');
  const { Cube, U, D, oppositeFace, simplifySeq } = C;
  const MAX_DEPTH = 14;      // 안전 한계
  const F2L_EASY_DEPTH = 8;  // 이 깊이 안에 풀리는 슬롯을 먼저 고른다
  const SLOT_NAMES = ['FR', 'FL', 'BL', 'BR'];

  const ollKey = (c) => ((((c.co[0] * 3 + c.co[1]) * 3 + c.co[2]) * 3 + c.co[3]) << 4) | (c.eo[0] << 3) | (c.eo[1] << 2) | (c.eo[2] << 1) | c.eo[3];
  const pllKey = (c) => (c.cp[0] << 14) | (c.cp[1] << 12) | (c.cp[2] << 10) | (c.cp[3] << 8) | (c.ep[0] << 6) | (c.ep[1] << 4) | (c.ep[2] << 2) | c.ep[3];
  const aufMove = (k) => (k ? [U * 3 + k - 1] : []);
  const eStep = (s, m) => (T.EDGE_TO[m][s >> 1] << 1) | ((s + T.EDGE_DO[m][s >> 1]) & 1);
  const cStep = (s, m) => { const p = (s / 3) | 0; return T.CORNER_TO[m][p] * 3 + (s - p * 3 + T.CORNER_DO[m][p]) % 3; };

  class Solver {
    constructor() { this.nodes = 0; this.onStage = null; }

    edgeState(c, cubie) { for (let p = 0; p < 12; p++) if (c.ep[p] === cubie) return p * 2 + c.eo[p]; }
    cornerState(c, cubie) { for (let p = 0; p < 8; p++) if (c.cp[p] === cubie) return p * 3 + c.co[p]; }

    // 추적 상태: es[0..3] = 크로스 엣지 DR DF DL DB, es[4+i]/cs[i] = i번째 추적 슬롯의 엣지/코너
    hCross(es) {
      let h = 0;
      for (let i = 0; i < 6; i++) {
        const [a, b] = T.CROSS_PAIRS[i];
        const d = T.CROSS_PAIR[i][es[a - 4] * 24 + es[b - 4]];
        if (d > h) h = d;
      }
      return h;
    }
    hF2L(es, cs, slots) {
      let h = this.hCross(es);
      for (let i = 0; i < slots.length; i++) { const d = T.F2L_PAIR[slots[i]][cs[i] * 24 + es[4 + i]]; if (d > h) h = d; }
      return h;
    }
    hSlotOnCube(c, s) { return T.F2L_PAIR[s][this.cornerState(c, 4 + s) * 24 + this.edgeState(c, 8 + s)]; }
    // 꺼내기 단계: 마지막 슬롯의 두 조각이 U층(위치 0..3)에 오면 목표. 완성된 것은 유지.
    hExtract(es, cs, slots) {
      let h = this.hCross(es);
      const last = slots.length - 1;
      for (let i = 0; i < last; i++) { const d = T.F2L_PAIR[slots[i]][cs[i] * 24 + es[4 + i]]; if (d > h) h = d; }
      if (((cs[last] / 3) | 0) >= 4 || (es[4 + last] >> 1) >= 4) { if (h < 1) h = 1; }
      return h;
    }

    // IDA*: 같은 면 연속 금지, 반대면 쌍은 면 번호가 작은 쪽을 먼저 (U D 허용, D U 금지)
    search(es, cs, g, bound, lastFace, path, slots, allowD, extract) {
      const hv = extract ? this.hExtract(es, cs, slots) : slots ? this.hF2L(es, cs, slots) : this.hCross(es);
      if (g + hv > bound) return false;
      if (hv === 0) return true;
      for (let m = 0; m < 18; m++) {
        const f = (m / 3) | 0;
        if (!allowD && f === D) continue;
        if (f === lastFace) continue;
        if (lastFace >= 0 && f === oppositeFace(lastFace) && f < lastFace) continue;
        this.nodes++;
        const es2 = new Array(es.length), cs2 = new Array(cs.length);
        for (let i = 0; i < es.length; i++) es2[i] = eStep(es[i], m);
        for (let i = 0; i < cs.length; i++) cs2[i] = cStep(cs[i], m);
        path.push(m);
        if (this.search(es2, cs2, g + 1, bound, f, path, slots, allowD, extract)) return true;
        path.pop();
      }
      return false;
    }
    ida(es, cs, slots, allowD, maxBound, extract) {
      const path = [];
      const h0 = extract ? this.hExtract(es, cs, slots) : slots ? this.hF2L(es, cs, slots) : this.hCross(es);
      for (let bound = h0; bound <= maxBound; bound++) if (this.search(es, cs, 0, bound, -1, path, slots, allowD, extract)) return path;
      return null;
    }
    trackedState(c, slots) {
      const es = [4, 5, 6, 7].map((e) => this.edgeState(c, e));
      const cs = [];
      for (const s of slots) { es.push(this.edgeState(c, 8 + s)); cs.push(this.cornerState(c, 4 + s)); }
      return { es, cs };
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
      let { es, cs } = this.trackedState(c, []);
      let mv = this.ida(es, cs, null, true, MAX_DEPTH);
      if (!mv) throw new Error('cross search failed');
      c.apply(mv); stages.push(this.stage('CROSS', mv, n0, t0));
      // 2. F2L
      const done = [];
      for (let k = 0; k < 4; k++) {
        t0 = this.now(); n0 = this.nodes;
        // 후보 슬롯을 거리표 값 순으로 (같으면 번호 순)
        const cand = [0, 1, 2, 3].filter((s) => !done.includes(s)).map((s) => ({ s, h: this.hSlotOnCube(c, s) })).sort((a, b) => a.h - b.h || a.s - b.s).map((x) => x.s);
        let chosen = -1; mv = null;
        for (const s of cand) {
          const slots = done.concat([s]);
          ({ es, cs } = this.trackedState(c, slots));
          mv = this.ida(es, cs, slots, false, F2L_EASY_DEPTH);
          if (mv) { chosen = s; break; }
        }
        if (!mv) { // 모두 깊이 8 초과: 첫 후보의 두 조각을 U층으로 꺼낸 뒤(짧은 탐색) 다시 끼운다
          chosen = cand[0];
          const slots = done.concat([chosen]);
          ({ es, cs } = this.trackedState(c, slots));
          const out = this.ida(es, cs, slots, false, MAX_DEPTH, true);
          if (!out) throw new Error('f2l extract failed');
          ({ es, cs } = this.trackedState(c.clone().apply(out), slots));
          const ins = this.ida(es, cs, slots, false, MAX_DEPTH);
          if (!ins) throw new Error('f2l insert failed');
          mv = out.concat(ins);
        }
        c.apply(mv); done.push(chosen);
        stages.push(this.stage('F2L ' + SLOT_NAMES[chosen], mv, n0, t0));
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

  const api = { Solver, ollKey, pllKey, SLOT_NAMES };
  global.CubeSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
