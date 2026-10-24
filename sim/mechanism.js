// sim/mechanism.js — V5 기구 절차. 펌웨어 firmware/main/mechanism.cpp 와 같은 규칙·같은 순서·같은 출력 줄 (docs/HARDWARE_V5.md 3절).
//   구동기 3개: 컵(홀더) 스텝모터 1 (층 회전 TURN / 큐브 전체 스핀 SPIN), 후드 서보 (CLOSE/OPEN/LOAD), 리프터 서보 (FLIP).
//   물리 위치: U(0) R(1) F(2) D(3) L(4) B(5). ori[p] = 그 물리 위치에 지금 있는 논리 면.
//   모든 층 회전은 아래(D 위치)에서만 한다. 논리 면 f 를 아래로 가져오는 재배향:
//     D: 없음 / F: FLIP / R: SPIN y → FLIP / L: SPIN y' → FLIP / B: SPIN y2 → FLIP / U: FLIP → FLIP
//   SPIN y = 큐브 전체가 위에서 봐서 시계 방향(U 와 같은 방향), FLIP = x' (F→D, D→B, B→U, U→F: 앞으로 넘어감).
//   스핀·뒤집기 앞에는 HOOD OPEN, 층 회전 앞에는 HOOD CLOSE 가 자동으로 들어간다(상태가 바뀔 때만 줄을 낸다).
//   plan(m) 은 한 논리 수에 필요한 동작 목록을 돌려주고 상태를 갱신한다. 시뮬레이터는 목록을 애니메이션하고,
//   tools/gen_wokwi_test.js 는 flips/spins 횟수를, tools/gen_mechanism_test.js 는 출력 줄을 기대값으로 쓴다.
(function (global) {
  'use strict';
  const HOOD_NAME = ['CLOSE', 'OPEN', 'LOAD'];
  const CLOSE = 0, OPEN = 1, LOAD = 2;
  const ORI_START = [3, 4, 2, 0, 1, 5];        // 장착 = z2: 흰색(논리 U) 아래, 초록(논리 F) 앞 → 물리 U←D, R←L, F←F, D←U, L←R, B←B
  const SPIN_NAME = ['', 'y', 'y2', "y'"];
  const TURN_NAME = ['D', 'D2', "D'"];
  // 논리 면이 있는 물리 위치 → 재배향 동작 (spin k 는 90° 시계 횟수, 1..3)
  const REORIENT = { 3: [], 2: ['flip'], 1: ['spin1', 'flip'], 4: ['spin3', 'flip'], 5: ['spin2', 'flip'], 0: ['flip', 'flip'] };

  class Mechanism {
    constructor() { this.reset(); }
    reset() { this.hood = OPEN; this.loaded = false; this.ori = ORI_START.slice(); this.flips = 0; this.spins = 0; this.hoods = 0; }
    resetCounters() { this.flips = 0; this.spins = 0; this.hoods = 0; }
    physPos(f) { return this.ori.indexOf(f); }
    // ---- 기본 동작: 각각 {type, ...} 하나를 목록에 넣고 상태를 바꾼다. line 은 펌웨어 시리얼 출력과 같다 ----
    setHood(out, pos) {
      if (this.hood === pos) return;
      this.hood = pos; this.hoods++;
      out.push({ type: 'hood', pos, line: `HOOD ${HOOD_NAME[pos]}` });
    }
    spin(out, k) {                                   // 큐브 전체 y^k (후드 OPEN)
      this.setHood(out, OPEN);
      for (let i = 0; i < k; i++) {                  // y: F←R, L←F, B←L, R←B
        const o = this.ori, r = o[1], f = o[2], l = o[4], b = o[5];
        o[2] = r; o[4] = f; o[5] = l; o[1] = b;
      }
      this.spins++;
      out.push({ type: 'spin', k, line: `SPIN ${SPIN_NAME[k]}` });
    }
    flip(out) {                                      // x': F→D, D→B, B→U, U→F
      this.setHood(out, OPEN);
      const o = this.ori, u = o[0], f = o[2], d = o[3], b = o[5];
      o[3] = f; o[5] = d; o[0] = b; o[2] = u;
      this.flips++;
      out.push({ type: 'flip', line: 'FLIP' });
    }
    // ---- 한 논리 수: 재배향 동작들 + HOOD CLOSE + {type:'turn', m, k} ----
    plan(m) {
      const out = [];
      const f = (m / 3) | 0, k = m % 3;
      for (const op of REORIENT[this.physPos(f)]) {
        if (op === 'flip') this.flip(out); else this.spin(out, +op[4]);
      }
      this.setHood(out, CLOSE);
      out.push({ type: 'turn', m, k, line: `TURN ${TURN_NAME[k]}` });
      return out;
    }
    planSeq(seq) { const out = []; for (const m of seq) out.push(...this.plan(m)); return out; }
    // ---- 장착/배출 (LOAD 버튼 한 단계). 후드를 뒤로 젖힌 LOAD 자세에서 큐브를 위에서 내려놓는다 ----
    load() {
      const out = [];
      if (this.loaded) return this.eject();
      if (this.hood !== LOAD) {
        this.setHood(out, LOAD);
        out.push({ type: 'msg', line: 'READY TO LOAD' });
        return out;
      }
      this.setHood(out, OPEN);
      this.loaded = true; this.ori = ORI_START.slice();
      out.push({ type: 'loaded', line: 'LOADED' });
      return out;
    }
    eject() {
      const out = [{ type: 'msg', line: 'EJECT' }];
      this.setHood(out, LOAD);
      this.loaded = false;
      out.push({ type: 'ejected', line: 'EJECTED' });
      return out;
    }
    manualFlip() { const out = []; this.flip(out); return out; }
    manualSpin(k) { const out = []; this.spin(out, ((k % 4) + 4) % 4 || 1); return out; }
    // 시간 추정(ms, HARDWARE_V5.md 5절 상수) — 시뮬레이터 표시·보고서용
    static durationMs(a) {
      if (a.type === 'hood') return 300;
      if (a.type === 'spin') return a.k === 2 ? 500 : 300;
      if (a.type === 'turn') return a.k === 1 ? 600 : 400;
      if (a.type === 'flip') return 1650;
      return 0;
    }
  }

  const api = { Mechanism, HOOD_NAME, CLOSE, OPEN, LOAD, ORI_START, SPIN_NAME, TURN_NAME, REORIENT };
  global.CubeMechanism = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
