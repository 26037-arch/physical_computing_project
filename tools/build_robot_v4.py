"""V4 CadQuery prototype, mm; V2 retention tracks and V3 offset belt drive.

Only models/robot_v4 is written. STEP keeps assembly coordinates; STL is
translated (never rotated) to its XY centre and z=0. Purchased shapes are
clearance envelopes, not supplier drawings. No physical validation implied.
"""
import argparse
import itertools
import json
import math
from pathlib import Path

import cadquery as cq
import build_robot_v2 as v2
import build_robot_v3 as v3

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'robot_v4'
box, cyl, ball, rounded, fuse = v2.box, v2.cyl, v2.ball, v2.rounded, v2.fuse
P = dict(v2.P, lock_bar_mm=8., lock_socket_mm=8.4, lock_stroke_mm=30.,
         lock_crank_r_mm=15., lock_length_mm=230., recess_depth_mm=2.,
         lock_tip_y_mm=-23.5,
         hollow_id_mm=12., hollow_od_mm=17., hollow_length_mm=82.,
         crank_r_mm=12., link_mm=36., servo_axis=[22., -44., 195.],
         rail_front_chamfer_mm=1.6,
         lock_servo_axis=[22., 24., 255.], pin_positions=[[0., 19.1], [0., -19.1]])
FACES_V4 = dict(F=((0, 0, 1), (0, 1, 0)), R=((1, 0, 0), (0, 1, 0)),
                B=((0, 0, -1), (0, 1, 0)), L=((-1, 0, 0), (0, 1, 0)),
                D=((0, -1, 0), (1, 0, 0)))


def face_location_v4(face):
    n, x = FACES_V4[face]
    return cq.Location(cq.Plane(origin=tuple(v * P['cube_mm']/2 for v in n), xDir=x, normal=n))


def cube_parts():
    parts, derived = v2.cube_parts()
    # Holes are WORLD U/D. Only the recessed centre template faces -Z.
    for sign in (-1, 1):
        parts['cube_core'] = parts['cube_core'].cut(box(8.3, 9, 8.3, (0, sign*15.5, 0)))
    # See HARDWARE_V4 section 2: an 8-mm recess cuts through V2 retention feet.
    # Retain the V2 track envelope, a 2-mm recess and a rotationally symmetric
    # plate rim so the U/D centre may remain keyed during a Y-layer turn.
    front = -P['cube_mm']/2 + P['recess_depth_mm']
    plate = rounded((18.8, 18.8, 8), 4, (0, 0, -24.5)).cut(ball(23.8))
    plate = plate.intersect(cyl(18.8, front, front+3))
    neck = cyl(8.8, front, 0).cut(ball(derived['track_inner_r_mm']))
    stem = box(8, 8, 6, (0, 0, -15)).intersect(ball(17.2))
    center = fuse(plate, neck, stem, cyl(8, -18, -12))
    center = center.cut(box(8.4, 8.4, 3.01, (0, 0, front+1.495)))
    center = center.cut(cyl(3.4, front-1, -11))
    # Keep the M3 head BELOW the lock-socket floor, otherwise it obstructs
    # the square bar. V2's 7-mm head clearance is retained, 3 mm deep here.
    center = center.cut(cyl(7, front+2.99, front+6))
    parts['center_recessed'] = center.clean()
    parts['cube_core'] = parts['cube_core'].clean()
    return parts, derived


def cube_instances(parts):
    # Classify with the full V2 template BEFORE replacing the U/D caps.
    result = []
    for name, kind, shape, pos in v2.cube_instances(parts):
        if kind == 'cube_center' and pos[1]:
            kind = 'center_recessed'
            shape = parts[kind].rotate((0, 0, 0), (1, 0, 0), 90 if pos[1] > 0 else -90)
        result.append((name, kind, shape, pos))
    return result


def drive_plate(pitch):
    plate = box(50, 50, 6, (0, 0, 8)).cut(cyl(22, 4, 12))
    for x, y in itertools.product((-pitch, pitch), repeat=2):
        plate = plate.fuse(box(8, 8, 4.2, (x, y, 2.9)))
    for x, y in itertools.product((-10, 10), repeat=2):
        plate = plate.cut(cyl(3.4, 4, 12, origin=(x, y, 0)))
        plate = plate.cut(cyl(6.2, 4.9, 7, origin=(x, y, 0)))
    for x, y in P['pin_positions']:
        plate = plate.cut(cyl(2.9, 4, 12, origin=(x, y, 0)))
    return plate.clean()


def servo_mount():
    # Output shaft is near the FRONT of the body, not at its Z centre.
    s = fuse(box(49, 28, 4, (-4, -44, 228)),
             box(49, 3, 44, (-4, -55.5, 206)),
             box(49, 3, 44, (-4, -32.5, 206)))
    for y in (-55.5, -32.5):
        for x in (-20, 12):
            s = s.cut(cyl(3.4, 182, 231, origin=(x, y, 0)))
    return s.clean()


def arm(length, width, thickness, x, y, z):
    # Capsule in the YZ plane, along -Z; pin bores parallel to local X.
    s = fuse(box(thickness, width, length, (x, y, z-length/2)),
             cyl(width, x-thickness/2, x+thickness/2, (1, 0, 0), (0, y, z)),
             cyl(width, x-thickness/2, x+thickness/2, (1, 0, 0), (0, y, z-length)))
    for zz in (z, z-length):
        s = s.cut(cyl(3.2, x-thickness, x+thickness, (1, 0, 0), (0, y, zz)))
    return s.clean()


def slider_z(theta, radius=12., axis_z=195.):
    a = math.radians(theta)
    return axis_z-radius*math.cos(a)-math.sqrt(P['link_mm']**2-(radius*math.sin(a))**2)


def crank_link(theta=0, lock=False):
    radius = P['lock_crank_r_mm'] if lock else P['crank_r_mm']
    x, y, z = P['lock_servo_axis'] if lock else P['servo_axis']
    crank = arm(radius, 6, 4, x+4, y, z).rotate((0, y, z), (1, y, z), theta)
    a = math.radians(theta)
    ey, ez = y+radius*math.sin(a), z-radius*math.cos(a)
    sz = slider_z(theta, radius, z)
    link = arm(P['link_mm'], 8, 4, x+9, ey, ez)
    angle = math.degrees(math.atan2(ey-y, ez-sz))
    link = link.rotate((0, ey, ez), (1, ey, ez), -angle)
    return crank, link


def carriage_boss(car):
    # Replace, rather than fill, the original M5 pocket and lug.
    car = car.cut(box(40, 25, 13, (22, -44.5, 147)))
    car = fuse(car, box(60, 6, 13, (0, -35, 145.5)),
               box(12, 19, 10, (22, -41.5, 147)),
               cyl(10, 16, 29, (1, 0, 0), (0, -44, 147)))
    return car.cut(cyl(3, 15, 34, (1, 0, 0), (0, -44, 147))).clean()


def module_design(hollow=False):
    # V3 remains the source of the offset motor, belt and slotted shelf.
    heads, hardware = v3.module_design(True) if hollow else v2.head_parts(19.1)
    heads = {k: s for k, s in heads.items() if k not in ('nut_cover', 'index_pin_bracket')}
    hardware = {k: s for k, s in hardware.items()
                if not k.startswith(('feed_', 'index_', 'handwheel_', 'profile_bolt_'))}
    hardware = {k: s for k, s in hardware.items() if not k.startswith('pin_')}
    hardware.update({f'pin_{i}': cyl(3, -3, 13, origin=(x, y, 0))
                     for i, (x, y) in enumerate(P['pin_positions'])})
    heads.pop('drive_plate')
    heads['drive_plate_2pin'] = drive_plate(19.1)
    heads['carriage'] = carriage_boss(heads['carriage'])
    support = box(60, 6, 190, (0, -54, 95))
    # D and R front corners overlap by 1.5 x 1.5 x 6 without this relief.
    c = P['rail_front_chamfer_mm']
    for sign in (-1, 1):
        corner = cq.Workplane('XZ', origin=(0, -50, 0)).polyline(
            [(sign*30, 0), (sign*(30-c), 0), (sign*30, c)]).close().extrude(8).val()
        support = support.cut(corner)
    # Servo body clearance in the rear of the support (axis stays per contract).
    support = support.cut(box(43.9, 22, 43, (-3.5, -44, 205.3)))
    for z in range(15, 176, 25):
        support = support.cut(cyl(3.4, -58, -50, (0, 1, 0), (0, 0, z)))
    for x, z in itertools.product((-24, 24), (8, 174)):
        support = support.cut(cyl(5.4, -58, -50, (0, 1, 0), (x, 0, z)))
    heads['rail_support'] = support.clean()
    heads['servo_mount'] = servo_mount()
    heads['crank'], heads['link'] = crank_link()
    hardware['servo_MG996R'] = box(42.9, 19.7, 40.7, (-3.5, -44, 205.3))
    hardware['servo_output'] = cyl(6, 17.95, 24, (1, 0, 0), (0, -44, 195))
    hardware['engage_switch'] = box(12.8, 6.5, 5.8, (22, -47.75, 154.9))
    if hollow:
        heads['shaft_hub'] = heads['shaft_hub'].cut(cyl(17.15, 10, 29)).clean()
        h = fuse(box(44, 44, 23, (0, 0, 46.5)),
                 box(44, 10, 23, (0, -27, 46.5)), box(60, 6, 23, (0, -29, 46.5)))
        h = h.cut(cyl(18.2, 34, 59)).cut(cyl(35.15, 34.9, 45)).cut(cyl(35.15, 48, 58.1))
        for x, y in itertools.product((-17, 17), repeat=2):
            h = h.cut(cyl(2.5, 34, 59, origin=(x, y, 0)))
        heads['bearing_housing'] = h.clean()
        for name, z in (('bearing_front_cap', 34), ('bearing_rear_cap', 59)):
            s = box(44, 44, 2, (0, 0, z)).cut(cyl(18.2, z-2, z+2))
            for x, y in itertools.product((-17, 17), repeat=2):
                s = s.cut(cyl(3.4, z-2, z+2, origin=(x, y, 0)))
            heads[name] = s.clean()
        hardware = {k: s for k, s in hardware.items()
                    if not k.startswith(('spindle_hollow_', 'bearing_6001_', 'front_thrust_', 'rear_thrust_'))}
        hardware['spindle_hollow_17x12'] = cyl(17, 16, 98).cut(cyl(12, 15, 99))
        for i, z in enumerate((35, 48)):
            hardware[f'bearing_6003_{i}'] = cyl(35, z, z+10).cut(cyl(17.05, z-1, z+11))
        for name, a, b in (('front', 28, 33), ('rear', 60, 65)):
            hardware[name+'_thrust_17x30'] = cyl(30, a, b).cut(cyl(17.05, a-1, b+1))
        hardware['pulley_40T_driven'] = hardware['pulley_40T_driven'].cut(cyl(17.05, 75, 95))
    return heads, hardware


def lock_design():
    # Local D z=-5 is world y=-23.5. Chamfer ONLY the leading end.
    tip = -P['lock_tip_y_mm']-P['cube_mm']/2
    bar = cq.Workplane('XY').box(8, 8, P['lock_length_mm']).faces('<Z').edges().chamfer(1).val().translate((0, 0, tip+P['lock_length_mm']/2))
    guide = fuse(box(24, 24, 12, (0, 0, 180)), box(24, 24, 12, (0, 0, 190)),
                 box(6, 24, 65, (-15, 0, 206.5)),
                 box(22, 63, 6, (-23, -19.5, 236)),
                 box(4, 6, 54, (-32, -48, 212)),
                 box(4, 6, 5, (-28, -48, 187.5)),
                 box(36, 3, 57, (0, 39.5, 261.5)),
                 box(6, 41, 6, (-15, 20.5, 236)))
    for z in (180, 190):
        guide = guide.cut(box(8.3, 8.3, 14, (0, 0, z)))
    # Clamp grips the bar below the lower guide, translated with the slider.
    carriage = fuse(box(18, 18, 10, (0, 0, 204)), box(8, 31, 8, (0, 11.5, 204)),
                    box(26, 10, 8, (9, 24, 204)),
                    cyl(10, 16, 29, (1, 0, 0), (0, 24, 204)))
    carriage = carriage.cut(box(8.1, 8.1, 12, (0, 0, 204)))
    carriage = carriage.cut(cyl(3, 15, 34, (1, 0, 0), (0, 24, 204)))
    carriage = carriage.cut(cyl(2.5, 3, 11, (1, 0, 0), (0, 0, 204)))
    crank, link = crank_link(lock=True)
    heads = dict(lock_guide=guide.clean(), lock_carriage=carriage.clean(),
                 lock_servo_mount=servo_mount().translate((0, 68, 60)),
                 lock_crank=crank, lock_link=link)
    hardware = dict(lock_bar=bar, lock_servo_MG996R=box(42.9, 19.7, 40.7, (-3.5, 24, 265.3)),
                    lock_engage_switch=box(12.8, 6.5, 5.8, (22, 14.75, 211.9)))
    return heads, hardware


FIXED = {'rail_support', 'servo_mount', 'rail_MGN12', 'servo_MG996R', 'servo_output', 'engage_switch'}
LOCK_FIXED = {'lock_guide', 'lock_servo_mount', 'lock_servo_MG996R', 'lock_engage_switch'}


def module_pose(module, shift):
    heads, hardware = module
    crank, link = crank_link(180 if shift else 0)
    return {n: crank if n == 'crank' else link if n == 'link' else
            s.translate((0, 0, 0 if n in FIXED else shift)) for n, s in {**heads, **hardware}.items()}


def lock_pose(unit, shift):
    heads, hardware = unit
    crank, link = crank_link(180 if shift else 0, lock=True)
    return {n: crank if n == 'lock_crank' else link if n == 'lock_link' else
            s.translate((0, 0, 0 if n in LOCK_FIXED else shift)) for n, s in {**heads, **hardware}.items()}


def make_design():
    cubes, derived = cube_parts()
    return cubes, derived, cube_instances(cubes), {False: module_design(), True: module_design(True)}, lock_design()


def printable_parts(cubes, modules, lock):
    qty = dict(cube_core=1, cube_center=4, center_recessed=2, cube_edge=12, cube_corner=8, socket_coupon=1)
    parts = {n: (s, qty[n]) for n, s in cubes.items()}
    shared = {'drive_plate_2pin', 'rail_support', 'servo_mount', 'crank', 'link'}
    for hollow, (heads, _) in modules.items():
        for n, s in heads.items():
            if n in shared:
                if not hollow:
                    parts[n] = (s, 5)
            else:
                parts[export_name(n, hollow)] = (s, 1 if hollow else 4)
    for n, s in lock[0].items():
        parts[n] = (s, 1)
    return parts


def export_name(name, hollow):
    return name if name == 'shaft_hub' and not hollow else name+('_hollow' if hollow else '_direct')


def assembly_items(instances, modules, lock, pose='FB'):
    for n, kind, s, pos in instances:
        yield 'cube/'+n, kind, s
    for face in FACES_V4:
        engaged = face in ('F', 'B', 'D') if pose == 'FB' else face in ('R', 'L', 'D') if pose == 'RL' else False
        for n, s in module_pose(modules[face == 'D'], 0 if engaged else 24).items():
            yield face+'/'+n, n, s.moved(face_location_v4(face))
    for n, s in lock_pose(lock, 30 if pose == 'retracted' else 0).items():
        yield 'LOCK/'+n, n, s.moved(face_location_v4('D'))


def color(name):
    if name in ('lock_bar', 'center_recessed'):
        return '#e07935' if name == 'lock_bar' else '#9c73b5'
    if 'servo' in name:
        return '#98633c'
    if name.startswith('pin_'):
        return '#dd5a48'
    return v2.COLORS.get(name, '#a4b1bf')


def build(tolerance=.05, angular=.12):
    OUT.mkdir(parents=True, exist_ok=True)
    cubes, derived, instances, modules, lock = make_design()
    printable = printable_parts(cubes, modules, lock)
    # Remove only obsolete part exports in this generator's own output folder.
    for path in (OUT/'print').glob('*'):
        if path.suffix in ('.stl', '.step') and path.stem not in printable:
            path.unlink()
    report = dict(status='CAD prototype; no physical printing/load validation', print_parts={},
                  purchased_parts_are_envelopes=True, stl_tolerance_mm=tolerance, stl_angular_tolerance=angular)
    offsets = {}
    for n, (s, qty) in printable.items():
        assert s.isValid() and len(s.Solids()) == 1, (n, 'invalid or disconnected', len(s.Solids()))
        bb = s.BoundingBox()
        offsets[n] = [(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, bb.zmin]
        # Reuse V2's exact coordinate convention; custom tolerance only on retry.
        v2.export_shape(n, s, OUT/'print')
        if (tolerance, angular) != (.05, .12):
            s.translate(tuple(-v for v in offsets[n])).exportStl(str(OUT/'print'/(n+'.stl')), tolerance=tolerance, angularTolerance=angular)
        mesh = v3.clean_stl(OUT/'print'/(n+'.stl'))
        report['print_parts'][n] = dict(qty=qty, valid=True, solids=1, volume_mm3=round(s.Volume(), 4),
                                      size_mm=[bb.xlen, bb.ylen, bb.zlen], mesh_cleanup=mesh)
        print('Exported', n, 'x', qty, flush=True)
    purchased = {}
    common = set(modules[False][1]) & set(modules[True][1])
    for hollow, (_, hardware) in modules.items():
        for n, s in hardware.items():
            key = n if n in common else n+('_hollow' if hollow else '_direct')
            bb = s.BoundingBox()
            purchased[key] = dict(size=[bb.xlen, bb.ylen, bb.zlen], center=[(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, (bb.zmin+bb.zmax)/2],
                                  qty=5 if n in common else 1 if hollow else 4,
                                  module='all' if n in common else 'D' if hollow else 'FRBL')
    for n, s in lock[1].items():
        bb = s.BoundingBox()
        purchased[n] = dict(size=[bb.xlen, bb.ylen, bb.zlen], center=[(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, (bb.zmin+bb.zmax)/2], qty=1, module='LOCK')
    params = dict(P, **derived, faces_v4=FACES_V4, print_offsets=offsets, purchased=purchased)
    report['purchased_parts'] = purchased
    (OUT/'parameters.json').write_text(json.dumps(params, indent=2), encoding='utf-8')
    (OUT/'manufacturing.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    assembly = cq.Assembly(name='RobotV4_FB_D_LOCK_engaged_RL_retracted')
    for n, kind, s in assembly_items(instances, modules, lock):
        assembly.add(s, name=n.replace('/', '__'), color=cq.Color(color(kind)))
    assembly.save(str(OUT/'robot_assembly.step'))
    assembly.save(str(OUT/'robot_assembly.glb'))
    # V2's printable cube derives from the MIT licensed Deckard retention model.
    license_file = ROOT/'models'/'robot_v2'/'THIRD_PARTY_LICENSE.md'
    if license_file.exists():
        (OUT/'THIRD_PARTY_LICENSE.md').write_bytes(license_file.read_bytes())
    print('Built', len(printable), 'unique parts;', sum(x[1] for x in printable.values()), 'printed items', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stl-tolerance', type=float, default=.05)
    parser.add_argument('--stl-angular', type=float, default=.12)
    args = parser.parse_args()
    if args.stl_tolerance <= 0 or args.stl_angular <= 0:
        parser.error('Tessellation tolerances must be positive')
    build(args.stl_tolerance, args.stl_angular)
