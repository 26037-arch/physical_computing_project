"""Check Rev B mounting interfaces, bolt heads and sampled V4 movement."""
import json,itertools,math
from pathlib import Path
import build_robot_v4 as d
import build_robot_v4_kit as k
from check_robot_v4 import hits

def main():
    panels,metal,prints,jigs=k.design()
    cubes,derived,instances,modules,lock=d.make_design()
    report={'revision':'Rev B','physical_load_test':False,'checks':{},'limitations':'Discrete rigid geometry only; includes P14 M5 head/washer envelopes. Other fasteners, vendor slots, horn details and switch levers are omitted.'}
    failures=[]
    def record(n,left,right,same=False):
        h=hits(left,right,same);report['checks'][n]=h
        print(n,len(h),h,flush=True);failures.extend([[n,*x] for x in h])
    frame=list({**panels,**metal}.items())
    record('frame_internal',frame,frame,True)
    for pose in ('FB','RL','retracted'):
        old=[(n,s) for n,_,s in d.assembly_items(instances,modules,lock,pose)]
        record('frame_vs_robot_'+pose,frame,old)
    bracket=prints['lock_switch_bracket'][0]
    # With a 6T spine and approximately 1T washer, a 12 mm screw enters
    # 5 mm from x=-30. Its last millimetre must clear the insert's plastic root.
    guide_tips=[(f'M4_tip_{y}_{z}',d.cyl(4,-30,-25,(1,0,0),(0,y,z)))
                for y,z in itertools.product((-9,9),(180,190))]
    bracket_tips=[(f'M3_tip_{z}',d.cyl(3,-30,-25,(1,0,0),(0,-21,z))) for z in (208,216)]
    record('guide_screw_tip_clearance',[('guide',lock[0]['lock_guide'])],guide_tips)
    record('switch_bracket_screw_tip_clearance',[('bracket',bracket)],bracket_tips)
    for shift in (0,15,30):
        unit=d.lock_pose(lock,shift)
        record('lock_bracket_'+str(shift),[('bracket',bracket)],list(unit.items()))
    # New static cap must not catch the full crank/link sweep or moving carriage.
    for hollow in (False,True):
        heads,hw=modules[hollow]
        fixed=[(n,heads[n]) for n in ('servo_mount','servo_clamp','rail_support')]
        record(f'head_{hollow}_fixed_interfaces',fixed,fixed,True)
        record(f'head_{hollow}_servo_and_rail',fixed,
               [(n,hw[n]) for n in ('servo_MG996R','rail_MGN12')])
        record(f'head_{hollow}_rail_vs_servo',[('rail',hw['rail_MGN12'])],[('servo',hw['servo_MG996R'])])
        bolt_heads=[]
        for x,z,front in ((-20,239,-51),(20,239,-51),(-20,171,-48)):
            washer=d.cyl(10,front,front+1,(0,1,0),(x,0,z))
            head=d.cyl(8.5,front+1,front+4.5,(0,1,0),(x,0,z))
            bolt_heads.append((f'M5_{x}_{z}',washer.fuse(head)))
        record(f'head_{hollow}_bolt_heads_static',bolt_heads,fixed+[(n,hw[n]) for n in ('servo_MG996R','rail_MGN12')])
        for theta in range(0,181,15):
            z=d.slider_z(theta)-147
            crank,link=d.crank_link(theta)
            moving=[('crank',crank),('link',link),('carriage',heads['carriage'].translate((0,0,z))),
                    ('MGN_block',hw['block_MGN12H'].translate((0,0,z)))]
            record(f'head_{hollow}_{theta}',fixed+bolt_heads,moving)
    lock_fixed=[(n,lock[0][n]) for n in ('lock_guide','lock_servo_mount','lock_servo_clamp')]
    record('lock_fixed_interfaces',lock_fixed,lock_fixed,True)
    record('lock_servo_capture',lock_fixed,[('servo',lock[1]['lock_servo_MG996R'])])
    # Mechanical sanity checks with actual generated solids.
    for n,(s,q) in prints.items():
        assert s.isValid() and len(s.Solids())==1,n
    report['failure_count']=len(failures);report['failures']=failures;report['passed']=not failures
    (k.OUT/'kit_checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    raise SystemExit(1 if failures else 0)

if __name__=='__main__':main()
