// Compile the actual sketch + mechanism/motors/cube/solver. GPIO and clock only are simulated.
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const C=require('../sim/cube.js'),R=require('../sim/robot_contract.js'),{Mechanism}=require('../sim/mechanism.js');
const root=path.resolve(__dirname,'..'),build=path.join(root,'build');fs.mkdirSync(build,{recursive:true});
const exe=path.join(build,process.platform==='win32'?'host_mechanism.exe':'host_mechanism');
const args=['-O2','-std=c++17','-Itools/host_mechanism','-Itools/host_solver','-Ifirmware/main',
  'tools/host_mechanism/main.cpp',...['mechanism','motors','cube','solver'].map(x=>`firmware/main/${x}.cpp`),'-o',exe];
const cc=spawnSync('g++',args,{cwd:root,stdio:'inherit'});assert.equal(cc.status,0,'host firmware compile');
let mech,cube,faultUnit=-1,faultWant=false;
const commands=[],expected=[];
const facelets=c=>c.toFacelets().map(f=>'URFDLB'[f]).join('');
function state(){return `MECH fb=${+mech.engaged[0]} rl=${+mech.engaged[1]} d=${+mech.engaged[2]} lock=${+mech.engaged[3]} orient=${mech.orient} loaded=${+mech.loaded} flips=${mech.flips} regrips=${mech.regrips}\n`;}
function record(cmd){
  commands.push(cmd);let list=[], extra='',aborted=false;
  if(cmd.startsWith('RESET ')){
    faultUnit=-1;mech=new Mechanism({virtual:cmd.endsWith('virtual'),readSensor:(u,w)=>u!==faultUnit||w!==faultWant});cube=new C.Cube();
  }else if(cmd.startsWith('FAULT ')){const a=cmd.split(' ');faultUnit=+a[1];faultWant=!!+a[2];}
  else if(cmd.startsWith('TIMEOUT '))mech.sensorTimeoutMs=+cmd.slice(8);
  else if(cmd==='LOAD')list=mech.load();
  else if(cmd==='EJECT')list=mech.eject();
  else if(cmd==='FLIP')list=mech.manualFlip();
  else if(cmd.startsWith('MOVE ')){
    let seq;try{seq=C.parseMoves(cmd.slice(5));}catch{seq=[];}
    if(!seq.length||seq.length>R.maxManualMoves)extra='ERR bad moves\n';
    else{
      list=mech.planSeq(seq);const done=list.filter(a=>a.type==='turn');
      for(const a of done)cube.move(a.m);
      if(mech.lastError){aborted=true;extra=`ABORTED completed=${done.length}\n`;}
    }
  }else if(cmd.startsWith('TURN '))list=[{type:'turn',phys:+cmd.slice(5)}];
  else if(cmd==='MOTORFLIP')list=[{type:'flip'}];
  let us=0,pulses=[],servos=[];
  const pulse=(pin,dir)=>pulses.push([pin,dir,us]);
  for(const a of list){
    if(mech.virtual)continue;
    if(a.type==='turn'){
      const f=Math.floor(a.phys/3),k=a.phys%3,n=(k===1?2:1)*R.stepsPerQuarter;
      us+=R.dirSetupUs;
      const ramp=Math.min((R.startUs-R.minUs)/R.accelUs,n/2);
      let gap=R.startUs;
      for(let i=0;i<n;i++){
        pulse(R.stepPins[f],k===2?0:1);us+=R.pulseUs+gap;
        if(i<ramp)gap-=R.accelUs;else if(n-i-1<ramp)gap+=R.accelUs;
      }
      us+=R.settleMs*1000;
    }else if(a.type==='flip'){
      for(let i=0;i<2*R.stepsPerQuarter;i++){
        us+=R.dirSetupUs;pulse(R.stepPins[1],1);us+=R.pulseUs+R.flipPairGapUs;
        us+=R.dirSetupUs;pulse(R.stepPins[4],0);us+=R.pulseUs+R.flipUs;
      }us+=R.settleMs*1000;
    }else if(a.type==='engage'||a.type==='retract'){
      servos.push([R.servoPins[a.unit],a.type==='engage'?R.servoEngagedDeg:R.servoRetractedDeg]);us+=R.servoTravelMs*1000;
    }else if(a.type==='wait')us+=Math.ceil(a.ms/R.sensorPollMs)*R.sensorPollMs*1000;
  }
  if(aborted)us+=400000; // actual execute(): failure buzzer+delay, excluded from pure kinematic estimate
  expected.push({trace:list.filter(a=>a.line).map(a=>a.line+'\n').join('')+extra,state:state(),cube:facelets(cube),us,pulses,servos});
}
record('RESET real');for(let m=0;m<18;m++)record('MOVE '+C.moveName(m));
record('RESET real');record('LOAD');record('LOAD');
for(let seed=1;seed<=20;seed++)record('MOVE '+C.seqToString(C.scramble(seed,R.scrambleLength)));
record('EJECT');record('LOAD');record('LOAD');
record('RESET virtual');record('FAULT 1 1');
for(let seed=1;seed<=20;seed++)record('MOVE '+C.seqToString(C.scramble(seed,R.scrambleLength)));
record('LOAD');record('LOAD');record('EJECT');
// All support states × every unit/direction fault × load/eject/flip/all six face preparations.
const contexts=[[],['LOAD'],['LOAD','LOAD'],...['U','R','F','D','L','B'].map(f=>['LOAD','LOAD','MOVE '+f])];
let scenarios=0;
for(const context of contexts)for(let u=0;u<4;u++)for(const want of [0,1])for(const op of ['LOAD','EJECT','FLIP',...['U','R','F','D','L','B'].map(f=>'MOVE '+f)]){
  record('RESET real');for(const step of context)record(step);
  record(`FAULT ${u} ${want}`);record(op);record('FAULT -1 0');record('LOAD');scenarios++;
}
record('RESET real');record('LOAD');record('LOAD');record('FAULT 1 1');record('MOVE F R U'); // retain completed F
record('RESET real');record('TIMEOUT 0');record('FAULT 2 1');record('LOAD');
record('RESET real');record('TIMEOUT 17');record('FAULT 2 1');record('LOAD');
record('RESET virtual');
for(const seq of ['R\tU2 F3',"R U2'",'Rubbish','R '.repeat(64),'R '.repeat(65),'R UZ',''])record('MOVE '+seq);
record('RESET real');for(let m=3;m<18;m++)record('TURN '+m);record('MOTORFLIP');
const inp=path.join(build,'mechanism_input.txt'),out=path.join(build,'mechanism_output.jsonl');
fs.writeFileSync(inp,commands.join('\n')+'\n');
const fdi=fs.openSync(inp,'r'),fdo=fs.openSync(out,'w');let run;
try{run=spawnSync(exe,[],{stdio:[fdi,fdo,'inherit']});}finally{fs.closeSync(fdi);fs.closeSync(fdo);}
assert(!run.error,run.error?.message);assert.equal(run.status,0,'firmware execution');
const actual=fs.readFileSync(out,'utf8').trim().split('\n').map(JSON.parse);assert.equal(actual.length,expected.length);
for(let i=0;i<actual.length;i++)assert.deepStrictEqual(actual[i],expected[i],`command #${i}: ${commands[i]}`);
// Compare the generated browser edge schedule directly with measured C++ GPIO edges.
for(let i=0;i<commands.length;i++){
  if(commands[i].startsWith('TURN ')){
    const m=+commands[i].slice(5),p=R.turnProfile(m),fw=actual[i];
    assert.equal(fw.us,R.turnMicros(m));assert.deepStrictEqual(fw.pulses.map(x=>x[2]),p.edges);
    for(let j=0;j<p.edges.length;j++){
      assert.equal(R.turnProgress(m,(p.edges[j]+0.1)/1000),(j+1)/p.edges.length);
      assert.equal(R.turnProgress(m,(p.edges[j]-0.1)/1000),j/p.edges.length);
    }
  }else if(commands[i]==='MOTORFLIP'){
    const fw=actual[i];assert.equal(fw.us,R.flipMicros());
    const edges=fw.pulses.filter(x=>x[0]===R.stepPins[4]);
    for(let j=0;j<edges.length;j++)assert.equal(R.flipProgress((edges[j][2]+0.1)/1000),(j+1)/edges.length);
  }
}
// Test the real serial receiver: overflow and invalid sequences must never execute a valid prefix.
const raw=['RESET virtual','RAW M '+ 'R '.repeat(128),'RAW M '+ 'R '.repeat(65),'RAW M '+ 'R '.repeat(64),'RAW M Rubbish','RAW M R\tU2 F3'];
fs.writeFileSync(inp,raw.join('\n')+'\n');
const ri=fs.openSync(inp,'r'),ro=fs.openSync(out,'w');let rr;
try{rr=spawnSync(exe,[],{stdio:[ri,ro,'inherit']});}finally{fs.closeSync(ri);fs.closeSync(ro);}
assert(!rr.error,rr.error?.message);assert.equal(rr.status,0);
const rx=fs.readFileSync(out,'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rx[1].trace,'ERR line too long\n');assert.equal(rx[1].cube,rx[0].cube);
assert.equal(rx[2].trace,'ERR bad moves\n');assert.equal(rx[2].cube,rx[0].cube);
assert(rx[3].trace.includes('MOVED 64'));assert.equal(rx[4].cube,rx[3].cube);assert.equal(rx[4].trace,'ERR bad moves\n');
assert(rx[5].trace.includes('MOVED 3'));
console.log(`host_mechanism_check PASS: ${scenarios} fault scenarios, ${commands.length} command/state/trace/servo/pulse/time comparisons; real serial overflow + 64/65 limit; partial completion retained.`);
