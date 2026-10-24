// tools/gen_mechanism_test.js — V4 기구 절차의 Wokwi 실제 모드(Q 0) 시나리오를 만든다.
//   node tools/gen_mechanism_test.js  →  tests/mechanism_v4.test.yaml
// JS 기구 모델(sim/mechanism.js)이 내는 동작 줄 순서대로 보드 출력을 기다리고, 그 줄마다 결합 스위치 버튼
// (sensF/sensB/sensR/sensL/sensD/sensLock)을 눌러 주거나 떼어 준다 — 서보 크랭크와 스위치를 사람 대신 시나리오가 흉내 낸다.
// 마지막에는 스위치를 눌러 주지 않아 결합 확인이 실패하는 경우(ERR … timeout → ABORTED, 모델 보존)를 검사한다.
// Wokwi CLI 의 wait-serial 은 그 단계가 시작된 뒤 들어온 글자만 보므로, 버튼은 누른 채로 기다리다가 마지막에 뗀다.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../sim/cube.js');
const { Mechanism } = require('../sim/mechanism.js');
const q = (s) => JSON.stringify(s);
const steps = [];
const wait = (s) => steps.push(`  - wait-serial: ${q(s)}`);
const write = (s) => steps.push(`  - write-serial: ${q(s + String.fromCharCode(10))}`);
const ctl = (id, v) => steps.push(`  - set-control:\n      part-id: ${id}\n      control: pressed\n      value: ${v}`);
const SENS = { FB: ['sensF', 'sensB'], RL: ['sensR', 'sensL'], D: ['sensD'], LOCK: ['sensLock'] };
// 보드가 낸 동작 줄에 맞춰 스위치를 조작한다
function react(line) {
  wait(line);
  let m;
  if ((m = /^ENGAGE (FB|RL|D|LOCK)$/.exec(line))) for (const id of SENS[m[1]]) { ctl(id.replace('sens','ret'), 0); ctl(id, 1); }
  if ((m = /^RETRACT (FB|RL|D|LOCK)$/.exec(line))) for (const id of SENS[m[1]]) { ctl(id, 0); ctl(id.replace('sens','ret'), 1); }
}
const mech = new Mechanism();
const asText = (c) => c.toFacelets().map((i) => 'URFDLB'[i]).join('');

wait('READY');
for(const ids of Object.values(SENS))for(const id of ids)ctl(id.replace('sens','ret'),1);
write('T 0'); wait('TIMEOUT 0');   // Wokwi CLI 는 set-control 이 수 초 늦을 수 있다 → 결합 확인을 최대 60 s 기다린다 (실물 기본 1500 ms)
// 1) 버튼 길게(1.2 s 이상 = LOAD): D 헤드를 결합 위치로 → 큐브 올려놓기 대기. 누른 채 기다려야 첫 줄을 놓치지 않는다
ctl('btnStart', 1);
for (const a of mech.load()) if (a.line) react(a.line);
ctl('btnStart', 0); steps.push('  - delay: 300ms');   // 뗀 것이 디바운스(30 ms)에 잡히도록
// 2) 버튼 길게: 막대 결합 → F/B 결합(스위치 확인) → 장착
ctl('btnStart', 1);
for (const a of mech.load()) if (a.line) react(a.line);
ctl('btnStart', 0);
write('F'); wait('ERR flip disabled: core not coupled');
write('M D'); wait('ERR fixed face D');
// 3) 네 면 + 뒤집기: F(→물리 B), R, U(→아래 D), D(→뒤집기 후 D)
const seq = C.parseMoves('F R U R');
write('M ' + C.seqToString(seq));
mech.resetCounters();
for (const a of mech.planSeq(seq)) if (a.line) react(a.line);
wait(`MOVED ${seq.length} flips=${mech.flips} regrips=${mech.regrips}`);
const cube = new C.Cube().apply(seq);
write('P'); wait('STATE ' + asText(cube));
wait(`MECH fb=${+mech.engaged[0]} rl=${+mech.engaged[1]} d=${+mech.engaged[2]} lock=${+mech.engaged[3]} orient=${mech.orient} loaded=1`);
// 4) 결합 실패: F 는 F/B 결합이 필요한데 스위치를 눌러 주지 않는다 → 그 수를 돌리지 않고 중단
write('T 1500'); wait('TIMEOUT 1500');
write('M F');
wait('ENGAGE FB');
wait('ERR ENGAGE FB timeout');
wait('ABORTED completed=0');
write('P'); wait('STATE ' + asText(cube));
// 5) 배출: D 핀이 큐브를 받친 채 막대·R/L 해제 → 손으로 꺼낸다
write('T 0'); wait('TIMEOUT 0');
write('E');
for (const a of mech.eject()) if (a.line) react(a.line);
const yaml = `# 자동 생성: node tools/gen_mechanism_test.js — V4 기구 절차(장착·지지 전환·막대·결합 실패·배출)를 실제 모드로 검사
name: V4 기구 절차 — LOAD 장착, F R U R (지지 전환·막대·개별 후퇴 끝), 결합 실패 중단, 배출
version: 1
author: physical_computing_project
steps:
${steps.join('\n')}
`;
const out = path.join(__dirname, '..', 'tests', 'mechanism_v4.test.yaml');
fs.writeFileSync(out, yaml);
console.log(out, `(${steps.length} steps)`);
