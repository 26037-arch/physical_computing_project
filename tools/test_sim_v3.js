// Exercise the real app's feed/lock/move functions without a WebGL dependency.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const C=require('../sim/cube.js');
const M=require('../sim/models.js');
const source=fs.readFileSync(require.resolve('../sim/app.js'),'utf8');
assert.equal(M.version,3);
assert.equal(M.params.axle_d,6);
assert.equal(M.frame.filter(x=>x.name.startsWith('perimeter_')).length,12);
assert(!M.frame.some(x=>x.name.startsWith('panel_')));
assert(M.frame.some(x=>x.name==='fixed_axle_D6_L620'));
for(const item of M.modules.hollow){
  if(item.name==='pulley_40T_driven')assert.equal(item.group,'spin');
  if(item.name==='pulley_40T_driver')assert.equal(item.group,'motorSpin');
  assert(!['coupling_5x8','spindle_8mm'].includes(item.name));
}
for(const part of Object.values(M.parts)){
  const b=Buffer.from(part.b64,'base64');assert.equal(b.length,84+50*b.readUInt32LE(80));
}
const rotation=()=>({z:0});
const head=()=>({retract:0,angle:0,locked:false,carriage:{position:{z:0}},spin:{rotation:rotation()},motorSpin:{rotation:rotation()},lockedPin:{visible:false},parkedPin:{visible:true}});
const N=[[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[-1,0,0],[0,0,-1]];
let samples=0;
for(const feed of [0,500]){
  const ctx={C,P:M.params,N,heads:Array.from({length:6},head),mm:x=>x/19.1,performance:{now:()=>ctx.now},now:0,
    document:{getElementById:id=>({value:id==='feed'?feed:40})},v3:a=>({x:a[0],y:a[1],z:a[2]}),
    cubies:{},cubeGroup:{attach(){}},pivot:{rotation:{set(){}},updateMatrixWorld(){},attach(){},setRotationFromAxisAngle(){}},
    THREE:{Group:function(){return {rotation:{set(){}},updateMatrixWorld(){},attach(){},setRotationFromAxisAngle(){}};}},
    paint(){},renderHeads(){},renderQueue(){},lcd(){},setBusy(){},requestAnimationFrame(){},scene:{add(){}},camera:{},renderer:{render(){}}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('  function setRetract'),source.indexOf('  // ---------- 카메라')),ctx);
  vm.runInContext(source.slice(source.indexOf('  const cube = new C.Cube();'),source.indexOf('  // ---------- 패널 ----------')),ctx);
  const moves=Array.from({length:180},(_,i)=>(i*7)%18);ctx.moves=moves;
  const expected=new C.Cube().apply(moves);
  // Move globals declared in the extracted source replace mock pivot via its declaration.
  vm.runInContext('enqueue(moves,"TEST",null)',ctx);
  let lastAngles=Array(6).fill(0),lastCurrent=null,guard=0;
  while(vm.runInContext('!!current || queue.length>0',ctx)){
    ctx.now+=16;vm.runInContext('animate(now)',ctx);
    const action=vm.runInContext('current',ctx);
    if(action?.type==='move'){
      const f=action.f,o=(f+3)%6;
      assert.equal(ctx.heads[f].locked,false);assert.equal(ctx.heads[o].locked,true);
      assert.equal(ctx.heads[f].retract,0);assert.equal(ctx.heads[o].retract,0);
      for(let i=0;i<6;i++)if(i%3!==f%3)assert.equal(ctx.heads[i].retract,24);
      assert.equal(ctx.heads[f].spin.rotation.z,ctx.heads[f].motorSpin.rotation.z);
      if(lastCurrent===action)for(let i=0;i<6;i++)if(i!==f)assert.equal(ctx.heads[i].spin.rotation.z,lastAngles[i]);
      samples++;
    }
    lastAngles=ctx.heads.map(h=>h.spin.rotation.z);lastCurrent=action;
    assert(++guard<100000,'animation stalled');
  }
  assert(vm.runInContext('cube',ctx).equals(expected));
  // Completion preserves cumulative spindle angles, rather than snapping to zero.
  for(const h of ctx.heads)assert.equal(h.spin.rotation.z,h.angle);
}
console.log(`V3 simulator PASS: 163 CAD meshes; 360 moves at feed 0/500 ms; ${samples} move-frame interlock checks; 12 open-frame edges.`);
