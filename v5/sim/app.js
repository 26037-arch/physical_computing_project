// V5 Rev B: tools/robot_v5_params.py:P dimensions, CubeMechanism action protocol.
// Units are mm. Holder origin: cube bottom centre; +y audience, +z up.
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id), errors = [];
  function showError(error) {
    const message = error.message || String(error); errors.push(message);
    $('error').hidden = false; $('error').textContent = message;
  }
  window.addEventListener('error', e => { const m = String((e.error && e.error.message) || e.message || ''); if (/ResizeObserver loop/.test(m)) return; showError(e.error || e.message); });   // ResizeObserver 루프 경고는 무해한 브라우저 알림
  window.addEventListener('unhandledrejection', e => showError(e.reason));
  try {
    if (!window.THREE) throw new Error('Three.js CDN을 불러오지 못했습니다. 네트워크 연결 후 새로고침하세요.');
    const C=CubeLib, S=CubeSolver, M=CubeMechanism, FACE='URFDLB';
    const deg=n=>n*Math.PI/180, clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
    const mix=(a,b,t)=>a+(b-a)*t, ease=t=>{t=clamp(t);return t*t*(3-2*t);};
    const vec=a=>new THREE.Vector3(...a), X=vec([1,0,0]), Z=vec([0,0,1]);
    const defaults={
      cube_mm:57,layer_mm:19,tilt_deg:20,post_clearance_mm:1,post_h_mm:15,post_t_mm:5,
      post_arm_mm:17,post_chamfer_mm:4,post_flip_relief_deg:65.1,post_flip_pivot_y_mm:-28.3,post_flip_margin_mm:.2,
      plate_mm:70,plate_t_mm:4,plate_corner_r_mm:1.5,notch_w_mm:20,notch_y_mm:23,
      hub_d_mm:16,hub_h_mm:14,hub_flange_d_mm:30,hub_flange_t_mm:3,
      motor_mm:42.3,motor_box_outer_mm:50,motor_face_z_mm:-25,motor_len_mm:40,motor_plate_t_mm:5,table_zw_mm:-78,
      hood_clearance_mm:1.5,hood_wall_mm:3,hood_bottom_z_mm:21,hood_roof_clear_mm:1.5,
      hood_roof_t_mm:3,hood_back_wall:false,hinge_y_mm:-90,hinge_z_mm:40,hinge_hub_d_mm:20,arm_t_mm:6,
      hood_open_deg:60,hood_flip_deg:90,hood_load_deg:120,lift_contact_y_mm:-27,
      lift_bottom_z_mm:-6.5,lift_stroke_mm:66,lift_dir_deg:26,shelf_len_mm:3.5,
      shelf_t_mm:2.5,lip_h_mm:1.5,lip_t_mm:3,hook_w_mm:16,cube_edge_r_mm:1.5,
      slider_bar_dy_mm:-14,slider_bar_dz_mm:-5,slider_bar_mm:4,slider_bar_half_x_mm:38.5,
      crank_r_mm:33,link_mm:70,sg90_mount_outer_x_mm:-61.5,sg90_mount_bottom_offset_mm:50,cube_mass_kg:.10,
      hood_mass_kg:.05,mu_floor:.35,mu_ledge:.8,g:9.81
    };
    // crank/link also exist in V4; require the V5 parameter signature.
    const embedded=window.CubeModels||{params:{},parts:{}};
    const forcePrimitives=new URLSearchParams(location.search).get('geometry')==='primitive';
    const models=!forcePrimitives&&Number.isFinite(embedded.params?.hinge_y_mm)?embedded:{params:{},parts:{}};
    let checks=null;
    if(!forcePrimitives)try {const r=await fetch('../../models/robot_v5/kinematic_checks.json');if(r.ok)checks=await r.json();}catch(_){/* analytic fallback */}
    const P=Object.assign({},defaults,checks?.parameters,models.params), H=P.cube_mm/2, pitch=P.layer_mm;
    const q0=[P.lift_contact_y_mm-P.lift_bottom_z_mm*Math.tan(deg(P.lift_dir_deg)),P.lift_bottom_z_mm];
    const liftDir=[-Math.sin(deg(P.lift_dir_deg)),Math.cos(deg(P.lift_dir_deg))];
    const hinge=[0,P.hinge_y_mm,P.hinge_z_mm],hoodAngles=[0,P.hood_open_deg,P.hood_load_deg];
    const roofZ=P.cube_mm+P.hood_roof_clear_mm,hoodIn=H+P.hood_clearance_mm,hoodOut=hoodIn+P.hood_wall_mm;
    const postIn=H+P.post_clearance_mm,postOut=postIn+P.post_t_mm;
    const crankRadius=P.crank_r_mm,linkLength=P.link_centres_mm??P.link_mm;
    // Use the CAD axis when provided; otherwise derive the inline dead-centre
    // axis from P (the rounded documentation coordinate cannot close a 70 mm link).
    const crankAxis=P.servo_axes?.lift||[P.sg90_mount_outer_x_mm,
      q0[0]+P.slider_bar_dy_mm+(P.lift_stroke_mm+linkLength-crankRadius)*liftDir[0],
      q0[1]+P.slider_bar_dz_mm+(P.lift_stroke_mm+linkLength-crankRadius)*liftDir[1]];
    const crankPlane=P.lever_planes_x_mm?.crank||[-55,-51],linkPlane=P.lever_planes_x_mm?.link||[-50,-46];
    const crankX=(crankPlane[0]+crankPlane[1])/2,linkX=(linkPlane[0]+linkPlane[1])/2;
    const cube=new C.Cube(),mech=new M.Mechanism();
    // Planner state is the future state; displayed state advances only on completion.
    const displayed={hood:M.OPEN,loaded:false,ori:M.ORI_START.slice(),flips:0,spins:0,hoods:0};
    const visual={hood:P.hood_open_deg,lifter:0,cup:0,theta:0,yf:H};
    const canvas=$('view'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputEncoding=THREE.sRGBEncoding;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x142028);scene.fog=new THREE.Fog(0x142028,900,1800);
    const camera=new THREE.PerspectiveCamera(35,1,1,2500);camera.up.set(0,0,1);
    scene.add(new THREE.HemisphereLight(0xf0fff9,0x455763,1.05));
    for(const [p,power] of [[[120,-220,340],1.25],[[-220,60,150],.65],[[40,240,200],.55]]){
      const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(...p);scene.add(light);
    }
    // World audience is -y: yaw 180°, then world x tilt -20°. This gives the
    // checker's z_world=z*cos(20°)+y*sin(20°), so the rear is lower.
    const tilt=new THREE.Group();tilt.rotation.x=-deg(P.tilt_deg);scene.add(tilt);
    const robot=new THREE.Group();robot.rotation.z=Math.PI;tilt.add(robot);
    const cup=new THREE.Group(),hood=new THREE.Group(),lifter=new THREE.Group();
    const base=new THREE.Group(),towers=new THREE.Group(),hardware=new THREE.Group();
    robot.add(cup,hood,lifter,base,towers,hardware);hood.position.set(...hinge);
    const mat=(color,metalness=.05)=>new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:.55,metalness});
    const cupMat=mat(0x65c9ae),hoodMat=mat(0x729dc5),liftMat=mat(0xeab467),baseMat=mat(0x3d535d);
    const towerMat=mat(0x4a626c),metal=mat(0xb0c3cb,.75),dark=mat(0x202b33),servoMat=mat(0x253b52),smallServoMat=mat(0x3b6691);
    const assetModes={};
    function mesh(parent,geometry,material,position=[0,0,0]){const o=new THREE.Mesh(geometry,material);o.position.set(...position);parent.add(o);return o;}
    function box(parent,size,center,material){return mesh(parent,new THREE.BoxGeometry(...size),material,center);}
    function cylinder(parent,r,length,center,direction,material){const o=mesh(parent,new THREE.CylinderGeometry(r,r,length,32),material,center);o.quaternion.setFromUnitVectors(vec([0,1,0]),vec(direction));return o;}
    function yzGeometry(points,x0,thickness,holes=[]){
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
      for(const h of holes)shape.holes.push(new THREE.Path(h.map(p=>new THREE.Vector2(...p))));
      const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
      g.applyMatrix4(new THREE.Matrix4().makeBasis(vec([0,1,0]),vec([0,0,1]),vec([1,0,0])));g.translate(x0,0,0);return g;
    }
    function stlGeometry(b64,offset){
      const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));if(bytes.length<84)throw Error('STL header');
      const dv=new DataView(bytes.buffer),n=dv.getUint32(80,true);if(84+n*50>bytes.length)throw Error('STL length');
      const positions=new Float32Array(n*9);
      for(let t=0;t<n;t++)for(let v=0;v<3;v++)for(let k=0;k<3;k++)positions[t*9+v*3+k]=dv.getFloat32(84+t*50+12+v*12+k*4,true)+offset[k];
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();return g;
    }
    function part(name,parent,material,fallback,origin=[0,0,0]){
      const data=models.parts?.[name],offset=P.print_offsets?.[name];
      if(data?.b64&&Array.isArray(offset)&&offset.length===3){try{const g=stlGeometry(data.b64,offset);g.translate(...origin.map(v=>-v));mesh(parent,g,material);assetModes[name]='STL';return;}catch(_){/* per-part fallback */}}
      fallback();assetModes[name]='primitive';
    }
    function buildHolder(){
      const p=P.plate_mm/2,n=P.notch_w_mm/2,e=P.notch_y_mm,t=P.plate_t_mm;
      box(cup,[2*e,2*e,t],[0,0,-t/2],cupMat);
      for(const sx of [-1,1])for(const sy of [-1,1]){
        box(cup,[p-n,p-e,t],[sx*(n+p)/2,sy*(e+p)/2,-t/2],cupMat);
        box(cup,[p-e,e-n,t],[sx*(e+p)/2,sy*(n+e)/2,-t/2],cupMat);
      }
      // Two L arms per post; a 4 mm inner bevel leaves a 1 mm top land.
      function relief(poly){
        const slope=1/Math.tan(deg(P.post_flip_relief_deg)),start=-P.post_flip_pivot_y_mm+P.post_flip_margin_mm;
        const out=[],f=p=>p[0]-start-slope*p[1];
        for(let i=0;i<poly.length;i++){
          const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);
          if(fa>=0)out.push(a);
          if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);out.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);}
        }return out;
      }
      for(const sx of [-1,1])for(const sy of [-1,1]){
        const a=postOut-P.post_arm_mm,h=P.post_h_mm,ch=P.post_chamfer_mm;
        const poly=[[postIn,0],[postOut,0],[postOut,h],[postIn+ch,h],[postIn,h-ch]];
        for(const [lo,hi,profile] of [[a,H+.1,relief(poly)],[H+.1,postOut,poly]]){
          mesh(cup,yzGeometry(profile.map(([y,z])=>[sy*y,z]),sx>0?lo:-hi,hi-lo),cupMat);
          const arm=mesh(cup,yzGeometry(profile.map(([y,z])=>[-sx*y,z]),sy>0?lo:-hi,hi-lo),cupMat);arm.rotation.z=Math.PI/2;
        }
      }
    }
    part('cube_holder',cup,cupMat,buildHolder);
    // Separate hub shares the cup's rotation; it is not part of cube_holder.
    part('hub',cup,cupMat,()=>{
      cylinder(cup,P.hub_d_mm/2,P.hub_h_mm,[0,0,-P.plate_t_mm-P.hub_h_mm/2],[0,0,1],cupMat);
      cylinder(cup,P.hub_flange_d_mm/2,P.hub_flange_t_mm,[0,0,-P.plate_t_mm-P.hub_flange_t_mm/2],[0,0,1],cupMat);
    });
    part('hood',hood,hoodMat,()=>{
      const g=new THREE.Group();g.position.set(0,-hinge[1],-hinge[2]);hood.add(g);
      const z=(P.hood_bottom_z_mm+roofZ)/2,height=roofZ-P.hood_bottom_z_mm;
      // Rev B: front (+y) wall and two side walls only. Rear roof rim remains.
      box(g,[2*hoodOut,P.hood_wall_mm,height],[0,hoodIn+P.hood_wall_mm/2,z],hoodMat);
      for(const sign of [-1,1]){
        box(g,[P.hood_wall_mm,hoodOut+hoodIn,height],[sign*(hoodIn+P.hood_wall_mm/2),-P.hood_wall_mm/2,z],hoodMat);
        box(g,[2*hoodOut,11,P.hood_roof_t_mm],[0,sign*(hoodOut-5.5),roofZ+P.hood_roof_t_mm/2],hoodMat);
        box(g,[11,44,P.hood_roof_t_mm],[sign*(hoodOut-5.5),0,roofZ+P.hood_roof_t_mm/2],hoodMat);
        const points=[[hinge[1],hinge[2]-10],[-hoodOut,P.hood_bottom_z_mm],[-hoodOut,roofZ+P.hood_roof_t_mm],[hinge[1]-10,roofZ+P.hood_roof_t_mm],[hinge[1]-10,hinge[2]]];
        mesh(g,yzGeometry(points,sign>0?hoodOut:-hoodOut-P.arm_t_mm,P.arm_t_mm),hoodMat);
        cylinder(g,P.hinge_hub_d_mm/2,P.arm_t_mm,[sign*(hoodOut+P.arm_t_mm/2),hinge[1],hinge[2]],[1,0,0],hoodMat);
      }
    },hinge);
    const slot0=[q0[0]+P.slider_bar_dy_mm,q0[1]+P.slider_bar_dz_mm];
    const slot1=[slot0[0]+liftDir[0]*P.lift_stroke_mm,slot0[1]+liftDir[1]*P.lift_stroke_mm];
    part('lifter',lifter,liftMat,()=>{
      const [y,z]=q0,[by,bz]=slot0;
      mesh(lifter,yzGeometry([[y-P.shelf_len_mm,z-P.shelf_t_mm],[y,z-P.shelf_t_mm],[y,z-1],[y-1,z],[y-P.shelf_len_mm,z]],-P.hook_w_mm/2,P.hook_w_mm),liftMat);
      box(lifter,[P.hook_w_mm,P.lip_t_mm,P.shelf_t_mm+P.lip_h_mm],[0,y-P.shelf_len_mm-P.lip_t_mm/2,z+(P.lip_h_mm-P.shelf_t_mm)/2],liftMat);
      mesh(lifter,yzGeometry([[by-2,bz-2],[y-P.shelf_len_mm,z-P.shelf_t_mm],[y-P.shelf_len_mm,z+P.lip_h_mm],[by-2,bz+2]],-P.hook_w_mm/2,P.hook_w_mm),liftMat);
      box(lifter,[2*P.slider_bar_half_x_mm,P.slider_bar_mm,P.slider_bar_mm],[0,by,bz],liftMat);
      box(lifter,[P.hook_w_mm,P.shelf_len_mm-1,.5],[0,y-(P.shelf_len_mm+1)/2,z+.25],dark);
    });
    const tableZ=y=>(P.table_zw_mm-y*Math.sin(deg(P.tilt_deg)))/Math.cos(deg(P.tilt_deg));
    part('base',base,baseMat,()=>{
      const outer=P.motor_box_outer_mm/2,inner=outer-3,face=P.motor_face_z_mm;
      const top=new THREE.Shape([[-outer,-outer],[outer,-outer],[outer,outer],[-outer,outer]].map(p=>new THREE.Vector2(...p)));
      const hole=new THREE.Path();hole.absarc(0,0,11.5,0,Math.PI*2,true);top.holes.push(hole);
      const plate=new THREE.ExtrudeGeometry(top,{depth:P.motor_plate_t_mm,bevelEnabled:false,curveSegments:32});plate.translate(0,0,face);mesh(base,plate,baseMat);
      for(const sign of [-1,1]){
        mesh(base,yzGeometry([[-outer,tableZ(-outer)],[outer,tableZ(outer)],[outer,face],[-outer,face]],sign>0?inner:-outer,3),baseMat);
        const y0=sign>0?inner:-outer,y1=y0+3;
        mesh(base,yzGeometry([[y0,tableZ(y0)],[y1,tableZ(y1)],[y1,face],[y0,face]],-inner,2*inner),baseMat);
      }
      const deckH=4/Math.cos(deg(P.tilt_deg));
      mesh(base,yzGeometry([[-105,tableZ(-105)],[-22,tableZ(-22)],[-22,tableZ(-22)+deckH],[-105,tableZ(-105)+deckH]],-56,112),baseMat);
    });
    if(assetModes.base==='STL'){
      // CAD base includes both towers: separate outer triangles for visibility controls.
      const source=base.children[0],p=source.geometry.attributes.position.array,outer=[],rest=[];
      for(let i=0;i<p.length;i+=9){const xs=[p[i],p[i+3],p[i+6]];((xs.every(x=>x>=39.49)||xs.every(x=>x<=-39.49))?outer:rest).push(...p.slice(i,i+9));}
      for(const [parent,data] of [[base,rest],[towers,outer]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));g.computeVertexNormals();mesh(parent,g,baseMat);}
      base.remove(source);source.geometry.dispose();
    }else{
      const n=[liftDir[1]*1.7,-liftDir[0]*1.7];
      const hole=[[slot0[0]+n[0],slot0[1]+n[1]],[slot1[0]+n[0],slot1[1]+n[1]],[slot1[0]-n[0],slot1[1]-n[1]],[slot0[0]-n[0],slot0[1]-n[1]]];
      for(const s of [-1,1]){
        const height=s<0?95:65;
        mesh(towers,yzGeometry([[-105,tableZ(-105)+4],[-35,tableZ(-35)+4],[-35,height],[-105,height]],s>0?39.5:-45.5,6,[hole]),towerMat);
      }
      // SG90 pocket outside the left tower; lower gusset reaches the tower.
      const sy=crankAxis[1],sz=crankAxis[2],mount=P.sg90_mount_outer_x_mm;
      mesh(towers,yzGeometry([[sy-17,sz-50],[sy+17,sz-50],[sy+17,sz+10],[sy-17,sz+10]],mount-3,3,
        [[[sy-11.25,sz-6.1],[sy+11.25,sz-6.1],[sy+11.25,sz+6.1],[sy-11.25,sz+6.1]]]),towerMat);
      const gusset=new THREE.Shape([new THREE.Vector2(-45.5,sz-50),new THREE.Vector2(mount,sz-50),new THREE.Vector2(-45.5,sz-50-(Math.abs(mount)-45.5))]);
      const g=new THREE.ExtrudeGeometry(gusset,{depth:34,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,sy+17,0);mesh(towers,g,towerMat);
      box(towers,[6,3,25],[42.5,-106.5,40.5],towerMat);
    }
    for(const s of [-1,1])cylinder(hardware,2,14,[s*43,hinge[1],hinge[2]],[1,0,0],metal);
    const purchased=P.purchased||{
      nema17:{size:[P.motor_mm,P.motor_mm,P.motor_len_mm+22],center:[0,0,P.motor_face_z_mm+(22-P.motor_len_mm)/2]},
      mg996r:{size:[44,40.5,20.5],center:[58.5,P.hinge_y_mm+10,P.hinge_z_mm]},
      sg90:{size:[28.7,22.5,12.2],center:[P.sg90_mount_outer_x_mm-8.35,crankAxis[1],crankAxis[2]]}
    };
    for(const [name,p] of Object.entries(purchased))if(Array.isArray(p.size)&&Array.isArray(p.center)){
      // NEMA envelope includes its shaft: draw body and shaft separately so
      // the 42.3 mm body stops at the underside of the motor top plate.
      if(/nema17/i.test(name))box(hardware,[P.motor_mm,P.motor_mm,P.motor_len_mm],[0,0,P.motor_face_z_mm-P.motor_len_mm/2],metal);
      else box(hardware,p.size,p.center,/SG90|MG90/i.test(name)?smallServoMat:servoMat);
    }
    cylinder(hardware,2.5,22,[0,0,P.motor_face_z_mm+11],[0,0,1],metal);cylinder(hardware,10.5,6,[39.5,hinge[1],hinge[2]],[1,0,0],dark);
    const crank=new THREE.Group(),link=new THREE.Group();robot.add(crank,link);
    part('crank',crank,liftMat,()=>{box(crank,[crankPlane[1]-crankPlane[0],crankRadius,8],[0,crankRadius/2,0],liftMat);for(const y of [0,crankRadius])cylinder(crank,4,4,[0,y,0],[1,0,0],liftMat);},[crankX,crankAxis[1],crankAxis[2]]);
    part('link',link,metal,()=>box(link,[3,linkLength,5],[0,linkLength/2,0],metal),[linkX,...slot0]);
    let restCrank=null,restLink=null;
    const pin=cylinder(robot,1.5,10,[0,0,0],[1,0,0],metal);
    for(const sign of [-1,1])cylinder(lifter,1.5,20,[sign*(P.slider_bar_half_x_mm+8),...slot0],[1,0,0],metal);
    function setLifter(s){
      visual.lifter=s;lifter.position.set(0,liftDir[0]*s,liftDir[1]*s);
      const by=slot0[0]+liftDir[0]*s,bz=slot0[1]+liftDir[1]*s,dy=by-crankAxis[1],dz=bz-crankAxis[2],d=Math.hypot(dy,dz);
      // Upper-axis branch: pin sweeps toward +N=(cos26,sin26), matching CAD.
      // s=L+r-r*cos(theta)-sqrt(L²-r²*sin²(theta)); theta=90 gives 41.266703.
      const alpha=Math.atan2(dz,dy)+Math.acos(clamp((d*d+crankRadius*crankRadius-linkLength*linkLength)/(2*d*crankRadius),-1,1));
      const ey=crankAxis[1]+crankRadius*Math.cos(alpha),ez=crankAxis[2]+crankRadius*Math.sin(alpha),beta=Math.atan2(ez-bz,ey-by);
      visual.linkageError=Math.abs(Math.hypot(by-ey,bz-ez)-linkLength);
      visual.crankAngle=alpha;visual.servoAngle=(alpha-Math.atan2(-liftDir[1],-liftDir[0]))*180/Math.PI;visual.linkAngle=beta;
      if(restCrank===null){restCrank=alpha;restLink=beta;}
      crank.position.set(crankX,crankAxis[1],crankAxis[2]);crank.rotation.x=alpha-(assetModes.crank==='STL'?restCrank:0);
      link.position.set(linkX,by,bz);link.rotation.x=beta-(assetModes.link==='STL'?restLink:0);pin.position.set((crankX+linkX)/2,ey,ez);
    }
    function setHood(angle){visual.hood=angle;hood.rotation.x=deg(angle);}

    // Standard cube: 26 rounded cubies and 54 stickers. R is audience-right
    // (holder -x); this basis matches D CCW, y CW and x' F->D exactly.
    const N=[[0,0,1],[-1,0,0],[0,1,0],[0,0,-1],[1,0,0],[0,-1,0]];
    const RIGHT=[[-1,0,0],[0,-1,0],[-1,0,0],[-1,0,0],[0,1,0],[1,0,0]];
    const DOWN=[[0,1,0],[0,0,-1],[0,0,-1],[0,-1,0],[0,0,-1],[0,0,-1]];
    const colors=[0xf6f4e9,0xde413f,0x35b76f,0xffd742,0xff893e,0x3483d7];
    const cubePose=new THREE.Group(),orientation=new THREE.Group(),layer=new THREE.Group();
    robot.add(cubePose);cubePose.add(orientation,layer);cubePose.position.z=H;
    const cubies=[],byPosition={},stickers=[];
    function roundedBox(size,r){
      const h=(size-2*r)/2,s=new THREE.Shape();s.moveTo(-h+r,-h);s.lineTo(h-r,-h);s.quadraticCurveTo(h,-h,h,-h+r);s.lineTo(h,h-r);s.quadraticCurveTo(h,h,h-r,h);s.lineTo(-h+r,h);s.quadraticCurveTo(-h,h,-h,h-r);s.lineTo(-h,-h+r);s.quadraticCurveTo(-h,-h,-h+r,-h);
      const g=new THREE.ExtrudeGeometry(s,{depth:size-2*r,steps:1,bevelEnabled:true,bevelSegments:3,bevelSize:r,bevelThickness:r,curveSegments:4});
      // Shrink XY profile before bevel: resulting outer dimensions remain size.
      return g;
    }
    const bodyGeo=roundedBox(pitch,P.cube_edge_r_mm);
    bodyGeo.translate(0,0,-(pitch-2*P.cube_edge_r_mm)/2);
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      if(!x&&!y&&!z)continue;const g=new THREE.Group();g.position.set(x*pitch,y*pitch,z*pitch);g.userData.home=g.position.clone();g.userData.coord=[x,y,z];orientation.add(g);mesh(g,bodyGeo,dark);cubies.push(g);byPosition[[x,y,z].join(',')]=g;
    }
    // Rounded sticker planes sit on the commercial cube's unmodified faces.
    const stickerShape=new THREE.Shape(),a=7.8,r=1.1;
    stickerShape.moveTo(-a+r,-a);stickerShape.lineTo(a-r,-a);stickerShape.quadraticCurveTo(a,-a,a,-a+r);stickerShape.lineTo(a,a-r);stickerShape.quadraticCurveTo(a,a,a-r,a);stickerShape.lineTo(-a+r,a);stickerShape.quadraticCurveTo(-a,a,-a,a-r);stickerShape.lineTo(-a,-a+r);stickerShape.quadraticCurveTo(-a,-a,-a+r,-a);
    const stickerGeo=new THREE.ShapeGeometry(stickerShape,5);
    for(let f=0;f<6;f++)for(let k=0;k<9;k++){
      const p=vec(N[f]).addScaledVector(vec(RIGHT[f]),k%3-1).addScaledVector(vec(DOWN[f]),Math.floor(k/3)-1);
      const g=byPosition[p.toArray().join(',')],sticker=mesh(g,stickerGeo,mat(colors[f]));
      sticker.position.copy(vec(N[f]).multiplyScalar(pitch/2+.025));sticker.quaternion.setFromUnitVectors(Z,vec(N[f]));
      stickers.push({mesh:sticker,owner:g,normal:vec(N[f]),index:f*9+k});
    }
    function paint(){const fc=cube.toFacelets();for(const s of stickers)s.mesh.material.color.setHex(colors[fc[s.index]]).convertSRGBToLinear();}
    function homeCubies(){for(const g of cubies){orientation.add(g);g.position.copy(g.userData.home);g.quaternion.identity();}layer.rotation.set(0,0,0);}
    function startOrientation(){orientation.quaternion.setFromAxisAngle(vec([0,1,0]),Math.PI);}
    // y2 about holder +y is z2 in cube notation: U<->D, R<->L, F unchanged.
    startOrientation();paint();cubePose.visible=false;setHood(P.hood_open_deg);setLifter(0);
    const table=mesh(scene,new THREE.PlaneGeometry(1600,1600),mat(0x1b2a31),[0,0,P.table_zw_mm-.5]);
    const grid=new THREE.GridHelper(900,30,0x35515c,0x243a44);grid.rotation.x=Math.PI/2;grid.position.z=P.table_zw_mm-.2;scene.add(grid);
    // Four feet at the world-horizontal base bottom.
    for(const [x,y] of [[-20,18],[20,18],[-43,-87],[43,-87]])cylinder(base,5,1,[x,y+Math.sin(deg(P.tilt_deg))*.5,tableZ(y)+Math.cos(deg(P.tilt_deg))*.5],[0,Math.sin(deg(P.tilt_deg)),Math.cos(deg(P.tilt_deg))],dark);

    // Kinematic trace interpolation; analytic fallback follows the same checker equations.
    const trace=[{s:0,theta_deg:0,yf:H},...(checks?.flip_trace||[])];
    const tip=checks?.checks?.D_flip_topples_forward;
    const flipStroke=tip?.s||63.3,flipTheta=tip?.theta_deg||65.1,flipY=tip?.yf??-28.3;
    if(trace.length===1){for(let s=7.3;s<flipStroke;s+=1){const qy=q0[0]+liftDir[0]*s,qz=q0[1]+liftDir[1]*s;let th=Math.asin(clamp(qz/P.cube_mm));const ebz=qz+P.cube_edge_r_mm*Math.sin(th);th=Math.asin(clamp(ebz/P.cube_mm));trace.push({s,theta_deg:th*180/Math.PI,yf:Math.min(H,qy-P.cube_edge_r_mm*Math.cos(Math.asin(clamp(qz/P.cube_mm)))+P.cube_mm*Math.cos(th))});}}
    trace.push({s:flipStroke,theta_deg:flipTheta,yf:flipY});trace.sort((a,b)=>a.s-b.s);
    function traceAt(s){
      if(s<=-q0[1]/liftDir[1])return{theta:0,yf:H};
      let i=1;while(i<trace.length-1&&trace[i].s<s)i++;
      const a=trace[i-1],b=trace[i],t=clamp((s-a.s)/(b.s-a.s||1));return{theta:mix(a.theta_deg,b.theta_deg,t),yf:mix(a.yf,b.yf,t)};
    }

    let current=null,actions=[],actionIndex=0,completion=null,paused=false,verifying=false;
    let moves=[],moveIndex=0,estimate=0,elapsed=0,lastTick=0,label='IDLE',freezeFlip=false;
    const history=[],coverage={hood:0,turn:0,spin:0,flip:0,msg:0,loaded:0,ejected:0};
    function log(s){const el=$('log');el.textContent+=s+'\n';if(el.textContent.length>65000)el.textContent=el.textContent.slice(-50000);el.scrollTop=el.scrollHeight;}
    function lcd(a,b=''){/* Preserve the exact longer V5 load instruction from §3.4. */$('lcd').textContent=a+'\n'+b;}
    function busy(){return!!current||actionIndex<actions.length||verifying;}
    function renderQueue(){ $('queue').innerHTML=moves.map((m,i)=>`<span class="${i<moveIndex?'done':i===moveIndex?'cur':''}">${C.moveName(m)}</span>`).join(' '); }
    function renderState(){
      $('stHood').textContent=`${M.HOOD_NAME[displayed.hood]} ${Math.round(visual.hood)}°`;
      $('stLifter').textContent=visual.lifter.toFixed(1);$('stEstimate').textContent=(estimate/1000).toFixed(1)+' s';
      $('stCrank').textContent=visual.servoAngle.toFixed(1)+'°';
      for(const k of ['flips','spins','hoods'])$('st'+k[0].toUpperCase()+k.slice(1)).textContent=displayed[k];
      $('orientation').innerHTML=displayed.ori.map((f,p)=>`<div class="face"><small>${FACE[p]}</small><b>${FACE[f]}</b></div>`).join('');
      $('machineStatus').textContent=verifying?'VERIFYING':busy()?(paused?'PAUSED':label):displayed.loaded?'CUBE LOADED':'AWAITING CUBE';
      $('actionLabel').textContent=current?current.a.line:'IDLE';
      $('progress').max=Math.max(estimate,1);$('progress').value=Math.min(elapsed,estimate);
      $('btnLoad').textContent=displayed.loaded?'LOAD · EJECT':displayed.hood===M.LOAD?'LOAD · 장착 완료':'LOAD · 투입 준비';
      for(const id of ['btnLoad','btnReset','btnVerify'])$(id).disabled=busy();
      for(const id of ['btnScramble','btnSolve','btnMoves','btnFlip','btnSpin','captureFlip'])$(id).disabled=busy()||!displayed.loaded;
      $('btnPause').disabled=!busy()||verifying;$('btnPause').textContent=paused?'계속':'일시정지';
    }
    function orientationFromAction(a){
      if(a.type==='spin')for(let k=0;k<a.k;k++){const o=displayed.ori,[u,r,f,d,l,b]=o;o.splice(0,6,u,b,r,d,f,l);}
      if(a.type==='flip'){const [u,r,f,d,l,b]=displayed.ori;displayed.ori=[b,r,u,f,l,d];}
    }
    function beginAction(a,quiet=false){
      if(!(a.type in coverage))throw Error('Unknown mechanism action: '+a.type);
      const state={a,ms:0,duration:M.Mechanism.durationMs(a),q:orientation.quaternion.clone(),cup:visual.cup,hood:visual.hood,selected:[]};
      current=state;if(!quiet)log(a.line);history.push(a.line);if(history.length>3000)history.shift();coverage[a.type]++;
      if(a.type==='turn'){
        if(displayed.hood!==M.CLOSE)throw Error('TURN requires CLOSE');
        if(displayed.ori[3]!==Math.floor(a.m/3))throw Error('Logical turn is not at D');
        robot.updateMatrixWorld(true);
        for(const g of cubies)if(g.userData.home.clone().applyQuaternion(orientation.quaternion).z<-pitch/2){layer.attach(g);state.selected.push(g);}
        if(state.selected.length!==9)throw Error('Bottom layer must contain 9 cubies');
      }
      return state;
    }
    function poseFlip(c,theta,yf){
      visual.theta=theta;visual.yf=yf;const t=deg(theta);
      cubePose.position.set(0,yf+H*(-Math.cos(t)+Math.sin(t)),H*(Math.sin(t)+Math.cos(t)));
      orientation.quaternion.copy(c.q).premultiply(new THREE.Quaternion().setFromAxisAngle(X,-t));
    }
    function sampleAction(c,t){
      const a=c.a,e=ease(t);t=clamp(t);
      if(a.type==='hood')setHood(mix(c.hood,hoodAngles[a.pos],e));
      if(a.type==='spin'){
        const angle=(a.k===3?1:-a.k)*Math.PI/2*e;visual.cup=c.cup+angle;cup.rotation.z=visual.cup;
        orientation.quaternion.copy(c.q).premultiply(new THREE.Quaternion().setFromAxisAngle(Z,angle));
      }
      if(a.type==='turn'){
        const target=(a.k===0?1:a.k===1?2:-1)*Math.PI/2,over=Math.sign(target)*deg(7.2);
        const angle=t<.82?(target+over)*ease(t/.82):mix(target+over,target,ease((t-.82)/.18));
        layer.rotation.z=angle;visual.cup=c.cup+angle;cup.rotation.z=visual.cup;
      }
      if(a.type==='flip'){
        const ms=t*2300;
        // Reference phase proportions: 275 hood + 900 lift + 250 topple +
        // 600 return + 275 hood. Normalize to durationMs so revised firmware
        // timings still complete every phase and always retract the lifter.
        if(ms<275){setHood(mix(P.hood_open_deg,P.hood_flip_deg,ease(ms/275)));setLifter(0);poseFlip(c,0,H);}
        else if(ms<1175){setHood(P.hood_flip_deg);const s=flipStroke*ease((ms-275)/900),p=traceAt(s);setLifter(s);poseFlip(c,p.theta,p.yf);}
        else if(ms<1425){setHood(P.hood_flip_deg);setLifter(flipStroke);const t=(ms-1175)/250;poseFlip(c,mix(flipTheta,90,t*t),flipY);}
        else{poseFlip(c,90,-H);cubePose.position.set(0,0,H);setLifter(ms<2025?flipStroke*(1-ease((ms-1425)/600)):0);setHood(ms<2025?P.hood_flip_deg:mix(P.hood_flip_deg,P.hood_open_deg,ease((ms-2025)/275)));}
      }
    }
    function finishAction(c,quiet=false){
      const a=c.a;sampleAction(c,1);
      if(a.type==='hood'){displayed.hood=a.pos;displayed.hoods++;}
      if(a.type==='turn'){cube.move(a.m);homeCubies();paint();moveIndex++;if(!quiet)renderQueue();}
      if(a.type==='spin'){orientationFromAction(a);displayed.spins++;}
      if(a.type==='flip'){orientationFromAction(a);displayed.flips++;cubePose.position.set(0,0,H);visual.theta=0;visual.yf=H;}
      if(a.type==='msg'){
        if(a.line==='READY TO LOAD')lcd('PLACE CUBE SOLVED','WHITE DOWN GRN FRONT');
        if(a.line==='EJECT')lcd('REMOVE CUBE');
      }
      if(a.type==='loaded'){
        displayed.loaded=true;displayed.ori=M.ORI_START.slice();cube.reset();homeCubies();startOrientation();paint();cubePose.position.set(0,0,H);cubePose.visible=true;
        lcd('CUBE LOADED','SCRAMBLE / SOLVE');$('loadHint').textContent='장착 완료 · LOAD를 누르면 배출합니다.';
      }
      if(a.type==='ejected'){displayed.loaded=false;cubePose.visible=false;lcd('REMOVE CUBE');$('loadHint').textContent='큐브 제거 · LOAD를 눌러 새 큐브를 장착합니다.';}
      current=null;
    }
    function enqueue(list,name,done,seq=[]){
      actions=list;actionIndex=0;completion=done;label=name;estimate=list.reduce((s,a)=>s+M.Mechanism.durationMs(a),0);elapsed=0;paused=false;lastTick=performance.now();
      moves=seq.slice();moveIndex=0;renderQueue();$('summary').textContent=`${seq.length} moves · ${list.length} actions · ${(estimate/1000).toFixed(1)} s`;renderState();
    }
    function tick(delta){
      let budget=delta;
      while(current||actionIndex<actions.length){
        if(!current)beginAction(actions[actionIndex++]);
        const c=current;
        if(c.duration===0){finishAction(c);continue;}
        const consume=Math.min(budget,c.duration-c.ms);c.ms+=consume;budget-=consume;elapsed+=consume;
        sampleAction(c,c.ms/c.duration);
        if(freezeFlip&&c.a.type==='flip'&&c.ms>=c.duration*1050/2300){freezeFlip=false;c.ms=c.duration*1050/2300;sampleAction(c,c.ms/c.duration);paused=true;break;}
        if(c.ms>=c.duration)finishAction(c);else break;
      }
      if(!current&&actionIndex>=actions.length&&completion){const done=completion;completion=null;done();}
    }
    function resetCounters(){mech.resetCounters();displayed.flips=displayed.spins=displayed.hoods=0;}
    function requireLoaded(){if(displayed.loaded)return true;log('ERR not loaded');return false;}
    function doLoad(){if(busy())return;const was=mech.loaded;enqueue(mech.load(),was?'EJECTING':'LOADING',()=>{});}
    function doMoves(text){
      if(busy()||!requireLoaded())return;let seq;
      try{seq=C.parseMoves(text);}catch(_){log('ERR bad moves');lcd('ERR bad moves');return;}
      if(!seq.length)return;resetCounters();enqueue(mech.planSeq(seq),'MOVING',()=>{log(`MOVED ${seq.length} flips=${mech.flips} spins=${mech.spins}`);lcd('CUBE ROBOT V5',cube.isSolved()?'solved':'scrambled');},seq);
    }
    function doScramble(seed){
      if(busy()||!requireLoaded())return;resetCounters();const seq=C.scramble(seed,20);
      log(`SCRAMBLE seed=${seed} (20): ${C.seqToString(seq)}`);lcd('SCRAMBLING',`seed ${seed}`);
      enqueue(mech.planSeq(seq),'SCRAMBLING',()=>{log(`SCRAMBLED exec=${Math.round(estimate)}ms flips=${mech.flips} spins=${mech.spins}`);lcd('SCRAMBLED 20mv',`seed ${seed}`);},seq);
    }
    function doSolve(){
      if(busy()||!requireLoaded())return;if(cube.isSolved()){log('ALREADY SOLVED');lcd('ALREADY SOLVED');return;}
      lcd('SOLVING...','CFOP');log('SOLVING');const t0=performance.now();let result;
      try{result=new S.Solver().solve(cube.clone());}catch(e){log('SOLVE FAILED '+e.message);lcd('SOLVE FAILED');return;}
      const calc=performance.now()-t0;$('stages').tBodies[0].textContent='';
      for(const st of result.stages){log(`${st.name} (${st.moves.length}): ${C.seqToString(st.moves)} | nodes=${st.nodes} ms=${st.ms.toFixed(1)}`);const row=$('stages').tBodies[0].insertRow();for(const value of [st.name,st.moves.length,st.nodes,st.ms.toFixed(1)])row.insertCell().textContent=value;}
      resetCounters();log(`TOTAL ${result.moves.length}: ${C.seqToString(result.moves)}`);
      enqueue(mech.planSeq(result.moves),'EXECUTING',()=>{const ok=cube.isSolved();log(`SOLVED ok=${+ok} moves=${result.moves.length} flips=${mech.flips} spins=${mech.spins} calc=${Math.round(calc)}ms exec=${Math.round(estimate)}ms`);lcd(ok?'SOLVED!':'MISMATCH',`${result.moves.length}mv`);},result.moves);
    }
    function doFlip(freeze=false){if(busy()||!requireLoaded())return;freezeFlip=freeze;enqueue(mech.manualFlip(),'FLIPPING',()=>lcd('CUBE LOADED','SCRAMBLE / SOLVE'));}
    function doSpin(k=1){if(busy()||!requireLoaded())return;enqueue(mech.manualSpin(k),'SPINNING',()=>lcd('CUBE LOADED','SCRAMBLE / SOLVE'));}
    function reset(){
      if(busy())return;cube.reset();mech.reset();Object.assign(displayed,{hood:M.OPEN,loaded:false,ori:M.ORI_START.slice(),flips:0,spins:0,hoods:0});
      homeCubies();startOrientation();paint();cubePose.visible=false;cubePose.position.set(0,0,H);setHood(P.hood_open_deg);setLifter(0);visual.cup=0;cup.rotation.z=0;
      actions=[];actionIndex=0;completion=null;moves=[];moveIndex=0;estimate=elapsed=0;paused=false;freezeFlip=false;
      $('stages').tBodies[0].textContent='';$('summary').textContent='큐브를 장착해 시작하세요.';$('loadHint').textContent='LOAD 두 번: 투입 준비 → 장착. 흰색 아래 · 초록색 앞.';
      renderQueue();renderState();log('RESET');lcd('CUBE ROBOT V5','LOAD: PLACE CUBE');
    }

    // Orbit controls without extra CDN dependencies; all presets show the rear servos.
    const presets={audience:[210,-350,205],side:[390,0,110],top:[0,0,500],rear:[-220,340,190]};
    const target=vec([0,28,5]);let radius=420,azimuth=0,elevation=.45;
    function updateCamera(){camera.position.copy(target).add(vec([radius*Math.cos(elevation)*Math.sin(azimuth),-radius*Math.cos(elevation)*Math.cos(azimuth),radius*Math.sin(elevation)]));camera.lookAt(target);}
    function setView(name){const p=vec(presets[name]||presets.audience).sub(target);radius=p.length();azimuth=Math.atan2(p.x,-p.y);elevation=Math.asin(p.z/radius);updateCamera();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));}
    let dragging=null;
    canvas.addEventListener('pointerdown',e=>{dragging=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;azimuth-=(e.clientX-dragging[0])*.007;elevation=clamp(elevation+(e.clientY-dragging[1])*.007,-.08,Math.PI/2-.001);dragging=[e.clientX,e.clientY];updateCamera();});
    canvas.addEventListener('pointerup',()=>{dragging=null;});canvas.addEventListener('pointercancel',()=>{dragging=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();radius=clamp(radius*Math.exp(e.deltaY*.001),180,900);updateCamera();},{passive:false});
    function resize(){const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
    new ResizeObserver(resize).observe($('stage'));setView('audience');resize();
    async function saveScreenshot(name){
      renderer.render(scene,camera);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Canvas capture failed');const r=await fetch('/__screenshot?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
      const text=await r.text();if(!r.ok)throw Error(text);$('shotStatus').textContent=text;return text;
    }

    // A single deterministic animation path is shared by playback and regression.
    // The regression samples real transforms, checks every sticker across turn
    // boundaries, and checks the quaternion against the independent planner ori.
    function assert(ok,message){if(!ok)throw Error('Verification: '+message);}
    function checkOrientation(){
      for(let p=0;p<6;p++){const f=displayed.ori[p],n=vec(N[f]).applyQuaternion(orientation.quaternion);assert(n.distanceTo(vec(N[p]))<1e-6,'quaternion / ori '+FACE[p]);}
      assert(displayed.ori.join()===mech.ori.join(),'planner orientation');
    }
    function stickerPositions(){
      const result=[];
      for(const s of stickers){const q=s.owner.quaternion,point=s.mesh.position.clone().applyQuaternion(q).add(s.owner.position),normal=s.normal.clone().applyQuaternion(q);
        if(s.owner.parent===layer){point.applyQuaternion(layer.quaternion);normal.applyQuaternion(layer.quaternion);}else{point.applyQuaternion(orientation.quaternion);normal.applyQuaternion(orientation.quaternion);}
        result.push({point,normal,color:s.mesh.material.color.getHex()});}
      return result;
    }
    const samples=[0,.10,.32,.50,.56,.62,.78,.90,1];
    async function verify(){
      if(busy())return;reset();verifying=true;renderState();const report=$('verification');report.textContent='검증 0 / 300';
      const seen=new Set(),variants=new Set();let tested=0;
      function run(list){
        const expected=list.map(a=>a.line),actual=[];
        for(const a of list){const c=beginAction(a,true);actual.push(a.line);seen.add(a.type);variants.add(a.type+':'+(a.k??a.pos??a.line));
          for(const t of samples){sampleAction(c,t);assert([...orientation.quaternion.toArray(),...cubePose.position.toArray(),crank.rotation.x,link.rotation.x].every(Number.isFinite),'finite transforms');assert(visual.linkageError<1e-6,'70 mm link closure');}
          const before=a.type==='turn'?stickerPositions():null;finishAction(c,true);
          if(a.type==='flip'){assert(visual.lifter===0&&Math.abs(visual.hood-P.hood_open_deg)<1e-6,'FLIP returns lifter and hood');assert(cubePose.position.distanceTo(vec([0,0,H]))<1e-6,'FLIP seated alignment');}
          if(before){const after=stickerPositions();for(const b of before){assert(after.some(a=>a.color===b.color&&a.point.distanceTo(b.point)<.01&&a.normal.distanceTo(b.normal)<.001),'sticker continuity at TURN '+a.line);}}
          tested++;
        }
        assert(actual.join('\n')===expected.join('\n'),'action line order');
        checkOrientation();assert(displayed.hood===mech.hood,'hood state');assert(displayed.loaded===mech.loaded,'loaded state');
        for(const k of ['flips','spins','hoods'])assert(displayed[k]===mech[k],'counter '+k);
      }
      try{
        // Check the Rev B upper-axis branch independently of playback samples.
        const middleStroke=linkLength+crankRadius-Math.sqrt(linkLength**2-crankRadius**2);
        for(const [s,theta] of [[0,0],[middleStroke,90],[P.lift_stroke_mm,180]]){
          setLifter(s);assert(Math.abs(visual.servoAngle-theta)<1e-4,'upper-axis crank angle '+theta);assert(visual.linkageError<1e-6,'crank dead-centre closure');
        }setLifter(0);
        run(mech.load());assert($('lcd').textContent==='PLACE CUBE SOLVED\nWHITE DOWN GRN FRONT','READY LCD');run(mech.load());
        run(mech.planSeq(C.parseMoves("R U R' U' F D2 B L")));
        // Include every direction and all marker actions independently of scrambles.
        for(const k of [1,2,3])run(mech.manualSpin(k));run(mech.manualFlip());run(mech.eject());run(mech.load());
        for(let seed=1;seed<=300;seed++){
          cube.reset();paint();resetCounters();const scramble=C.scramble(seed,20),scrambleActions=mech.planSeq(scramble);run(scrambleActions);
          log(`VERIFY seed=${seed}`);log(`SCRAMBLED exec=${scrambleActions.reduce((s,a)=>s+M.Mechanism.durationMs(a),0)}ms flips=${mech.flips} spins=${mech.spins}`);
          const t0=performance.now(),result=new S.Solver().solve(cube.clone()),calc=Math.round(performance.now()-t0);resetCounters();
          const solveActions=mech.planSeq(result.moves);run(solveActions);assert(cube.isSolved(),'seed '+seed);
          log(`SOLVED ok=1 moves=${result.moves.length} flips=${mech.flips} spins=${mech.spins} calc=${calc}ms exec=${solveActions.reduce((s,a)=>s+M.Mechanism.durationMs(a),0)}ms`);
          if(seed%5===0){report.textContent=`S → V ${seed} / 300 · ${tested} actions`;await new Promise(resolve=>setTimeout(resolve,0));}
        }
        assert(seen.size===7,'all seven action types');for(const k of [0,1,2])assert(variants.has('turn:'+k),'turn variant '+k);
        report.textContent=`PASS · 300 / 300 SOLVED ok=1\n${tested} actions · ${[...seen].join(', ')}\nori / counters / 54 stickers / finite transforms / line order OK`;
        log('VERIFY PASS seeds=1..300');
      }catch(e){report.textContent='FAIL · '+e.message;showError(e);}
      finally{verifying=false;reset();renderState();}
    }

    $('btnLoad').onclick=doLoad;$('btnReset').onclick=reset;$('btnScramble').onclick=()=>doScramble(Number($('seed').value)||0);$('btnSolve').onclick=doSolve;
    $('btnMoves').onclick=()=>doMoves($('moves').value);$('moves').addEventListener('keydown',e=>{if(e.key==='Enter')doMoves(e.target.value);});
    $('btnFlip').onclick=()=>doFlip();$('btnSpin').onclick=()=>doSpin();$('captureFlip').onclick=()=>doFlip(true);
    $('btnPause').onclick=()=>{paused=!paused;lastTick=performance.now();renderState();};
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('showHood').onchange=e=>{hood.visible=e.target.checked;};$('showTowers').onchange=e=>{towers.visible=e.target.checked;};$('showBase').onchange=e=>{base.visible=e.target.checked;};
    $('shotRobot').onclick=()=>saveScreenshot('sim_v5_robot.png').catch(e=>{$('shotStatus').textContent=e.message;});
    $('shotFlip').onclick=()=>saveScreenshot('sim_v5_flip.png').catch(e=>{$('shotStatus').textContent=e.message;});$('btnVerify').onclick=verify;
    $('modelSource').textContent=`V5 Rev B · ${Object.values(assetModes).filter(m=>m==='STL').length}/7 STL · ${checks?'검사 궤적':'기본 궤적'} · 57 mm`;
    function animate(now){
      requestAnimationFrame(animate);const delta=Math.min(100,now-(lastTick||now));lastTick=now;
      if(!paused&&!verifying)tick(delta*Number($('speed').value));renderState();renderer.render(scene,camera);
    }
    paint();renderQueue();renderState();log('READY cube-robot v5 (S [seed] | V | M <moves> | L | E | F | Y <k> | R)');
    window.CubeSim={cube,mech,params:P,assetModes,visual,displayed,errors,coverage,history,doLoad,doMoves,doScramble,doSolve,doFlip,doSpin,reset,verify,setView,saveScreenshot,
      state:()=>({busy:busy(),paused,action:current?.a,estimate,elapsed,quaternion:orientation.quaternion.toArray(),...displayed,visual:{...visual}})};
    requestAnimationFrame(animate);
  }catch(e){showError(e);}
})();
