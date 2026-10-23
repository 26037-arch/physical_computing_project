"""Check exported V4 BReps; sampled motion is not a continuous-motion proof.

No exclusions in cube/cross-module checks. Pin press fits inside their OWN
module, bolted mounting faces, and the bar clamp are not cross-module pairs.
"""
import itertools
import json
import math
import multiprocessing
from concurrent.futures import ProcessPoolExecutor

import cadquery as cq
import build_robot_v4 as d
from check_robot_v2 import overlap

TOL = .02
_WORKER_PARTS = None


def init_layer_worker():
    """Independent OCC processes avoid shared mutable BReps and nested pools."""
    global _WORKER_PARTS
    from OCP.OSD import OSD_ThreadPool
    OSD_ThreadPool.DefaultPool_s().Init(1)
    params = json.loads((d.OUT/'parameters.json').read_text(encoding='utf-8'))
    d.P.update({k: params[k] for k in d.P})
    cubes = {n: cq.importers.importStep(str(d.OUT/'print'/(n+'.step'))).val()
             for n in ('cube_core', 'cube_center', 'cube_edge', 'cube_corner', 'center_recessed')}
    _WORKER_PARTS = d.cube_instances(cubes)


def layer_sample(job):
    axis_i, side, angle = job
    axis = tuple(1 if i == axis_i else 0 for i in range(3))
    moving = [(n, s.rotate((0, 0, 0), axis, angle)) for n, k, s, p in _WORKER_PARTS
              if p[axis_i] == side and k != 'center_recessed']
    names = {n for n, _ in moving}
    fixed = [(n, s) for n, _, s, _ in _WORKER_PARTS if n not in names]
    return dict(axis=axis, side=side, angle_deg=angle, collisions=hits(moving, fixed))


def load_design():
    params = json.loads((d.OUT/'parameters.json').read_text(encoding='utf-8'))
    for k in d.P:
        d.P[k] = params[k]
    cubes, derived, _, modules, lock = d.make_design()
    exported = {p.stem: cq.importers.importStep(str(p)).val() for p in (d.OUT/'print').glob('*.step')}
    for n in cubes:
        cubes[n] = exported[n]
    for hollow, (heads, _) in modules.items():
        for n in heads:
            heads[n] = exported[n if n in d.SHARED else d.export_name(n, hollow)]
    for n in lock[0]:
        lock[0][n] = exported[n]
    return params, cubes, d.cube_instances(cubes), modules, lock, exported


def hits(left, right, same=False):
    """Broad phase cached per call; V2 overlap does the exact BRep boolean."""
    result = []
    def bounds(s):
        b = s.BoundingBox()
        return ((b.xmin, b.xmax), (b.ymin, b.ymax), (b.zmin, b.zmax))
    ll = [(n, s, bounds(s)) for n, s in left]
    rr = ll if same else [(n, s, bounds(s)) for n, s in right]
    pairs = itertools.combinations(ll, 2) if same else itertools.product(ll, rr)
    for (na, a, ba), (nb, b, bb) in pairs:
        if all(min(x[1], y[1])-max(x[0], y[0]) > 1e-5 for x, y in zip(ba, bb)):
            vol = overlap(a, b)
            if vol > TOL:
                result.append([na, nb, round(vol, 6)])
    return result


def main():
    params, cubes, parts, modules, lock, exported = load_design()
    failures = []
    report = dict(volume_tolerance_mm3=TOL, unique_cube_positions=len({p for _, _, _, p in parts}),
                  limitations='Discrete BRep samples, purchased envelopes; no printing, friction, deflection, load or continuous swept-volume validation.',
                  cube_layer_samples=[], flip_samples=[], module_poses=[], support_checks=[], kinematics=[])
    def record(label, collisions):
        failures.extend([[label, *hit] for hit in collisions])
        print(label, ':', len(collisions), 'collisions', flush=True)
        if collisions:
            print(json.dumps(collisions), flush=True)
        return collisions
    report['print_parts'] = {n: dict(valid=s.isValid(), solids=len(s.Solids())) for n, s in exported.items()}
    for n, r in report['print_parts'].items():
        if not r['valid'] or r['solids'] != 1:
            failures.append(['invalid_print_part', n, r])
    if report['unique_cube_positions'] != 27:
        failures.append(['unique_cube_positions', report['unique_cube_positions']])
    cube = [(n, s) for n, _, s, _ in parts]
    report['cube_assembled_collisions'] = record('cube assembled', hits(cube, cube, same=True))
    # Both signs of all three axes. Keyed U/D centres remain fixed to the core
    # during Y turns; their spherical track is the sliding interface.
    jobs = list(itertools.product(range(3), (-1, 1), range(15, 91, 15)))
    # OCC starts native threads before this point; Linux fork can deadlock its
    # inherited thread pool. Spawn gives each geometric worker a fresh runtime.
    with ProcessPoolExecutor(max_workers=3, mp_context=multiprocessing.get_context('spawn'), initializer=init_layer_worker) as pool:
        for sample in pool.map(layer_sample, jobs):
            record(f"layer {sample['axis']} {sample['side']} {sample['angle_deg']}", sample['collisions'])
            report['cube_layer_samples'].append(sample)
    loc = d.face_location_v4('D')
    bar = lock[1]['lock_bar'].moved(loc)
    report['lock_cube_collisions'] = record('engaged bar vs entire cube', hits([('lock_bar', bar)], cube))
    edges = [s for _, k, s, pos in parts if k == 'cube_edge' and pos[1] == -1]
    report['lock_to_D_edge_clearance_mm'] = min(bar.distance(s) for s in edges)
    report['nominal_lock_to_edge_wall_mm'] = (19.4-params['lock_bar_mm'])/2
    report['lock_to_hollow_diagonal_clearance_mm'] = (params['hollow_id_mm']-params['lock_bar_mm']*math.sqrt(2))/2
    # Axial: the engaged tip must stop short of the socket floor (and the M3
    # head under it). Nominal from the contract, then proven on the BRep by
    # pushing the bar further up: clear just below the nominal gap, touching
    # just beyond it. A dead-centre crank cannot absorb interference here.
    front = -params['cube_mm']/2+params['recess_depth_mm']
    axial = (front+params['lock_socket_depth_mm'])-params['lock_tip_y_mm']
    report['lock_axial_clearance_mm'] = axial
    centre_d = next(s for _, k, s, pos in parts if k == 'center_recessed' and pos[1] == -1)
    # The M3 socket head (purchased, DIN 912: 5.5 x 3) sits in the pocket with
    # its top flush with the socket floor; it is the real stop for the 4x4 flat
    # tip, which is smaller than the 6 mm pocket. Include its envelope.
    m3_head = d.cyl(5.5, front+params['lock_socket_depth_mm'], front+params['lock_socket_depth_mm']+3, (0, 1, 0))
    report['lock_axial_samples'] = []
    for extra, want_hit in ((axial-.05, False), (axial+.05, True)):
        raised = bar.translate((0, extra, 0))
        vol = overlap(raised, centre_d)+overlap(raised, m3_head)
        report['lock_axial_samples'].append(dict(bar_raised_mm=extra, overlap_mm3=round(vol, 6), expect_contact=want_hit))
        if (vol > TOL) != want_hit:
            failures.append(['lock_axial_clearance', extra, vol])
    print('lock axial clearance', axial, 'mm; samples', report['lock_axial_samples'], flush=True)
    report['lock_hollow_samples'] = []
    for shift in (0, 24):
        shaft = modules[True][1]['spindle_hollow_17x12'].translate((0, 0, shift)).moved(loc)
        collisions = record(f'bar vs hollow shift {shift}', hits([('lock_bar', bar)], [('hollow', shaft)]))
        report['lock_hollow_samples'].append(dict(shift_mm=shift, clearance_mm=bar.distance(shaft), collisions=collisions))
    # RL gripping heads rotate WITH the cube and are intentionally outside
    # this F/B/D withdrawal test, as specified in the brief.
    obstacles = []
    for face in ('F', 'B', 'D'):
        obstacles.extend((face+'/'+n, s.moved(d.face_location_v4(face)))
                         for n, s in d.module_pose(modules[face == 'D'], 24).items())
    obstacles.extend(('LOCK/'+n, s.moved(loc)) for n, s in d.lock_pose(lock, 30).items())
    for angle in range(0, 181, 15):
        rotated = [(n, s.rotate((0, 0, 0), (1, 0, 0), angle)) for n, s in cube]
        collisions = record(f'flip {angle}', hits(rotated, obstacles))
        report['flip_samples'].append(dict(angle_deg=angle, collisions=collisions))
    # Pin self-alignment (2026-10-24). In-plane capture = countersink radius
    # minus tip radius; the lever to a side socket is cube/2 (28.5), to a D
    # socket the pitch (19.1). BRep sample: cube shifted in x, pin tips 0.1 mm
    # below the face -> clear inside the capture, touching just outside it.
    cs, tipd, eng = params['socket_countersink_mm'], params['pin_tip_mm'], params['pin_engagement_mm']
    capture = (cs-tipd)/2
    report['pin_capture_mm'] = capture
    report['pin_capture_deg'] = dict(side=math.degrees(capture/(params['cube_mm']/2)), D=math.degrees(capture/params['pitch_mm']),
                                     bar_square_slop=math.degrees((params['lock_socket_mm']-params['lock_bar_mm'])/params['lock_bar_mm']))
    report['pin_capture_samples'] = []
    for face in ('F', 'D'):
        pins = [(face+'/'+n, s.translate((0, 0, eng-.1)).moved(d.face_location_v4(face)))
                for n, s in modules[face == 'D'][1].items() if n.startswith('pin_')]
        for dx, want_hit in ((capture-.4, False), (capture+.3, True)):
            shifted = [(n, s.translate((dx, 0, 0))) for n, s in cube]
            collisions = hits(pins, shifted)
            report['pin_capture_samples'].append(dict(face=face, cube_shift_x_mm=dx, expect_contact=want_hit, collisions=collisions))
            if bool(collisions) != want_hit:
                failures.append(['pin_capture', face, dx, collisions])
            print(f'pin capture {face} shift {dx:.2f}: {len(collisions)} collisions (expect {"hit" if want_hit else "clear"})', flush=True)
    # Layer turns against the modules in the pose the firmware actually uses
    # (mechanism.cpp prepare): F with F/B engaged, R with R/L engaged, and D
    # with the lock bar plus whichever side pair was left engaged. The turning
    # face's own module spins with the layer and is excluded. Found 2026-10-24:
    # D-layer corners (sweep r 38.65) hit 50x50 side plates at 33.5 mm.
    report['layer_turn_samples'] = []
    for face, axis_i, side, engaged in (('F', 2, 1, ('F', 'B')), ('R', 0, 1, ('R', 'L')),
                                        ('D', 1, -1, ('F', 'B', 'D')), ('D', 1, -1, ('R', 'L', 'D'))):
        axis = tuple(1 if i == axis_i else 0 for i in range(3))
        obstacles = []
        for other in d.FACES_V4:
            if other == face:
                continue
            obstacles.extend((other+'/'+n, s.moved(d.face_location_v4(other)))
                             for n, s in d.module_pose(modules[other == 'D'], 0 if other in engaged else 24).items())
        obstacles.extend(('LOCK/'+n, s.moved(loc)) for n, s in d.lock_pose(lock, 0).items())
        moving = [(n, s) for n, k, s, p in parts if p[axis_i] == side and k != 'center_recessed']
        label = face+' turn, '+'/'.join(engaged)+' engaged'
        for angle in range(15, 90, 15):
            rotated = [(n, s.rotate((0, 0, 0), axis, angle)) for n, s in moving]
            collisions = record(f'{label} {angle}', hits(rotated, obstacles))
            report['layer_turn_samples'].append(dict(face=face, engaged=list(engaged), angle_deg=angle, collisions=collisions))
    for pose in ('FB', 'RL', 'retracted'):
        groups = {}
        for n, _, s in d.assembly_items(parts, modules, lock, pose):
            group = n.split('/')[0]
            groups.setdefault(group, []).append((n, s))
        collisions = []
        for a, b in itertools.combinations((g for g in groups if g != 'cube'), 2):
            collisions.extend(hits(groups[a], groups[b]))
        for group in groups:
            if group != 'cube':
                collisions.extend(hits(groups[group], groups['cube']))
        report['module_poses'].append(dict(pose=pose, collisions=record('pose '+pose, collisions)))
    supports = [(f, modules[f == 'D'][0]['rail_support'].moved(d.face_location_v4(f))) for f in d.FACES_V4]
    report['support_checks'].append(dict(pose='all', collisions=record('five rail supports', hits(supports, supports, same=True))))
    for shift in (0, 30):
        unit = [(n, s.moved(loc)) for n, s in d.lock_pose(lock, shift).items()]
        report['support_checks'].append(dict(lock_shift_mm=shift, collisions=record(f'supports vs lock {shift}', hits(supports, unit))))
    for is_lock in (False, True):
        radius = params['lock_crank_r_mm'] if is_lock else params['crank_r_mm']
        axis_z = params['lock_servo_axis'][2] if is_lock else params['servo_axis'][2]
        for theta, expected in ((0, 204 if is_lock else 147), (180, 234 if is_lock else 171)):
            actual = d.slider_z(theta, radius, axis_z)
            error = abs(actual-expected)
            report['kinematics'].append(dict(unit='LOCK' if is_lock else 'head', theta_deg=theta, z_mm=actual, expected_mm=expected, error_mm=error))
            if error > .01:
                failures.append(['kinematics', is_lock, theta, error])
        # Also check actual crank/link bore-centre geometry at intermediate angles.
        for theta in range(0, 181, 15):
            a = math.radians(theta)
            ey = radius*math.sin(a)
            ez = axis_z-radius*math.cos(a)
            sz = d.slider_z(theta, radius, axis_z)
            if abs(math.hypot(ey, ez-sz)-params['link_mm']) > .01:
                failures.append(['link_length', is_lock, theta])
    report['sample_counts'] = dict(cube_pairs=27*26//2, layer_poses=len(report['cube_layer_samples']), flip_poses=len(report['flip_samples']),
                                   layer_turn_poses=len(report['layer_turn_samples']), module_poses=len(report['module_poses']))
    report['failure_count'] = len(failures)
    report['failures'] = failures
    report['passed'] = not failures
    (d.OUT/'mechanical_checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS' if report['passed'] else f'FAIL: {len(failures)} collisions/errors', flush=True)
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
