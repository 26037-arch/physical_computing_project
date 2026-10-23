// Exercise production V4 animation + panel code with a deterministic clock and scene adapter.
// This validates kinematics/state/axes, not WebGL rendering or real friction.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const C=require('../sim/cube.js'),S=require('../sim/solver.js'),MECH=require('../sim/mechanism.js'),R=require('../sim/robot_contract.js'),M=require('../sim/models.js');
const source=fs.readFileSync(require.resolve('../sim/app.js'),'utf8');
assert.equal(M.params.lock_bar_mm,6);for(const [k,v]of Object.entries(R.geometry))assert.deepStrictEqual(M.params[k],v,`CAD/embedded geometry ${k}`);
assert(source.includes('Object.assign({}, R.geometry, MODELS.params || {})'));
class Vector {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vector(this.x,this.y,this.z);}
  copy(v){Object.assign(this,v);return this;}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  multiplyScalar(a){this.x*=a;this.y*=a;this.z*=a;return this;}
  normalize(){return this.multiplyScalar(1/Math.hypot(this.x,this.y,this.z));}
  applyQuaternion(q){const c=Math.cos(q.angle),s=Math.sin(q.angle),y=this.y;this.y=y*c-this.z*s;this.z=y*s+this.z*c;return this;}
}
class Group {
  constructor(){this.rotation={x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}};this.position=new Vector();this.children=[];this.quaternion={setFromUnitVectors(){}};}
  add(x){this.children.push(x);} attach(){} updateMatrixWorld(){} setRotationFromAxisAngle(){}
}
const N=[[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[-1,0,0],[0,0,-1]];
const els=new Map();function element(id){if(!els.has(id))els.set(id,{value:id==='speed'?'1':'',textContent:'',innerHTML:'',checked:true,addEventListener(){},insertAdjacentHTML(){}});return els.get(id);}
let ctx;
function crank(r=12){return {theta:0,shift:0,set(t){this.theta=t;this.shift=r*(1-Math.cos(t));}};}
const heads={};for(const p of [1,2,3,4,5])heads[p]={crank:crank(),angle:0,spin:new Group()};
const cubeGroup=new Group();Object.defineProperty(cubeGroup,'quaternion',{get:()=>({angle:cubeGroup.rotation.x})});
ctx={C,S,MECH,R,P:R.geometry,N,FACE_NAMES:['U','R','F','D','L','B'],SIDE:[2,1,5,4],DF:3,SCRAMBLE_LEN:R.scrambleLength,
  UNIT_LABEL:['F/B','R/L','D','LOCK'],heads,lock:{crank:crank(15)},cubeGroup,cubies:{},THREE:{Group,Vector3:Vector},
  v3:a=>new Vector(...a),mm:x=>x/R.geometry.pitch_mm,LK:R.geometry.link_mm,servoMat:{},alumMat:{},steelMat:{},
  envelope:()=>new Group(),cylX:()=>new Group(),boxAt:()=>new Group(),
  performance:{now:()=>ctx.now},now:0,document:{getElementById:element,querySelector:element},
  paint(){},requestAnimationFrame(){},scene:{add(){}},camera:{},renderer:{render(){}},setView(){},VIEW_ALL:{},VIEW_CUBE:{}};
ctx.UNIT_CRANKS=[[heads[2].crank,heads[5].crank],[heads[1].crank,heads[4].crank],[heads[3].crank],[ctx.lock.crank]];
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('  function makeCrank('),source.indexOf('  const heads =')),ctx);
for(const lock of [false,true]){
  const axis=lock?R.geometry.lock_servo_axis:R.geometry.servo_axis,r=lock?15:12,lug=axis[2]-r-R.geometry.link_mm;
  ctx.args=[new Group(),axis,r,lug,new Group()];const k=vm.runInContext('makeCrank(...args)',ctx);
  for(let deg=0;deg<=180;deg+=15){const t=deg*Math.PI/180;k.set(t);const y=r*Math.sin(t),z=axis[2]-r*Math.cos(t);assert(Math.abs(k.shift-(z-Math.sqrt(R.geometry.link_mm**2-y*y)-lug))<1e-9);}
  assert(Math.abs(k.shift-2*r)<1e-9);
}
vm.runInContext(source.slice(source.indexOf('  const cube = new C.Cube();'),source.indexOf('  // 시작\n')),ctx);
const run=code=>vm.runInContext(code,ctx),mech=run('mech'),cube=run('cube');
assert.equal(mech.loaded,false);assert.deepStrictEqual(Array.from(mech.engaged),[false,false,false,false]);
run('doMoves("R")');assert(element('log').textContent.includes('ERR not loaded'));assert(cube.isSolved());
let frames=0,flipSamples=0,moveSamples=0;
function drain(){let guard=0;while(run('busy()')){
  ctx.now+=10;run('animate(now)');const c=run('current');frames++;
  if(c?.type==='flip'){
    assert(heads[1].crank.theta<1e-8 && heads[4].crank.theta<1e-8);
    for(const p of [2,5,3])assert(Math.abs(heads[p].crank.theta-Math.PI)<1e-8);
    assert(Math.abs(ctx.lock.crank.theta-Math.PI)<1e-8);
    assert(ctx.cubeGroup.rotation.x<=c.from+1e-8);assert(heads[1].spin.rotation.z<=c.r0+1e-8);assert(heads[4].spin.rotation.z>=c.l0-1e-8);
    assert.equal(c.dur,R.flipMicros()/1000/+element('speed').value);
    const t=Math.min(1,(ctx.now-c.start)/c.dur),p=R.flipProgress(t*R.flipMicros()/1000);
    assert(Math.abs(ctx.cubeGroup.rotation.x-(c.from-Math.PI*p))<1e-8);flipSamples++;
  }else if(c?.type==='move'){
    assert(ctx.lock.crank.theta<1e-8);assert(heads[c.p].crank.theta<1e-8);
    if([1,4].includes(c.p)){assert(heads[2].crank.theta>3 && heads[5].crank.theta>3 && heads[3].crank.theta>3);}
    if([2,5].includes(c.p)){assert(heads[1].crank.theta>3 && heads[4].crank.theta>3 && heads[3].crank.theta>3);}
    for(const [i,k]of ['x','y','z'].entries())assert(Math.abs(c.axis[k]-N[c.p][i])<1e-8,'logical turn axis must be physical head normal');
    assert.equal(c.dur,R.turnMicros(c.p*3+c.m%3)/1000/+element('speed').value);const t=Math.min(1,(ctx.now-c.start)/c.dur),p=R.turnProgress(c.p*3+c.m%3,t*R.turnMicros(c.p*3+c.m%3)/1000);
    assert(Math.abs(heads[c.p].spin.rotation.z-(heads[c.p].angle+c.angle*p))<1e-8);moveSamples++;
  }
  assert(++guard<300000,'animation stalled');
}}
run('doLoad()');drain();assert(!mech.loaded && mech.engaged[2]);
run('doLoad()');drain();assert(mech.loaded);
for(const rate of [1,4]){
  element('speed').value=String(rate);
  const seq=Array.from({length:180},(_,i)=>(i*7)%18),expected=cube.clone().apply(seq);
  ctx.seq=seq;run('doMoves(C.seqToString(seq.slice(0,60)))');drain();
  run('doMoves(C.seqToString(seq.slice(60,120)))');drain();run('doMoves(C.seqToString(seq.slice(120)))');drain();assert(cube.equals(expected));
}
// Reject the entire oversized/invalid manual input.
const before=cube.clone();ctx.long='R '.repeat(65);run('doMoves(long)');assert(!run('busy()'));assert(cube.equals(before));
run('doMoves("Rubbish")');assert(!run('busy()'));
// Compare a real solver-driven queue and then a failed second move.
run('doScramble(42)');drain();run('doSolve()');drain();assert(cube.isSolved());
if(mech.orient===1){run('doFlip()');drain();}
assert.equal(mech.orient,0);
run('doLoad()');drain();assert(!mech.loaded);run('doLoad()');drain();assert(mech.loaded);
assert.equal(ctx.cubeGroup.rotation.x,R.initialOrient*Math.PI,'reload white down must restore visual/physical mapping');
run('doMoves("U")');drain();
mech.readSensor=(u,w)=>u!==MECH.RL||!w;
const expected=cube.clone().apply(C.parseMoves('F'));run('doMoves("F R U")');drain();
assert(cube.equals(expected));assert(element('log').textContent.includes('ABORTED completed=1'));
assert(!run('busy()'));assert.equal(element('btnMoves').disabled,false);
assert(element('lcd').textContent.includes('ABORTED'));assert(heads[1].crank.theta>3,'failed engage must recover to retracted');
console.log(`V4 simulator PASS: initial unloaded / LOAD×2 / eject / 360 moves at 1×+4× / solver queue / failure retention; ${frames} frames (${flipSamples} flip, ${moveSamples} turn); signed axes, pulse-derived durations, CAD crank strokes 24/30.`);
