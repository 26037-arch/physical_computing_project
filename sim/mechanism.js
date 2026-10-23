// V4 procedure mirrors firmware/main/mechanism.cpp, including short-circuit failures.
(function (global) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./robot_contract.js') : global.RobotContract;
  const PHYS = R.faceMap, UNIT_NAME = R.unitNames, UNIT_FACES = R.unitFaces;
  const FB = 0, RL = 1, D = 2, LOCK = 3;
  class Mechanism {
    // readSensor(unit, wantEngaged): false simulates an end-switch timeout.
    // The browser's default ideal switches are a kinematic assumption, not measured hardware.
    constructor(options = {}) {
      this.virtual = !!options.virtual;
      this.readSensor = options.readSensor || (() => true);
      this.sensorTimeoutMs = R.sensorTimeoutMs;
      this.reset();
    }
    reset() { this.engaged = R.initialEngaged.slice(); this.orient = R.initialOrient; this.loaded = R.initialLoaded; this.flips = 0; this.regrips = 0; this.lastError = null; }
    resetCounters() { this.flips = 0; this.regrips = 0; }
    physFace(f) { return PHYS[this.orient][f]; }
    fail(out, line) { this.lastError = line; out.push({type:'error', line}); return false; }
    engage(out, u) {
      if (this.engaged[u]) return true;
      this.regrips++;
      out.push({type:'engage', unit:u, faces:UNIT_FACES[u], line:`ENGAGE ${UNIT_NAME[u]}`});
      if (!this.virtual && !this.readSensor(u, true)) {
        out.push({type:'wait', ms:Math.ceil((this.sensorTimeoutMs || R.sensorLongTimeoutMs)/R.sensorPollMs)*R.sensorPollMs});
        const line = `ERR ENGAGE ${UNIT_NAME[u]} timeout`;
        out.push({type:'msg', line});
        out.push({type:'retract', unit:u, faces:UNIT_FACES[u]}); // firmware recovery, no RETRACT serial line
        this.lastError = line; out.push({type:'error'}); return false;
      }
      this.engaged[u] = true; return true;
    }
    retract(out, u) {
      if (!this.engaged[u]) return true;
      out.push({type:'retract', unit:u, faces:UNIT_FACES[u], line:`RETRACT ${UNIT_NAME[u]}`});
      if (!this.virtual && !this.readSensor(u, false)) {
        out.push({type:'wait', ms:Math.ceil((this.sensorTimeoutMs || R.sensorLongTimeoutMs)/R.sensorPollMs)*R.sensorPollMs});
        return this.fail(out, `ERR RETRACT ${UNIT_NAME[u]} timeout`);
      }
      this.engaged[u] = false; return true;
    }
    flip(out) {
      out.push({type:'flipStart', line:'FLIP'});
      if (!this.engage(out, RL) || !this.retract(out, FB) || !this.retract(out, D) || !this.retract(out, LOCK)) return false;
      this.orient ^= 1; this.flips++;
      out.push({type:'flip', orient:this.orient, line:`FLIPPED orient=${this.orient}`}); return true;
    }
    plan(m) {
      const out = []; this.lastError = null;
      if (!this.virtual && !this.loaded) { this.fail(out, 'ERR not loaded'); return out; }
      const f = Math.floor(m/3), k = m%3;
      let p = this.physFace(f);
      if (p === 0) { if (!this.flip(out)) return out; p = this.physFace(f); }
      let ok;
      if (p === 2 || p === 5) ok = this.engage(out, FB) && this.retract(out, D) && this.retract(out, RL) && this.engage(out, LOCK);
      else if (p === 1 || p === 4) ok = this.engage(out, RL) && this.retract(out, D) && this.retract(out, FB) && this.engage(out, LOCK);
      else ok = this.engage(out, LOCK) && this.engage(out, D);
      if (ok) out.push({type:'turn', m, phys:p*3+k, face:p});
      return out;
    }
    planSeq(seq) { const out=[]; for(const m of seq) { out.push(...this.plan(m)); if(this.lastError)break; } return out; }
    load() {
      const out=[]; this.lastError = null;
      if(this.loaded)return this.eject();
      if(!this.engaged[D] || this.engaged[FB] || this.engaged[RL] || this.engaged[LOCK]) {
        if(this.retract(out,FB) && this.retract(out,RL) && this.retract(out,LOCK) && this.engage(out,D))out.push({type:'msg',line:'READY TO LOAD'});
        return out;
      }
      if(!this.engage(out,LOCK) || !this.engage(out,FB))return out;
      this.loaded=true; this.orient=R.initialOrient;
      out.push({type:'loaded',line:`LOADED orient=${this.orient}`}); return out;
    }
    eject() {
      const out=[{type:'msg',line:'EJECT'}]; this.lastError=null;
      if(!this.engage(out,D) || !this.retract(out,LOCK) || !this.retract(out,FB) || !this.retract(out,RL))return out;
      this.loaded=false; out.push({type:'ejected',line:'EJECTED'}); return out;
    }
    manualFlip() { const out=[]; this.lastError=null; this.flip(out); return out; }
  }
  const api={Mechanism,PHYS,UNIT_NAME,UNIT_FACES,FB,RL,D,LOCK};
  global.CubeMechanism=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
