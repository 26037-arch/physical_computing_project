// Verify CAD embedding and every configured signal against the Wokwi circuit.
'use strict';
const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const R=require('../sim/robot_contract.js'),M=require('../sim/models.js');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'config/robot_v4.json')));
const cad=JSON.parse(fs.readFileSync(path.join(root,'models/robot_v4/parameters.json')));
assert.deepStrictEqual(M.params,cad,'embedded CAD parameters are stale');
for(const[k,v]of Object.entries(cfg))assert.deepStrictEqual(R[k],v,`generated control setting ${k}`);
for(const[k,v]of Object.entries(R.geometry))assert.deepStrictEqual(v,cad[k],`generated geometry ${k}`);
const diagram=JSON.parse(fs.readFileSync(path.join(root,'diagram.json')));
const edges=new Set(diagram.connections.flatMap(([a,b])=>[a+'|'+b,b+'|'+a]));
const wire=(a,b)=>assert(edges.has(a+'|'+b),`missing wire ${a} -> ${b}`);
const motors=['','R','F','D','L','B'];
for(let f=1;f<6;f++){wire('uno:'+R.stepPins[f],'drv'+motors[f]+':STEP');wire('uno:'+R.dirPin,'drv'+motors[f]+':DIR');}
const groups=[['srvF','srvB'],['srvR','srvL'],['srvD'],['srvLock']];
for(let u=0;u<4;u++)for(const id of groups[u])wire('uno:'+R.servoPins[u],id+':PWM');
assert.equal(diagram.parts.filter(x=>x.type==='wokwi-servo').length,6);
wire('endEng:Q7','uno:'+R.sensorDataPin);wire('endRet:Q7','endEng:DS');wire('endRet:DS','uno:5V');
for(const chip of ['endEng','endRet']){
  wire(chip+':PL','uno:'+R.sensorLoadPin);wire(chip+':CP','uno:'+R.sensorClockPin);wire(chip+':CE','uno:GND.2');
  wire(chip+':VCC','uno:5V');wire(chip+':GND','uno:GND.2');
  for(const spare of [6,7])wire(chip+':D'+spare,'uno:5V');
  for(const [i,face]of ['F','B','R','L','D','Lock'].entries()){
    const prefix=chip==='endEng'?'sens':'ret';
    wire(chip+':D'+i,prefix+face+':1.l');wire(prefix+face+':2.l','uno:GND.2');
    wire('pullup'+prefix+face+':1','uno:5V');wire('pullup'+prefix+face+':2',prefix+face+':1.l');
    assert.equal(diagram.parts.find(p=>p.id==='pullup'+prefix+face)?.attrs.value,'10000');
  }
}
for(const [id,chip] of [['bypass0','endEng'],['bypass1','endRet']]){
  wire(id+':1',chip+':VCC');wire(id+':2',chip+':GND');
  assert.equal(diagram.parts.find(p=>p.id===id)?.attrs.value,'0.1µF');
}
assert.equal(diagram.parts.filter(x=>x.type==='wokwi-74hc165').length,2);
assert.equal(R.flipEnabled,false);assert.equal(R.faceMap[R.initialOrient][R.fixedLogicalFace],0);
wire('btnStart:1.l','uno:'+R.buttonPin);wire('bz1:2','uno:'+R.buzzerPin);
wire('lcd1:SDA','uno:A4');wire('lcd1:SCL','uno:A5');
const pin=p=>typeof p==='number'?p:14+ +p.slice(1);
const signals=[...R.stepPins.slice(1),R.dirPin,...R.servoPins,R.sensorDataPin,R.sensorClockPin,R.sensorLoadPin,R.buttonPin,R.buzzerPin,'A4','A5'].map(pin);
assert.equal(new Set(signals).size,signals.length,'signal pin conflict');
assert.equal(R.geometry.retract_mm,2*R.geometry.crank_r_mm);assert.equal(R.geometry.lock_stroke_mm,2*R.geometry.lock_crank_r_mm);
assert.equal(R.geometry.lock_bar_mm,6);assert.equal(R.geometry.strip_width_mm,16);
const html=fs.readFileSync(path.join(root,'sim/index.html'),'utf8');
assert(html.indexOf('<script src="robot_contract.js"')<html.indexOf('<script src="mechanism.js"'));
assert(fs.readFileSync(path.join(root,'scripts/upload.ps1'),'utf8').includes('.physicalBoard'));
assert(fs.readFileSync(path.join(root,'scripts/build.ps1'),'utf8').includes('.simulationBoard'));
console.log('Robot V4 contract PASS: config/generated JS + embedded CAD identical; 6 servos / 4 signals, 5 steppers, 12 individual engaged/retracted endstops via 74HC165×2, button, buzzer, LCD; unique pins and board defaults.');
