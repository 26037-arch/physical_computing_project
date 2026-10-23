"""Check Rev A additions against stationary and moving V4 components."""
import json,itertools,math
from pathlib import Path
import build_robot_v4 as d
import build_robot_v4_kit as k
from check_robot_v4 import hits

def main():
    panels,metal,prints,jigs=k.design()
    cubes,derived,instances,modules,lock=d.make_design()
    report={'physical_load_test':False,'checks':{},'limitations':'Discrete rigid geometry only; purchased envelopes omit slots, screw heads and levers.'}
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
    for shift in (0,15,30):
        unit=d.lock_pose(lock,shift)
        record('lock_bracket_'+str(shift),[('bracket',bracket)],list(unit.items()))
    # New static cap must not catch the full crank/link sweep or moving carriage.
    for hollow in (False,True):
        heads,hw=modules[hollow]
        for theta in range(0,181,15):
            z=d.slider_z(theta)-147
            crank,link=d.crank_link(theta)
            fixed=[(n,heads[n]) for n in ('servo_mount','servo_clamp','rail_support')]
            moving=[('crank',crank),('link',link),('carriage',heads['carriage'].translate((0,0,z)))]
            record(f'head_{hollow}_{theta}',fixed,moving)
    # Mechanical sanity checks with actual generated solids.
    for n,(s,q) in prints.items():
        assert s.isValid() and len(s.Solids())==1,n
    report['failure_count']=len(failures);report['failures']=failures;report['passed']=not failures
    (k.OUT/'kit_checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    raise SystemExit(1 if failures else 0)

if __name__=='__main__':main()
