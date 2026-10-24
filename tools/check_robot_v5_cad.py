"""Check exported V5 BReps, with no collision-volume exclusions or masking.

Samples are discrete, not a continuous motion proof. This deliberately fails
inconsistent brief requirements rather than labelling a geometric proxy PASS.
"""
import json
import math
import struct
import sys

import cadquery as cq
import build_robot_v5 as d

TOL = .02


def overlap(a, b):
    ba, bb = a.BoundingBox(), b.BoundingBox()
    if any(min(getattr(ba, k+'max'), getattr(bb, k+'max')) -
           max(getattr(ba, k+'min'), getattr(bb, k+'min')) <= 1e-7 for k in 'xyz'):
        return 0.0
    return sum(s.Volume() for s in a.intersect(b).Solids())


def collisions(left, right):
    return [dict(left=na, right=nb, overlap_mm3=round(v, 6))
            for na, a in left.items() for nb, b in right.items()
            if (v := overlap(a, b)) > TOL]


def main():
    parts, bought = d.load_parts(), d.purchased()
    params = json.loads((d.OUT/'parameters.json').read_text(encoding='utf-8'))
    checks, failures = {}, []

    def rec(name, ok, **values):
        checks[name] = dict(ok=bool(ok), **values)
        if not ok:
            failures.append(name)
        print(('OK   ' if ok else 'FAIL ')+name, flush=True)

    rec('exported_parts_valid', set(parts) == {'base', 'cube_holder', 'hub', 'hood', 'lifter', 'crank', 'link'}
        and all(s.isValid() and len(s.Solids()) == 1 for s in parts.values()),
        parts={n: dict(valid=s.isValid(), solids=len(s.Solids())) for n, s in parts.items()})
    rec('exported_parameters_match_P', all(params.get(k) == v for k, v in d.P.items()))
    meshes = {}
    for name in parts:
        data = (d.OUT/'print'/(name+'.stl')).read_bytes()
        count = struct.unpack_from('<I', data, 80)[0]
        valid_length = len(data) == 84+50*count and count > 0
        vertices = [struct.unpack_from('<3f', data, 84+50*i+12+12*j)
                    for i in range(count) for j in range(3)] if valid_length else []
        if not vertices:
            meshes[name] = dict(ok=False)
            continue
        lo = [min(p[k] for p in vertices) for k in range(3)]
        hi = [max(p[k] for p in vertices) for k in range(3)]
        centered = max(abs((lo[k]+hi[k])/2) for k in (0, 1)) <= .1 and abs(lo[2]) <= .1
        b = parts[name].BoundingBox()
        offset = params['print_offsets'][name]
        restored = [lo[k]+offset[k] for k in range(3)]+[hi[k]+offset[k] for k in range(3)]
        expected = [b.xmin, b.ymin, b.zmin, b.xmax, b.ymax, b.zmax]
        error = max(abs(a-b) for a, b in zip(restored, expected))
        meshes[name] = dict(ok=centered and error <= .1, triangles=count, bytes=len(data),
                            min_mm=lo, max_mm=hi, restored_bbox_error_mm=error)
    rec('exported_STL_offsets', all(r['ok'] for r in meshes.values()), parts=meshes,
        bbox_tolerance_mm=.1)
    rec('source_lift_endpoints_consistent',
        abs(d.Q0[0]+(-d.Q0[1]/d.D[1])*d.D[0]-d.P['lift_contact_y_mm']) < 1e-8
        and math.dist(d.SERVO, (-83.0, 81.1)) < .1,
        P_derived_Q0=list(d.Q0), P_derived_B0=list(d.B0), upper_servo_yz_mm=list(d.SERVO))
    seated = d.box(d.C, d.C, d.C, (0, 0, d.H))
    close_hits = collisions({'hood': parts['hood']}, dict(cube=seated, cube_holder=parts['cube_holder'], base=parts['base']))
    rec('a_close_no_overlap', not close_hits, collisions=close_hits,
        wall_cube_gap_mm=d.HOOD_IN-d.H, roof_cube_gap_mm=d.ROOF_Z-d.C)

    # 90-degree symmetry means these six orientations exactly represent all
    # 24 requested 15-degree samples; use their true BRep union, not a box.
    print('Building holder 15-degree sampled union...', flush=True)
    holder_sweep = d.fuse(*(parts['cube_holder'].rotate((0, 0, 0), (0, 0, 1), a) for a in range(0, 90, 15)))
    cube_sweep = d.cyl(d.C*math.sqrt(2), 0, d.C)
    motion = []
    for angle in sorted(set([i*2.5 for i in range(25)]+list(range(0, 121, 5)))):
        hood = d.hood_pose(parts['hood'], angle)
        # Before OPEN the cube cannot spin; endpoints OPEN and LOAD must also
        # clear the swept solid. Intermediate >=60 poses use the swept test.
        targets = dict(base=parts['base'])
        if angle <= 60:
            targets.update(cube=seated, cube_holder=parts['cube_holder'])
        if angle in (60, 120):
            targets.update(cube_sweep=cube_sweep, holder_sweep=holder_sweep)
        hit = collisions({'hood': hood}, targets)
        motion.append(dict(angle_deg=angle, collisions=hit))
    rec('b_hood_0_to_120', not any(s['collisions'] for s in motion), samples=motion,
        seated_cube_interval_deg=2.5, base_interval_deg=5, sweep_test_deg=[60, 120],
        holder_union_angles_deg=list(range(0, 360, 15)), symmetry_period_deg=90,
        cube_sweep_radius_mm=d.C/math.sqrt(2))

    cube_high = d.rect(-d.H, d.H, -d.H, d.H, 3, d.C)
    path = []
    max_depth, max_brush = 0., 0.
    for s in range(0, int(d.P['lift_stroke_mm'])+1, 2):
        lift = d.lift_pose(parts['lifter'], s)
        hit = collisions({'lifter': lift}, dict(base=parts['base'], nema17=bought['nema17'], cube_holder=parts['cube_holder'], hub=parts['hub']))
        high = overlap(lift, cube_high)
        brush = lift.intersect(seated)
        if brush.Solids():
            max_depth = max(max_depth, brush.BoundingBox().ymax+d.H)
            max_brush = max(max_brush, brush.Volume())
        path.append(dict(s_mm=s, collisions=hit, cube_above_3_overlap_mm3=round(high, 6)))
    rec('c_lifter_path_step2', not any(s['collisions'] for s in path), samples=path)
    rec('c_cube_above_3_clear', all(s['cube_above_3_overlap_mm3'] <= TOL for s in path),
        max_penetration_from_rear_plane_mm=round(max_depth, 6),
        max_corner_brush_volume_mm3=round(max_brush, 6), permitted_brush_region='z <= 3 mm only')
    flip = dict(d.assembly_items(parts, bought, 'flip'))
    hit = collisions({'tilted_cube': flip['cube']}, dict(hood=flip['hood'], base=parts['base'], hub=parts['hub'], lifter=flip['lifter'], cube_holder=parts['cube_holder']))
    rec('d_flip_cube_65p1_clear', not hit, collisions=hit, cube_angle_deg=65.1,
        cube_pivot_yz_mm=[-28.3, 0], hood_angle_deg=d.P['hood_flip_deg'])
    hit = collisions({'lifter': flip['lifter']}, {'hood': flip['hood']})
    rec('d_lifter_top_hood_clear', not hit, collisions=hit)

    kinematics = []
    for theta in range(0, 181, 5):
        expected = {0: 0, 180: 66}.get(theta)
        s, pin, slider = d.linkage(theta)
        link = d.lever(pin, slider, *d.LINK_X)
        crank = d.lever(d.SERVO, pin, *d.CRANK_X, True)
        hit = collisions(dict(link=link, crank=crank), {'base': parts['base']})
        hit += collisions(dict(link=link, crank=crank), {'sg90': bought['sg90']})
        hit += collisions({'link': link}, {'crank': crank})
        kinematics.append(dict(crank_deg=theta, slider_s_mm=s, required_s_mm=expected,
                               error_mm=s-expected if expected is not None else None, link_length_mm=math.dist(pin, slider),
                               pin_yz_mm=pin, slider_yz_mm=slider, collisions=hit))
    rec('e_crank_endpoints_and_rod_length',
        all((r['error_mm'] is None or abs(r['error_mm']) <= .05) and abs(r['link_length_mm']-d.LINK) < 1e-7 for r in kinematics),
        samples=kinematics, physical_mid_90_mm=d.linkage(90)[0],
        lower_axis_reference_mid_90_mm=math.sqrt(d.LINK**2-d.R**2)-(d.LINK-d.R),
        formula='Upper-axis: s = L+r-r*cos(theta)-sqrt(L^2-r^2*sin(theta)^2)',
        explanation='Rev B raises the axis above the rail: the physical 90-degree midpoint is 41.266703, while 24.733297 is the old lower-axis branch. Only endpoints are required.')
    rec('e_link_crank_base_clear', not any(s['collisions'] for s in kinematics), samples=kinematics)
    ground_samples = []
    for row in kinematics:
        theta = row['crank_deg']
        _, pin, slider = d.linkage(theta)
        shapes = dict(crank=d.lever(d.SERVO, pin, *d.CRANK_X, True), link=d.lever(pin, slider, *d.LINK_X))
        ground_samples.append(dict(crank_deg=theta, minimum_world_z_mm={n: sh.rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg']).BoundingBox().zmin for n, sh in shapes.items()}))
    b1 = tuple(d.B0[i]+d.P['lift_stroke_mm']*d.D[i] for i in range(2))
    # Every point of a rod lies within 4 mm of its endpoint segment. The
    # crank pin lies on the r circle and the slider stays on B0--B1 (L>r).
    # This lower bound covers every angle, including between the samples.
    desk_bound = min(d.world_z(*d.SERVO)-d.R-4,
                     d.world_z(*d.B0)-4, d.world_z(*b1)-4)
    rec('e_full_linkage_above_desk', desk_bound > d.P['table_zw_mm']
        and all(z > d.P['table_zw_mm'] for r in ground_samples for z in r['minimum_world_z_mm'].values()),
        samples=ground_samples, continuous_lower_bound_world_z_mm=desk_bound,
        continuous_ground_clearance_bound_mm=desk_bound-d.P['table_zw_mm'])

    # Probe actual BRep undersides at foot-rim locations (seat itself is 1 mm
    # deep, and a 1 mm rubber disc restores the common contact plane).
    feet = []
    for x, y in ((-20, 18), (20, 18), (-43, -87), (43, -87)):
        origin = (x, y, d.floor_z(y))
        down = (0, math.sin(d.TILT), math.cos(d.TILT))
        probe = d.cyl(.2, -1, 3, down, origin)
        actual = parts['base'].intersect(probe).rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg'])
        seat_world = actual.BoundingBox().zmin if actual.Solids() else None
        feet.append(dict(local_center=list(origin), seat_world_z_mm=seat_world,
                         rubber_contact_world_z_mm=seat_world-1 if seat_world is not None else None))
    world_base = parts['base'].rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg'])
    rec('f_base_floor_horizontal', abs(world_base.BoundingBox().zmin-d.P['table_zw_mm']) <= .01
        and all(f['rubber_contact_world_z_mm'] is not None and abs(f['rubber_contact_world_z_mm']-d.P['table_zw_mm']) <= .01 for f in feet), feet=feet,
        base_min_world_z_mm=world_base.BoundingBox().zmin,
        convention='Uses the specified z_world=z*cos20+y*sin20. Mathematical rotation is +20 about +X.')
    motor_world = bought['nema17'].rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg'])
    rec('f_motor_ground_clearance', motor_world.BoundingBox().zmin >= d.P['table_zw_mm']+3,
        motor_min_world_z_mm=motor_world.BoundingBox().zmin, ground_clearance_mm=motor_world.BoundingBox().zmin-d.P['table_zw_mm'])

    print_sizes = {}
    for n, sh in parts.items():
        bb = sh.BoundingBox()
        posed = d.print_pose(n, sh)
        pb = posed.BoundingBox()
        print_sizes[n] = dict(local_size_mm=[bb.xlen, bb.ylen, bb.zlen],
                              posed_size_mm=[pb.xlen, pb.ylen, pb.zlen])
    rec('g_bed_220', all(max(r['local_size_mm']+r['posed_size_mm']) <= 220 for r in print_sizes.values()), parts=print_sizes)

    from check_robot_v5_print import review_print
    support = {name: review_print(d.print_pose(name, shape)) for name, shape in parts.items()}
    rec('g_support_free_all_seven', all(r['ok'] for r in support.values()), parts=support,
        poses={n:r['print_pose'] for n,r in json.loads((d.OUT/'manufacturing.json').read_text(encoding='utf-8'))['print_parts'].items()},
        assumptions='0.2 mm layers, 45-degree supported expansion, short anchored ledges <=0.6 mm, two-anchor bridges <=45 mm. Finite geometric eligibility, not a slicer/material guarantee.')

    # Additional fit checks catch issues absent from the supplied 2D model.
    motor_hit = overlap(parts['base'], bought['nema17'])
    rec('extra_motor_box_fit', motor_hit <= TOL, overlap_mm3=round(motor_hit, 6),
        box_inside_mm=d.P['motor_box_outer_mm']-6, motor_body_mm=d.P['motor_mm'])
    actual_top = parts['cube_holder'].BoundingBox().zmax
    rec('extra_post_height', abs(actual_top-d.P['post_h_mm']) <= .01,
        actual_post_top_mm=actual_top, specified_post_top_mm=d.P['post_h_mm'],
        remaining_top_land_mm=d.P['post_t_mm']-d.P['post_chamfer_mm'])
    # Required reach beyond the crossbar end; insertion, nut/head and thread
    # engagement allowance remain explicitly identified physical-fit checks.
    bolt_reach = abs(d.LINK_X[0]-(-d.P['slider_bar_half_x_mm']))
    rec('extra_slider_pin_reach', bolt_reach <= 20, required_reach_mm=bolt_reach, available_bolt_length_mm=20,
        note='Bolt insertion from crossbar end face; nut/head allowance and threaded insert need physical fit validation.')
    servo_crank_overlap = overlap(parts['crank'], bought['sg90'])
    rec('extra_servo_crank_fit', servo_crank_overlap <= TOL,
        overlap_mm3=round(servo_crank_overlap, 6),
        note='Simplified SG90 output envelope seats at the horn-pocket floor; screw/horn hardware still needs physical fit validation.')
    fit_hits = collisions({'sg90': bought['sg90'], 'mg996r': bought['mg996r']}, {'base': parts['base']})
    fit_hits += collisions({'nema17': bought['nema17']}, {'hub': parts['hub'], 'cube_holder': parts['cube_holder']})
    rec('extra_purchased_mounts_fit', not fit_hits, collisions=fit_hits,
        shaft='5 mm D profile, flat at x=2 mm; SG90 envelope includes output horn to pocket floor')
    ground = {n: s.rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg']).BoundingBox().zmin
              for n, s in d.assembly_items(parts, bought)}
    rec('extra_assembly_above_desk', all(z >= d.P['table_zw_mm']-.01 for z in ground.values()), minimum_world_z_mm=ground)
    result = dict(revision='B', passed=not failures, failures=failures, volume_tolerance_mm3=TOL,
                  limitations='Discrete BRep motion samples and purchased envelopes; no physical, slicer, strength, backlash or friction validation.', checks=checks)
    (d.OUT/'mechanical_checks.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('PASS' if not failures else 'FAILED: '+', '.join(failures), flush=True)
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
