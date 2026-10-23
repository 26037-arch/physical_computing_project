// sim/mechanism.js — V4 기구 절차. 펌웨어 firmware/main/mechanism.cpp 와 같은 규칙·같은 순서·같은 출력 줄.
//   물리 면: U(0, 모터 없음) R(1) F(2) D(3, 아래 헤드) L(4) B(5). 논리 면 → 물리 면은 orient 로 정한다
//   (orient 1 = x축 180° 뒤집힘: U↔D, F↔B). 위 면이 필요한 수 앞에는 FLIP 을 끼워 넣는다.
//   이송 유닛 4개: 0 = F/B 쌍, 1 = R/L 쌍, 2 = 아래 D 헤드, 3 = 잠금 막대(코어 고정, 뒤집기 때만 내림).
//   모두 서보 크랭크 결합/후퇴 + 스위치 확인.
//   plan(m) 은 한 논리 수에 필요한 동작 목록을 돌려주고 상태를 갱신한다. 시뮬레이터는 목록을 애니메이션하고,
//   tools/gen_wokwi_test.js 는 flips/regrips 횟수를, tools/gen_mechanism_test.js 는 출력 줄을 기대값으로 쓴다.
(function (global) {
  'use strict';
  const PHYS = [[0, 1, 2, 3, 4, 5], [3, 1, 5, 0, 4, 2]];
  const UNIT_NAME = ['FB', 'RL', 'D', 'LOCK'];
  const UNIT_FACES = [[2, 5], [1, 4], [3], []];
  const FB = 0, RL = 1, D = 2, LOCK = 3;

  class Mechanism {
    constructor() { this.reset(); }
    reset() { this.engaged = [false, false, false, false]; this.orient = 1; this.loaded = false; this.flips = 0; this.regrips = 0; }
    resetCounters() { this.flips = 0; this.regrips = 0; }
    physFace(f) { return PHYS[this.orient][f]; }
    // ---- 기본 동작: 각각 {type, ...} 하나를 목록에 넣고 상태를 바꾼다. line 은 펌웨어 시리얼 출력과 같다 ----
    engage(out, u) {
      if (this.engaged[u]) return;
      this.regrips++; this.engaged[u] = true;
      out.push({ type: 'engage', unit: u, faces: UNIT_FACES[u], line: `ENGAGE ${UNIT_NAME[u]}` });
    }
    retract(out, u) {
      if (!this.engaged[u]) return;
      this.engaged[u] = false;
      out.push({ type: 'retract', unit: u, faces: UNIT_FACES[u], line: `RETRACT ${UNIT_NAME[u]}` });
    }
    flip(out) {
      out.push({ type: 'flipStart', line: 'FLIP' });
      this.engage(out, RL); this.retract(out, FB); this.retract(out, D); this.retract(out, LOCK);
      this.orient ^= 1; this.flips++;
      out.push({ type: 'flip', orient: this.orient, line: `FLIPPED orient=${this.orient}` });
    }
    // ---- 한 논리 수: 지지 전환 동작들 + 마지막에 {type:'turn', phys, m} ----
    plan(m) {
      const out = [];
      const f = (m / 3) | 0, k = m % 3;
      let p = this.physFace(f);
      if (p === 0) { this.flip(out); p = this.physFace(f); }
      if (p === 2 || p === 5) { this.engage(out, FB); this.retract(out, D); this.retract(out, RL); this.engage(out, LOCK); }
      else if (p === 1 || p === 4) { this.engage(out, RL); this.retract(out, D); this.retract(out, FB); this.engage(out, LOCK); }
      else { this.engage(out, LOCK); this.engage(out, D); }
      out.push({ type: 'turn', m, phys: p * 3 + k, face: p });
      return out;
    }
    planSeq(seq) { const out = []; for (const m of seq) out.push(...this.plan(m)); return out; }
    // ---- 장착/배출 (LOAD 버튼 한 단계). 위가 열려 있어 큐브는 손으로 D 헤드 핀 위에 올려놓는다 ----
    load() {
      const out = [];
      if (this.loaded) return this.eject();
      if (!this.engaged[D] || this.engaged[FB] || this.engaged[RL] || this.engaged[LOCK]) {
        this.retract(out, FB); this.retract(out, RL); this.retract(out, LOCK); this.engage(out, D);
        out.push({ type: 'msg', line: 'READY TO LOAD' });
        return out;
      }
      this.engage(out, LOCK); this.engage(out, FB);
      this.loaded = true; this.orient = 1;
      out.push({ type: 'loaded', line: `LOADED orient=${this.orient}` });
      return out;
    }
    eject() {
      const out = [{ type: 'msg', line: 'EJECT' }];
      this.engage(out, D); this.retract(out, LOCK); this.retract(out, FB); this.retract(out, RL);
      this.loaded = false;
      out.push({ type: 'ejected', line: 'EJECTED' });
      return out;
    }
    manualFlip() { const out = []; this.flip(out); return out; }
  }

  const api = { Mechanism, PHYS, UNIT_NAME, UNIT_FACES, FB, RL, D, LOCK };
  global.CubeMechanism = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
