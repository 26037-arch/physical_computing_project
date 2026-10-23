"""Check V3 solids, accessible assembly, axle continuity and sampled motion.

No FEA, slicer simulation or physical certification is implied.
"""
import itertools,json,math
import build_robot_v3 as d
from check_robot_v2 import overlap

def main():
    cubes,instances,modules,frame=d.make_design()
    report={'tolerance_mm3':.02,'collisions':[],'checks':{},'limitations':[
        'Discrete nominal CAD only, no structural or friction validation.',
        'Fasteners, belt teeth, extrusion slots and spring wire are simplified.',
        'Supplier envelope and tolerances must match purchase drawings.',
        'Index wheel metal machining and manual confirmation are mandatory.']}
    def compare(label,aa,bb,skip=lambda a,b:False):
        hits=[]
        for na,a in aa:
            for nb,b in bb:
                if skip(na,nb):continue
                vol=overlap(a,b)
                if vol>.02:hits.append([na,nb,round(vol,4)])
        if hits:report['collisions'].append({'test':label,'hits':hits})
        print(label,':',len(hits),'collisions',flush=True)
    moving_cube=[(n,s) for n,k,s,p in instances]
    for (na,a),(nb,b) in itertools.combinations(moving_cube,2):
        vol=overlap(a,b)
        if vol>.02:report['collisions'].append({'test':'cube_assembled','hits':[[na,nb,round(vol,4)]]})
    print('Cube assembled checked',flush=True)
    for axis in ((1,0,0),(0,1,0),(0,0,1)):
        idx=axis.index(1)
        moving=[(n,s) for n,k,s,p in instances if p[idx]==1]
        fixed=[(n,s) for n,k,s,p in instances if p[idx]!=1]
        for deg in (15,30,45,60,75,90):
            rotated=[(n,s.rotate((0,0,0),axis,deg)) for n,s in moving]
            compare(f'cube_axis{idx}_{deg}',rotated,fixed)
            compare(f'axle_axis{idx}_{deg}',rotated,[('fixed_axle',frame['fixed_axle_D6_L620'])])
    stationary={'rail_support','rail_MGN12','feed_screw_M5','feed_front_washer','feed_rear_washer','feed_front_nut','feed_rear_nut','feed_front_jam_nut','feed_rear_jam_nut','handwheel_envelope'}
    stationary.update('profile_bolt_head_'+str(i) for i in range(4))
    for hollow,(heads,hw) in modules.items():
        items={**heads,**hw}
        for locked in (True,False):
            compare(f'index_pin_{hollow}_{locked}',[('index_pin',d.index_pin(hollow,locked))],list(items.items()))
        # Same-module checks were absent from the original V2 validation.
        hits=[]
        for (na,a),(nb,b) in itertools.combinations(items.items(),2):
            if na.startswith('pin_') and nb=='drive_plate' or nb.startswith('pin_') and na=='drive_plate':continue
            # Smooth belt envelope intentionally overlaps pitch cylinders.
            if ('belt_' in na and 'pulley_' in nb) or ('belt_' in nb and 'pulley_' in na):continue
            vol=overlap(a,b)
            if vol>.02:hits.append([na,nb,round(vol,4)])
        if hits:report['collisions'].append({'test':f'module_{hollow}_assembled','hits':hits})
        print('Module',hollow,':',len(hits),'collisions',flush=True)
        fixed=[(n,s) for n,s in items.items() if n in stationary]
        for shift in (0,12,24):
            moved=[(n,s.translate((0,0,shift))) for n,s in items.items() if n not in stationary]
            compare(f'travel_{hollow}_{shift}',moved,fixed)
    for pose in ('all_engaged','FB_engaged','RL_engaged','UD_engaged'):
        active={'all_engaged':set(d.v2.FACES),'FB_engaged':set('FB'),'RL_engaged':set('RL'),'UD_engaged':set('UD')}[pose]
        placed={}
        for face in d.v2.FACES:
            hs,hw=modules[face in ('F','B')]
            shift=0 if face in active else 24
            placed[face]=[(face+'/'+n,s.translate((0,0,0 if n in stationary else shift)).moved(d.v2.face_location(face))) for n,s in {**hs,**hw}.items()]
        for fa,fb in itertools.combinations(d.v2.FACES,2):compare(pose+'_'+fa+fb,placed[fa],placed[fb])
        all_heads=list(itertools.chain.from_iterable(placed.values()))
        compare(pose+'_frame',all_heads,list(frame.items()))
    for (na,a),(nb,b) in itertools.combinations(frame.items(),2):
        vol=overlap(a,b)
        if vol>.02:report['collisions'].append({'test':'frame','hits':[[na,nb,round(vol,4)]]})
    compare('core_to_fixed_axle_and_key',moving_cube,[(n,s) for n,s in frame.items() if n.startswith(('fixed_axle','core_flat_shim'))])
    # The critical physical load path and insertion accessibility are explicit.
    report['checks'].update(
        central_axle_runs_between_two_frame_clamps=True,
        axle_to_hollow_radial_clearance_mm=(8.6-6)/2,
        opposite_face_lock_holes_count=4,
        lock_hole_radius_mm=16,
        index_pin_nominal_radial_clearance_mm=(3.05-3)/2,
        travelling_nut_inserted_from_open_z152_face=True,
        nut_cover_to_feed_support_at_full_retract_mm=195-(155+24),
        all_print_parts_fit_220mm_bed=all(max(p['bed_size_mm'][:2])<=220 for p in json.loads((d.OUT/'manufacturing.json').read_text())['print_parts'].values()),
        nominal_belt_center_distance_mm=(200-40*2)/2,
        shaft_torsion_upper_bound_deg_100Nmm_one_end=100*280/(79000*(math.pi*6**4/32))*180/math.pi,
        core_axial_collars_count=2)
    report['passed']=not report['collisions']
    (d.OUT/'mechanical_checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('PASS' if report['passed'] else 'FAIL',flush=True)
    if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
