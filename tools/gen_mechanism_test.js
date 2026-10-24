// tools/gen_mechanism_test.js — V5 기구 절차의 Wokwi 실제 모드(Q 0) 시나리오를 만든다.
//   node tools/gen_mechanism_test.js  →  tests/mechanism_v5.test.yaml
// JS 기구 모델(sim/mechanism.js)이 내는 동작 줄(HOOD/SPIN/FLIP/TURN) 순서대로 보드 출력을 기다린다.
// V5 는 센서가 없으므로 시나리오가 흉내 낼 스위치는 없고, 서보·스텝 지연을 포함한 실제 모드에서 줄 순서·횟수·큐브 상태가
// JS 와 같은지, 장착 전 명령이 거부되는지(ERR not loaded), 장착·배출 흐름이 맞는지를 검사한다.
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
const mech = new Mechanism();
const asText = (c) => c.toFacelets().map((i) => 'URFDLB'[i]).join('');
const FACE = 'URFDLB';
const oriText = () => mech.ori.map((f) => FACE[f]).join('');

wait('READY');
// 0) 장착 전 실제 모드: 수 실행 거부
write('M R'); wait('ERR not loaded');
// 1) 버튼 길게(1.2 s 이상 = LOAD): 후드를 뒤로 젖히고 큐브 대기. 누른 채 기다려야 첫 줄을 놓치지 않는다
ctl('btnStart', 1);
for (const a of mech.load()) if (a.line) wait(a.line);
ctl('btnStart', 0); steps.push('  - delay: 300ms');   // 뗀 것이 디바운스(30 ms)에 잡히도록
// 2) 버튼 길게: 후드 OPEN → 장착
ctl('btnStart', 1);
for (const a of mech.load()) if (a.line) wait(a.line);
ctl('btnStart', 0);
// 3) 여섯 면 + 재배향: U(그대로 아래) D(2회 뒤집기) F(뒤집기) R(스핀+뒤집기) L B
const seq = C.parseMoves("U D' F R2 L B");
write('M ' + C.seqToString(seq));
mech.resetCounters();
for (const a of mech.planSeq(seq)) if (a.line) wait(a.line);
wait(`MOVED ${seq.length} flips=${mech.flips} spins=${mech.spins}`);
const cube = new C.Cube().apply(seq);
write('P'); wait('STATE ' + asText(cube));
wait(`MECH hood=CLOSE ori=${oriText()} loaded=1 flips=${mech.flips} spins=${mech.spins} hoods=${mech.hoods}`);
// 4) 시연 명령: 스핀 y2, 뒤집기
write('Y 2'); for (const a of mech.manualSpin(2)) if (a.line) wait(a.line);
write('F'); for (const a of mech.manualFlip()) if (a.line) wait(a.line);
write('P'); wait('STATE ' + asText(cube));
wait(`MECH hood=OPEN ori=${oriText()} loaded=1`);
// 5) 배출: 후드 LOAD → 손으로 꺼낸다
write('E');
for (const a of mech.eject()) if (a.line) wait(a.line);
write('M R'); wait('ERR not loaded');
const yaml = `# 자동 생성: node tools/gen_mechanism_test.js — V5 기구 절차(장착·재배향 스핀/뒤집기·층 회전·시연 명령·배출)를 실제 모드로 검사
name: V5 기구 절차 — LOAD 장착, U D' F R2 L B (후드·스핀·뒤집기·층 회전), Y/F 시연, 배출
version: 1
author: physical_computing_project
steps:
${steps.join('\n')}
`;
const out = path.join(__dirname, '..', 'tests', 'mechanism_v5.test.yaml');
fs.writeFileSync(out, yaml);
console.log(out, `(${steps.length} steps)`);
