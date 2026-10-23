"""Generate a printable cube and a retracting, pin-driven robot prototype.

Requires cadquery 2.7. All geometry is in mm. Outputs real BRep STEP and binary
STL; Fusion imports STEP with fusion/scripts/import_robot_v2.py via the MCP.
Cube retention geometry is adapted from Jared Deckard's MIT-licensed model;
see models/robot_v2/THIRD_PARTY_LICENSE.md. This is an unprinted prototype.
"""
import argparse
import itertools
import json
import math
from pathlib import Path

import cadquery as cq

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'robot_v2'
P = dict(cube_mm=57.0, piece_gap_mm=0.30, bevel_mm=4.0,
         plate_thickness_mm=6.0, pin_mm=3.0, socket_mm=3.4,
         socket_depth_mm=4.2, pin_engagement_mm=3.0, retract_mm=24.0)


def box(x, y, z, center):
    return cq.Workplane('XY').box(x, y, z).val().translate(center)


def cyl(d, a, b, axis=(0, 0, 1), origin=(0, 0, 0)):
    start = tuple(origin[i] + a * axis[i] for i in range(3))
    return cq.Solid.makeCylinder(d / 2, b - a, start, axis)


def ball(r):
    return cq.Solid.makeSphere(r, angleDegrees1=-90, angleDegrees2=90)


def rounded(size, r, center):
    if isinstance(size, (int, float)):
        size = (size,) * 3
    # OpenSCAD's limiting capsule is approximated within 0.01 mm.
    r = min(r, min(size) / 2 - 0.01)
    return cq.Workplane('XY').box(*size).edges().fillet(r).val().translate(center)


def fuse(*parts):
    s = parts[0]
    for other in parts[1:]:
        s = s.fuse(other)
    return s.clean()


def cube_parts():
    w, g, b, t = (P[k] for k in ('cube_mm', 'piece_gap_mm', 'bevel_mm', 'plate_thickness_mm'))
    p = (w - 2 * g) / 3
    pitch, skid, r = p + g, p / 2 - 2 * g, 1.25 * p
    length = p / 2 + skid / 2 + g
    core_r = r - t - g
    core = ball(core_r)
    for axis in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
        core = core.cut(cyl(2.5, core_r - 10, core_r + 1, axis))
        core = core.cut(cyl(4.6, core_r - 4.5, core_r + 1, axis))
    corner = fuse(
        rounded(p, b, (pitch, pitch, -pitch)).cut(ball(r - t / 2)),
        ball(r).intersect(rounded(p, b, (length, length, -length))).cut(ball(r - t)))
    edge = fuse(
        rounded(p, b, (0, pitch, -pitch)).cut(ball(r + g)),
        ball(r).intersect(rounded((skid, p, p), b, (0, length, -length))).cut(ball(r - t)),
        ball(r + 2 * g).intersect(box(skid / 2, p, p, (0, pitch + b, -pitch - b))).cut(ball(r - t / 2)))
    # A socket on each of the edge's two exposed faces. Pins drive the edge,
    # and the cube's captive tracks carry its corners with the turning layer.
    for axis, origin in (((0, 0, 1), (0, pitch, -w / 2)), ((0, -1, 0), (0, w / 2, -pitch))):
        edge = edge.cut(cyl(P['socket_mm'], -0.2, P['socket_depth_mm'], axis, origin))
        edge = edge.cut(cq.Solid.makeCone(2.2, P['socket_mm'] / 2, 0.6, origin, axis))
    center = fuse(
        rounded((p, p, 2 * b), b, (0, 0, -w / 2 + b)).cut(ball(r + g)),
        cyl(skid, -w / 2, 0).cut(ball(r - t)))
    center = center.cut(cyl(3.4, -w / 2 - 1, 0))
    center = center.cut(cyl(7.0, -w / 2 - 0.1, -w / 2 + 6.5))
    # A coupon checks socket clearance before all twelve edges are printed.
    coupon = box(42, 16, 8, (0, 0, 4))
    for x, d in zip((-14, 0, 14), (3.2, 3.4, 3.6)):
        coupon = coupon.cut(cyl(d, 3.8, 9, origin=(x, 0, 0)))
    return dict(cube_core=core.clean(), cube_center=center.clean(),
                cube_edge=edge.clean(), cube_corner=corner.clean(),
                socket_coupon=coupon.clean()), dict(piece_mm=p, pitch_mm=pitch,
                track_outer_r_mm=r, track_inner_r_mm=r-t, core_r_mm=core_r)


def head_parts(pitch):
    # Local +Z points away from the cube; z=0 is its outer face.
    # A 5 mm air gap keeps the stationary center and screw accessible.
    plate = box(50, 50, 6, (0, 0, 8))  # z = 5..11
    plate = plate.cut(cyl(22, 4, 12))
    # Four corner stops locate the cube axially. A nominal 1 mm silicone pad
    # compresses to 0.8 mm; torque is carried by steel pins, not pad friction.
    for x, y in itertools.product((-pitch, pitch), repeat=2):
        plate = plate.fuse(box(8, 8, 4.2, (x, y, 2.9)))
    for x, y in itertools.product((-10, 10), repeat=2):
        plate = plate.cut(cyl(3.4, 4, 12, origin=(x, y, 0)))
        plate = plate.cut(cyl(6.2, 4.9, 7, origin=(x, y, 0)))
    pin_positions = [(pitch, 0), (-pitch, 0), (0, pitch), (0, -pitch)]
    for x, y in pin_positions:
        # Ream to the actual dowel fit; do not assume printed press fits.
        plate = plate.cut(cyl(2.9, 4, 12, origin=(x, y, 0)))
    hub = fuse(box(32, 32, 5, (0, 0, 13.5)), cyl(24, 16, 28))
    hub = hub.cut(cyl(8.15, 10, 29))
    for x, y in itertools.product((-10, 10), repeat=2):
        hub = hub.cut(cyl(4.6, 10.9, 15.1, origin=(x, y, 0)))
        hub = hub.cut(cyl(3.2, 15.1, 17, origin=(x, y, 0)))
    for axis in ((1, 0, 0), (0, 1, 0)):
        hub = hub.cut(cyl(4.3, 0, 13, axis, (0, 0, 22)))
        hub = hub.cut(cyl(5.6, 7, 13, axis, (0, 0, 22)))
    # F8-16M thrust bearing z=28..33; two 608 bearings z=35..42,45..52.
    housing = fuse(box(34, 34, 17, (0, 0, 43.5)),
                   box(34, 9, 17, (0, -21.5, 43.5)),
                   box(60, 6, 17, (0, -29, 43.5)))
    housing = housing.cut(cyl(9.2, 34, 53))
    housing = housing.cut(cyl(22.15, 34.9, 42))
    housing = housing.cut(cyl(22.15, 45, 52.1))
    caps = {}
    for name, z in [('bearing_front_cap', 34), ('bearing_rear_cap', 53)]:
        s = box(34, 34, 2, (0, 0, z)).cut(cyl(9.2, z-2, z+2))
        for x, y in itertools.product((-13, 13), repeat=2):
            s = s.cut(cyl(3.4, z-2, z+2, origin=(x, y, 0)))
        caps[name] = s.clean()
    for x, y in itertools.product((-13, 13), repeat=2):
        housing = housing.cut(cyl(2.5, 34, 53, origin=(x, y, 0)))
        housing = housing.cut(cyl(4.6, 34.9, 39, origin=(x, y, 0)))
        housing = housing.cut(cyl(4.6, 48, 52.1, origin=(x, y, 0)))
    for x, z in itertools.product((-24, 24), (38.5, 48.5)):
        housing = housing.cut(cyl(3.4, -33, -25, (0, 1, 0), (x, 0, z)))
    # Moving base is bolted to an MGN12H block. Its side lug accepts an M5
    # feed screw and a captive nut for the first, manually indexed prototype.
    carriage = fuse(box(60, 6, 120, (0, -35, 92)),
                    box(60, 58, 6, (0, -3, 101)),
                    box(12, 19, 10, (22, -41.5, 147)))
    carriage = carriage.cut(cyl(23, 97, 105))
    for x, y in itertools.product((-15.5, 15.5), repeat=2):
        carriage = carriage.cut(cyl(3.4, 97, 105, origin=(x, y, 0)))
    for x, z in itertools.product((-10, 10), (74, 94)):
        carriage = carriage.cut(cyl(3.4, -39, -31, (0, 1, 0), (x, 0, z)))
    for x, z in itertools.product((-24, 24), (38.5, 48.5)):
        carriage = carriage.cut(cyl(3.4, -39, -31, (0, 1, 0), (x, 0, z)))
    carriage = carriage.cut(cyl(5.5, 140, 154, origin=(22, -44, 0)))
    nut = cq.Workplane('XY').polygon(6, 9.6).extrude(4.4).val().translate((22, -44, 142))
    carriage = carriage.cut(nut)
    # Correct MGN12 total mounting height: rail base -51, carriage top -38.
    support = fuse(box(60, 6, 190, (0, -54, 95)),
                   box(14, 25, 6, (22, -44.5, 183)))
    for z in range(15, 176, 25):
        support = support.cut(cyl(3.4, -58, -50, (0, 1, 0), (0, 0, z)))
    for x, z in itertools.product((-24, 24), (8, 174)):
        support = support.cut(cyl(5.4, -58, -50, (0, 1, 0), (x, 0, z)))
    support = support.cut(cyl(5.5, 179, 187, origin=(22, -44, 0)))
    spindle = cyl(8, 16, 83)
    pins = {f'pin_{i}': cyl(3, -3, 13, origin=(x, y, 0)) for i, (x, y) in enumerate(pin_positions)}
    pads = {f'axial_pad_{i}': box(8, 8, 0.8, (x, y, 0.4))
            for i, (x, y) in enumerate(itertools.product((-pitch, pitch), repeat=2))}
    radial = {f'bearing_608_{i}': cyl(22, a, a+7).cut(cyl(8.05, a-1, a+8)) for i, a in enumerate((35, 45))}
    thrust = cyl(16, 28, 33).cut(cyl(8.05, 27, 34))
    coupling = cyl(19, 70, 95).cut(cyl(8.1, 69, 83)).cut(cyl(5.1, 84, 96))
    motor = fuse(box(42.3, 42.3, 40, (0, 0, 124)), cyl(22, 102, 104))
    motor = motor.cut(cyl(5.1, 101, 105))
    motor_shaft = cyl(5, 84, 104)
    rail = box(12, 8, 180, (0, -47, 95))
    block = box(27, 11, 45.4, (0, -43.5, 84))
    block = block.cut(box(12.4, 6.2, 47, (0, -46, 84)))
    screw = cyl(5, 135, 218, origin=(22, -44, 0))
    return dict(drive_plate=plate.clean(), shaft_hub=hub.clean(),
                bearing_housing=housing.clean(), carriage=carriage.clean(),
                rail_support=support.clean(), **caps), dict(
                spindle_8mm=spindle, **pins, **pads, **radial, thrust_F8_16M=thrust,
                coupling_5x8=coupling, motor_NEMA17=motor, motor_shaft=motor_shaft,
                rail_MGN12=rail, block_MGN12H=block.clean(), feed_screw_M5=screw)


COLORS = dict(cube_core='#777777', cube_center='#dddddd', cube_edge='#f1a938',
              cube_corner='#46a8ba', drive_plate='#34659a', shaft_hub='#7998b8',
              bearing_housing='#aab3bd', carriage='#7d8898', rail_support='#4a525f')
FACES = dict(U=((0, 1, 0), (0, 0, -1)), D=((0, -1, 0), (0, 0, -1)),
             R=((1, 0, 0), (0, -1, 0)), L=((-1, 0, 0), (0, -1, 0)),
             F=((0, 0, 1), (-1, 0, 0)), B=((0, 0, -1), (-1, 0, 0)))


def color(name):
    return cq.Color(COLORS.get(name, '#b8bdc5'))


def face_location(face):
    n, x = FACES[face]
    origin = tuple(v * P['cube_mm'] / 2 for v in n)
    return cq.Location(cq.Plane(origin=origin, xDir=x, normal=n))


def cube_instances(parts):
    result = [('core', 'cube_core', parts['cube_core'], (0, 0, 0))]
    # The source templates face -Z, with corners at (+,+,-), edges at (0,+,-).
    corner_angles = [(0, 0, z) for z in range(0, 360, 90)] + [(180, 0, z) for z in range(0, 360, 90)]
    edge_angles = [(0, 0, z) for z in range(0, 360, 90)] + [(0, 90, z) for z in range(0, 360, 90)] + [(90, 0, z) for z in range(0, 360, 90)]
    center_angles = [(0, 0, 0), (180, 0, 0), (90, 0, 0), (-90, 0, 0), (0, 90, 0), (0, -90, 0)]
    for kind, angles in [('corner', corner_angles), ('edge', edge_angles), ('center', center_angles)]:
        for i, ang in enumerate(angles):
            s = parts['cube_' + kind]
            for axis, a in zip(((1, 0, 0), (0, 1, 0), (0, 0, 1)), ang):
                if a:
                    s = s.rotate((0, 0, 0), axis, a)
            # Use its outer bounding box to classify the cubie, not its curved foot.
            bb = s.BoundingBox()
            threshold = P['cube_mm'] / 2 - 0.01
            pos = tuple(1 if hi > threshold else -1 if lo < -threshold else 0 for lo, hi in ((bb.xmin, bb.xmax), (bb.ymin, bb.ymax), (bb.zmin, bb.zmax)))
            result.append((f'{kind}_{i:02}', 'cube_' + kind, s, pos))
    assert len({pos for _, _, _, pos in result}) == 27, 'All 26 cubies and the core must occupy unique locations'
    return result


def export_shape(name, s, folder):
    folder.mkdir(parents=True, exist_ok=True)
    # Place each print file on z=0; STEP part files retain assembly coordinates.
    bb = s.BoundingBox()
    flat = s.translate((-(bb.xmin+bb.xmax)/2, -(bb.ymin+bb.ymax)/2, -bb.zmin))
    flat.exportStl(str(folder / (name + '.stl')), tolerance=0.05, angularTolerance=0.12)
    cq.exporters.export(s, str(folder / (name + '.step')))


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    cubes, derived = cube_parts()
    heads, bought = head_parts(derived['pitch_mm'])
    report = {'parameters': P, 'derived': derived, 'parts': {},
              'status': 'CAD prototype; Fusion import and physical printing not yet verified'}
    for name, s in {**cubes, **heads}.items():
        solids = s.Solids()
        if not s.isValid() or len(solids) != 1:
            raise RuntimeError(f'{name}: invalid or disconnected: {len(solids)} solids')
        bb = s.BoundingBox()
        report['parts'][name] = {'valid': True, 'solids': len(solids), 'volume_mm3': round(s.Volume(), 2),
                                 'size_mm': [round(bb.xlen, 3), round(bb.ylen, 3), round(bb.zlen, 3)]}
        export_shape(name, s, OUT / ('cube' if name.startswith(('cube_', 'socket_')) else 'head'))
    instances = cube_instances(cubes)
    cube = cq.Assembly(name='PrintableCubeV2')
    for name, kind, s, _ in instances:
        cube.add(s, name=name, color=color(kind))
    cube.save(str(OUT / 'printable_cube.step'))
    cube.save(str(OUT / 'printable_cube.glb'))
    robot = cq.Assembly(name='RobotV2_F_turn')
    robot.add(cube, name='cube')
    head = cq.Assembly(name='OneFaceModule')
    for name, s in {**heads, **bought}.items():
        head.add(s, name=name, color=color(name))
    head.save(str(OUT / 'one_face_module.step'))
    head.save(str(OUT / 'one_face_module.glb'))
    fixed = {'rail_support', 'rail_MGN12', 'feed_screw_M5'}
    for face in FACES:
        sub = cq.Assembly(name=face)
        retraction = 0 if face in ('F', 'B') else P['retract_mm']
        for name, s in {**heads, **bought}.items():
            sub.add(s, name=name, color=color(name), loc=cq.Location((0, 0, 0 if name in fixed else retraction)))
        robot.add(sub, name='head_' + face, loc=face_location(face))
    robot.save(str(OUT / 'robot_assembly.step'))
    robot.save(str(OUT / 'robot_assembly.glb'))
    report['clearance'] = {
        'inactive_head_to_cube_swept_envelope_mm': round(P['cube_mm']/2+P['retract_mm']-3-math.sqrt(2)*P['cube_mm']/2, 3),
        'pin_tip_to_socket_bottom_mm': round(P['socket_depth_mm']-P['pin_engagement_mm'], 3),
        'nominal_pin_radial_clearance_mm': (P['socket_mm']-P['pin_mm'])/2}
    (OUT / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (OUT / 'parameters.json').write_text(json.dumps({**P, **derived}, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)
    return cubes, heads, bought, instances


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cube-mm', type=float, default=57)
    parser.add_argument('--gap-mm', type=float, default=0.30)
    args = parser.parse_args()
    if not 55 <= args.cube_mm <= 60 or not 0.15 <= args.gap_mm <= 0.50:
        parser.error('Prototype supports cube 55..60 mm and gap 0.15..0.50 mm.')
    P.update(cube_mm=args.cube_mm, piece_gap_mm=args.gap_mm)
    build()
