#!/usr/bin/env node
'use strict';

// No packages required. Run from any directory; --check never writes files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'docs/WIRING_V5_R4.html');
const SVG = path.join(ROOT, 'docs/images/wiring_v5_breadboard.svg');
const DATA = path.join(ROOT, 'v5/sim/wiring_data.js');
const COLORS = {
  red: ['#df3437', '빨강 / 5 V'], black: ['#303238', '검정 / GND'],
  purple: ['#8347bc', '보라 / 12 V 또는 DIR'], orange: ['#ef7b25', '주황 / 신호'],
  yellow: ['#d9ac12', '노랑 / 버튼·RESET–SLEEP'], teal: ['#138891', '청록 / STEP'],
  green: ['#32954c', '초록 / D8·SDA·코일 1'], blue: ['#337aca', '파랑 / D9·SCL·코일 2'],
  metal: ['#aeb4bd', '부품 다리'],
};

// THE wiring table: kind, step, endpoint A, endpoint B, colour, wire type,
// and optional drawing bends. Component legs are attachments, not shorts
// through the component: capacitor/resistor/buzzer/coils are separate devices.
// Rail addresses T-/T+/B-/B+:1..50 number the actual holes left to right.
// 1..25 are the left bank; 26..50 the isolated right bank.
const WIRING = [
  ['leg', 2, 'drvCup:VMOT', 'e5'], ['leg', 2, 'drvCup:GNDmot', 'e6'],
  ['leg', 2, 'drvCup:2B', 'e7'], ['leg', 2, 'drvCup:2A', 'e8'],
  ['leg', 2, 'drvCup:1A', 'e9'], ['leg', 2, 'drvCup:1B', 'e10'],
  ['leg', 2, 'drvCup:VDD', 'e11'], ['leg', 2, 'drvCup:GND', 'e12'],
  ['leg', 2, 'drvCup:ENABLE', 'h5'], ['leg', 2, 'drvCup:MS1', 'h6'],
  ['leg', 2, 'drvCup:MS2', 'h7'], ['leg', 2, 'drvCup:MS3', 'h8'],
  ['leg', 2, 'drvCup:RESET', 'h9'], ['leg', 2, 'drvCup:SLEEP', 'h10'],
  ['leg', 2, 'drvCup:STEP', 'h11'], ['leg', 2, 'drvCup:DIR', 'h12'],
  ['leg', 3, 'cap:+', 'c5'], ['leg', 3, 'cap:-', 'c6'],
  ['leg', 5, 'btnStart:1.l', 'e15'], ['leg', 5, 'btnStart:2.l', 'e17'],
  ['leg', 5, 'btnStart:1.r', 'f15'], ['leg', 5, 'btnStart:2.r', 'f17'],
  ['leg', 6, 'resistor:1', 'i18'], ['leg', 6, 'resistor:2', 'i21'],
  ['leg', 6, 'bz1:2', 'f21'], ['leg', 6, 'bz1:1', 'f24'],
  ['wire', 1, 'uno:5V', 'T+:1', 'red', '수-수', [[446, 385], [152, 385], [152, 504]]],
  ['wire', 1, 'uno:GND.1', 'T-:1', 'black', '수-수', [[460, 398], [174, 398]]],
  ['wire', 1, 'T-:25', 'B-:25', 'black', '수-수', [[575, 490], [575, 742]]],
  ['wire', 1, 'jack:+', 'B+:1', 'purple', '단선', [[130, 802], [174, 802]]],
  ['wire', 1, 'jack:-', 'B-:1', 'black', '단선', [[144, 790], [160, 790], [160, 742]]],
  ['wire', 2, 'i9', 'i10', 'yellow', '수-수(짧게)', [[272, 678], [286, 678]]],
  ['wire', 2, 'j7', 'T+:6', 'red', '수-수 / MS2', [[244, 804], [114, 804], [114, 518], [258, 518]]],
  ['wire', 2, 'a6', 'T-:4', 'black', '수-수'],
  ['wire', 2, 'a12', 'T-:10', 'black', '수-수'],
  ['wire', 2, 'a11', 'T+:9', 'red', '수-수'],
  ['wire', 3, 'a5', 'B+:4', 'purple', '수-수(길게)', [[216, 535], [91, 535], [91, 779], [216, 779]]],
  ['wire', 2, 'uno:6', 'j5', 'orange', '수-수', [[558, 47], [740, 47], [740, 826], [202, 826], [202, 700]]],
  ['wire', 2, 'uno:2', 'j11', 'teal', '수-수', [[614, 55], [724, 55], [724, 812], [300, 812]]],
  ['wire', 2, 'uno:7', 'j12', 'purple', '수-수', [[544, 39], [756, 39], [756, 840], [314, 840]]],
  ['wire', 4, 'motCup:A-', 'a7', 'blue', '모터 선', [[190, 410], [244, 410]]],
  ['wire', 4, 'motCup:A+', 'a8', 'blue', '모터 선', [[204, 418], [251, 418], [251, 539], [258, 539]]],
  ['wire', 4, 'motCup:B+', 'a9', 'green', '모터 선', [[218, 426], [272, 426]]],
  ['wire', 4, 'motCup:B-', 'a10', 'green', '모터 선', [[232, 434], [286, 434]]],
  ['wire', 5, 'uno:A2', 'a15', 'yellow', '수-수', [[544, 450], [356, 450]]],
  ['wire', 5, 'j17', 'B-:12', 'black', '수-수', [[384, 731], [356, 731]]],
  ['wire', 6, 'uno:A3', 'j18', 'orange', '수-수', [[558, 440], [670, 440], [670, 794], [398, 794]]],
  ['wire', 6, 'j24', 'B-:20', 'black', '수-수'],
  ['wire', 7, 'adapter:+', 'j27', 'red', '단선', [[810, 858], [524, 858]]],
  ['wire', 7, 'adapter:-', 'B-:24', 'black', '단선', [[824, 850], [776, 850], [776, 766], [552, 766]]],
  ['wire', 7, 'j29', 'B-:23', 'black', '수-수', [[552, 724], [538, 724]]],
  ['wire', 7, 'srvHood:V+', 'h27', 'red', '수-수', [[876, 672]]],
  ['wire', 7, 'srvHood:GND', 'f29', 'black', '수-수', [[862, 644]]],
  ['wire', 7, 'uno:8', 'srvHood:PWM', 'green', '수-수 / 주황 신호선에 연결', [[516, 31], [772, 31], [772, 270], [984, 270], [984, 404], [890, 404]]],
  ['wire', 7, 'srvLift:V+', 'i27', 'red', '수-수', [[1056, 686]]],
  ['wire', 7, 'srvLift:GND', 'g29', 'black', '수-수', [[1042, 658]]],
  ['wire', 7, 'uno:9', 'srvLift:PWM', 'blue', '수-수 / 주황 신호선에 연결', [[502, 23], [788, 23], [788, 254], [1170, 254], [1170, 404], [1070, 404]]],
  ['wire', 8, 'lcd1:GND', 'T-:20', 'black', '암-수', [[880, 242], [812, 242], [812, 460], [482, 460]]],
  ['wire', 8, 'lcd1:VCC', 'T+:19', 'red', '암-수', [[908, 250], [800, 250], [800, 452], [804, 452], [804, 532], [468, 532]]],
  ['wire', 8, 'uno:A4', 'lcd1:SDA', 'green', '암-수', [[572, 410], [700, 410], [700, 246], [936, 246]]],
  ['wire', 8, 'uno:A5', 'lcd1:SCL', 'blue', '암-수', [[586, 422], [712, 422], [712, 238], [964, 238]]],
].map(([kind, step, a, b, color = 'metal', type = '부품 다리', via = []], i) =>
  ({kind, step, a, b, color, type, via, id: i + 1}));
const WIRES = WIRING.filter(r => r.kind === 'wire');
const LEGS = WIRING.filter(r => r.kind === 'leg');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
const colX = n => 160 + (n - 1) * 14;
const rowY = {a:546, b:560, c:574, d:588, e:602, f:644, g:658, h:672, i:686, j:700};
const railY = {'T-':490, 'T+':504, 'B-':742, 'B+':756};
const railX = n => colX(2 + Math.floor((n - 1) / 5) * 6 + (n - 1) % 5 + (n > 25 ? 1 : 0));
const HEADERS = [
  ['SCL', 'SDA', 'AREF', 'GND.3', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'],
  ['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND.1', 'GND.2', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
];
const terminals = new Map();
HEADERS.forEach((pins, side) => pins.forEach((p, i) =>
  terminals.set(`uno:${p}`, [390 + i * 14 + (i >= (side ? 8 : 10) ? 14 : 0), side ? 340 : 96])));
Object.entries({
  'motCup:A-':[190,295], 'motCup:A+':[204,295], 'motCup:B+':[218,295], 'motCup:B-':[232,295],
  'srvHood:GND':[862,370], 'srvHood:V+':[876,370], 'srvHood:PWM':[890,370],
  'srvLift:GND':[1042,370], 'srvLift:V+':[1056,370], 'srvLift:PWM':[1070,370],
  'lcd1:GND':[880,230], 'lcd1:VCC':[908,230], 'lcd1:SDA':[936,230], 'lcd1:SCL':[964,230],
  'jack:+':[130,880], 'jack:-':[144,880], 'adapter:+':[810,880], 'adapter:-':[824,880],
}).forEach(([k,v]) => terminals.set(k,v));
for (const r of LEGS) terminals.set(r.a, holePoint(r.b));

function holePoint(id) {
  let m = /^([a-j])(\d+)$/.exec(id);
  if (m && +m[2] >= 1 && +m[2] <= 63) return [colX(+m[2]), rowY[m[1]]];
  m = /^([TB][+-]):(\d+)$/.exec(id);
  if (m && +m[2] >= 1 && +m[2] <= 50) return [railX(+m[2]), railY[m[1]]];
  return null;
}
function point(id) {
  const p = holePoint(id) || terminals.get(id);
  assert(p, `Unknown endpoint: ${id}`);
  return p;
}
function label(id) {
  const m = /^([TB])([+-]):(\d+)$/.exec(id);
  if (m) return `${m[1] === 'T' ? '위' : '아래'} ${m[2] === '-' ? '−' : '+'} 레일 ${+m[3] <= 25 ? 'L' : 'R'}${String(((+m[3]-1)%25)+1).padStart(2,'0')}`;
  const names = {uno:'UNO', drvCup:'A4988', motCup:'NEMA17', srvHood:'MG996R', srvLift:'SG90', lcd1:'LCD', jack:'12 V 잭', adapter:'5 V 어댑터'};
  const [part, pin] = id.split(':');
  if (!pin) return id;
  return `${names[part] || part} ${part === 'uno' && /^\d+$/.test(pin) ? 'D' : ''}${pin.replace(/GND\.\d/, 'GND')}`;
}
function wireNumber(r) { return WIRES.indexOf(r) + 1; }
function wirePoints(r) {
  const start=point(r.a), end=point(r.b);
  const bends=r.via.length ? r.via : start[0]!==end[0] && start[1]!==end[1] ? [[start[0],end[1]]] : [];
  return [start,...bends,end];
}
function checkWireGeometry() {
  const segments=[];
  for (const r of WIRES) {
    const points=wirePoints(r);
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      assert(a[0]===b[0] || a[1]===b[1],`Non-orthogonal wire: ${wireNumber(r)}`);
      segments.push({id:wireNumber(r),a,b});
    }
  }
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];
    if(a.id===b.id) continue;
    for(const axis of [0,1]) {
      const along=1-axis;
      if(a.a[axis]!==a.b[axis] || b.a[axis]!==b.b[axis] || a.a[axis]!==b.a[axis]) continue;
      const low=Math.max(Math.min(a.a[along],a.b[along]),Math.min(b.a[along],b.b[along]));
      const high=Math.min(Math.max(a.a[along],a.b[along]),Math.max(b.a[along],b.b[along]));
      assert(high<=low,`Collinear wire overlap: ${a.id} / ${b.id}`);
    }
  }
}

class Nets {
  constructor() { this.parent = new Map(); }
  root(x) {
    if (!this.parent.has(x)) this.parent.set(x,x);
    const p = this.parent.get(x);
    if (p !== x) this.parent.set(x,this.root(p));
    return this.parent.get(x);
  }
  join(a,b) { this.parent.set(this.root(a),this.root(b)); }
}
function electricalCheck() {
  const nets = new Nets(), occupied = new Map(), active = new Set();
  const buckets = new Map();
  const addHole = (h, bucket) => {
    if (buckets.has(bucket)) nets.join(h,buckets.get(bucket));
    else { buckets.set(bucket,h); nets.root(h); }
  };
  for (let n=1;n<=63;n++) for (const row of 'abcdefghij') addHole(`${row}${n}`, `${row <= 'e' ? 'upper' : 'lower'}:${n}`);
  for (const rail of Object.keys(railY)) for (let n=1;n<=50;n++) addHole(`${rail}:${n}`, `${rail}:${n <= 25 ? 'L' : 'R'}`);
  for (const r of WIRING) {
    for (const id of [r.a,r.b]) {
      point(id); // Valid header, external connector or breadboard hole.
      assert(!occupied.has(id), `Double insertion at ${id}: rows ${occupied.get(id)} and ${r.id}`);
      occupied.set(id,r.id);
      if (holePoint(id)) {
        const rail = /^([TB][+-]):(\d+)$/.exec(id);
        assert(!rail || +rail[2] <= 25, `Rail connection outside left bank: ${id}`);
      } else active.add(id);
    }
    nets.join(r.a,r.b);
  }
  // UNO's three GND headers and tact switch duplicate legs are internal copper.
  for (const g of ['uno:GND.2','uno:GND.3']) { nets.join('uno:GND.1',g); active.add(g); }
  nets.join('btnStart:1.l','btnStart:1.r');
  nets.join('btnStart:2.l','btnStart:2.r'); // Open switch; pressing is tested below.
  // The Wokwi diagram supplies MCU signal pins and coil labels. Physical
  // supplies (separate servo adapter) and the series resistor follow the brief.
  const diagram = JSON.parse(fs.readFileSync(path.join(ROOT,'v5/diagram.json'),'utf8'));
  const unoFor = pin => {
    const matches = diagram.connections.filter(c => c.slice(0,2).includes(pin))
      .map(c => c[0] === pin ? c[1] : c[0]).filter(p => p.startsWith('uno:'));
    assert.equal(matches.length,1, `Expected one UNO connection in diagram.json for ${pin}`);
    return matches[0];
  };
  const expected = [];
  const expect = (name, members) => expected.push({name, members});
  for (const target of ['drvCup:STEP','drvCup:DIR','drvCup:ENABLE','srvHood:PWM','srvLift:PWM','lcd1:SDA','lcd1:SCL'])
    expect(target, [unoFor(target), target]);
  expect('BUTTON', [unoFor('btnStart:1.l'), 'btnStart:1.l','btnStart:1.r']);
  expect('BUZZER_INPUT', [unoFor('bz1:2'),'resistor:1']);
  expect('BUZZER_AFTER_100_OHM', ['resistor:2','bz1:2']);
  assert.equal(unoFor('drvCup:MS2'),'uno:5V','diagram.json must connect MS2 to UNO 5V');
  expect('UNO_5V', ['uno:5V','drvCup:VDD','drvCup:MS2','lcd1:VCC']);
  expect('SERVO_5V', ['adapter:+','srvHood:V+','srvLift:V+']);
  expect('MOTOR_12V', ['jack:+','drvCup:VMOT','cap:+']);
  expect('GND', ['uno:GND.1','uno:GND.2','uno:GND.3','drvCup:GND','drvCup:GNDmot','cap:-',
    'jack:-','adapter:-','srvHood:GND','srvLift:GND','lcd1:GND','btnStart:2.l','btnStart:2.r','bz1:1']);
  expect('RESET_SLEEP', ['drvCup:RESET','drvCup:SLEEP']);
  for (const p of ['MS1','MS3']) expect(`${p}_FLOATING`, [`drvCup:${p}`]);
  for (const p of ['1A','1B','2A','2B']) {
    const c = diagram.connections.find(c => c.slice(0,2).includes(`drvCup:${p}`));
    assert(c, `Motor pin ${p} missing in diagram.json`);
    expect(`MOTOR_${p}`, c.slice(0,2));
  }
  const assigned = new Set(), roots = new Set();
  for (const {name,members} of expected) {
    const root = nets.root(members[0]);
    assert(!roots.has(root), `Short between expected nets: ${name}`);
    roots.add(root);
    const actual = [...active].filter(p => nets.root(p) === root).sort();
    assert.deepEqual(actual,[...members].sort(), `Net mismatch: ${name}`);
    for (const member of members) { assert(!assigned.has(member),`Duplicate expected terminal: ${member}`); assigned.add(member); }
  }
  assert.deepEqual([...assigned].sort(),[...active].sort(),'Unverified component terminals');
  for (const pin of ['drvCup:MS1','drvCup:MS3']) {
    const mount=LEGS.find(r=>r.a===pin).b;
    const insertions=[...occupied.keys()].filter(h=>holePoint(h) && nets.root(h)===nets.root(pin));
    assert.deepEqual(insertions,[mount],`${pin} must have no jumper or other leg on its strip`);
  }
  for (const rail of Object.keys(railY)) {
    assert.notEqual(nets.root(`${rail}:25`),nets.root(`${rail}:26`),`Split rail bridged: ${rail}`);
    assert(![...active].some(p => nets.root(p) === nets.root(`${rail}:26`)),`Right rail in use: ${rail}`);
  }
  assert.notEqual(nets.root('uno:A2'),nets.root('uno:GND.1'),'Button short while released');
  nets.join('btnStart:1.l','btnStart:2.l');
  assert.equal(nets.root('uno:A2'),nets.root('uno:GND.1'),'Button does not ground A2 when pressed');
  return {nets:expected.length, holes:830, occupied:[...occupied.keys()].filter(h => holePoint(h)).length, terminals:active.size};
}

function makeSvg() {
  const out = [];
  const put = s => out.push(s);
  const rect = (x,y,w,h,fill,stroke='#61707a',rx=0) => put(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`);
  const text = (x,y,s,size=12,fill='#24333e',anchor='start',extra='') => put(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" stroke="${['#fff','#c8eaff'].includes(fill)?'#24333e':'#fff'}" stroke-width="2.5" paint-order="stroke fill" ${extra}>${esc(s)}</text>`);
  const circle = (x,y,r,fill,stroke='#59616a') => put(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}"/>`);
  const line = (x1,y1,x2,y2,color,width=2) => put(`<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`);
  const badge = (n,x,y,title) => { circle(x,y,13,'#163c4d','#fff'); text(x,y+5,'①②③④⑤⑥⑦⑧⑨'[n-1],19,'#fff','middle'); if (title) text(x+19,y+4,title,12); };
  put('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1050" width="1200" height="1050" role="img" aria-labelledby="wiring-title wiring-desc">');
  put('<title id="wiring-title">V5 UNO R4 WiFi · 830홀 브레드보드 배선</title>');
  put('<desc id="wiring-desc">위에 UNO 평면도, 아래에 63열 브레드보드. 모든 레일 배선은 왼쪽 절반. 아래 + 레일은 12 V. MS2는 j7에서 위 + 레일로 연결. 교차하는 선은 접속되지 않으며 양 끝 점에서만 꽂는다.</desc>');
  put('<g font-family="Malgun Gothic, Arial, sans-serif" stroke-linecap="round" stroke-linejoin="round">');
  rect(0,0,1200,1050,'#fff','#fff');
  text(30,33,'V5 · 실제 홀에 꽂는 배선도',19,'#153b4b');
  text(30,53,'830홀 / 2.54 mm 피치 · a 행이 UNO 쪽',12);
  // UNO: 68.6 x 53.4 mm at exactly 14 px per 2.54 mm.
  rect(310,70,+(68.6*14/2.54).toFixed(3),+(53.4*14/2.54).toFixed(3),'#16858e','#095963',12);
  for (const [x,y] of [[324,84],[674,84],[324,350],[674,350]]) circle(x,y,6,'#f8f6e8','#c5c6b8');
  rect(297,123,46,42,'#cbd0d4','#5d6870',4); text(320,148,'USB-C',11,'#24333e','middle');
  rect(303,261,45,42,'#272b30','#111',3); circle(317,282,10,'#111');
  rect(357,124,24,20,'#d7dad8','#183d42',3); circle(369,134,6,'#c54440'); text(369,159,'RESET',10,'#fff','middle');
  rect(470,184,78,66,'#263940','#0a4a50',3);
  for (let i=0;i<7;i++) { line(464,190+i*8,470,190+i*8,'#b9c5c6',3); line(548,190+i*8,554,190+i*8,'#b9c5c6',3); }
  text(499,280,'UNO R4 WiFi (R3 와 헤더 동일)',14,'#fff','middle');
  HEADERS.forEach((pins,side) => pins.forEach(p => {
    const [x,y]=terminals.get(`uno:${p}`);
    rect(x-5,y-6,10,12,'#171b20','#171b20'); circle(x,y,2.4,'#bcc6b8','#d2aa66');
    const name=p === 'NC' ? '(NC)' : p.replace(/GND\.\d/,'GND');
    text(x,side ? y-10 : y+15,name,10,'#fff',side ? 'start' : 'end',`transform="rotate(-55 ${x} ${side ? y-10 : y+15})"`);
  }));
  // External components, deliberately kept outside the breadboard body.
  rect(60,175,196,120,'#e7e9ea','#64717a',9); rect(75,190,65,65,'#343b42','#111',4); circle(107,222,23,'#c7cdd0'); circle(107,222,7,'#626b73');
  text(153,205,'NEMA17',15); text(153,227,'코일 2 / 코일 1',11); text(153,247,'A− A+ / B+ B−',11); badge(4,46,183);
  rect(840,90,292,140,'#2a7b4c','#17482e',5); rect(858,109,255,66,'#25334c','#13263d',3);
  text(985,139,'LCD1602 · I2C',18,'#c8eaff','middle'); text(985,162,'0x27',12,'#c8eaff','middle'); badge(8,824,102);
  for (const [i,p] of ['GND','VCC','SDA','SCL'].entries()) text(880+i*28,215,p,10,'#fff','middle');
  for (const [id,x,name,fill] of [['srvHood',820,'MG996R · 후드','#4b4e54'],['srvLift',1000,'SG90 · 리프터','#3774b6']]) {
    rect(x,290,150,80,fill,'#253443',6); circle(x+30,321,15,'#f4f1e7'); rect(x+16,317,65,8,'#f3f1e7','#ddd',3);
    text(x+75,352,name,13,'#fff','middle');
    for (const [pin,color] of [['GND','#805431'],['V+','#df3437'],['PWM','#ef7b25']]) { const [px,py]=point(`${id}:${pin}`); rect(px-5,py-8,10,14,color,'#333',2); }
    text(x+75,284,'갈 GND / 빨 + / 주황 신호',10,'#374b58','middle');
  }
  rect(65,880,205,65,'#e7ecef','#64717a',7); text(82,911,'12 V DC 잭 터미널',14); text(82,933,'+ 보라 / − 검정',12);
  rect(760,880,270,65,'#edf0f2','#64717a',7); text(777,911,'5 V USB 어댑터 · 서보 전용',14); text(777,933,'+ → j27 / − → 아래 − 레일',12);
  for (const id of ['jack:+','jack:-','adapter:+','adapter:-']) { const [x,y]=point(id), positive=id.endsWith('+'); circle(x,y,5,'#b7bdc2'); text(x+(positive?-10:10),y+4,positive?'+':'−',11,'#111',positive?'end':'start'); }
  // 630 terminal holes + 200 rail holes = 830, exactly.
  rect(130,470,948,310,'#f3f0e6','#bab7a9',9);
  rect(142,614,924,18,'#ded9c9','#d1ccbf',2);
  for (const [rail,y] of Object.entries(railY)) {
    const color=rail.includes('-')?'#3880cf':'#df3437';
    for (const [x1,x2] of [[150,575],[600,1058]]) line(x1,y-7,x2,y-7,color,1.6);
    text(142,y+4,rail.includes('-')?'−':'+',13,color,'middle'); text(1066,y+4,rail.includes('-')?'−':'+',13,color,'middle');
    for (let n=1;n<=50;n++) { const id=`${rail}:${n}`; const [x,hy]=point(id); put(`<circle data-hole="${id}" cx="${x}" cy="${hy}" r="2.8" fill="#66685f" stroke="#cbc7b9"/>`); }
  }
  for (let n=1;n<=63;n++) {
    if (n===1 || n%5===0) for (const y of [532,722]) text(colX(n),y,n,10,'#5c615b','middle');
    for (const row of 'abcdefghij') { const id=`${row}${n}`; const [x,y]=point(id); put(`<circle data-hole="${id}" cx="${x}" cy="${y}" r="2.8" fill="#66685f" stroke="#cbc7b9"/>`); }
  }
  for (const [row,y] of Object.entries(rowY)) for (const x of [143,1054]) text(x,y+4,row,11,'#53615c','middle');
  // Mounted component bodies. Their pin coordinates come only from WIRING.
  const [dx,dy]=point('drvCup:VMOT'), [ex,ey]=point('drvCup:DIR');
  rect(dx-8,dy-7,ex-dx+16,ey-dy+14,'#b63c38','#76231f',3);
  rect(dx+26,dy+28,52,28,'#a8b0b9','#5f6770',2);
  for (let i=0;i<5;i++) line(dx+29+i*10,dy+30,dx+29+i*10,dy+53,'#dce1e4',3);
  circle(ex-7,dy+38,9,'#d4d5cd'); line(ex-12,dy+38,ex-2,dy+38,'#50595d',2);
  text(dx+54,dy+21,'A4988',12,'#fff','middle');
  for (const r of LEGS.filter(r => r.a.startsWith('drvCup:'))) {
    const [x,y]=point(r.b), top=r.b[0]==='e';
    rect(x-3.5,y-3.5,7,7,'#caa667','#725727');
    text(x+3,top?y+8:y-5,r.a.split(':')[1].replace('GNDmot','GND'),10,'#fff','start',`transform="rotate(-90 ${x+3} ${top?y+8:y-5})"`);
  }
  const [cx,cy]=point('cap:+'), [cnx,cny]=point('cap:-');
  const canX=(cx+cnx)/2, canY=(cy+rowY.d)/2;
  line(cx,cy,canX-4,canY-4,'#777',2); line(cnx,cny,canX+4,canY-4,'#777',2);
  circle(canX,canY,7,'#263745','#17232e');
  put(`<path d="M${canX+3},${canY-6} A7,7 0 0 1 ${canX+3},${canY+6} Z" fill="#d9dfe1" stroke="none"/>`);
  line(canX+3,canY,canX+6,canY,'#263745',1);
  const [bx,by]=point('btnStart:1.l'), [b2x,b2y]=point('btnStart:2.r');
  rect(bx-4,by-4,b2x-bx+8,b2y-by+8,'#bcc1c1','#646c6c',3); circle((bx+b2x)/2,(by+b2y)/2,11,'#343b40');
  const [rx,ry]=point('resistor:1'), [r2x]=point('resistor:2');
  line(rx,ry,r2x,ry,'#9b9d9e',2); rect(rx+6,ry-6,r2x-rx-12,12,'#dfc79d','#a38657',4);
  for (const [x,c] of [[rx+11,'#794222'],[rx+17,'#181818'],[rx+23,'#794222'],[r2x-10,'#bc941e']]) rect(x,ry-6,3,12,c,c);
  const [zx,zy]=point('bz1:2'), [z2x,z2y]=point('bz1:1');
  circle((zx+z2x)/2,zy,26,'#262d32','#0b1116'); circle((zx+z2x)/2,zy,7,'#10171b'); text(zx,zy+5,'+',12,'#fff'); text(z2x,zy+5,'−',12,'#fff');
  for (const r of LEGS.filter(r => !r.a.startsWith('drvCup:'))) { const [x,y]=point(r.b); circle(x,y,2.5,'#d7b77e'); }
  // Wires: white crossing clearance, same-colour dark edge, rounded core.
  for (const r of WIRES) {
    const points=wirePoints(r);
    const d=points.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join(' ');
    const color=COLORS[r.color][0];
    const dark='#'+color.slice(1).match(/../g).map(s=>Math.round(parseInt(s,16)*.57).toString(16).padStart(2,'0')).join('');
    put(`<g data-wire="${wireNumber(r)}"><title>${esc(`${wireNumber(r)} · ${label(r.a)} ↔ ${label(r.b)} · 단계 ${r.step}`)}</title>`);
    for (const [stroke,width] of [['#fff',9],[dark,6.6],[color,4.8]]) put(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`);
    for (const [x,y] of [points[0],points.at(-1)]) circle(x,y,3.6,color,dark);
    put('</g>');
  }
  // Badges and labels are above the wiring layer for a readable assembly key.
  badge(1,145,467,'레일'); badge(2,333,617); badge(3,196,579);
  text(160,605,'100 µF',11);   // 커패시터(c5·c6) 바로 아래, 비어 있는 1~3열 d·e 위

  badge(5,398,618); badge(6,481,695); badge(7,532,620);
  text(411,673,'100 Ω',10,'#5c686e','middle');
  text(180,849,'MS2: j7 → 위 +',12,'#b62227'); text(850,797,'D2 → j11 STEP',11,'#087680');
  text(850,815,'D6 → j5 ENABLE',11,'#bd5911'); text(850,833,'D7 → j12 DIR',11,'#75409f');
  text(590,486,'레일 중앙 단절',10,'#4a565d','middle');
  rect(994,786,188,78,'#f5f7f8','#bac4ca',5);
  text(1004,801,'오른쪽 레일 미사용',11,'#5c686e');
  text(1004,819,'L01~L25: 왼쪽 25홀',11,'#5c686e');
  text(1004,837,'(5홀 × 5묶음)',11,'#5c686e');
  text(1004,855,'1~63열 · 가운데 홈',11,'#5c686e');
  rect(295,886,425,63,'#fff1e9','#cf4c25',7); badge(9,317,906);
  text(337,910,'아래 + 레일 = 12 V, 5 V 부품 금지',16,'#ad3219');
  text(312,934,'위 + / 27열 / 아래 + 는 서로 연결하지 않는다.',12,'#ad3219');
  text(35,978,'선 색 = 의미',13,'#163c4d');
  for (const [i,c] of ['red','black','purple','orange','yellow','teal','green','blue'].entries()) {
    const x=35+(i%4)*290,y=996+Math.floor(i/4)*24;
    line(x,y,x+24,y,COLORS[c][0],5); text(x+31,y+4,COLORS[c][1],11);
  }
  text(35,1042,'점 = 꽂는 양 끝 · 교차는 접속 아님(흰 테두리) · 핀/홀과 선 번호는 SVG 툴팁 및 아래 선 목록 참조',11,'#5c686e');
  put('</g></svg>');
  return out.join('\n')+'\n';
}

// Deliberately small XML validator for the generated SVG vocabulary. Rejects
// unmatched tags, duplicate attributes, malformed entities, and text outside root.
function checkXml(svg) {
  const stack=[], token=/<[^>]*>|[^<]+/g;
  let roots=0, consumed=0, match;
  const entityCheck = s => assert(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(s),'Invalid XML entity');
  while ((match=token.exec(svg))) {
    assert.equal(match.index,consumed,'Unparsed XML'); consumed=token.lastIndex;
    const s=match[0];
    if (s.startsWith('</')) { assert(/^<\/[\w:-]+>$/.test(s),'Invalid closing tag'); assert.equal(stack.pop(),s.slice(2,-1),'XML tag mismatch'); }
    else if (s.startsWith('<')) {
      const m=/^<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>$/.exec(s);
      assert(m,`Invalid XML tag: ${s.slice(0,100)}`);
      if (!stack.length) { roots++; assert.equal(m[1],'svg','Expected SVG root'); }
      const attrs=new Set();
      for (const a of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) { assert(!attrs.has(a[1]),`Duplicate XML attribute ${a[1]}`); attrs.add(a[1]); entityCheck(a[2]); }
      if (!m[3]) stack.push(m[1]);
    } else { entityCheck(s); assert(stack.length || !s.trim(),'Text outside SVG root'); }
  }
  assert.equal(consumed,svg.length); assert.equal(roots,1); assert.equal(stack.length,0,'Unclosed SVG tags');
  assert.equal([...svg.matchAll(/data-hole="/g)].length,830,'SVG must draw exactly 830 holes');
  assert.equal([...svg.matchAll(/data-wire="/g)].length,WIRES.length,'SVG wire count mismatch');
}
function makeList() {
  const rows=WIRES.map(r=>`    <tr><td>${wireNumber(r)}</td><td>${'①②③④⑤⑥⑦⑧⑨'[r.step-1]}</td><td>${esc(label(r.a))}</td><td>${esc(label(r.b))}</td><td>${esc(r.type)}</td><td><span class="sw" style="background:${COLORS[r.color][0]}"></span>${esc(COLORS[r.color][1])}</td></tr>`);
  return `<table>\n  <thead><tr><th>#</th><th>단계</th><th>한쪽</th><th>다른 쪽</th><th>종류</th><th>색 추천</th></tr></thead>\n  <tbody>\n${rows.join('\n')}\n  </tbody>\n</table>`;
}
// 3D 최종 모습(v5/sim/wiring.html)이 쓰는 데이터. 같은 표에서 나오므로 그림·선 목록·3D 가 어긋나지 않는다.
// pa/pb 는 브레드보드 구멍의 2D 그림 좌표(px, 14 px = 2.54 mm)이고, 구멍이 아닌 끝(UNO 핀·외부 부품)은 null 이다.
function makeData() {
  const data={
    pitchPx:14, origin:[colX(1),(rowY.e+rowY.f)/2], headers:HEADERS,
    grid:{cols:63, rowY, railY, railX:Array.from({length:50},(_,i)=>railX(i+1))},
    colors:Object.fromEntries(Object.entries(COLORS).map(([k,v])=>[k,{hex:v[0],label:v[1]}])),
    wires:WIRES.map(r=>({n:wireNumber(r),step:r.step,a:r.a,b:r.b,color:r.color,type:r.type,la:label(r.a),lb:label(r.b),pa:holePoint(r.a),pb:holePoint(r.b)})),
    legs:LEGS.map(r=>({pin:r.a,hole:r.b,step:r.step,p:holePoint(r.b)})),
  };
  return `// 자동 생성 (node tools/make_wiring_v5.js) — 수정 금지. 원본은 tools/make_wiring_v5.js 의 WIRING 표.\nwindow.WiringV5 = ${JSON.stringify(data)};\n`;
}
function replaceBlock(html, name, body) {
  const begin=`<!-- WIRING-${name}:BEGIN -->`,end=`<!-- WIRING-${name}:END -->`;
  assert.equal(html.split(begin).length,2,`Expected exactly one ${begin}`);
  assert.equal(html.split(end).length,2,`Expected exactly one ${end}`);
  const a=html.indexOf(begin)+begin.length,b=html.indexOf(end);
  assert(b>a,`Reversed markers: ${name}`);
  return html.slice(0,a)+'\n'+body+'\n'+html.slice(b);
}
function main() {
  assert(process.argv.slice(2).every(a=>a==='--check'),'Usage: node tools/make_wiring_v5.js [--check]');
  const check=process.argv.includes('--check');
  const report=electricalCheck(); checkWireGeometry();
  const svg=makeSvg(); checkXml(svg);
  const data=makeData();
  const original=fs.readFileSync(HTML,'utf8');
  const newline=original.includes('\r\n')?'\r\n':'\n';
  let html=original.replace(/\r\n/g,'\n');
  const figure=`<figure>\n${svg.trimEnd()}\n<figcaption>그림 3. UNO 평면도와 풀사이즈 830홀 배치. <code>tools/make_wiring_v5.js</code>의 배선 표 하나로 SVG·선 목록·넷 검사를 생성한다. ①~⑨는 아래 순서와 같다. 양 끝 점만 구멍에 꽂으며 선의 교차는 접속이 아니다. 레일은 위쪽 줄 −, 아래쪽 줄 + 이며 중앙에서 끊긴 왼쪽 절반만 쓴다. L01~L25는 각 레일 왼쪽의 실제 구멍 번호다.</figcaption>\n</figure>`;
  html=replaceBlock(html,'FIG',figure);
  html=replaceBlock(html,'LIST',makeList());
  if(newline==='\r\n') html=html.replace(/\n/g,'\r\n');
  if (check) {
    assert(fs.existsSync(SVG),'Missing generated SVG; run node tools/make_wiring_v5.js');
    assert(fs.readFileSync(SVG,'utf8')===svg,'SVG is stale; regenerate');
    assert(original===html,'HTML figure/list is stale; regenerate');
    assert(fs.existsSync(DATA) && fs.readFileSync(DATA,'utf8')===data,'v5/sim/wiring_data.js is stale; regenerate');
  } else {
    fs.mkdirSync(path.dirname(SVG),{recursive:true}); fs.writeFileSync(SVG,svg); fs.writeFileSync(HTML,html); fs.writeFileSync(DATA,data);
    console.log('WROTE docs/images/wiring_v5_breadboard.svg + docs/WIRING_V5_R4.html (FIG/LIST) + v5/sim/wiring_data.js');
  }
  console.log(`PASS holes: ${report.holes}; occupied breadboard holes: ${report.occupied}; no duplicate insertions`);
  console.log(`PASS nets: ${report.nets}; component terminals: ${report.terminals}; 9 UNO signals match v5/diagram.json`);
  console.log('PASS MS2=UNO 5V; RESET=SLEEP; MS1/MS3 floating; button open/pressed; buzzer via 100 ohm');
  console.log('PASS 12V / UNO 5V / servo 5V isolated; GND common; split rails right banks unused');
  console.log('PASS wire routes orthogonal; no collinear wire overlaps');
  console.log(`PASS SVG XML tags + 830 drawn holes + ${WIRES.length} wires; generated SVG/HTML ${check?'up to date (read only)':'written'}`);
}
if (require.main===module) { try { main(); } catch (error) { console.error(`FAIL ${error.message}`); process.exitCode=1; } }
