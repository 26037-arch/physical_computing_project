"""Mechanical checks using actual generated STEP solids, not visual animation.

Samples of the cubie sweep are not proof of continuous collision freedom.
Pin/plate press fits are intentional; cross-module intersections are not.
"""
import itertools
import json
from pathlib import Path

import cadquery as cq
import build_robot_v2 as d


def bb_overlap(a, b):
    x, y = a.BoundingBox(), b.BoundingBox()
    return all(min(u, v) - max(i, j) > 1e-5 for i, u, j, v in
               [(x.xmin, x.xmax, y.xmin, y.xmax), (x.ymin, x.ymax, y.ymin, y.ymax), (x.zmin, x.zmax, y.zmin, y.zmax)])


def overlap(a, b):
    return a.intersect(b).Volume() if bb_overlap(a, b) else 0.0


def main():
    params = json.loads((d.OUT / 'parameters.json').read_text())
    d.P.update({k: params[k] for k in d.P})
    cubes = {name: cq.importers.importStep(str(d.OUT / 'cube' / (name + '.step'))).val()
             for name in ('cube_core', 'cube_center', 'cube_edge', 'cube_corner')}
    parts = d.cube_instances(cubes)
    failures = []
    report = dict(unique_cube_positions=len({p for _, _, _, p in parts}),
                  cube_samples=[], head_poses=[], volume_tolerance_mm3=0.01,
                  limitations='Discrete CAD checks only; printing, friction, deflection, fasteners and loaded motion unverified')
    for a, b in itertools.combinations(parts, 2):
        vol = overlap(a[2], b[2])
        if vol > 0.01:
            failures.append(['cube_assembled', a[0], b[0], round(vol, 4)])
    print('Assembled cube checked:', len(failures), 'intersections', flush=True)
    moving = [(n, s) for n, _, s, p in parts if p[2] == 1]
    fixed = [(n, s) for n, _, s, p in parts if p[2] != 1]
    for angle in (30, 45, 60, 90):
        hits = []
        for name, shape in moving:
            rotated = shape.rotate((0, 0, 0), (0, 0, 1), angle)
            for other, stationary in fixed:
                vol = overlap(rotated, stationary)
                if vol > 0.01:
                    hits.append([name, other, round(vol, 4)])
        report['cube_samples'].append(dict(angle_deg=angle, collisions=hits))
        failures.extend([['cube_sweep', angle, *hit] for hit in hits])
        print('Cube turn', angle, 'degrees:', len(hits), 'intersections', flush=True)
    # Module placement: all six inserted for transfer, then only F/B inserted.
    heads, hardware = d.head_parts(params['pitch_mm'])
    items = {**heads, **hardware}
    stationary_names = {'rail_support', 'rail_MGN12', 'feed_screw_M5'}
    for pose in ('handoff_all_inserted', 'F_B_inserted'):
        placed = {}
        for face in d.FACES:
            shift = 0 if pose == 'handoff_all_inserted' or face in ('F', 'B') else d.P['retract_mm']
            placed[face] = [(name, s.translate((0, 0, 0 if name in stationary_names else shift)).moved(d.face_location(face)))
                            for name, s in items.items()]
        hits = []
        for fa, fb in itertools.combinations(d.FACES, 2):
            for (na, a), (nb, b) in itertools.product(placed[fa], placed[fb]):
                vol = overlap(a, b)
                if vol > 0.01:
                    hits.append([fa, na, fb, nb, round(vol, 4)])
        report['head_poses'].append(dict(pose=pose, collisions=hits))
        failures.extend([['heads', pose, *hit] for hit in hits])
        print('Heads', pose, ':', len(hits), 'intersections', flush=True)
    report['passed'] = not failures and report['unique_cube_positions'] == 27
    report['failures'] = failures
    (d.OUT / 'mechanical_checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if not report['passed']:
        raise SystemExit('Mechanical CAD check failed; see models/robot_v2/mechanical_checks.json')
    print('Mechanical CAD samples passed; physical validation still required.', flush=True)


if __name__ == '__main__':
    main()
