"""check_robot_v5h.py — V5H 조립 재현(A1~A12)·간섭(I1~I15) 검사. 원본은 docs/V5H_DESIGN.md 6.2·6.3절.

조각은 build_robot_v5h 가 2절 좌표대로 놓은 BRep 이다. 결과는 models/robot_v5h/checks.json 에
{id, value, limit, ok} (+ 근거 필드)로 쓰고 하나라도 실패하면 종료코드 1.
I1 은 V5 의 tools/check_robot_v5.py 소스를 PH 로 다시 실행한다(파일은 고치지 않음, 출력은 models/robot_v5h/kinematic_checks.json).
지그(J)·재료(M)·렌더(R)는 다른 워커 몫이라 여기서 다루지 않는다.
실행: python3 tools/check_robot_v5h.py
"""
import contextlib
import io
import json
import math
import sys
from pathlib import Path

import cadquery as cq
from shapely.geometry import Polygon, box as sbox
from shapely.affinity import translate as stranslate
from shapely.ops import unary_union

import build_robot_v5h as b
import build_robot_v5 as v5
from robot_v5h_params import PH

ROOT = b.ROOT
OUT = b.OUT
TOL_V = 0.02          # 겹침 체적 허용 (mm³)
TOL_L = 0.01          # 길이 허용 (mm)

CHECKS = []


def rec(cid, value, limit, ok, **extra):
    CHECKS.append(dict(id=cid, value=value, limit=limit, ok=bool(ok), **extra))
    print(('OK   ' if ok else 'FAIL ') + cid + ' ' + json.dumps(dict(value=value, limit=limit), ensure_ascii=False)[:200], flush=True)


def r4(v):
    return round(float(v), 4)


def compound(shapes):
    return cq.Compound.makeCompound(list(shapes))


def bbox(s):
    bb = s.BoundingBox()
    return bb


def overlap(a, b_):
    ba, bb_ = a.BoundingBox(), b_.BoundingBox()
    if any(min(getattr(ba, k + 'max'), getattr(bb_, k + 'max')) - max(getattr(ba, k + 'min'), getattr(bb_, k + 'min')) <= 1e-7
           for k in 'xyz'):
        return 0.0
    return sum(s.Volume() for s in a.intersect(b_).Solids())


def dist(a, b_):
    return a.distance(b_)


def sweep_min(lo, hi, coarse, fine, fn):
    """[lo, hi] 를 coarse 간격으로 훑고 최소 부근을 fine 간격으로 다시 훑는다 → (최솟값, 그때 매개변수)."""
    n = int(round((hi - lo) / coarse))
    vals = [(fn(lo + i * coarse), lo + i * coarse) for i in range(n + 1)]
    best = min(vals)
    a, c = max(lo, best[1] - coarse), min(hi, best[1] + coarse)
    m = int(round((c - a) / fine))
    vals += [(fn(a + i * fine), a + i * fine) for i in range(m + 1)]
    return min(vals)


# ---------------------------------------------------------------- 공용 모양

SOL = b.solids()


def named(pred):
    return {n: s for n, (s, mot, col, pid) in SOL.items() if pred(n, mot, pid)}


POSTS = named(lambda n, m, p: p in ('P01', 'P02'))


def fused(shapes):
    """맞닿은 조각을 한 솔리드로 (겹친 compound 의 불리언은 믿을 수 없다)."""
    shapes = list(shapes)
    s = shapes[0]
    for o in shapes[1:]:
        s = s.fuse(o)
    return s.clean()


POSTS_FUSED = fused(POSTS.values())
PLATE = SOL['H01'][0]
HOLDER = dict(POSTS, H01=PLATE)                                  # 판 + 기둥
CUP = named(lambda n, m, p: m == 'cup')
HOOD = named(lambda n, m, p: m == 'hood')
LIFTER = named(lambda n, m, p: m == 'lifter')
BASE = named(lambda n, m, p: m == 'base')
CRANK = named(lambda n, m, p: m == 'crank')
LINK = named(lambda n, m, p: m == 'link')
KIT = named(lambda n, m, p: p == 'KIT')


def pc_of(pid, **kw):
    for pc in b.PIECES:
        if pc['id'] == pid and pc['group'] != 'spare' and all(pc.get(k) == v for k, v in kw.items()):
            return pc
    raise KeyError(pid)


# ---------------------------------------------------------------- A. 조립 재현

def a1():
    inner = b.POST_IN
    vals = {}
    for rot in (0, 90, 180, 270):
        back = compound([s.rotate((0, 0, 0), (0, 0, 1), -rot) for s in POSTS.values()])
        arm_y = back.intersect(cq.Solid.makeBox(29.4 - 17.0, 20, 20, cq.Vector(17.0, 20, -1)))   # +y 팔 (x 17~29.4)
        arm_x = back.intersect(cq.Solid.makeBox(20, 29.4 - 17.0, 20, cq.Vector(20, 17.0, -1)))
        vals[f'rot{rot}_y'] = r4(arm_y.BoundingBox().ymin)
        vals[f'rot{rot}_x'] = r4(arm_x.BoundingBox().xmin)
    dev = max(abs(v - inner) for v in vals.values())
    intrude = overlap(POSTS_FUSED, cq.Solid.makeBox(2 * inner, 2 * inner, 20, cq.Vector(-inner, -inner, -1)))
    rec('A1', r4(dev), TOL_L, dev <= TOL_L and intrude <= TOL_V, unit='mm (8면 |x|·|y| − 29.5 최대)', faces=vals,
        cube_space_intrusion_mm3=r4(intrude), target=inner)


def top_z(solid, x, y, zmax=20.0):
    """(x, y) 를 지나는 수직선 위 재료의 가장 높은 z (이분법)."""
    lo, hi = -1.0, zmax
    if not solid.isInside(cq.Vector(x, y, 0.01), 1e-6):
        return None
    lo = 0.01
    for _ in range(50):
        mid = (lo + hi) / 2
        if solid.isInside(cq.Vector(x, y, mid), 1e-7):
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def a2():
    col = None
    for n, s in POSTS.items():
        if n.startswith('P01') and int(n.split('_')[-1]) <= 5:              # rot 0 의 5층
            col = s if col is None else col.fuse(s)
    col = col.clean()
    zmax = POSTS_FUSED.BoundingBox().zmax
    probes = []
    for y in (29.6, 30.5, 31.5, 32.5, 33.4):                                 # 모따기 A: z = 11 + (y − 29.5), x = 34
        probes.append(('A', 34.0, y, min(15.0, 11 + (y - 29.5))))
    for x in (29.6, 30.5, 31.5, 32.5, 33.4):                                 # 모따기 B
        probes.append(('B', x, 34.0, min(15.0, 11 + (x - 29.5))))
    for x, y in ((33.6, 33.6), (34.4, 34.4), (33.6, 34.4), (34.4, 33.6)):     # 윗면 1 × 1
        probes.append(('land', x, y, 15.0))
    errs = []
    for kind, x, y, want in probes:
        got = top_z(col, x, y)
        errs.append(dict(kind=kind, x=x, y=y, z=r4(got), want=r4(want), err=r4(abs(got - want))))
    # 윗면 폭: y = 34 선에서 z 가 15 가 되기 시작하는 x
    lo, hi = 32.0, 34.4
    for _ in range(40):
        mid = (lo + hi) / 2
        if top_z(col, mid, 34.0) >= 15 - 1e-6:
            hi = mid
        else:
            lo = mid
    land = 34.5 - hi
    dev = max([e['err'] for e in errs] + [abs(zmax - 15.0), abs(land - 1.0)])
    rec('A2', r4(dev), TOL_L, dev <= TOL_L, unit='mm', post_top_z=r4(zmax), top_land_mm=r4(land), probes=errs,
        chamfer_points=[[29.5, 11.0], [33.5, 15.0]])


def a3():
    v5h = POSTS_FUSED
    ref = v5.cube_holder().intersect(cq.Solid.makeBox(100, 100, 15.0, cq.Vector(-50, -50, 0)))
    extra_shape = v5h.cut(ref)
    extra = sum(s.Volume() for s in extra_shape.Solids())
    # 8절 D7 허용 띠: 경사 조각 끝 (|x| 또는 |y| ∈ [28.5, 28.6], 반대축 ∈ [33.6, 34.5], z 11~12) — V5H−V5 에만 적용
    d7 = None
    for sa in (1, -1):
        for sb in (1, -1):
            for box_ in (cq.Solid.makeBox(0.1, 0.9, 1.0, cq.Vector(min(sa * 28.5, sa * 28.6), min(sb * 33.6, sb * 34.5), 11.0)),
                         cq.Solid.makeBox(0.9, 0.1, 1.0, cq.Vector(min(sb * 33.6, sb * 34.5), min(sa * 28.5, sa * 28.6), 11.0))):
                d7 = box_ if d7 is None else d7.fuse(box_)
    extra_d7 = sum(s.Volume() for s in extra_shape.intersect(d7).Solids()) if extra > 0 else 0.0
    extra_out = sum(s.Volume() for s in extra_shape.cut(d7).Solids()) if extra > 0 else 0.0
    lost_shape = ref.cut(v5h)
    lost = sum(s.Volume() for s in lost_shape.Solids())
    band = None
    for a in (28.6, -29.5):
        for slab in (cq.Solid.makeBox(0.9, 100, 20, cq.Vector(a, -50, -1)), cq.Solid.makeBox(100, 0.9, 20, cq.Vector(-50, a, -1))):
            band = slab if band is None else band.fuse(slab)
    allowed = band.fuse(cq.Solid.makeBox(100, 100, 10, cq.Vector(-50, -50, 12.0)))
    residual = sum(s.Volume() for s in lost_shape.cut(allowed).Solids()) if lost > 0 else 0.0
    ok = extra_out <= TOL_V and lost <= 40.0 and residual <= TOL_V
    where = [dict(volume_mm3=r4(s.Volume()), bbox=[r4(v) for v in (s.BoundingBox().xmin, s.BoundingBox().xmax, s.BoundingBox().ymin,
                                                                   s.BoundingBox().ymax, s.BoundingBox().zmin, s.BoundingBox().zmax)])
             for s in extra_shape.Solids() if s.Volume() > 1e-6]
    rec('A3', dict(v5h_minus_v5_outside_d7_mm3=r4(extra_out), v5_minus_v5h_mm3=r4(lost), outside_allowed_mm3=r4(residual)),
        dict(v5h_minus_v5_outside_d7_mm3=TOL_V, v5_minus_v5h_mm3=40.0, outside_allowed_mm3=TOL_V), ok,
        d7_allowed=dict(volume_mm3=r4(extra_d7), status='D7 허용', pieces=where,
                        region='|x| 또는 |y| ∈ [28.5, 28.6], 반대축 |·| ∈ [33.6, 34.5], z ∈ [11, 12] (8곳)',
                        cause='V5 cube_holder() 의 모따기 쐐기가 28.5 부터 z 11 위를 비우는데 V5H 경사 조각(P02, x 17.5~28.6) 끝은 '
                              '자르지 않는다. 큐브 밖(|x| > 28.5)이고 손 재단 오차(±0.3)보다 작아 수용 (8절 D7).'),
        v5h_minus_v5_total_mm3=r4(extra),
        allowed_regions='V5−V5H: |x| 또는 |y| ∈ [28.6, 29.5] 띠, z ≥ 12 (8절 D6, 문서 계산 34 mm³)')


def a4():
    bb = PLATE.BoundingBox()
    pc = pc_of('H01')
    plate = Polygon(pc['outline'])
    w = PH['plate_mm'] / 2
    holes = sbox(-w, -w, w, w).difference(plate)
    notches, corners = [], []
    for g in getattr(holes, 'geoms', [holes]):
        (notches if g.area > 1 else corners).append(g)
    nb = [g.bounds for g in notches]
    widths = [(x1 - x0) if abs(x0 + x1) < 1e-6 else (y1 - y0) for x0, y0, x1, y1 in nb]
    inner_edge = [min(abs(y0), abs(y1)) if abs(x0 + x1) < 1e-6 else min(abs(x0), abs(x1)) for x0, y0, x1, y1 in nb]
    r = math.sqrt(sum(g.area for g in corners) / len(corners) / (1 - math.pi / 4)) if corners else 0
    vol_err = abs(PLATE.Volume() - plate.area * PH['plate_t_mm'])
    dev = max([abs(bb.zmax), abs(bb.zmin + 3.0), abs(bb.xlen - 70), abs(bb.ylen - 70), abs(r - 1.5)] +
              [abs(x - 20) for x in widths] + [abs(x - 23) for x in inner_edge])
    rec('A4', r4(dev), TOL_L, dev <= TOL_L and len(notches) == 4 and len(corners) == 4 and vol_err < 0.1, unit='mm',
        plate_z=[r4(bb.zmin), r4(bb.zmax)], outer=[r4(bb.xlen), r4(bb.ylen)], notch_widths=[r4(x) for x in widths],
        notch_inner_edge=[r4(x) for x in inner_edge], corner_r=r4(r), solid_vs_outline_volume_err_mm3=r4(vol_err),
        note='모서리 R1.5 는 호를 16 마디로 나눈 다각형 (꼭짓점 처짐 0.002)')


def a5():
    k = {n: s.BoundingBox() for n, s in HOOD.items() if n.startswith('K')}
    side_r = [v for n, v in k.items() if n.startswith('K03') and v.xmin > 0][0]
    side_l = [v for n, v in k.items() if n.startswith('K03') and v.xmin < 0][0]
    front = k['K02']
    roof = k['K01']
    hole = Polygon(pc_of('K01')['holes'][0]['poly']).bounds
    hinge = [(h['x'], h['y']) for side in ('R', 'L') for h in pc_of('K04', side=side)['holes'] if h['d'] == 3.2]
    walls_bottom = min(v.zmin for v in k.values())
    vals = dict(inside_x=r4(side_r.xmin - side_l.xmax), front_inner_y=r4(front.ymin), wall_bottom_z=r4(walls_bottom),
                roof_z=[r4(roof.zmin), r4(roof.zmax)], roof_hole=[r4(hole[2] - hole[0]), r4(hole[3] - hole[1])],
                arm_hinge=[[r4(x), r4(y)] for x, y in hinge])
    dev = max(abs(vals['inside_x'] - 60), abs(vals['front_inner_y'] - 30), abs(walls_bottom - 21), abs(roof.zmin - 58.5),
              abs(roof.zmax - 61.5), abs(vals['roof_hole'][0] - 44), abs(vals['roof_hole'][1] - 44),
              max(math.dist(p, b.HINGE) for p in hinge))
    rec('A5', r4(dev), TOL_L, dev <= TOL_L, unit='mm', **vals, inside_depth_note='앞벽 안쪽 y 30, 뒤는 열림 (뒷벽 없음, V5 와 같음)')


def a6():
    body = compound([s for n, s in LIFTER.items() if n.startswith('L01')])
    qy, qz = b.Q0
    region = cq.Solid.makeBox(40, 20, 20, cq.Vector(-20, -30.33, qz - PH['shelf_t_mm']))   # y ≥ −30.33, z ≥ 선반 밑면 −9
    part = body.intersect(region)
    ref = v5.lifter().fuse(SOL['pad'][0])
    outside = sum(s.Volume() for s in part.cut(ref).Solids())
    pad_top = SOL['pad'][0].BoundingBox().zmax
    ok = outside <= TOL_V and abs(pad_top - qz) <= TOL_L
    rec('A6', dict(outside_v5_mm3=r4(outside), pad_top_err_mm=r4(abs(pad_top - qz))), dict(outside_v5_mm3=TOL_V, pad_top_err_mm=TOL_L), ok,
        region='y ≥ −30.33 이고 z ≥ −9.0 (선반·입술 부분; 몸통 아래쪽은 V5 에 없는 새 구조라 제외)', pad_top_z=r4(pad_top), Q0z=qz,
        width_mm=PH['hook_w_mm'])


def a7():
    pc = pc_of('L03')
    hb, hf = [(h['x'], h['y']) for h in pc['holes'] if h.get('d') == 3.2]
    l01 = compound([s for n, s in LIFTER.items() if n.startswith('L01')]).BoundingBox()
    q0 = (l01.ymax, SOL['pad'][0].BoundingBox().zmax)                       # 선반 앞면 · 고무 윗면
    pin_b = SOL['pin_B_R'][0].BoundingBox()
    pin_c = ((pin_b.ymin + pin_b.ymax) / 2, (pin_b.zmin + pin_b.zmax) / 2)
    worst = 0.0
    for i in range(0, 661):
        s = i * 0.1
        q = (q0[0] + s * b.D[0], q0[1] + s * b.D[1])
        bp = (hb[0] + s * b.D[0], hb[1] + s * b.D[1])
        fp = (hf[0] + s * b.D[0], hf[1] + s * b.D[1])
        want_b = (q[0] + PH['slider_bar_dy_mm'], q[1] + PH['slider_bar_dz_mm'])
        want_f = (bp[0] + PH['follower_s_mm'] * b.D[0], bp[1] + PH['follower_s_mm'] * b.D[1])
        worst = max(worst, math.dist(bp, want_b), math.dist(fp, want_f))
    worst = max(worst, math.dist(pin_c, hb))
    rec('A7', r4(worst), TOL_L, worst <= TOL_L, unit='mm (σ 0~66, 0.1 간격)', Q0_from_geometry=[r4(v) for v in q0],
        B0_hole=[r4(v) for v in hb], F0_hole=[r4(v) for v in hf], pin_hardware_centre=[r4(v) for v in pin_c])


def a8():
    v1 = pc_of('V01')
    servo = [(h['x'], h['y']) for h in v1['holes'] if h['d'] == 6.0][0]
    pin = [(h['x'], h['y']) for h in v1['holes'] if h['d'] == 3.2][0]
    v2 = pc_of('V02')
    hexc = Polygon(v2['holes'][0]['poly']).centroid
    b_hole = [(h['x'], h['y']) for h in v2['holes'] if h.get('d') == 3.2][0]
    want = tuple(b.B0[i] + (PH['lift_stroke_mm'] + PH['link_mm'] - PH['crank_r_mm']) * b.D[i] for i in range(2))
    rlen = math.dist(servo, pin)
    llen = math.dist((hexc.x, hexc.y), b_hole)
    s0, s180 = b.linkage(0)[0], b.linkage(180)[0]
    dev = max(math.dist(servo, want), math.dist(servo, (-82.982, 81.076)), abs(rlen - 33), abs(llen - 70), abs(s0), abs(s180 - 66))
    rec('A8', r4(dev), TOL_L, dev <= TOL_L, unit='mm', servo=[r4(v) for v in servo], crank_r=r4(rlen), link_centres=r4(llen),
        stroke_endpoints=[r4(s0), r4(s180)])


def a9():
    t1l = [s for n, (s, *_r) in SOL.items() if n == 'B06_1'][0].BoundingBox()
    t1r = SOL['B07_T1R'][0].BoundingBox()
    dev = max(abs(t1l.xmax + 39.5), abs(t1r.xmin - 39.5))
    rec('A9', r4(dev), TOL_L, dev <= TOL_L, unit='mm', left_inner_x=r4(t1l.xmax), right_inner_x=r4(t1r.xmin))


def a10():
    slab = cq.Solid.makeBox(100, 100, 13.0, cq.Vector(-50, -50, -16.0))
    rot = compound([s for n, s in CUP.items() if n != 'H01' and n not in POSTS])
    below = rot.intersect(slab)
    r_poly = 0.0
    for v in below.Vertices():
        r_poly = max(r_poly, math.hypot(v.X, v.Y))
    head_r = SOL['m5_stub'][0].BoundingBox().xmax
    coupler_r = SOL['coupler'][0].BoundingBox().xmax
    rmax = max(r_poly, head_r)
    ok = rmax <= 20.8 + 1e-9 and coupler_r <= PH['coupler_od_mm'] / 2 + 1e-9
    rec('A10', r4(rmax), 20.8, ok, unit='mm (z −16~−3 회전체 최대 반경)', octagon_r=r4(PH['stack_disc_r_mm']),
        nut_r=r4(PH['m5_nut_r_mm']), head_r=r4(head_r), coupler_r=r4(coupler_r), coupler_limit=PH['coupler_od_mm'] / 2)


def a11():
    stub = SOL['m5_stub'][0].BoundingBox()
    coupler = SOL['coupler'][0].BoundingBox()
    nema = SOL['nema17'][0]
    shaft_top = nema.BoundingBox().zmax
    ring = cq.Solid.makeCylinder(15, 10, cq.Vector(0, 0, PH['motor_face_z_mm'] - 0.001)).cut(
        cq.Solid.makeCylinder(3.5, 12, cq.Vector(0, 0, PH['motor_face_z_mm'] - 1)))            # 축을 뺀 보스 자리
    boss = nema.intersect(ring).BoundingBox().zmax
    plate_top = max(SOL[n][0].BoundingBox().zmax for n in SOL if n.startswith('B02'))
    vals = dict(e_bolt=r4(coupler.zmax - stub.zmin), e_shaft=r4(shaft_top - coupler.zmin), bolt_shaft_gap=r4(stub.zmin - shaft_top),
                coupler_boss_gap=r4(coupler.zmin - boss), coupler_plate_gap=r4(coupler.zmin - plate_top))
    above = [n for n, s in CUP.items() if n not in POSTS and s.BoundingBox().zmax > 1e-6]
    lim = dict(e_bolt=PH['min_bolt_engage_mm'], e_shaft=PH['min_shaft_engage_mm'], bolt_shaft_gap=0.5, coupler_boss_gap=0.5,
               coupler_plate_gap=2.0)
    ok = all(vals[k] >= lim[k] - 1e-9 for k in lim) and not above
    formula = dict(e_bolt=PH['e_bolt_mm'], e_shaft=PH['e_shaft_mm'], boss_gap=PH['boss_gap_mm'], plate_gap=PH['motor_plate_gap_mm'])
    rec('A11', vals, lim, ok, material_above_plate_except_posts=above, params_formula=formula,
        z=dict(coupler=[r4(coupler.zmin), r4(coupler.zmax)], bolt_tip=r4(stub.zmin), shaft_tip=r4(shaft_top), boss_top=r4(boss),
               motor_plate_top=r4(plate_top)))


def a12():
    low = b.local_to_world(SOL['nema17'][0]).BoundingBox().zmin
    lim = PH['table_zw_mm'] + PH['motor_desk_margin_mm']
    rec('A12', r4(low), r4(lim), low >= lim - 1e-9, unit='월드 mm (모터 몸체·커넥터 최저점 ≥ 책상 + 3)', table_zw=PH['table_zw_mm'],
        margin_mm=r4(low - PH['table_zw_mm']))


# ---------------------------------------------------------------- I1. V5 운동학 검사를 PH 로

I1_CHANGED = {
    'A_lifter_bottom_clears_spin_sweep': dict(gap_mm=2.0),
    'A_load_hood_above_table': dict(hood_lowest_world_mm=-3.2, motor_lowest_world_mm=-91.8, table_zw_mm=-95.0),
    'C_lifter_bottom_below_plate': dict(lip_top_mm=-5.0, plate_bottom_mm=-3.0),
    'C_hook_width_fits_notch': dict(hook_w_mm=15.0, notch_w_mm=20.0),
    'G_motor_plate_above_motor_face': dict(plate_z=[-50.0, -44.0], hub_z=[-41.0, -3.0]),
    'F_hood_servo_torque': dict(torque_kgcm=0.27),
}
I1_NOTES = {
    'E_lifter_top_clears_hood_arm': 'V5 검사기의 리프터 단면(4×4 바)으로는 V5 값 9.06 그대로. 6.5절 기대값 "끝판 6.57 (막대 11.69)" 은 V5H 조각으로 I4 에서 잰다.',
    'D_topple_sweep_clears_hood_and_lifter': '6.5절: gap_lifter ≥ 0.32 (V5H 몸통 2D 0.463 은 I9).',
}


def i1():
    src = (ROOT / 'tools' / 'check_robot_v5.py').read_text(encoding='utf-8')
    rep = [("from robot_v5_params import P\n", "P = __PH__\n"),
           ("OUT = ROOT / 'models' / 'robot_v5'\n", "OUT = ROOT / 'models' / 'robot_v5h'\n")]
    for a, c in rep:
        assert src.count(a) == 1, a
        src = src.replace(a, c)
    phc = dict(PH)
    # V5 검사기가 읽는 키: 핀 축 B 의 4×4 바 단면(V5 값), 판 아래 회전체 = 디스크 외접원 × (판 밑 ~ 커플링 밑)
    phc.update(slider_bar_mm=4.0, slider_bar_half_x_mm=38.5, hub_d_mm=2 * PH['stack_disc_r_mm'],
               hub_h_mm=-PH['plate_t_mm'] - PH['coupler_bottom_z_mm'])
    phc = {k: (list(v) if isinstance(v, tuple) else v) for k, v in phc.items()}
    ns = dict(__name__='check_robot_v5_rerun', __file__=str(ROOT / 'tools' / 'check_robot_v5.py'), __PH__=phc)
    buf = io.StringIO()
    code = 0
    with contextlib.redirect_stdout(buf):
        try:
            exec(compile(src, 'check_robot_v5.py(PH)', 'exec'), ns)
        except SystemExit as e:
            code = e.code
    got = json.loads((OUT / 'kinematic_checks.json').read_text(encoding='utf-8'))
    ref = json.loads((ROOT / 'models' / 'robot_v5' / 'kinematic_checks.json').read_text(encoding='utf-8'))['checks']
    rows, mism = {}, []
    for name, row in got['checks'].items():
        want = dict(ref.get(name, {}))
        want.update(I1_CHANGED.get(name, {}))
        diffs = {}
        for k, v in row.items():
            if k == 'ok' or k not in want:
                continue
            w = want[k]
            if isinstance(v, (int, float)) and isinstance(w, (int, float)) and not isinstance(v, bool):
                if abs(v - w) > 0.011:
                    diffs[k] = [v, w]
            elif isinstance(v, list) and isinstance(w, list):
                if len(v) != len(w) or any(abs(a - c) > 0.011 for a, c in zip(v, w)):
                    diffs[k] = [v, w]
            elif v != w:
                diffs[k] = [v, w]
        if name == 'D_topple_sweep_clears_hood_and_lifter':
            diffs.pop('gap_lifter_mm', None) if row['gap_lifter_mm'] >= 0.32 else None
        rows[name] = dict(ok=row['ok'], matches_expected=not diffs, diffs=diffs, note=I1_NOTES.get(name))
        if diffs:
            mism.append(name)
    fails = got['failures']
    n = len(got['checks'])
    rec('I1', dict(items=n, failed=len(fails), unexpected=len(mism)), dict(items=36, failed=0, unexpected=0),
        n == 36 and not fails and not mism and code == 0, failures=fails, unexpected_items=mism, items=rows,
        output='models/robot_v5h/kinematic_checks.json')


# ---------------------------------------------------------------- I2~I14

def lifter_at(names, s):
    return compound([b.lift_pose(LIFTER[n], s) for n in names])


def i2_i3():
    holder = compound(HOLDER.values())
    ends = [n for n in LIFTER if n.startswith('L03')]
    bars = [n for n in LIFTER if n.startswith('L02')]
    body = [n for n in LIFTER if n.startswith('L01')] + ['pad']
    d_end, s_end = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(ends, s), holder))
    rec('I2', r4(d_end), 2.0, d_end >= 2.0, unit='mm', at_sigma=r4(s_end), expected=2.27,
        target='판 H01 + 기둥 P01·P02 (컵 0°, 노치 정렬)')
    d_bar, s_bar = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(bars, s), holder))
    d_body, s_body = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(body, s), PLATE))
    # 문서 값(2.72)은 yz 단면 거리: 몸통이 노치 끝(y −23)을 지나는 거리
    poly = Polygon(pc_of('L01')['outline'])
    plate_sec = sbox(-PH['notch_y_mm'], -PH['plate_t_mm'], PH['notch_y_mm'], 0)
    sec = min(stranslate(poly, i * 0.1 * b.D[0], i * 0.1 * b.D[1]).distance(plate_sec) for i in range(661))
    rec('I3', dict(bar=r4(d_bar), body=r4(d_body)), 2.0, min(d_bar, d_body) >= 2.0, unit='mm',
        at_sigma=dict(bar=r4(s_bar), body=r4(s_body)), expected=dict(bar=4.27, body=2.72), body_yz_section_to_notch_end=r4(sec),
        note='body 3D 값은 노치 옆변(|x| 10)과의 거리 2.5 가 먼저 걸린다 (몸통 반폭 7.5). 문서 2.72 는 yz 단면값.')


def i4():
    arms = compound([b.hood_pose(HOOD[n], PH['hood_flip_deg']) for n in HOOD if n.startswith('K04')])
    out = {}
    for key, names in (('endplate', [n for n in LIFTER if n.startswith('L03')]), ('pin_head', [n for n in LIFTER if n.startswith('pin_')]),
                       ('bar', [n for n in LIFTER if n.startswith('L02')])):
        out[key] = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(names, s), arms))
    vals = {k: r4(v[0]) for k, v in out.items()}
    rec('I4', vals, 5.0, min(vals.values()) >= 5.0, unit='mm (FLIP 90° 팔 ↔ 리프터, σ 0~66)', at_sigma={k: r4(v[1]) for k, v in out.items()},
        expected=dict(endplate=6.57, pin_head=8.36, bar=11.69), note='pin_head 는 핀 모형 전체(머리·와셔 r 3.5, 너트 r 3.2)')


def i5():
    pins = [n for n in LIFTER if n.startswith('pin_') and n.endswith('_R')]
    mg = SOL['mg996r'][0]
    pad = SOL['B08_P1F'][0]
    d_mg = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(pins, s), mg))
    d_pad = sweep_min(0, 66, 1.0, 0.1, lambda s: dist(lifter_at(pins, s), pad))
    vals = dict(mg996r=r4(d_mg[0]), pad_P1F=r4(d_pad[0]))
    rec('I5', vals, 2.0, min(vals.values()) >= 2.0, unit='mm (오른쪽 B·F 핀 모형 ↔ MG996R 키트 모형 / 패드)',
        at_sigma=dict(mg996r=r4(d_mg[1]), pad_P1F=r4(d_pad[1])), expected=dict(mg996r=3.29, pad_P1F=2.54),
        note='3D 거리: 너트(x 46.0~48.4)와 귀(x 50.2~52.7)는 x 로도 떨어져 있어 문서의 yz 값보다 크게 나올 수 있다')


def crank_at(theta):
    return compound([b.crank_pose(s, theta) for s in CRANK.values()])


def link_at(theta):
    return compound([b.link_pose(s, theta) for s in LINK.values()])


def i6():
    legs = compound([SOL['B11'][0], SOL['B12'][0]])
    dc = sweep_min(0, 180, 5.0, 0.5, lambda t: dist(crank_at(t), legs))
    dl = sweep_min(0, 180, 5.0, 0.5, lambda t: dist(link_at(t), legs))
    vals = dict(crank=r4(dc[0]), link=r4(dl[0]))
    rec('I6', vals, 5.0, min(vals.values()) >= 5.0, unit='mm (θ 0~180)', at_theta=dict(crank=r4(dc[1]), link=r4(dl[1])),
        expected=dict(crank=10.61, link=6.36))


def i7():
    def lifter_hw(name, t):
        return b.lift_pose(LIFTER[name], b.linkage(t)[0])
    d_fnut = sweep_min(0, 180, 5.0, 0.5, lambda t: dist(link_at(t), lifter_hw('pin_F_L', t)))
    d_head = sweep_min(0, 180, 5.0, 0.5, lambda t: dist(link_at(t), SOL['hinge_bolt_L'][0]))
    d_nuts = sweep_min(0, 180, 5.0, 0.5, lambda t: dist(crank_at(t), compound([lifter_hw('pin_B_L', t), lifter_hw('pin_F_L', t)])))
    vals = dict(link_F_nut=r4(d_fnut[0]), link_hinge_head=r4(d_head[0]), crank_BF_nuts=r4(d_nuts[0]))
    lim = dict(link_F_nut=3.0, link_hinge_head=5.0, crank_BF_nuts=5.0)
    rec('I7', vals, lim, all(vals[k] >= lim[k] for k in lim), unit='mm (θ 0~180)',
        at_theta=dict(link_F_nut=r4(d_fnut[1]), link_hinge_head=r4(d_head[1]), crank_BF_nuts=r4(d_nuts[1])),
        expected=dict(link_F_nut=5.80, link_hinge_head=15.82, crank_BF_nuts=25.81))


def i8():
    hood = compound(HOOD.values())
    rear = SOL['B09'][0]
    d = sweep_min(0, PH['hood_load_deg'], 5.0, 0.5, lambda a: dist(b.hood_pose(hood, a), rear))
    rec('I8', r4(d[0]), 10.0, d[0] >= 10.0, unit='mm (후드·팔·혼 0~120° ↔ 리어월)', at_deg=r4(d[1]), expected=15.58)


def i9():
    cube = b.cube_solid('flip')
    body = lifter_at([n for n in LIFTER if n.startswith('L01')], PH['lift_stroke_mm'])
    with_pad = compound([body, b.lift_pose(SOL['pad'][0], PH['lift_stroke_mm'])])
    d_body, d_pad = dist(cube, body), dist(cube, with_pad)
    rec('I9', r4(min(d_body, d_pad)), 0.30, min(d_body, d_pad) >= 0.30, unit='mm (넘어지는 큐브 65.1° ↔ 몸통·고무, σ 66)',
        body_only=r4(d_body), with_pad=r4(d_pad), expected=0.463)


def i10():
    poly = Polygon(pc_of('L01')['outline'])
    qy, qz = b.Q0
    pad = sbox(qy - 1 - 2.5, qz - PH['pad_t_mm'], qy - 1, qz)
    cube = sbox(-b.H, 0, b.H, b.C)
    def worst(shape):
        m = 0.0
        for i in range(661):
            g = stranslate(shape, i * 0.1 * b.D[0], i * 0.1 * b.D[1]).intersection(cube)
            if not g.is_empty and g.area > 1e-9:
                m = max(m, g.bounds[3])
        return m
    z_body = worst(poly)
    z_pad = worst(unary_union([poly, pad]))
    rec('I10', r4(z_body), 2.051, z_body <= 2.051, unit='mm (복귀하는 몸통이 앉은 큐브와 겹치는 가장 높은 z)', with_pad=r4(z_pad),
        expected=2.03, v5_shelf=2.05, note='고무는 무른 재료라 판정에서 뺀다 (with_pad 는 참고)')


def i11():
    nema = SOL['nema17'][0]
    deck = compound([SOL[n][0] for n in SOL if n.startswith('B01')])
    d = dist(nema, deck)
    low = b.local_to_world(nema).BoundingBox().zmin
    table = low - PH['table_zw_mm']
    rec('I11', dict(deck_window=r4(d), table=r4(table)), dict(deck_window=0.5, table=3.0), d >= 0.5 and table >= 3.0, unit='mm',
        expected=dict(deck_window=0.90, table=3.19))


def i12():
    hb = SOL['hinge_bolt_L'][0].BoundingBox().xmax
    eb = SOL['ear_bolts'][0].BoundingBox().xmin
    nut_out = {}
    for n in [k for k in LIFTER if k.startswith('pin_')]:
        s = LIFTER[n]
        bb = s.BoundingBox()
        side = 1 if n.endswith('_R') else -1
        tip = bb.xmax if side > 0 else -bb.xmin
        nut = 51.9 if n == 'pin_B_L' else 48.4
        nut_out[n] = r4(tip - nut)
    cp = SOL['crank_pin'][0].BoundingBox().xmax
    link_face = PH['link_x_mm'][1]
    ok = abs(hb - (-26.0)) <= TOL_L and 40.0 <= eb <= 43.1 and min(nut_out.values()) >= 0.5 and cp < link_face
    rec('I12', dict(F04_end=r4(hb), F05_end=r4(eb), F08_past_nut_min=min(nut_out.values()), F09_end=r4(cp)),
        dict(F04_end=-26.0, F05_end=[40.0, 43.1], F08_past_nut_min=0.5, F09_end=f'< {link_face}'), ok,
        F08_past_nut=nut_out, note='철물 모형은 3절 쌓임 순서로 만든다 (너트 위치는 표의 값)')


def i13():
    link_face = SOL['V02'][0].BoundingBox().xmax
    t2l_out = SOL['B06_2'][0].BoundingBox().xmin
    horn = SOL['mg996r_horn'][0].BoundingBox().xmax
    t1r_in = SOL['B07_T1R'][0].BoundingBox().xmin
    vals = dict(link_T2L=r4(t2l_out - link_face), horn_T1R=r4(t1r_in - horn))
    rec('I13', vals, 0.3, min(vals.values()) >= 0.3, unit='mm', expected=dict(link_T2L=0.5, horn_T1R=0.5))


def i14():
    probes = [cq.Solid.makeBox(10, 51, 3.0, cq.Vector(-5, 9, z - 1.5)) for z in PH['coupler_setscrew_z_mm']]
    hits = {}
    for pose in ('close', 'open', 'load'):
        for name, s, _c in b.assembly(pose):
            if name in CUP or name == 'cube':
                continue
            for z, pr in zip(PH['coupler_setscrew_z_mm'], probes):
                v = overlap(s, pr)
                if v > 1e-6:
                    hits[f'{pose}:{name}@z{z}'] = r4(v)
    rec('I14', r4(sum(hits.values())), 0.0, not hits, unit='mm³ (멈춤나사 앞 y 9~60, |x| ≤ 5, z ±1.5 에 든 재료)', hits=hits,
        setscrew_z=list(PH['coupler_setscrew_z_mm']))


# ---------------------------------------------------------------- I15. 3D BRep 자세 묶음

# 핀-구멍·면 맞닿음으로 설계상 닿는 쌍 (체적은 기록하지만 판정에서 뺀다)
EXCLUDE = {
    frozenset(('nema17', 'coupler')): '모터축 Ø5 가 커플링 구멍 Ø5 에 꽂힘 (핀-구멍)',
}


def i15():
    hits, excluded, samples = [], [], 0

    def test(tag, movers, targets):
        nonlocal samples
        for na, a in movers.items():
            for nb, c in targets.items():
                if na == nb:
                    continue
                samples += 1
                v = overlap(a, c)
                if v <= 1e-9:
                    continue
                row = dict(pose=tag, a=na, b=nb, overlap_mm3=round(v, 6))
                key = frozenset((na, nb))
                if key in EXCLUDE:
                    excluded.append(dict(row, reason=EXCLUDE[key]))
                elif v > TOL_V:
                    hits.append(row)
    fixed = dict(BASE)
    fixed.update({n: s for n, s in KIT.items()})
    seated = b.cube_solid('close')
    print('I15: hood 0~120 …', flush=True)
    holder_sweep = compound([s.rotate((0, 0, 0), (0, 0, 1), a) for s in CUP.values() for a in range(0, 90, 15)])
    cube_sweep = cq.Solid.makeCylinder(b.C / math.sqrt(2), b.C, cq.Vector(0, 0, 0))
    for angle in sorted(set([i * 2.5 for i in range(25)] + list(range(0, 121, 5)))):
        movers = {n: b.hood_pose(s, angle) for n, s in HOOD.items()}
        targets = dict(fixed)
        targets.update(LIFTER)
        targets.update(CRANK)
        targets.update(LINK)
        if angle <= PH['hood_open_deg']:
            targets.update(CUP)
            targets['cube'] = seated
        if angle in (PH['hood_open_deg'], PH['hood_load_deg']):
            targets.update(holder_sweep=holder_sweep, cube_sweep=cube_sweep)
        test(f'hood {angle}', movers, targets)
    print('I15: lifter 0~66 …', flush=True)
    cube_high = cq.Solid.makeBox(b.C, b.C, b.C - 3, cq.Vector(-b.H, -b.H, 3.0))
    hood_flip = {n: b.hood_pose(s, PH['hood_flip_deg']) for n, s in HOOD.items()}
    for s in range(0, int(PH['lift_stroke_mm']) + 1, 2):
        t = b.theta_for_s(s)
        movers = {n: b.lift_pose(sh, s) for n, sh in LIFTER.items()}
        targets = dict(fixed)
        targets.update(CUP)
        targets.update(hood_flip)
        targets['cube_above_3'] = cube_high
        targets.update({n: b.crank_pose(sh, t) for n, sh in CRANK.items()})
        targets.update({n: b.link_pose(sh, t) for n, sh in LINK.items()})
        test(f'lifter {s}', movers, targets)
    print('I15: crank 0~180 …', flush=True)
    for t in range(0, 181, 5):
        sv = b.linkage(t)[0]
        movers = {n: b.crank_pose(sh, t) for n, sh in CRANK.items()}
        movers.update({n: b.link_pose(sh, t) for n, sh in LINK.items()})
        targets = dict(fixed)
        targets.update({n: b.lift_pose(sh, sv) for n, sh in LIFTER.items()})
        test(f'crank {t}', movers, targets)
        test(f'crank {t} (crank↔link)', {n: b.crank_pose(sh, t) for n, sh in CRANK.items()},
             {n: b.link_pose(sh, t) for n, sh in LINK.items()})
    print('I15: FLIP cube, purchased …', flush=True)
    flip_targets = dict(fixed)
    flip_targets.update(CUP)
    flip_targets.update(hood_flip)
    flip_targets.update({n: b.lift_pose(sh, PH['lift_stroke_mm']) for n, sh in LIFTER.items()})
    test('flip cube', {'cube_flip': b.cube_solid('flip')}, flip_targets)
    test('purchased', dict(KIT), dict(BASE, **CUP, **{n: s for n, s in LIFTER.items()}, **CRANK, **LINK))
    test('cup', dict(CUP), dict(BASE))
    ok = not hits
    rec('I15', r4(max([h['overlap_mm3'] for h in hits] or [0.0])), TOL_V, ok, unit='mm³ (가장 큰 겹침)', collisions=hits,
        excluded=excluded, pair_tests=samples,
        bundle='후드 0~120 (2.5°/5°) · 리프터 0~66 (2 mm, 후드 FLIP) · 크랭크 0~180 (5°) · FLIP 큐브 · 구매품 끼움',
        limitations='이산 표본, 단순 철물 모형. 마찰·강도·백래시는 다루지 않는다.')


def main():
    for fn in (a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, i1, i2_i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14, i15):
        fn()
    fails = [c['id'] for c in CHECKS if not c['ok']]
    out = dict(source='docs/V5H_DESIGN.md 6.2·6.3절', passed=not fails, failures=fails, volume_tolerance_mm3=TOL_V,
               length_tolerance_mm=TOL_L, checks=CHECKS)
    (OUT / 'checks.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print('PASS' if not fails else 'FAILED: ' + ', '.join(fails), flush=True)
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main())
