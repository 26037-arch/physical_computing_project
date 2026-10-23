"""Manufacturing prototype V3: fixed core axle, hollow F/B drive, index locks.

Run with CadQuery 2.7.0. Dimensions mm. V2 files are not overwritten.
Purchased envelopes are fit requirements, not vendor production drawings.
"""
import itertools, json, math, struct
from pathlib import Path
import cadquery as cq
import build_robot_v2 as v2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'robot_v3'
box, cyl, fuse = v2.box, v2.cyl, v2.fuse
P = dict(axle_d=6., axle_length=620., axle_bore=6.2, axle_flat_x=2.,
         hollow_od=12., hollow_id=8.6, hollow_length=82.,
         frame_inner=560., wall=12., profile_start=5., profile_length=246.5,
         motor_offset=60., retract=24., belt_pitch_length=200.,
         status='CAD manufacturing prototype; physical acceptance tests required')

def hexprism(af, a, b, origin=(0,0,0)):
    return cq.Workplane('XY').polygon(6, af / math.cos(math.pi/6)).extrude(b-a).val().translate((origin[0],origin[1],a+origin[2]))

def d_bore(diameter, flat_x, a, b):
    return cyl(diameter,a,b).intersect(box(30,30,b-a+2,(flat_x-15,0,(a+b)/2)))

def cube_design():
    base, derived = v2.cube_parts()
    # Core consists of two clamped halves. A D-flat gives positive torque reaction.
    core = v2.ball(derived['core_r_mm'])
    for axis in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0)):
        core = core.cut(cyl(2.5,7.2,18,axis)).cut(cyl(4.6,12.7,18,axis))
    core = core.cut(d_bore(6.2,2.1,-18,18))
    # Embedded metal collars give axial retention; screws only close the shell.
    for a,b in ((7.9,13.1),(-13.1,-7.9)):
        core=core.cut(cyl(12.2,a,b))
    for y,z in itertools.product((-9,9),(-5,5)):
        core = core.cut(cyl(3.4,-18,18,(1,0,0),(0,y,z)))
        core = core.cut(cyl(6.2,8,18,(1,0,0),(0,y,z)))
        nut = hexprism(5.8,-18,-8).rotate((0,0,0),(0,1,0),90).translate((0,y,z))
        core = core.cut(nut)
    parts = dict(core_left=core.intersect(box(30,40,40,(-15.05,0,0))).clean(),
                 core_right=core.intersect(box(30,40,40,(15.05,0,0))).clean())
    # Keep the original center retention envelope: enlarging its stem collides
    # with edge/corner feet during X/Y turns. A 6-mm axle leaves 1.275-mm wall.
    p=derived['piece_mm']; w=57.; r=derived['track_outer_r_mm']
    axle_center = fuse(v2.rounded((p,p,8),4,(0,0,-24.5)).cut(v2.ball(r+.3)),
                       cyl(derived['piece_mm']/2-.6,-28.5,0).cut(v2.ball(r-6)))
    axle_center = axle_center.cut(cyl(6.25,-29,1)).clean()
    parts.update(center_standard=base['cube_center'],center_axle=axle_center,
                 cube_edge=base['cube_edge'],cube_corner=base['cube_corner'],
                 socket_coupon=base['socket_coupon'])
    coupon=box(48,20,8,(0,0,4))
    coupon=coupon.cut(d_bore(6.2,2.1,-1,9).translate((-12,0,0)))
    coupon=coupon.cut(cyl(6.25,-1,9,origin=(12,0,0)))
    parts['axle_coupon']=coupon.clean()
    return parts,base,derived

def index_wheel(bore):
    s=cyl(38,61,69).cut(cyl(bore,-1,100))
    for x,y in ((16,0),(0,16),(-16,0),(0,-16)):
        s=s.cut(cyl(3.05,60,70,origin=(x,y,0)))
    for sign in (-1,1):
        a=(sign/math.sqrt(2),1/math.sqrt(2),0)
        s=s.cut(cyl(3.3,0,21,a,(0,0,65))) # M4 tap in machined metal
    return s.clean()

def module_design(hollow=False):
    heads,hardware=v2.head_parts(19.1)
    # The old M5 nut pocket was sealed inside the lug. Open it axially.
    car=heads['carriage'].fuse(box(22,19,10,(22,-41.5,147)))
    car=car.cut(hexprism(8.31,142,152.2,(22,-44,0)))
    for x in (14,30):
        car=car.cut(cyl(2.5,145,153,origin=(x,-36,0)))
    for z in (65,75):
        car=car.cut(cyl(3.4,-39,-31,(0,1,0),(24,0,z)))
    cover=box(22,19,3,(22,-41.5,153.5)).fuse(hexprism(8.05,146.5,152,(22,-44,0)))
    cover=cover.cut(cyl(5.5,145,156,origin=(22,-44,0)))
    for x in (14,30): cover=cover.cut(cyl(3.4,151,156,origin=(x,-36,0)))
    # Relocate the feed-screw reaction flange to leave room for its locknuts.
    support=box(60,6,190,(0,-54,95))
    support=fuse(support,box(14,6,15,(22,-54,193.5)),box(14,25,6,(22,-44.5,198)))
    for z in range(15,176,25):
        support=support.cut(cyl(3.4,-58,-50,(0,1,0),(0,0,z)))
        support=support.cut(cyl(4.6,-57.1,-53,(0,1,0),(0,0,z)))
    for x,z in itertools.product((-20,20),(25,120)):
        support=support.cut(cyl(5.4,-58,-50,(0,1,0),(x,0,z)))
    support=support.cut(cyl(5.5,194,202,origin=(22,-44,0)))
    level=93 if hollow else 83
    lock=fuse(box(22,6,36 if hollow else 30,(22,-29,78 if hollow else 75)),box(22,30,6,(22,-11,level)))
    for x in (16,28):lock=lock.cut(cyl(3.05 if x==16 else 3.2,level-4,level+4,origin=(x,0,0)))
    for z in (65,75):lock=lock.cut(cyl(3.4,-33,-25,(0,1,0),(24,0,z)))
    heads.update(carriage=car.clean(),rail_support=support.clean(),nut_cover=cover.clean(),index_pin_bracket=lock.clean())
    for i,(x,z) in enumerate(itertools.product((-20,20),(25,120))):
        hardware[f'profile_bolt_head_{i}']=cyl(8.5,-50,-45,(0,1,0),(x,0,z)).fuse(cyl(10,-51,-50,(0,1,0),(x,0,z)))
    hardware['feed_screw_M5']=cyl(5,135,235,origin=(22,-44,0))
    hardware['feed_front_washer']=cyl(10,194.2,195,origin=(22,-44,0)).cut(cyl(5.5,194,196,origin=(22,-44,0)))
    hardware['feed_rear_washer']=cyl(10,201,201.8,origin=(22,-44,0)).cut(cyl(5.5,200,203,origin=(22,-44,0)))
    for name,a,b in [('front',190.2,194.2),('rear',201.8,206.3),('travelling',142,146.2)]:
        hardware['feed_'+name+'_nut']=hexprism(8,a,b,(22,-44,0)).cut(cyl(5.05,a-1,b+1,origin=(22,-44,0)))
    for name,a,b in [('front_jam',186.2,190.2),('rear_jam',206.3,210.3)]:
        hardware['feed_'+name+'_nut']=hexprism(8,a,b,(22,-44,0)).cut(cyl(5.05,a-1,b+1,origin=(22,-44,0)))
    hardware['handwheel_envelope']=cyl(20,212,225,origin=(22,-44,0)).cut(cyl(5.05,211,226,origin=(22,-44,0)))
    # Both directions of axial load now have thrust bearings and a metal retainer.
    if not hollow:
        hardware['rear_thrust_F8_16M']=cyl(16,54,59).cut(cyl(8.05,53,60))
        hardware['rear_axial_shim']=cyl(16,59,61).cut(cyl(8.05,58,62))
        hardware['index_wheel_8']=index_wheel(8.05)
    else:
        for n in ('spindle_8mm','coupling_5x8','motor_NEMA17','motor_shaft','bearing_608_0','bearing_608_1','thrust_F8_16M'):
            hardware.pop(n)
        heads['shaft_hub']=heads['shaft_hub'].cut(cyl(12.15,10,29)).clean()
        # Reconstruct the housing so bearing seats do not break into each other.
        h=fuse(box(34,34,19,(0,0,44.5)),box(34,9,19,(0,-21.5,44.5)),box(60,6,19,(0,-29,44.5)))
        h=h.cut(cyl(13.2,34,55)).cut(cyl(28.15,34.9,43)).cut(cyl(28.15,46,54.1))
        for x,y in itertools.product((-13,13),repeat=2):
            h=h.cut(cyl(2.5,34,55,origin=(x,y,0)))
            h=h.cut(cyl(4.6,34.9,39,origin=(x,y,0))).cut(cyl(4.6,50,54.1,origin=(x,y,0)))
        for x,z in itertools.product((-24,24),(38.5,48.5)):
            h=h.cut(cyl(3.4,-33,-25,(0,1,0),(x,0,z)))
        heads['bearing_housing']=h.clean()
        heads['bearing_front_cap']=heads['bearing_front_cap'].cut(cyl(13.2,32,36)).clean()
        heads['bearing_rear_cap']=heads['bearing_rear_cap'].translate((0,0,2)).cut(cyl(13.2,53,57)).clean()
        # Offset NEMA17, retaining the original 1:1 motor/face ratio.
        car=heads['carriage'].cut(box(62,58,6,(0,-3,101)))
        car=fuse(car,box(116,59,6,(28,-3.5,101)),box(60,6,35,(56,-35,87.5)))
        car=car.cut(cyl(42,97,105)) # access aperture for locked-pin handle
        car=car.cut(cyl(3.2,97,105,origin=(28,0,0))) # parked pin seats on plate
        pilot=cq.Workplane('XY').center(60,0).slot2D(29,23).extrude(8).val().translate((0,0,97))
        car=car.cut(pilot)
        for x,y in itertools.product((44.5,75.5),(-15.5,15.5)):
            # 6-mm adjustment slots along X for purchased belt tolerance.
            slot=cq.Workplane('XY').center(x,y).slot2D(9.4,3.4).extrude(8).val().translate((0,0,97))
            car=car.cut(slot)
        # Outer rib remains outside both the belt and the motor body.
        for x in (82,):
            rib=cq.Workplane('YZ',origin=(x,0,0)).polyline([(-32,74),(20,98),(-32,98)]).close().extrude(4).val()
            car=car.fuse(rib)
        heads['carriage']=car.clean()
        hardware['spindle_hollow_12x8_6']=cyl(12,16,98).cut(cyl(8.6,15,99))
        for i,z in enumerate((35,46)):
            hardware[f'bearing_6001_{i}']=cyl(28,z,z+8).cut(cyl(12.05,z-1,z+9))
        for name,a,b in [('front',28,33),('rear',56,61)]:
            hardware[name+'_thrust_F12_21M']=cyl(21,a,b).cut(cyl(12.05,a-1,b+1))
        hardware['index_wheel_12']=index_wheel(12.05)
        motor=fuse(box(42.3,42.3,40,(60,0,124)),cyl(22,102,104,origin=(60,0,0)))
        hardware['motor_NEMA17_offset']=motor.cut(cyl(5.1,101,105,origin=(60,0,0)))
        hardware['motor_shaft_offset']=cyl(5,84,104,origin=(60,0,0))
        for name,x,bore in [('driven',0,12.05),('driver',60,5.05)]:
            pulley=fuse(cyl(28,76,84,origin=(x,0,0)),cyl(20,84,94,origin=(x,0,0)))
            hardware['pulley_40T_'+name]=pulley.cut(cyl(bore,75,95,origin=(x,0,0)))
        # Smooth pitch-envelope: tooth profile comes from purchased belt/pulleys.
        outer=cq.Workplane('XY').center(30,0).slot2D(87.465,27.465).extrude(6).val().translate((0,0,77))
        inner=cq.Workplane('XY').center(30,0).slot2D(83.465,23.465).extrude(8).val().translate((0,0,76))
        hardware['belt_200_2GT_6_pitch_envelope']=outer.cut(inner)
    return heads,hardware

def frame_design():
    frame={}
    # Purchased 2060 extrusion envelope. Slots are represented by mounting datums.
    for face in v2.FACES:
        profile=box(60,20,246.5,(0,-67,128.25))
        # The three longitudinal cores are clearance envelopes, not exact profile.
        for x in (-20,0,20):profile=profile.cut(cyl(5,0,252,origin=(x,-67,0)))
        frame['profile_'+face]=profile.moved(v2.face_location(face))
        sizes={'U':(584,584),'D':(584,584),'R':(560,584),'L':(560,584),'F':(560,560),'B':(560,560)}
        sx,sy=sizes[face]
        panel=box(sx,sy,12,(0,0,257.5)).cut(box(100,100,14,(0,0,257.5)))
        for a,b in itertools.product((-265,265),(-180,180)):
            for x,y in ((a,b),(b,a)):panel=panel.cut(cyl(4.5,250,265,origin=(x,y,0)))
        for x in (-20,20): panel=panel.cut(cyl(6.6,250,265,origin=(x,-67,0)))
        if face in ('F','B'):
            for x in (-60,60):
                for y in (-10,10):panel=panel.cut(cyl(5.5,250,265,origin=(x,y,0)))
        frame['panel_'+face]=panel.moved(v2.face_location(face))
        spread=box(80,40,3,(0,-67,265))
        for x in (-20,20):spread=spread.cut(cyl(6.6,263,267,origin=(x,-67,0)))
        frame['profile_end_plate_'+face]=spread.moved(v2.face_location(face))
        if face in ('F','B'):
            bridge=box(140,30,5,(0,0,266)).cut(cyl(6.5,262,270))
            # SHF6: mounting pitch 32 mm, mounting bolt M5 (supplier drawing).
            for x in (-16,16):bridge=bridge.cut(cyl(5.5,262,270,origin=(x,0,0)))
            for x,y in itertools.product((-60,60),(-10,10)):
                bridge=bridge.cut(cyl(5.5,262,270,origin=(x,y,0)))
            frame['shaft_bridge_'+face]=bridge.moved(v2.face_location(face))
            shf=fuse(box(43,20,5,(0,0,271)),cyl(24,273.5,278.5))
            shf=shf.cut(cyl(6.05,268,280))
            for x in (-16,16):shf=shf.cut(cyl(5.5,268,274,origin=(x,0,0)))
            frame['SHF6_envelope_'+face]=shf.moved(v2.face_location(face))
    axle=cyl(6,-310,310)
    # Mill one flat over the 36-mm core contact region; remaining shaft is round.
    axle=axle.cut(box(4,10,36,(4,0,0)))
    frame['fixed_axle_D6_L620']=axle.clean()
    frame['core_flat_shim_0_1']=box(.1,4.2,15.6,(2.05,0,0))
    # Twenty-four 30x30x20 metal corner brackets, two per box edge.
    for cycle in range(3):
        for sx,sy,along in itertools.product((-1,1),(-1,1),(-180,180)):
            b=fuse(box(2,30,20,(279,265,along)),box(30,2,20,(265,279,along)))
            b=b.cut(cyl(4.5,277,281,(1,0,0),(0,265,along)))
            b=b.cut(cyl(4.5,277,281,(0,1,0),(265,0,along)))
            if sx<0:b=b.mirror('YZ')
            if sy<0:b=b.mirror('XZ')
            if cycle:b=b.rotate((0,0,0),(1,1,1),120*cycle)
            frame[f'corner_bracket_{cycle}_{sx}_{sy}_{along}']=b
    return frame

def assembly_instances(cubes,base):
    old=v2.cube_instances(base)
    parts=[('core_left','core_left',cubes['core_left'],(0,0,0)),('core_right','core_right',cubes['core_right'],(0,0,0))]
    for name,kind,s,pos in old:
        if kind=='cube_core':continue
        if kind=='cube_center' and pos[2]:
            s=cubes['center_axle']
            if pos[2]>0:s=s.rotate((0,0,0),(1,0,0),180)
            kind='center_axle'
        elif kind=='cube_center':kind='center_standard'
        parts.append((name,kind,s,pos))
    return parts

def flatten(s,axis=None):
    if axis:s=s.rotate((0,0,0),axis[0],axis[1])
    bb=s.BoundingBox()
    return s.translate((-(bb.xmin+bb.xmax)/2,-(bb.ymin+bb.ymax)/2,-bb.zmin))

def clean_stl(path):
    """Weld at 0.00001 mm and remove collapsed pole triangles from OCC STL."""
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,80)[0];triangles=[]
    for i in range(n):
        f=struct.unpack_from('<12fH',raw,84+50*i)
        vs=[tuple(round(x,5) for x in f[j:j+3]) for j in (3,6,9)]
        if len(set(vs))<3:continue
        a,b,c=vs;u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
        normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
        norm=math.sqrt(sum(x*x for x in normal))
        if norm<1e-14:continue
        normal=tuple(x/norm for x in normal)
        triangles.append(struct.pack('<12fH',*normal,*a,*b,*c,0))
    path.write_bytes(b'V3 welded 0.00001mm; degenerate OCC pole triangles removed'.ljust(80,b' ')+struct.pack('<I',len(triangles))+b''.join(triangles))
    return {'triangles_before':n,'triangles_after':len(triangles),'weld_mm':.00001}

def make_design():
    cubes,base,derived=cube_design()
    return cubes,assembly_instances(cubes,base),{False:module_design(False),True:module_design(True)},frame_design()

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    cubes,instances,modules,frame=make_design()
    printable={n:(s,1 if n in ('core_left','core_right','axle_coupon','socket_coupon') else 4 if n=='center_standard' else 2 if n=='center_axle' else 12 if n=='cube_edge' else 8) for n,s in cubes.items()}
    for hollow,(heads,_) in modules.items():
        for n,s in heads.items():
            if n in ('drive_plate','rail_support','nut_cover'):
                if not hollow:printable[n]=(s,6)
            else:printable[n+('_hollow' if hollow else '_direct')]=(s,2 if hollow else 4)
    report={'parameters':P,'print_parts':{},'purchased_parts_are_envelopes':True}
    for n,(s,qty) in printable.items():
        assert s.isValid() and len(s.Solids())==1,(n,len(s.Solids()))
        folder=OUT/'print';folder.mkdir(exist_ok=True)
        # Orient support plate with its wide back on the bed; keep pockets open.
        orient=((1,0,0),90) if n=='rail_support' or n.startswith('index_pin_bracket') else ((1,0,0),180) if n in ('nut_cover','drive_plate') else ((0,1,0),90) if n=='core_left' or n.startswith('carriage') else ((0,1,0),-90) if n=='core_right' else None
        flat=flatten(s,orient)
        stl_path=folder/(n+'.stl')
        flat.exportStl(str(stl_path),tolerance=.04,angularTolerance=.12)
        mesh_clean=clean_stl(stl_path)
        cq.exporters.export(s,str(folder/(n+'.step')))
        bb=flat.BoundingBox()
        no_support=n in ('rail_support','nut_cover','drive_plate','axle_coupon','socket_coupon') or n.startswith(('bearing_','shaft_hub','index_pin_bracket'))
        report['print_parts'][n]={'qty':qty,'valid':True,'solids':1,'bed_size_mm':[round(bb.xlen,2),round(bb.ylen,2),round(bb.zlen,2)],'support_review_required':not no_support,'mesh_cleanup':mesh_clean}
    machining=OUT/'purchase_and_cut';machining.mkdir(exist_ok=True)
    for n,s in frame.items():cq.exporters.export(s,str(machining/(n+'.step')))
    for bore in (8,12):cq.exporters.export(index_wheel(bore+.05),str(machining/f'index_wheel_bore{bore}.step'))
    robot=cq.Assembly(name='RobotV3_fixed_core_manual_F_turn')
    cube=cq.Assembly(name='CubeV3')
    for n,k,s,pos in instances:cube.add(s,name=n,color=v2.color('cube_'+k if k.startswith('center') else k))
    # Bushings, springs (envelopes), washers, and collars move with neither head.
    for sign in (-1,1):
        for n,s in [('spring_envelope',cyl(10,28.5,31.5).cut(cyl(6.4,28,32))),
                    ('washer',cyl(12,31.5,32).cut(cyl(6.4,31,33))),
                    ('collar',cyl(12,32,37).cut(cyl(6.05,31,38)))]:
            if sign<0:s=s.rotate((0,0,0),(1,0,0),180)
            cube.add(s,name=f'{n}_{sign}',color=cq.Color('#c49c55'))
        collar=cyl(12,8,13).cut(cyl(6.05,7,14))
        if sign<0:collar=collar.rotate((0,0,0),(1,0,0),180)
        cube.add(collar,name=f'core_axial_collar_{sign}',color=cq.Color('#c49c55'))
    cube_export=cq.Assembly(name='CubeV3_on_fixed_axle')
    cube_export.add(cube,name='cube')
    cube_export.add(frame['fixed_axle_D6_L620'],name='fixed_axle',color=cq.Color('#c34a35'))
    cube_export.add(frame['core_flat_shim_0_1'],name='flat_key_shim',color=cq.Color('#c49c55'))
    cube_export.save(str(OUT/'cube_with_fixed_axle.step'))
    robot.add(cube,name='cube')
    for face in v2.FACES:
        hollow=face in ('F','B'); heads,hw=modules[hollow]
        shift=0 if hollow else 24
        sub=cq.Assembly(name='head_'+face)
        fixed={'rail_support','rail_MGN12','feed_screw_M5','feed_front_washer','feed_rear_washer','feed_front_nut','feed_rear_nut','feed_front_jam_nut','feed_rear_jam_nut','handwheel_envelope'}
        fixed.update(n for n in hw if n.startswith('profile_bolt_head_'))
        for n,s in {**heads,**hw}.items():
            sub.add(s,name=n,color=v2.color(n),loc=cq.Location((0,0,0 if n in fixed else shift)))
        # F is active; B is mechanically locked. Other pins are in park holes.
        pin=index_pin(hollow,face=='B')
        sub.add(pin,name='index_pin',color=cq.Color('#d94e32'),loc=cq.Location((0,0,shift)))
        robot.add(sub,name='head_'+face,loc=v2.face_location(face))
        if face in ('F','R'):sub.save(str(OUT/('module_hollow.step' if hollow else 'module_direct.step')))
    for n,s in frame.items():robot.add(s,name=n,color=cq.Color('#dcbf8f' if n.startswith('panel') else '#788999'))
    robot.save(str(OUT/'robot_assembly.step'))
    robot.save(str(OUT/'robot_assembly.glb'))
    (OUT/'manufacturing.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)

def index_pin(hollow,locked):
    x=16 if locked else 28
    end=96 if hollow and locked else 104 if hollow else 86
    length=40 if hollow else 30
    return fuse(cyl(3,end-length,end,origin=(x,0,0)),cyl(7,end,end+3,origin=(x,0,0)))

if __name__=='__main__':main()
