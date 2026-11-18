"""check_v5h_jigs.py — V5H 지그 검사 J1~J18. 원본은 docs/V5H_DESIGN.md 6.1절.

build_v5h_jigs.make_jigs() 가 만든 BRep(사용 좌표)에서 면·원통을 찾아 재고, 기준값은 V5 의 P
(robot_v5_params) 와 V5H 의 PH·PIECES 에서 따로 계산한다(지그 스크립트의 상수를 되읽지 않는다).
J1·J2 의 닫힘·외곽은 models/robot_v5h/jigs/*.stl 파일 자체를 읽어 본다.
결과는 models/robot_v5h/jig_checks.json 에 {id, value, limit, ok} (+ 근거) 로 쓰고, 하나라도 실패하면 종료코드 1.
J18 은 사람이 출력물을 재는 항목이라 manual: true 로 기록만 한다.
실행: python3 tools/check_v5h_jigs.py  (먼저 build_v5h_jigs.py)
"""
import json
import math
import struct
import sys

import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

import build_robot_v5h as b
import build_v5h_jigs as jb
from robot_v5_params import P
from robot_v5h_params import PH

OUT = b.OUT
TOL_L = 0.01
TOL_A = 0.02
CHECKS = []


def rec(cid, value, limit, ok, **extra):
    CHECKS.append(dict(id=cid, value=value, limit=limit, ok=bool(ok), **extra))
    print(('OK   ' if ok else 'FAIL ') + cid + ' ' + json.dumps(dict(value=value, limit=limit), ensure_ascii=False)[:220], flush=True)


def r6(v):
    return round(float(v), 6)


# ---------------------------------------------------------------- V5 기준값 (P 에서 직접)

C5 = P['cube_mm']
POST_IN5 = C5 / 2 + P['post_clearance_mm']
POST_OUT5 = POST_IN5 + P['post_t_mm']
RAMP_Y0_5 = -(P['post_flip_pivot_y_mm'] - P['post_flip_margin_mm'])
RELIEF5 = math.radians(P['post_flip_relief_deg'])
CHAMFER_Z0_5 = P['post_h_mm'] - P['post_chamfer_mm']
HOOD_IN5 = C5 / 2 + P['hood_clearance_mm']
ROOF5 = C5 + P['hood_roof_clear_mm']
ROOF_TOP5 = ROOF5 + P['hood_roof_t_mm']
HINGE5 = (P['hinge_y_mm'], P['hinge_z_mm'])
_a = math.radians(P['lift_dir_deg'])
D5 = (-math.sin(_a), math.cos(_a))
Q0_5 = (P['lift_contact_y_mm'] - P['lift_bottom_z_mm'] * math.tan(_a), P['lift_bottom_z_mm'])
B0_5 = (Q0_5[0] + P['slider_bar_dy_mm'], Q0_5[1] + P['slider_bar_dz_mm'])
B1_5 = (B0_5[0] + P['lift_stroke_mm'] * D5[0], B0_5[1] + P['lift_stroke_mm'] * D5[1])
F0_5 = (B0_5[0] + PH['follower_s_mm'] * D5[0], B0_5[1] + PH['follower_s_mm'] * D5[1])   # V5H D2: F = B − 14·D


def line_dist(p, a, c):
    L = math.dist(a, c)
    return abs((c[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - a[1])) / L


# ---------------------------------------------------------------- BRep 측정

def planes(solid):
    out = []
    for f in solid.Faces():
        if f.geomType() != 'PLANE':
            continue
        c = f.Center()
        n = f.normalAt(c)
        out.append(dict(n=n.toTuple(), c=c.toTuple(), area=f.Area()))
    return out


def inside(c, box):
    return box[0] <= c[0] <= box[1] and box[2] <= c[1] <= box[3] and box[4] <= c[2] <= box[5]


def axis_planes(solid, axis, sign=None, box=None, min_area=0.0):
    i = 'xyz'.index(axis)
    res = []
    for p in planes(solid):
        n = p['n']
        if abs(abs(n[i]) - 1) > 1e-9:
            continue
        if sign is not None and n[i] * sign < 0:
            continue
        if box is not None and not inside(p['c'], box):
            continue
        if p['area'] < min_area:
            continue
        res.append(dict(off=p['c'][i], n=n, c=p['c'], area=p['area']))
    return res


def cylinders(solid):
    out = []
    for f in solid.Faces():
        ad = BRepAdaptor_Surface(f.wrapped)
        if ad.GetType() != GeomAbs_Cylinder:
            continue
        cy = ad.Cylinder()
        loc, d = cy.Axis().Location(), cy.Axis().Direction()
        out.append(dict(loc=(loc.X(), loc.Y(), loc.Z()), dir=(d.X(), d.Y(), d.Z()), r=cy.Radius()))
    return out


def find_cyl(solid, axis, center, exp_d):
    """axis 방향 원통 중 축이 center 를 지나는 것(0.5 이내), 반경이 exp_d/2 에 가장 가까운 것."""
    i = 'xyz'.index(axis)
    oth = [k for k in range(3) if k != i]
    best = None
    for c in cylinders(solid):
        if abs(abs(c['dir'][i]) - 1) > 1e-9:
            continue
        d = math.dist((c['loc'][oth[0]], c['loc'][oth[1]]), center)
        if d > 0.5:
            continue
        k = (abs(2 * c['r'] - exp_d), d)
        if best is None or k < best[0]:
            best = (k, dict(d=2 * c['r'], off=d, at=(c['loc'][oth[0]], c['loc'][oth[1]])))
    return None if best is None else best[1]


def gap(solid, axis, box):
    offs = [p['off'] for p in axis_planes(solid, axis, box=box)]
    return (max(offs) - min(offs), min(offs), max(offs)) if len(offs) >= 2 else (None, None, None)


def line_of(p):
    """(a, v) 평면 위 면 → n_a·a + n_v·v = d (x 성분 0 인 면)."""
    n, c = p['n'], p['c']
    return (n[1], n[2], n[1] * c[1] + n[2] * c[2])


def meet(l1, l2):
    det = l1[0] * l2[1] - l1[1] * l2[0]
    return ((l1[2] * l2[1] - l1[1] * l2[2]) / det, (l1[0] * l2[2] - l1[2] * l2[0]) / det)


def slanted(solid, box):
    seen = {}
    for p in planes(solid):
        n = p['n']
        if abs(n[0]) > 1e-9 or abs(n[1]) < 1e-6 or abs(n[2]) < 1e-6 or not inside(p['c'], box):
            continue
        ln = line_of(p)
        seen[(round(ln[0], 6), round(ln[1], 6), round(ln[2], 5))] = ln
    return list(seen.values())


# ---------------------------------------------------------------- STL 파일

def read_stl(path):
    data = path.read_bytes()
    n = struct.unpack('<I', data[80:84])[0]
    assert len(data) == 84 + 50 * n, path
    tris = []
    for k in range(n):
        o = 84 + 50 * k + 12
        tris.append([data[o + 12 * j:o + 12 * j + 12] for j in range(3)])
    return tris


def stl_stats(path):
    tris = read_stl(path)
    vid = {}
    T = []
    for t in tris:
        T.append([vid.setdefault(v, len(vid)) for v in t])
    verts = [None] * len(vid)
    for v, i in vid.items():
        verts[i] = struct.unpack('<3f', v)
    directed = {}
    undirected = {}
    for t in T:
        for a, c in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            directed[(a, c)] = directed.get((a, c), 0) + 1
            k = (min(a, c), max(a, c))
            undirected[k] = undirected.get(k, 0) + 1
    closed = all(v == 2 for v in undirected.values()) and all(v == 1 for v in directed.values())
    parent = list(range(len(verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for t in T:
        for a in t[1:]:
            ra, rb = find(t[0]), find(a)
            if ra != rb:
                parent[ra] = rb
    comps = len({find(t[0]) for t in T})
    vol = 0.0
    for t in T:
        p0, p1, p2 = (verts[i] for i in t)
        vol += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) +
                p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6
    lo = [min(v[i] for v in verts) for i in range(3)]
    hi = [max(v[i] for v in verts) for i in range(3)]
    return dict(triangles=len(T), closed=closed, components=comps, volume=vol, lo=lo, hi=hi,
                size=[hi[i] - lo[i] for i in range(3)])


# ---------------------------------------------------------------- 검사

def j1_j2(jigs, index):
    sizes = []
    closed_bad = []
    for j in jigs:
        st = stl_stats(jb.OUT / j['file'])
        j['_stl'] = st
        sizes.append(dict(file=j['file'], size=[r6(v) for v in st['size']], qty=j['qty']))
    worst = max(max(s['size']) for s in sizes)
    rec('J1', r6(worst), f"세 축 모두 ≤ {PH['jig_max_mm']}", worst <= PH['jig_max_mm'], files=len(sizes),
        prints=sum(s['qty'] for s in sizes), sizes=sizes,
        note='문서 6.1 "STL 15 + 1·2·3·5·6·7" 기준. 4H-2 플러그 3개를 따로 출력해 JIG-4 는 16, 6a·6b 는 같은 STL 을 2개씩 출력')
    rows = []
    for j in jigs:
        st = j['_stl']
        sol = j['solid']
        brep_ok = len(sol.Solids()) == 1 and sol.isValid()
        removed = j['body'].cut(sol)
        eng_rows = []
        for e in j['engr']:
            if not e['text']:
                continue
            n = [round(v) for v in e['normal']]
            ax = [i for i in range(3) if n[i]][0]
            sgn = n[ax]
            xd = e['xdir']
            yd = (n[1] * xd[2] - n[2] * xd[1], n[2] * xd[0] - n[0] * xd[2], n[0] * xd[1] - n[1] * xd[0])
            x0, x1, y0, y1 = jb.text_bbox(e['text'], e['size'])
            o = e['origin']
            pts = [[o[i] + u * xd[i] + v * yd[i] for i in range(3)] for u in (x0, x1) for v in (y0, y1)]
            lo = [min(p[i] for p in pts) - 0.2 for i in range(3)]
            hi = [max(p[i] for p in pts) + 0.2 for i in range(3)]
            lo[ax], hi[ax] = o[ax] - 2.0, o[ax] + 2.0
            probe = jb.box3(lo[0], hi[0], lo[1], hi[1], lo[2], hi[2])
            part = removed.intersect(probe)
            vol = part.Volume() if part.Solids() else 0.0
            if vol > 0:
                bb = jb.tight_bb(part)
                top = bb[ax + 3] if sgn > 0 else -bb[ax]
                bot = bb[ax] if sgn > 0 else -bb[ax + 3]
                face = o[ax] * sgn
                depth = top - bot
                ok = abs(top - face) <= 1e-6 and abs(depth - jb.ENGRAVE) <= 1e-6
            else:
                depth, ok = 0.0, False
            eng_rows.append(dict(text=e['text'], depth=r6(depth), volume=r6(vol), ok=ok))
        has_jig = any(r['text'].startswith('JIG-') and r['ok'] for r in eng_rows)
        ok = st['closed'] and st['components'] == 1 and st['volume'] > 0 and brep_ok and has_jig and all(r['ok'] for r in eng_rows)
        rows.append(dict(file=j['file'], closed=st['closed'], components=st['components'], triangles=st['triangles'],
                         stl_volume=r6(st['volume']), brep_single_valid=brep_ok, engravings=eng_rows, ok=ok))
        if not ok:
            closed_bad.append(j['file'])
    rec('J2', len(rows) - len(closed_bad), f'{len(rows)} 개 모두 닫힌 단일 솔리드 + JIG- 각인 (깊이 {jb.ENGRAVE})', not closed_bad,
        failed=closed_bad, rows=rows)


def by_id(jigs, jid):
    return next(j for j in jigs if j['id'] == jid)


def j3_j5(jigs):
    g = by_id(jigs, '1b')['solid']
    comp = PH['jig_xy_comp_mm']
    hh = P['post_h_mm']
    side = []
    for ax in 'xy':
        for sgn in (-1, 1):
            f = max(axis_planes(g, ax, sgn, box=[-40, 40, -40, 40, 0.1, hh - 0.1]), key=lambda p: p['area'])
            side.append(sgn * f['off'])
    top = max(axis_planes(g, 'z', 1), key=lambda p: p['area'])['off']
    dev = max(abs(s - (POST_IN5 - comp)) for s in side)
    rec('J3', dict(sides=[r6(s) for s in side], top=r6(top)), f'옆면 = POST_IN {POST_IN5} (− comp), 윗면 = post_h {hh}, ≤ {TOL_L}',
        dev <= TOL_L and abs(top - hh) <= TOL_L, side_dev=r6(dev), top_dev=r6(abs(top - hh)))
    tabs = g.intersect(jb.box3(-50, 50, -50, 50, -20, -1e-3)).Solids()
    nh, ny = P['notch_w_mm'] / 2, P['notch_y_mm']
    margins = []
    for t in tabs:
        x0, y0, _z0, x1, y1, _z1 = jb.tight_bb(t)
        if x1 - x0 > y1 - y0:          # 탭이 ±y 쪽 (x 로 긴 것)
            tang, rad = max(abs(x0), abs(x1)), min(abs(y0), abs(y1))
        else:
            tang, rad = max(abs(y0), abs(y1)), min(abs(x0), abs(x1))
        margins.append(dict(tangential=r6(nh - tang), radial=r6(rad - ny)))
    mn = min(min(m['tangential'], m['radial']) for m in margins)
    rec('J4', r6(mn), '탭 |x| ≤ 8 ↔ 노치 반폭 10, 탭 |y| ≥ 24.5 ↔ 노치 23: 여유 ≥ 1.5', len(tabs) == 4 and round(mn, 6) >= 1.5,
        tabs=margins)
    a = by_id(jigs, '1a')['solid']
    m = by_id(jigs, '1a')['meta']
    pocket = P['plate_mm'] + jb.SLIP
    res = {}
    for face, zr in (('A', (m['zA'] + 0.1, 26 - 0.1)), ('B', (0.1, m['pocket_d'] - 0.1))):
        wx, x0, x1 = gap(a, 'x', [-37, 37, -5, 5, *zr])
        wy, y0, y1 = gap(a, 'y', [-5, 5, -37, 37, *zr])
        res[face] = dict(w=[r6(wx), r6(wy)], c=[r6((x0 + x1) / 2), r6((y0 + y1) / 2)])
    pdev = max(abs(w - pocket) for f in res.values() for w in f['w'])
    c1 = by_id(jigs, '1c')
    bore = find_cyl(c1['solid'], 'z', (0, 0), jb.guide(5.0))
    pc_ = res['B']['c']
    axis_off = math.dist(bore['at'], pc_)
    nut_bot = -m['pocket_d'] - PH['coupler_top_z_mm']
    boss_bot = min(p['off'] for p in axis_planes(c1['solid'], 'z', -1, box=[-7.5, 7.5, -7.5, 7.5, 0, 28]))
    rec('J5', dict(pocket=res, bore_axis_off=r6(axis_off), boss_above_nut=r6(boss_bot - nut_bot)),
        f'포켓 = plate {P["plate_mm"]} + 0.4 (≤ {TOL_L}) / 보어 축 ↔ 포켓 중심 ≤ {TOL_L} / 보스 밑면 ≥ 너트 밑면 + 0.5',
        pdev <= TOL_L and axis_off <= TOL_L and boss_bot - nut_bot >= 0.5, pocket_dev=r6(pdev), nut_bottom=r6(nut_bot), boss_bottom=r6(boss_bot))


def j6_j7(jigs):
    j = by_id(jigs, '2')
    s = j['solid']
    S = max(axis_planes(s, 'z', -1), key=lambda p: p['area'])['off']

    def frame(lines):
        assert len(lines) == 2, lines
        A = meet(*lines)
        feet = []
        for ln in lines:
            feet.append(((ln[2] - ln[1] * S) / ln[0], S))
        return A, feet

    # R: W1 = 막대 밑면 (발이 꼭짓점보다 −a), W2 = 바깥면
    A, feet = frame(slanted(s, [-1, 141, 0, 40, -1, 20]))
    f1, f2 = sorted(feet)
    u1 = ((f1[0] - A[0]) / math.dist(f1, A), (f1[1] - A[1]) / math.dist(f1, A))
    u2 = ((f2[0] - A[0]) / math.dist(f2, A), (f2[1] - A[1]) / math.dist(f2, A))
    wall_ang = math.degrees(math.acos(u1[0] * u2[0] + u1[1] * u2[1]))

    def to_jig(y, z):
        return (A[0] + (POST_OUT5 - y) * u1[0] + z * u2[0], A[1] + (POST_OUT5 - y) * u1[1] + z * u2[1])
    zs = (0.0, (POST_OUT5 - RAMP_Y0_5) * math.tan(RELIEF5))
    pts = [to_jig(RAMP_Y0_5 + z / math.tan(RELIEF5), z) for z in zs]
    dist = max(abs(p[1] - S) for p in pts)
    ang = abs(math.degrees(math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])))
    ang = min(ang, 180 - ang)
    rec('J6', dict(dist=r6(dist), angle_deg=r6(ang)), f'S ↔ V5 비움면 y = {RAMP_Y0_5:.1f} + z/tan{P["post_flip_relief_deg"]}°: 거리 ≤ {TOL_L}, 각 ≤ {TOL_A}°',
        dist <= TOL_L and ang <= TOL_A and abs(wall_ang - 90) <= TOL_A, apex=[r6(v) for v in A], feet=[r6(f1[0]), r6(f2[0])],
        wall_angle_deg=r6(wall_ang), v5_points=[[r6(v) for v in p] for p in pts])
    # C
    A, feet = frame(slanted(s, [-1, 41, 40, 71, -1, 20]))
    f1, f2 = sorted(feet)
    u1 = ((f1[0] - A[0]) / math.dist(f1, A), (f1[1] - A[1]) / math.dist(f1, A))
    u2 = ((f2[0] - A[0]) / math.dist(f2, A), (f2[1] - A[1]) / math.dist(f2, A))
    pts = [(A[0] + (POST_OUT5 - y) * u1[0] + z * u2[0], A[1] + (POST_OUT5 - y) * u1[1] + z * u2[1])
           for y, z in ((POST_IN5, CHAMFER_Z0_5), (POST_OUT5, CHAMFER_Z0_5 + POST_OUT5 - POST_IN5))]
    cdist = max(abs(p[1] - S) for p in pts)
    m = j['meta']
    hc = m['H']['c']
    ceil = [p['off'] for p in axis_planes(s, 'z', -1, box=[hc[0] - 3.5, hc[0] + 3.5, hc[1] - 3.5, hc[1] + 3.5, S + 1, 30])]
    hdepth = min(ceil) - S
    kp = sorted(p['off'] for p in axis_planes(s, 'x', 1, box=[45, 65, m['K']['a'] - 9, m['K']['a'] + 9, 20, 37]))
    stop = kp[0]
    knife = next(v for v in kp if v > stop + 1)
    ramp = PH['post_relief_x_mm'] - (POST_OUT5 - P['post_arm_mm'])
    rec('J7', dict(chamfer_dist=r6(cdist), H_depth=r6(hdepth), K=r6(knife - stop)),
        f'S ↔ 모따기면 z = {CHAMFER_Z0_5:.0f} + (y − {POST_IN5}) ≤ {TOL_L}; H 깊이 = {P["post_h_mm"]}; K 멈춤벽 ↔ 칼 홈 = {ramp:.3f}',
        cdist <= TOL_L and abs(hdepth - P['post_h_mm']) <= TOL_L and abs((knife - stop) - ramp) <= TOL_L,
        apex=[r6(v) for v in A], feet=[r6(f1[0]), r6(f2[0])])


def j8(jigs):
    s = by_id(jigs, '3a')['solid']
    tape = PH['tape_t_mm']
    fl_top = max(axis_planes(s, 'z', 1, box=[-38, 38, -38, 38, 15, 22]), key=lambda p: p['area'])['off']
    half = [max(p['off'] for p in axis_planes(s, 'x', 1, box=[-31, 31, -33, 30, 22, 58], min_area=100)),
            -min(p['off'] for p in axis_planes(s, 'x', -1, box=[-31, 31, -33, 30, 22, 58], min_area=100))]
    front = max(p['off'] for p in axis_planes(s, 'y', 1, box=[-31, 31, 25, 31, 22, 58], min_area=100))
    tops = [p['off'] for p in axis_planes(s, 'z', 1, box=[-31, 31, -34, 31, 50, 59.5])]
    top = max(tops)
    boss, _b0, _b1 = gap(s, 'x', [-23, 23, -5, 5, top + 0.1, top + 2.5])
    hole = find_cyl(by_id(jigs, '3b')['solid'], 'x', HINGE5, 3.2)
    vals = dict(flange=r6(fl_top + tape - P['hood_bottom_z_mm']), half=r6(max(abs(h + tape - HOOD_IN5) for h in half)),
                front=r6(front + tape - HOOD_IN5), top_margin=r6(ROOF5 - tape - top), boss=r6(boss - (PH['hood_roof_hole_mm'] - 0.4)),
                hinge=r6(hole['off']))
    ok = (abs(vals['flange']) <= TOL_L and vals['half'] <= TOL_L and abs(vals['front']) <= TOL_L and vals['top_margin'] >= -TOL_L
          and abs(vals['boss']) <= TOL_L and vals['hinge'] <= TOL_L)
    rec('J8', vals, f'플랜지·반폭·앞면 + tape {tape} = V5 (≤ {TOL_L}), 윗면 ≤ {ROOF5} − tape, 보스 = 44 − 0.4, 3b 구멍 축 = 힌지 {HINGE5}', ok)


def holes_at(solid, pts, bit):
    rows = []
    for p in pts:
        c = find_cyl(solid, 'z', p, jb.guide(bit))
        rows.append(dict(target=[r6(v) for v in p], off=r6(c['off']) if c else None, d=r6(c['d']) if c else None))
    return rows


def fence_dev(solid, fences):
    out = []
    for f in fences:
        n = f['n']
        want = -(n[0] * f['p'][0] + n[1] * f['p'][1])
        best = None
        for p in planes(solid):
            pn = p['n']
            if abs(pn[2]) > 1e-9 or abs(pn[0] + n[0]) > 1e-6 or abs(pn[1] + n[1]) > 1e-6 or p['c'][2] > 0:
                continue
            off = pn[0] * p['c'][0] + pn[1] * p['c'][1]
            if best is None or abs(off - want) < abs(best - want):
                best = off
        out.append(None if best is None else abs(best - want))
    return out


def j9(jigs):
    j = by_id(jigs, '4A-1')
    s = j['solid']
    ears = PH['mg996r_ear_holes']
    tgt = [HINGE5, F0_5, B1_5] + [tuple(e) for e in ears]
    rows = holes_at(s, tgt, 3.2)
    # 펜스: 타워 아래 변(데크 선)·앞아래 변 — PIECES B06 외곽에서
    tb, fl = PH['tower_back_y_mm'], PH['tower_front_low_y_mm']
    b06 = next(p for p in b.PIECES if p['id'] == 'B06')
    pA = min(b06['outline'], key=lambda q: math.dist(q, (tb, b.floor_z(tb))))
    pB = min(b06['outline'], key=lambda q: math.dist(q, (fl, b.floor_z(fl))))
    pC = (fl, PH['tower_step_z_mm'])
    fences = []
    for p, q in ((pA, pB), (pB, pC)):
        L = math.dist(p, q)
        fences.append(dict(p=p, n=((q[1] - p[1]) / L, -(q[0] - p[0]) / L)))
    fd = fence_dev(s, fences)
    worst = max([r['off'] for r in rows] + fd)
    rec('J9', r6(worst), f'구멍(힌지·F0·B1·귀 4) ↔ 2.6절 좌표, 펜스 ↔ 타워 아래 변·앞아래 변 ≤ {TOL_L}', worst <= TOL_L,
        holes=rows, fence_dev=[r6(v) for v in fd])


def j10(jigs):
    s = by_id(jigs, '4C')['solid']
    h = PH['motor_hole_pitch_mm'] / 2
    rows = holes_at(s, [(sx * h, sy * h) for sx in (-1, 1) for sy in (-1, 1)], 3.2)
    wd = PH['motor_plate_hole_mm'] + PH['blade_t_mm'] + 2 * PH['jig_xy_comp_mm']
    w = find_cyl(s, 'z', (0, 0), wd)
    worst = max([r['off'] for r in rows] + [w['off'], abs(w['d'] - wd)])
    rec('J10', r6(worst), f'구멍 (±{h}, ±{h}), 원형 창 중심 (0, 0), 지름 {PH["motor_plate_hole_mm"] + PH["blade_t_mm"]:.2f} ≤ {TOL_L}',
        worst <= TOL_L, holes=rows, window=dict(off=r6(w['off']), d=r6(w['d'])))


def j11(jigs):
    s = by_id(jigs, '4D')['solid']
    lip = [p['off'] for p in axis_planes(s, 'y', -1, box=[-16, 16, -25, -22, -9.5, -7.5])]
    colt = [p['off'] for p in axis_planes(s, 'z', 1, box=[-17, 17, -29, -19, -10, -8.5])]
    cin = sorted(p['off'] for p in axis_planes(s, 'x', box=[-8, 8, -29, -19, -31, -10]))
    lip_y, col_top = lip[0], max(colt)
    want_b = (B0_5[0] - Q0_5[0], B0_5[1] - (Q0_5[1] - P['shelf_t_mm']))
    want_f = (F0_5[0] - Q0_5[0], F0_5[1] - (Q0_5[1] - P['shelf_t_mm']))
    rows = []
    for name, want in (('B0', want_b), ('F0', want_f)):
        tgt = (lip_y + want[0], col_top + want[1])
        cs = [c for c in cylinders(s) if abs(abs(c['dir'][0]) - 1) < 1e-9 and math.dist((c['loc'][1], c['loc'][2]), tgt) < 0.5
              and abs(2 * c['r'] - jb.guide(3.2)) < 0.05]
        offs = [math.dist((c['loc'][1], c['loc'][2]), tgt) for c in cs]
        coax = max(math.dist((a['loc'][1], a['loc'][2]), (c['loc'][1], c['loc'][2])) for a in cs for c in cs) if cs else None
        rows.append(dict(name=name, faces=len(cs), off=r6(max(offs)) if offs else None, coaxial=r6(coax) if cs else None))
    sym = abs(cin[0] + cin[-1]) / 2
    gap_ = cin[-1] - cin[0]
    worst = max([r['off'] for r in rows] + [r['coaxial'] for r in rows] + [sym])
    ok = worst <= TOL_L and all(r['faces'] >= 2 for r in rows) and gap_ >= PH['hook_w_mm']
    rec('J11', r6(worst), f'보어 ↔ B0·F0 (선반 앞면·밑면·몸통 옆면 기준), 두 팔 동축 ≤ {TOL_L}', ok, bores=rows,
        datums=dict(lip_y=r6(lip_y), col_top=r6(col_top), col_inner=[r6(cin[0]), r6(cin[-1])], body_gap=r6(gap_)))


def j12(jigs):
    j = by_id(jigs, '4E')
    s = j['solid']
    top_e = ROOF_TOP5
    back_e = HINGE5[0] - P['hinge_hub_d_mm'] / 2
    ftop = [p for p in axis_planes(s, 'y', -1) if p['c'][2] < 0]
    fbk = [p for p in axis_planes(s, 'x', 1) if p['c'][2] < 0]
    top_f = min(ftop, key=lambda p: abs(p['off'] - top_e))['off']
    back_f = min(fbk, key=lambda p: abs(p['off'] - back_e))['off']
    hc = find_cyl(s, 'z', HINGE5, jb.guide(3.2))
    rel = (hc['at'][0] - back_f, hc['at'][1] - top_f)
    want = (HINGE5[0] - back_e, HINGE5[1] - top_e)
    dev = math.dist(rel, want)
    rr = PH['horn_hole_r_mm']
    horn = []
    for a in (0, 90, 180, 270):
        p = (HINGE5[0] + rr * math.cos(math.radians(a)), HINGE5[1] + rr * math.sin(math.radians(a)))
        c = find_cyl(s, 'z', p, jb.guide(PH['horn_hole_d_mm']))
        horn.append(r6(math.dist(c['at'], hc['at'])))
    hdev = max(abs(h - rr) for h in horn)
    rec('J12', dict(hinge=r6(dev), horn_r=horn), f'힌지 보어 ↔ (−90, 40) (윗변 {top_e}·뒷변 {back_e} 기준), 혼 구멍 반경 {rr:.3f} ≤ {TOL_L}',
        dev <= TOL_L and hdev <= TOL_L, fences=dict(top=r6(top_f), back=r6(back_f)))


def j13(jigs):
    j = by_id(jigs, '4G')
    s = j['solid']
    b01 = next(p for p in b.PIECES if p['id'] == 'B01')
    mk = b01['marks']
    wp = next(h for h in b01['holes'] if 'poly' in h)['poly']
    wc = ((min(p[0] for p in wp) + max(p[0] for p in wp)) / 2, (min(p[1] for p in wp) + max(p[1] for p in wp)) / 2)
    cw = PH['blade_t_mm'] + 2 * PH['jig_xy_comp_mm']
    ww = (max(p[0] for p in wp) - min(p[0] for p in wp) + cw, max(p[1] for p in wp) - min(p[1] for p in wp) + cw)
    gx, x0, x1 = gap(s, 'x', [wc[0] - 24, wc[0] + 24, wc[1] - 5, wc[1] + 5, 0.5, 5.5])
    gy, y0, y1 = gap(s, 'y', [wc[0] - 5, wc[0] + 5, wc[1] - 25, wc[1] + 25, 0.5, 5.5])
    devs = [abs(gx - ww[0]), abs(gy - ww[1]), abs((x0 + x1) / 2 - wc[0]), abs((y0 + y1) / 2 - wc[1])]
    lines = []
    ty = mk['tower_yw']
    for x in mk['tower_in'] + mk['tower_out']:
        offs = [p['off'] for p in axis_planes(s, 'x', box=[x - 1, x + 1, ty[0], ty[1], 0.5, 5.5])]
        lines.append(dict(at=x, center=r6((min(offs) + max(offs)) / 2), w=r6(max(offs) - min(offs))))
    for y in mk['rear_wall_yw'] + mk['front_brace_yw']:
        offs = [p['off'] for p in axis_planes(s, 'y', box=[-30, 30, y - 1, y + 1, 0.5, 5.5])]
        lines.append(dict(at=y, center=r6((min(offs) + max(offs)) / 2), w=r6(max(offs) - min(offs))))
    devs += [abs(l['center'] - l['at']) for l in lines]
    awl = holes_at(s, [(x, y) for x in mk['motor_box_x'] for y in mk['motor_box_yw']], 1.2 - PH['jig_bore_clear_mm'])
    devs += [a['off'] for a in awl]
    worst = max(devs)
    rec('J13', r6(worst), f'창·표시선·송곳 ↔ 2.6절 B01 ≤ {TOL_L}', worst <= TOL_L,
        window=dict(w=[r6(gx), r6(gy)], c=[r6((x0 + x1) / 2), r6((y0 + y1) / 2)]), lines=lines, awl=awl)


def j14(jigs):
    s = by_id(jigs, '5')['solid']
    fr = [p for p in planes(s) if p['n'][1] > 1e-6 and p['n'][2] > 1e-6 and abs(p['n'][0]) < 1e-9]
    assert len(fr) == 1, fr
    n = fr[0]['n']
    ang = math.degrees(math.atan2(n[2], n[1]))
    rec('J14', r6(ang), f'앞면이 수직에서 뒤로 {P["tilt_deg"]}° ≤ {TOL_A}°', abs(ang - P['tilt_deg']) <= TOL_A)


def j15(jigs):
    a = by_id(jigs, '6a')['solid']
    fx = max(axis_planes(a, 'x', 1, box=[9, 11, 10, 50, 0, 40]), key=lambda p: p['area'])
    fy = max(axis_planes(a, 'y', 1, box=[10, 50, 9, 11, 0, 40]), key=lambda p: p['area'])
    ang = math.degrees(math.acos(abs(sum(fx['n'][i] * fy['n'][i] for i in range(3)))))
    s6b = by_id(jigs, '6b')['solid']
    x0, _y0, _z0, x1, _y1, _z1 = jb.tight_bb(s6b)
    span = x1 - x0
    want = 2 * PH['tower_in_x_mm'] - 2 * PH['jig_xy_comp_mm']
    c = by_id(jigs, '6c')['solid']
    pins = []
    for p in (F0_5, B1_5):
        cs = [q for q in cylinders(c) if abs(abs(q['dir'][0]) - 1) < 1e-9 and math.dist((q['loc'][1], q['loc'][2]), p) < 0.5]
        pins.append(dict(target=[r6(v) for v in p], faces=len(cs), off=r6(max(math.dist((q['loc'][1], q['loc'][2]), p) for q in cs))))
    pdev = max(p['off'] for p in pins)
    ok = abs(ang - 90) <= TOL_A and abs(span - want) <= TOL_L and pdev <= TOL_L and all(p['faces'] == 2 for p in pins)
    rec('J15', dict(angle=r6(ang), span=r6(span), pins=r6(pdev)), f'6a 90° ≤ {TOL_A}°, 6b = 2 × {PH["tower_in_x_mm"]} ≤ {TOL_L}, 6c 핀 ↔ F0·B1 ≤ {TOL_L}',
        ok, pins=pins)


def j16(jigs):
    j = by_id(jigs, '7')
    s = j['solid']
    L = PH['slot_len_mm']
    p0 = find_cyl(s, 'z', (0, 0), 3.1)
    p1 = find_cyl(s, 'z', (L, 0), 3.1)
    spacing = math.dist(p0['at'], p1['at'])
    faces = axis_planes(s, 'y', box=[5, L - 5, -3, 3, 0.5, 4.5])
    lo = [f['off'] for f in faces if f['n'][1] > 0]
    hi = [f['off'] for f in faces if f['n'][1] < 0]
    width = min(hi) - max(lo)
    nc = (min(hi) + max(lo)) / 2
    # 창 중심선이 핀 선(s 축)에서 얼마나 떨어졌나 + 핀이 꽂히는 F0·B1 이 V5 직선 위인가
    pin_line_ang = math.degrees(math.atan2(p1['at'][1] - p0['at'][1], p1['at'][0] - p0['at'][0]))
    dist = max(abs(nc - p0['at'][1]), line_dist(F0_5, B0_5, B1_5), line_dist(B1_5, B0_5, B1_5))
    v5_ang = abs(math.degrees(math.atan2(B1_5[1] - B0_5[1], B1_5[0] - B0_5[0]) - math.atan2(B1_5[1] - F0_5[1], B1_5[0] - F0_5[0])))
    ang = abs(pin_line_ang) + v5_ang
    want_w = 3.4 + PH['blade_t_mm'] + 2 * PH['jig_xy_comp_mm']
    ok = dist <= TOL_L and ang <= TOL_A and abs(width - want_w) <= TOL_L and abs(spacing - L) <= TOL_L
    rec('J16', dict(dist=r6(dist), angle=r6(ang), width=r6(width), pin_spacing=r6(spacing)),
        f'창 중심선 ↔ V5 B0→B1 직선 ≤ {TOL_L}, 각 ≤ {TOL_A}°, 폭 = 3.40 + blade = {want_w:.2f}, 핀 간격 = {L:.3f}', ok,
        v5_line=dict(B0=[r6(v) for v in B0_5], B1=[r6(v) for v in B1_5], F0=[r6(v) for v in F0_5]))


RULES = dict(drill=('비트 + 0.15', lambda t: t + PH['jig_bore_clear_mm'] + 2 * PH['jig_xy_comp_mm']),
             plug=('목표 − blade_t', lambda t: t - PH['blade_t_mm'] - 2 * PH['jig_xy_comp_mm']),
             plug_r=('반경 = 목표 − blade_t/2', lambda t: t - PH['blade_t_mm'] / 2 - PH['jig_xy_comp_mm']),
             window=('목표 + blade_t', lambda t: t + PH['blade_t_mm'] + 2 * PH['jig_xy_comp_mm']),
             pin=('구멍 비트 − 0.1', lambda t: t - 0.1),
             awl=('송곳 표시 Ø1.2', lambda t: 1.2))


def j17(jigs):
    rows = []
    for j in jigs:
        for f in j['feats']:
            if f['kind'] not in RULES:
                continue
            rule, fn = RULES[f['kind']]
            want = fn(f['target'])
            pr = f['probe']
            if 'cyl' in pr:
                exp_d = 2 * want if f['kind'] == 'plug_r' else want
                c = find_cyl(j['solid'], pr['axis'], tuple(pr['cyl']), exp_d)
                got = None if c is None else (c['d'] / 2 if f['kind'] == 'plug_r' else c['d'])
            else:
                got = gap(j['solid'], pr['gap'], pr['box'])[0]
            ok = got is not None and abs(got - want) <= 1e-6
            rows.append(dict(jig=j['id'], feature=f['name'], kind=f['kind'], rule=rule, target=f['target'], expect=r6(want),
                             measured=None if got is None else r6(got), ok=ok))
    bad = [r for r in rows if not r['ok']]
    print('     J17 표:', flush=True)
    for r in rows:
        print(f"       {r['jig']:6s} {r['feature'][:34]:34s} {r['kind']:7s} 목표 {r['target']:8.3f} → {r['expect']:8.3f} 측정 {r['measured']}", flush=True)
    rec('J17', f'{len(rows) - len(bad)}/{len(rows)}', '모든 안내 구멍 = 비트 + 0.15, 플러그 = 목표 − blade_t, 창 = 목표 + blade_t (일치)', not bad,
        table=rows, failed=bad)


def j18():
    CHECKS.append(dict(id='J18', manual=True, value=None, limit='출력한 1b 게이지 59.00 ± 0.05, 지그 7 창 3.80 ± 0.05',
                       ok=None, note='사람 측정. 넘으면 PH jig_xy_comp_mm 를 (측정 − 목표)/2 로 넣고 다시 출력'))
    print('MAN  J18 사람 측정 (1b 59.00, 지그 7 창 3.80, ±0.05)', flush=True)


def main():
    index = json.loads((jb.OUT / 'index.json').read_text(encoding='utf-8'))
    jigs = jb.make_jigs()
    assert [j['file'] for j in jigs] == [i['file'] for i in index['jigs']], 'index.json 이 오래됨 — build_v5h_jigs.py 를 먼저'
    for fn in (lambda: j1_j2(jigs, index), lambda: j3_j5(jigs), lambda: j6_j7(jigs), lambda: j8(jigs), lambda: j9(jigs),
               lambda: j10(jigs), lambda: j11(jigs), lambda: j12(jigs), lambda: j13(jigs), lambda: j14(jigs), lambda: j15(jigs),
               lambda: j16(jigs), lambda: j17(jigs), j18):
        fn()
    auto = [c for c in CHECKS if not c.get('manual')]
    failed = [c['id'] for c in auto if not c['ok']]
    out = dict(source='docs/V5H_DESIGN.md 6.1절', stl_files=len(jigs), prints=sum(j['qty'] for j in jigs),
               passed=len(auto) - len(failed), failed=failed, manual=['J18'], checks=CHECKS)
    (OUT / 'jig_checks.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(auto) - len(failed)}/{len(auto)} 통과' + (f', 실패 {failed}' if failed else ''), flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
