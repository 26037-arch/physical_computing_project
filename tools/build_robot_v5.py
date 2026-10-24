"""V5 BRep prototype. All assembly coordinates are local holder millimetres.

P is imported, never copied. Print STLs are translated only (XY centred,
minimum Z zero); STEP parts keep assembly coordinates. Manufacturing poses
are separate recommendations, not silently applied to the exported meshes.
"""
import argparse
import json
import math
from pathlib import Path

import cadquery as cq
from robot_v5_params import P
from build_robot_v2 import box, cyl, fuse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'robot_v5'
C = P['cube_mm']
H = C / 2
POST_IN = H + P['post_clearance_mm']
POST_OUT = POST_IN + P['post_t_mm']
HOOD_IN = H + P['hood_clearance_mm']
HOOD_OUT = HOOD_IN + P['hood_wall_mm']
ROOF_Z = C + P['hood_roof_clear_mm']
HINGE = (P['hinge_y_mm'], P['hinge_z_mm'])
A = math.radians(P['lift_dir_deg'])
D = (-math.sin(A), math.cos(A))
N = (math.cos(A), math.sin(A))
Q0 = (P['lift_contact_y_mm'] - P['lift_bottom_z_mm'] * math.tan(A), P['lift_bottom_z_mm'])
B0 = (Q0[0] + P['slider_bar_dy_mm'], Q0[1] + P['slider_bar_dz_mm'])
R = P['crank_r_mm']
LINK = P['link_mm']
CRANK_X = (-55., -51.)  # outboard crank; rod is on its tower-facing side
LINK_X = (-50., -46.)  # clears shaft even at the folded upper dead centre
SERVO = tuple(B0[i] + (P['lift_stroke_mm'] + LINK - R) * D[i] for i in range(2))
TILT = math.radians(P['tilt_deg'])
COLORS = dict(base='#6e7f91', cube_holder='#1f9e98', hood='#e0ad40',
              hub='#287e84',
              lifter='#e56744', crank='#9568bb', link='#bc87d0',
              nema17='#404650', mg996r='#8d6846', sg90='#4779c6', cube='#e7e9e7')


def yz(poly, x0, x1):
    return cq.Workplane('YZ', origin=(x0, 0, 0)).polyline(poly).close().extrude(x1-x0).val()


def rect(x0, x1, y0, y1, z0, z1):
    return box(x1-x0, y1-y0, z1-z0, ((x0+x1)/2, (y0+y1)/2, (z0+z1)/2))


def capsule(a, b, width, x0, x1):
    dy, dz = b[0]-a[0], b[1]-a[1]
    length = math.hypot(dy, dz)
    ny, nz = -dz / length * width/2, dy / length * width/2
    core = yz([(a[0]+ny, a[1]+nz), (b[0]+ny, b[1]+nz),
               (b[0]-ny, b[1]-nz), (a[0]-ny, a[1]-nz)], x0, x1)
    return fuse(core, cyl(width, x0, x1, (1, 0, 0), (0, *a)),
                cyl(width, x0, x1, (1, 0, 0), (0, *b)))


def bore_x(diameter, x0, x1, center, up):
    """Round fit envelope with a 45-degree roof in the chosen print pose."""
    radius = diameter/2
    if not P['horizontal_bore_roof_relief']:
        return cyl(diameter, x0, x1, (1, 0, 0), (0, *center))
    across = (up[1], -up[0])
    def at(a, b):
        return tuple(center[i]+a*up[i]+b*across[i] for i in range(2))
    triangle = [at(radius/math.sqrt(2), -radius/math.sqrt(2)),
                at(radius*math.sqrt(2), 0), at(radius/math.sqrt(2), radius/math.sqrt(2))]
    return fuse(cyl(diameter, x0, x1, (1, 0, 0), (0, *center)), yz(triangle, x0, x1))


def cube_holder():
    t, w = P['plate_t_mm'], P['plate_mm']
    plate = cq.Workplane('XY').box(w, w, t).edges('|Z').fillet(P['plate_corner_r_mm']).val().translate((0, 0, -t/2))
    for angle in (0, 90, 180, 270):
        cut = rect(-P['notch_w_mm']/2, P['notch_w_mm']/2, P['notch_y_mm'], w, -t-1, 1)
        plate = plate.cut(cut.rotate((0, 0, 0), (0, 0, 1), angle))
    inner, outer = POST_IN, POST_OUT
    end = outer - P['post_arm_mm']
    height, cham = P['post_h_mm'], P['post_chamfer_mm']
    post = fuse(rect(end, outer, inner, outer, 0, height), rect(inner, outer, end, outer, 0, height))
    # Rev B: 4 mm bevel in 5 mm wall leaves a 1 mm top land at z=15.
    wedge = yz([(inner, height-cham), (inner+cham, height),
                (inner+cham, height+1), (inner-1, height+1), (inner-1, height-cham)], -w, w)
    post = post.cut(wedge).cut(wedge.rotate((0, 0, 0), (0, 0, 1), -90)).clean()
    for angle in (0, 90, 180, 270):
        plate = plate.fuse(post.rotate((0, 0, 0), (0, 0, 1), angle))
    if P['post_footprint_trim']:
        outline = cq.Workplane('XY').box(w, w, height+t+2).edges('|Z').fillet(P['plate_corner_r_mm']).val().translate((0, 0, (height-t)/2))
        plate = plate.intersect(outline)
    # Keep the tall outside corners, but open a throat through the inside
    # arms for the rearward-sliding, 65.1-degree cube. This is a cut only;
    # the print sections decrease as height increases.
    slope = 1/math.tan(math.radians(P['post_flip_relief_deg']))
    start = P['post_flip_pivot_y_mm']-P['post_flip_margin_mm']
    relief = yz([(start, 0), (0, 0), (0, height+1),
                 (start-slope*(height+1), height+1)], -H-.1, H+.1)
    for angle in (0, 90, 180, 270):
        plate = plate.cut(relief.rotate((0, 0, 0), (0, 0, 1), angle))
    for x in (-11, 11):
        plate = plate.cut(cyl(3.2, -t-1, 1, origin=(x, 0, 0)))
    plate = plate.cut(cyl(P['plate_shaft_relief_d_mm'], -t-1, -t+P['plate_shaft_relief_depth_mm']))
    return plate.clean()


def hub():
    t = P['plate_t_mm']
    hub_bottom = -t-P['hub_h_mm']
    hub = fuse(cyl(P['hub_d_mm'], hub_bottom, -t),
               cyl(P['hub_flange_d_mm'], -t-P['hub_flange_t_mm'], -t))
    # D bore: circular diameter 5, flat at x=2 (4.5 across from x=-2.5).
    bore = cyl(5, hub_bottom-1, 1).intersect(rect(-3, 2, -3, 3, hub_bottom-1, 1))
    hub = hub.cut(bore).cut(cyl(2.5, 1.9, P['hub_d_mm']/2+1, (1, 0, 0), (0, 0, -11)))
    for x in (-11, 11):
        hub = hub.cut(cyl(3.2, -t-P['hub_flange_t_mm']-1, 1, origin=(x, 0, 0)))
    return hub.clean()


def hood():
    top = ROOF_Z+P['hood_roof_t_mm']
    walls = fuse(rect(-HOOD_OUT, HOOD_OUT, HOOD_IN, HOOD_OUT, P['hood_bottom_z_mm'], top),
                 rect(-HOOD_OUT, -HOOD_IN, -HOOD_OUT, HOOD_IN, P['hood_bottom_z_mm'], top),
                 rect(HOOD_IN, HOOD_OUT, -HOOD_OUT, HOOD_IN, P['hood_bottom_z_mm'], top),
                 rect(-HOOD_OUT, HOOD_OUT, -HOOD_OUT, HOOD_OUT, ROOF_Z, top))
    walls = walls.cut(rect(-22, 22, -22, 22, ROOF_Z-0.1, top+1))
    rad = P['hinge_hub_d_mm']/2
    profile = [(HINGE[0], HINGE[1]-rad), (-HOOD_OUT, P['hood_bottom_z_mm']),
               (-HOOD_OUT, top), (HINGE[0]-rad, top), (HINGE[0]-rad, HINGE[1])]
    for side in (-1, 1):
        x0, x1 = sorted((side*HOOD_OUT, side*(HOOD_OUT+P['arm_t_mm'])))
        arm = fuse(yz(profile, x0, x1), cyl(2*rad, x0, x1, (1, 0, 0), (0, *HINGE)))
        arm = arm.cut(cyl(3.2, x0-1, x1+1, (1, 0, 0), (0, *HINGE)))
        if side == 1:
            arm = arm.cut(bore_x(21.5, x1-2.5, x1+1, HINGE, (0, -1)))
            for angle in (0, 90, 180, 270):
                ang = math.radians(angle)
                arm = arm.cut(cyl(2.0, x0-1, x1+1, (1, 0, 0),
                                  (0, HINGE[0]+7*math.cos(ang), HINGE[1]+7*math.sin(ang))))
        # Overlap 0.01 at the wall interface avoids a disconnected tangent face.
        join = rect(x0 if side > 0 else -HOOD_OUT-0.01,
                    HOOD_OUT+0.01 if side > 0 else x1,
                    -HOOD_OUT, -HOOD_IN, P['hood_bottom_z_mm'], ROOF_Z)
        walls = fuse(walls, arm, join)
    return walls.clean()


def lifter():
    qy, qz = Q0
    length, t = P['shelf_len_mm'], P['shelf_t_mm']
    w = P['hook_w_mm']/2
    shelf = yz([(qy-length, qz-t), (qy, qz-t), (qy, qz-1),
                (qy-1, qz), (qy-length, qz)], -w, w)
    # 0.5 deep recess leaves a 0.5 rim; the rubber itself is not a printed part.
    shelf = shelf.cut(rect(-w+.5, w-.5, qy-length+.5, qy-1.1, qz-.5, qz+.1))
    lip = rect(-w, w, qy-length-P['lip_t_mm'], qy-length, qz-t, qz+P['lip_h_mm'])
    by, bz = B0
    # Flat T: bar rear face is the bed. The body shares its lower z edge;
    # a <=45-degree underside leads to the shelf, with no floating wings.
    body = yz([(by-2, bz-2), (qy-length, qz-t),
               (qy-length, qz+P['lip_h_mm']),
               (qy-length-P['lip_t_mm'], qz+P['lip_h_mm']),
               (by-2, bz+2)], -w, w)
    half = P['slider_bar_half_x_mm']
    bar = rect(-half, half, by-P['slider_bar_mm']/2, by+P['slider_bar_mm']/2,
               bz-P['slider_bar_mm']/2, bz+P['slider_bar_mm']/2)
    part = fuse(shelf, lip, body, bar)
    for x0, x1 in ((-half-1, -half+6), (half-6, half+1)):
        part = part.cut(cyl(3.2, x0, x1, (1, 0, 0), (0, by, bz)))
    return part.clean()


def floor_z(y, world=None):
    if world is None:
        world = P['table_zw_mm']
    return world/math.cos(TILT)-y*math.tan(TILT)


def world_z(y, z):
    return z*math.cos(TILT)+y*math.sin(TILT)


def base():
    # Exact world-horizontal underside; no rotated bounding-box approximation.
    half = P['motor_box_outer_mm']/2
    face = P['motor_face_z_mm']
    outer = yz([(-half, floor_z(-half)), (half, floor_z(half)), (half, face), (-half, face)], -half, half)
    inner = half-3
    void = rect(-inner, inner, -inner, inner, -150, face+.01)
    motor_box = outer.cut(void).fuse(rect(-half, half, -half, half, face, face+P['motor_plate_t_mm']))
    motor_box = motor_box.cut(cyl(23, -26, -19))
    for x in (-15.5, 15.5):
        for y in (-15.5, 15.5):
            motor_box = motor_box.cut(cyl(3.4, -26, -19, origin=(x, y, 0)))
    deck = yz([(-105, floor_z(-105)), (-22, floor_z(-22)),
               (-22, floor_z(-22, P['table_zw_mm']+4)), (-105, floor_z(-105, P['table_zw_mm']+4))], -56, 56)
    part = fuse(motor_box, deck)
    b1 = tuple(B0[i]+P['lift_stroke_mm']*D[i] for i in range(2))
    for side in (-1, 1):
        x0, x1 = sorted((side*39.5, side*45.5))
        top = 95 if side < 0 else 65
        profile = (cq.Workplane('YZ', origin=(x0, 0, 0))
                   .moveTo(-105, floor_z(-105)).lineTo(-35, floor_z(-35))
                   .lineTo(-35, top-10).radiusArc((-45, top), -10)
                   .lineTo(-95, top).radiusArc((-105, top-10), -10).close().extrude(6).val())
        print_up = (math.sin(TILT), math.cos(TILT))
        profile = profile.cut(bore_x(3.2, x0-1, x1+1, HINGE, print_up))
        profile = profile.cut(capsule(B0, b1, 3.4, x0-1, x1+1))
        profile = profile.cut(bore_x(3.4, x0-1, x1+1, b1, print_up))
        if side > 0:
            # The rear mounting ear is centred at y=-104.75: its round
            # clearance cannot close against a tower ending at y=-105.
            rear = -105-P['mg996r_rear_lug_mm']
            lug = yz([(-105, 21), (rear, 28), (rear, 53), (-102, 53), (-102, 21)], x0, x1)
            profile = fuse(profile, lug)
            profile = profile.cut(bore_x(24, x0-.1, x0+6, HINGE, print_up))
            profile = profile.cut(rect(x1-3, x1+1, HINGE[0]-10.25, HINGE[0]+30.25,
                                       HINGE[1]-10.25, top+1 if P['mg996r_pocket_open_top'] else HINGE[1]+10.25))
            for y in (HINGE[0]+10-24.75, HINGE[0]+10+24.75):
                for z in (HINGE[1]-5, HINGE[1]+5):
                    profile = profile.cut(bore_x(3.2, x0-1, x1+1, (y, z), print_up))
        else:
            sy, sz = SERVO
            mount = P['sg90_mount_outer_x_mm']
            bottom = sz-P['sg90_mount_bottom_offset_mm']
            frame = rect(mount-3, mount, sy-17, sy+17, bottom, sz+10)
            # Outside both lever planes: the lower web reaches the tower
            # entirely behind the crank's swept half-disc.
            web = (cq.Workplane('XZ', origin=(0, sy+17, 0))
                   .polyline([(x0, bottom-(x0-(mount-3))), (x0, bottom+1),
                              (mount-3, bottom+1), (mount-3, bottom)])
                   .close().extrude(34).val())
            frame = fuse(frame, web)
            frame = frame.cut(rect(mount-4, mount+1, sy-11.25, sy+11.25, sz-6.1, sz+6.1))
            for y in (sy-14, sy+14):
                frame = frame.cut(bore_x(2, mount-4, mount+1, (y, sz), print_up))
            profile = fuse(profile, frame)
            profile = profile.cut(bore_x(6, x0-1, x1+1, (sy, sz), print_up))
        part = part.fuse(profile)
    # Four shallow foot seats, drilled normal to the world-horizontal floor.
    for x, y in ((-20, 18), (20, 18), (-43, -87), (43, -87)):
        z = floor_z(y)
        part = part.fuse(cyl(P['foot_boss_d_mm'], 0, 3, (0, math.sin(TILT), math.cos(TILT)), (x, y, z)))
        part = part.cut(cyl(10, -.1, 1, (0, math.sin(TILT), math.cos(TILT)), (x, y, z)))
    return part.clean()


def linkage(theta):
    """Physical inline crank angle, lower dead centre = 0 degrees."""
    a = math.radians(theta)
    axial, lateral = -R*math.cos(a), R*math.sin(a)
    pin = tuple(SERVO[i]+axial*D[i]+lateral*N[i] for i in range(2))
    # The Rev B servo is ABOVE the slider. The rod points down the rail.
    # This branch has 41.2667 mm at 90 deg (24.7333 is the lower-axis branch).
    s = LINK+R+axial-math.sqrt(LINK*LINK-lateral*lateral)
    slider = tuple(B0[i]+s*D[i] for i in range(2))
    return s, pin, slider


def lever(a, b, x0, x1, boss=False):
    part = capsule(a, b, 8, x0, x1)
    if boss:
        part = fuse(part, cyl(6, x0-2, x0, (1, 0, 0), (0, *a)))
    for p in (a, b):
        part = part.cut(cyl(3.2 if p == b or not boss else 2, x0-3, x1+1, (1, 0, 0), (0, *p)))
    if boss:
        # Six-mm boss, 4.8-mm horn/shaft envelope recess, M2 through-hole.
        part = part.cut(cyl(4.8, x0-2.1, x0-.5, (1, 0, 0), (0, *a)))
    return part.clean()


def purchased():
    motor_bottom = P['motor_face_z_mm']-P['motor_len_mm']
    shaft = cyl(5, P['motor_face_z_mm'], P['motor_face_z_mm']+22).intersect(
        rect(-3, 2, -3, 3, P['motor_face_z_mm']-1, P['motor_face_z_mm']+23))
    nema = fuse(box(P['motor_mm'], P['motor_mm'], P['motor_len_mm'],
                    (0, 0, (motor_bottom+P['motor_face_z_mm'])/2)),
                shaft)
    mg = fuse(rect(42.5, 80.5, HINGE[0]-10.25, HINGE[0]+30.25, HINGE[1]-10.25, HINGE[1]+10.25),
              cyl(6, 36.5, 43, (1, 0, 0), (0, *HINGE)))
    sy, sz = SERVO
    mount = P['sg90_mount_outer_x_mm']
    sg = fuse(rect(mount-22.7, mount, sy-11.25, sy+11.25, sz-6.1, sz+6.1),
              cyl(4.8, mount, CRANK_X[0]-.5, (1, 0, 0), (0, sy, sz)))
    return dict(nema17=nema, mg996r=mg, sg90=sg)


def make_design():
    _, pin, slider = linkage(0)
    return dict(cube_holder=cube_holder(), hub=hub(), hood=hood(), lifter=lifter(), base=base(),
                crank=lever(SERVO, pin, *CRANK_X, True),
                link=lever(pin, slider, *LINK_X))


def hood_pose(shape, angle):
    return shape.rotate((0, *HINGE), (1, *HINGE), angle)


def lift_pose(shape, s):
    return shape.translate((0, D[0]*s, D[1]*s))


def assembly_items(parts, bought, pose='open'):
    angle = {'open': P['hood_open_deg'], 'close': 0, 'flip': P['hood_flip_deg']}[pose]
    theta = 180 if pose == 'flip' else 0
    s, pin, slider = linkage(theta)
    yield 'base', parts['base']
    yield 'cube_holder', parts['cube_holder']
    yield 'hub', parts['hub']
    yield 'hood', hood_pose(parts['hood'], angle)
    yield 'lifter', lift_pose(parts['lifter'], s)
    yield 'crank', lever(SERVO, pin, *CRANK_X, True)
    yield 'link', lever(pin, slider, *LINK_X)
    for n, sh in bought.items():
        yield n, sh
    cube = box(C, C, C, (0, 0, H))
    if pose == 'flip':
        cube = cube.translate((0, -28.3-H, 0)).rotate((0, -28.3, 0), (1, -28.3, 0), -65.1)
    yield 'cube', cube


def load_parts():
    return {p.stem: cq.importers.importStep(str(p)).val() for p in sorted((OUT/'print').glob('*.step'))}


def print_pose(name, shape):
    # These are candidate poses, explicitly tested/reviewed in the checker.
    if name == 'hood':
        shape = shape.rotate((0, 0, 0), (1, 0, 0), 180)
    elif name == 'base':
        shape = shape.rotate((0, 0, 0), (1, 0, 0), P['tilt_deg'])
    elif name in ('crank', 'link'):
        shape = shape.rotate((0, 0, 0), (0, 1, 0), 90)
    elif name == 'hub':
        shape = shape.rotate((0, 0, 0), (1, 0, 0), 180)
    elif name == 'lifter':
        shape = shape.rotate((0, 0, 0), (1, 0, 0), 90)
    bb = shape.BoundingBox()
    return shape.translate((-(bb.xmin+bb.xmax)/2, -(bb.ymin+bb.ymax)/2, -bb.zmin))


def build(tolerance=.05, angular=.12):
    parts, bought = make_design(), purchased()
    folder = OUT/'print'
    folder.mkdir(parents=True, exist_ok=True)
    offsets, rows = {}, {}
    notes = dict(cube_holder='Plate underside on bed, posts up; separate hub.',
                 hub='Flange on bed (X 180 deg), shaft up; D bore vertical.',
                 hood='Roof and extended arm top webs on bed (X 180 deg).',
                 base='World-horizontal deck underside on bed (X +20 deg).',
                 lifter='Rear crossbar face on bed (X +90 deg); flat T body rises to hook.',
                 crank='Flat back on bed (Y +90 deg), horn pocket upwards.',
                 link='Flat side down (rotate Y 90 deg).')
    for name, s in parts.items():
        assert s.isValid() and len(s.Solids()) == 1, (name, 'invalid/disconnected', len(s.Solids()))
        bb = s.BoundingBox()
        offset = [(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, bb.zmin]
        offsets[name] = offset
        s.translate(tuple(-v for v in offset)).exportStl(str(folder/(name+'.stl')), tolerance=tolerance, angularTolerance=angular)
        cq.exporters.export(s, str(folder/(name+'.step')))
        # Inward 1.2-mm shell (three 0.4-mm lines), with 20% core infill.
        # A conservative surface-area shell estimate is capped at solid volume.
        volume = s.Volume()
        shell = min(volume, s.Area()*1.2)
        plastic = shell+.2*(volume-shell)
        mass = plastic/1000*1.27
        posed = print_pose(name, s).BoundingBox()
        rows[name] = dict(qty=1, valid=True, solids=1, volume_mm3=round(volume, 3),
                          estimated_plastic_mm3=round(plastic, 3), grams_each=round(mass, 3),
                          grams_total=round(mass, 3), size_mm=[bb.xlen, bb.ylen, bb.zlen],
                          print_size_mm=[posed.xlen, posed.ylen, posed.zlen], print_pose=notes[name],
                          estimated_hours=round(plastic/(.2*.4*60)/3600*1.5, 3))
        print('Exported', name, flush=True)
    hardware = {}
    for name, s in bought.items():
        bb = s.BoundingBox()
        hardware[name] = dict(size=[bb.xlen, bb.ylen, bb.zlen],
                              center=[(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, (bb.zmin+bb.zmax)/2], qty=1,
                              envelope_only=True)
    params = dict(P, hood_in=2*HOOD_IN, hood_out=2*HOOD_OUT, post_in=POST_IN, post_out=POST_OUT,
                  hinge=list(HINGE), lift_Q0=list(Q0), lift_Q1=[Q0[i]+P['lift_stroke_mm']*D[i] for i in range(2)],
                  lift_B0=list(B0), lift_B1=[B0[i]+P['lift_stroke_mm']*D[i] for i in range(2)],
                  servo_axes=dict(hood=[42.5, *HINGE], lift=[P['sg90_mount_outer_x_mm'], *SERVO]),
                  lever_planes_x_mm=dict(crank=list(CRANK_X), link=list(LINK_X)),
                  revision='B', crank_r_mm=R, link_centres_mm=LINK, table_world_z_mm=P['table_zw_mm'],
                  world_height_equation='z_world = z*cos(tilt) + y*sin(tilt)',
                  crank_branch='Upper-axis rod points down rail: physical 90 deg gives 41.266703 mm; lower-axis reference gives 24.733297 mm.',
                  print_offsets=offsets, purchased=hardware, faces={})
    report = dict(status='Rev B CAD; see mechanical_checks.json for geometric checks; physical operation unverified',
                  parameters=P, print_parts=rows, purchased=hardware, density_g_cm3=1.27,
                  infill_fraction=.2, shell_lines=3, line_width_mm=.4, layer_height_mm=.2,
                  speed_mm_s=60, time_overhead_factor=1.5,
                  mass_model='min(volume, area*1.2mm) shell plus 20% remaining core; slicer estimate required',
                  grams_total=round(sum(r['grams_total'] for r in rows.values()), 3),
                  estimated_hours_total=round(sum(r['estimated_hours'] for r in rows.values()), 3),
                  stl_tolerance_mm=tolerance, stl_angular_tolerance=angular,
                  effective_post_top_mm=P['post_h_mm']-max(0, P['post_chamfer_mm']-P['post_t_mm']))
    (OUT/'parameters.json').write_text(json.dumps(params, indent=2), encoding='utf-8')
    (OUT/'manufacturing.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    for pose, filename in (('open', 'robot_assembly'), ('close', 'robot_assembly_close'), ('flip', 'robot_assembly_flip')):
        assembly = cq.Assembly(name='RobotV5_'+pose)
        for name, s in assembly_items(parts, bought, pose):
            assembly.add(s, name=name, color=cq.Color(COLORS[name]))
        assembly.save(str(OUT/(filename+'.step')))
        if pose == 'open':
            assembly.save(str(OUT/(filename+'.glb')))
    print('Built seven V5 Rev B parts; estimated PETG grams:', report['grams_total'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stl-tolerance', type=float, default=.05)
    parser.add_argument('--stl-angular', type=float, default=.12)
    args = parser.parse_args()
    if args.stl_tolerance <= 0 or args.stl_angular <= 0:
        parser.error('Tessellation tolerances must be positive')
    build(args.stl_tolerance, args.stl_angular)
