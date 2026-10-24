// Exhaustive completeness checks for fixed-top operation. Generic 6-face scrambles remain test inputs.
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const C=require('../sim/cube'),T=require('../sim/tables'),R=require('../sim/robot_contract'),{Solver}=require('../sim/solver');
const moves=Array.from({length:18},(_,m)=>m).filter(m=>Math.floor(m/3)!==R.fixedLogicalFace);
const step=T.EDGE_TO.map((row,m)=>Array.from({length:24},(_,s)=>2*row[s>>1]+((s+T.EDGE_DO[m][s>>1])&1)));
const pack=e=>((e[0]*24+e[1])*24+e[2])*24+e[3];
const dist=new Uint8Array(24**4).fill(255),queue=new Uint32Array(24**4);
const start=pack([8,10,12,14]);dist[start]=0;queue[0]=start;let head=0,tail=1,maxDepth=0;
while(head<tail){
  const key=queue[head++];let k=key;const e=[0,0,0,0];for(let i=3;i>=0;i--){e[i]=k%24;k=Math.floor(k/24);}
  for(const m of moves){const n=pack(e.map(s=>step[m][s]));if(dist[n]!==255)continue;dist[n]=dist[key]+1;maxDepth=Math.max(maxDepth,dist[n]);queue[tail++]=n;}
}
assert.equal(tail,12*11*10*9*16,'all legal cross states');assert(maxDepth<=14);
const perms=a=>a.length<2?[a]:a.flatMap((v,i)=>perms(a.filter((_,j)=>j!==i)).map(p=>[v,...p]));
const parity=p=>p.reduce((s,a,i)=>s+p.slice(i+1).filter(b=>a>b).length,0)%2;
let ll=0,maxMoves=0,maxStage=0;
const solver=new Solver();
for(const cp of perms([0,1,2,3]))for(const ep of perms([0,1,2,3])){
  if(parity(cp)!==parity(ep))continue;
  for(let a=0;a<27;a++)for(let b=0;b<8;b++){
    const c=new C.Cube();c.cp.splice(0,4,...cp);c.ep.splice(0,4,...ep);
    const o=[Math.floor(a/9),Math.floor(a/3)%3,a%3];c.co.splice(0,4,...o,(6-o.reduce((x,y)=>x+y,0))%3);
    const es=[b>>2,(b>>1)&1,b&1];c.eo.splice(0,4,...es,es.reduce((x,y)=>x+y,0)%2);
    const r=solver.solve(c);assert(c.clone().apply(r.moves).isSolved());assert(r.moves.every(m=>moves.includes(m)));
    maxMoves=Math.max(maxMoves,r.moves.length);maxStage=Math.max(maxStage,...r.stages.map(s=>s.moves.length));ll++;
  }
}
assert.equal(ll,62208);assert(maxStage<=40);
let randomMax=0;
for(let seed=1;seed<=1000;seed++){
  const c=new C.Cube().apply(C.scramble(seed,20));const r=solver.solve(c);
  assert(c.clone().apply(r.moves).isSolved());assert(r.moves.every(m=>moves.includes(m)));assert(r.moves.length<=128);randomMax=Math.max(randomMax,r.moves.length);
}
const report={passed:true,physical_validation:false,cross_states:tail,cross_max_distance:maxDepth,last_layer_states:ll,last_layer_max_moves:maxMoves,last_layer_max_stage:maxStage,generic_scramble_seeds:1000,random_max_moves:randomMax,forbidden_logical_face:'D',flips_required:0};
fs.writeFileSync(path.join(__dirname,'../models/robot_v4/assembly_kit/five_face_checks.json'),JSON.stringify(report,null,2)+'\n');console.log('five-face PASS '+JSON.stringify(report));
