"""export_v5h_web.py — 웹 3D 조립 설명서용 V5H 데이터 (models/robot_v5h/assembly_web.json).

원본: build_robot_v5h (PIECES, piece_solid, place, purchased, hardware, cube_solid). 이 스크립트는 원본을 import 만 한다.

좌표
- 월드 (X, Y_w, Z_w): Z 위, 책상 Z_w = table_zw. 국소 → 월드는 x축 둘레 +tilt_deg (docs/V5H_DESIGN.md 0.3절).
- 조각 2D 좌표 (u, v, w): (u, v) = pieces.json outline 좌표, w = 0~3 두께 방향.
  matrix (column-major 16개, three.js Matrix4.fromArray) 가 (u, v, w, 1) → 월드. 모두 정상 회전(행렬식 +1).
  · XY: u→x, v→y, w→+z (z = lo + w)   · YZ: u→y, v→z, w→+x (x = lo + w)
  · XZ: u→x, v→z, w→−y (y = hi − w, 뒤(−y)에서 본 면이 w = 3 쪽)
  · WORLD: (X, Y_w, Z_w = lo + w)       · OBLIQUE(L02): u→x, v→N, w→D (B0 기준 s = lo + w)
  · 패널: _panel_place 의 작업평면 (xDir, yDir, normal)
  · P01·P02 인스턴스는 z축 둘레 rot_z 를 matrix 에 넣는다. 후드·리프터·크랭크·링크는 OPEN 자세 변환을 넣는다.
- 인스턴스 이름: <id>(-<sub>)#<k>. sub = pieces.json 의 sub, 없으면 side(K04·B05 의 R/L), P02 는 띠 L0~L3.
  k = 같은 id·sub 안에서 pieces.json offset 순서 (문서 2절 순서).
- P02: 띠 4장(본 제작 장수)을 지그로 8토막씩 나눠 놓으므로 놓인 조각은 32개다. outline 은 토막 하나
  (x_range × 띠 폭, 길이 11.1) — pieces.json 의 110 띠 외곽과 다르다. 그래서 놓인 조각 수 = 72 − 4 + 32 = 100.
- finish(모따기·경사·데크 경사) 가 있는 조각은 outline 압출과 모양이 다르므로 finished_mesh (조각 2D 좌표, matrix 그대로 적용)
  를 함께 넣는다.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cadquery as cq  # noqa: E402

import build_robot_v5h as b  # noqa: E402
from robot_v5h_params import PH  # noqa: E402

OUT = b.OUT / 'assembly_web.json'
POSE = 'open'
TESS_TOL = 0.3
TESS_ANG = 0.5
MAX_BYTES = 3 * 1024 * 1024
BBOX_TOL = 0.05


# ---------------------------------------------------------------- 4×4 행렬 (행 우선 리스트)

def mat(cols, t):
    """열 벡터 3개 + 이동 → 4×4."""
    return [[cols[0][r], cols[1][r], cols[2][r], t[r]] for r in range(3)] + [[0.0, 0.0, 0.0, 1.0]]


def ident():
    return mat([(1, 0, 0), (0, 1, 0), (0, 0, 1)], (0, 0, 0))


def mul(a, c):
    return [[sum(a[r][k] * c[k][col] for k in range(4)) for col in range(4)] for r in range(4)]


def rot_x(deg, centre=(0.0, 0.0, 0.0)):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    r = mat([(1, 0, 0), (0, ca, sa), (0, -sa, ca)], (0, 0, 0))
    return mul(mul(trans(centre), r), trans([-v for v in centre]))


def rot_z(deg):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    return mat([(ca, sa, 0), (-sa, ca, 0), (0, 0, 1)], (0, 0, 0))


def trans(t):
    return mat([(1, 0, 0), (0, 1, 0), (0, 0, 1)], t)


def apply(m, p):
    return tuple(m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3] for r in range(3))


def rigid_inv(m):
    rt = [[m[c][r] for c in range(3)] for r in range(3)]
    t = [-sum(rt[r][k] * m[k][3] for k in range(3)) for r in range(3)]
    return [rt[r] + [t[r]] for r in range(3)] + [[0.0, 0.0, 0.0, 1.0]]


def det3(m):
    return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))


def col_major(m):
    return [z0(round(m[r][c], 6)) for c in range(4) for r in range(4)]


def from_col_major(a):
    return [[a[c * 4 + r] for c in range(4)] for r in range(4)]


def z0(v):
    return 0.0 if v == 0 else v                      # −0.0 → 0.0 (결정적 출력)


L2W = rot_x(PH['tilt_deg'])                          # 국소 → 월드


# ---------------------------------------------------------------- 자세 (build_robot_v5h.place 와 같은 변환)

def pose_matrix(motion, hood_deg, theta):
    if motion == 'hood':
        return rot_x(hood_deg, (0.0, *b.HINGE))
    if motion == 'lifter':
        s = b.linkage(theta)[0]
        return trans((0.0, b.D[0] * s, b.D[1] * s))
    if motion == 'crank':
        return rot_x(theta, (0.0, *b.SERVO))
    if motion == 'link':
        _, pin, slider = b.linkage(theta)
        a0 = math.degrees(math.atan2(b.B0[1] - b.PIN0[1], b.B0[0] - b.PIN0[0]))
        a1 = math.degrees(math.atan2(slider[1] - pin[1], slider[0] - pin[0]))
        return mul(trans((0.0, pin[0] - b.PIN0[0], pin[1] - b.PIN0[1])), rot_x(a1 - a0, (0.0, *b.PIN0)))
    return ident()


# ---------------------------------------------------------------- 조각 행렬 (조각 2D → 국소 또는 월드)

def panel_plane(pc, lo):
    """build_robot_v5h._panel_place 와 같은 작업평면 (월드). 반환: (xDir, yDir, normal, origin)."""
    t = b.ST
    y_front = PH['deck_yw_mm'][1] + PH.get('panel_gap_mm', 58.0) + PH['panel_floor_d_mm']
    pt = math.radians(PH['panel_tilt_deg'])
    e_n = cq.Vector(0, math.cos(pt), math.sin(pt))
    front_origin = cq.Vector(0, y_front, b.TABLE + t + t * math.sin(pt))
    if pc['id'] == 'C02':
        plane = cq.Plane(cq.Vector(0, y_front, b.TABLE), cq.Vector(1, 0, 0), cq.Vector(0, 0, 1))
        off = 0
    elif pc['id'] in ('C01', 'C04'):
        plane = cq.Plane(front_origin, cq.Vector(1, 0, 0), -e_n)
        off = 0 if pc['id'] == 'C01' else t
    elif pc['id'] == 'C03':
        back = front_origin - e_n * t
        plane = cq.Plane(cq.Vector(lo[1], back.y, back.z), cq.Vector(0, -1, 0), cq.Vector(-1, 0, 0))
        off = 0
    else:
        raise ValueError(pc['id'])
    o = plane.origin + plane.zDir * off
    return mat([plane.xDir.toTuple(), plane.yDir.toTuple(), plane.zDir.toTuple()], o.toTuple())


def piece_matrix(pc, i, hood_deg, theta):
    """(u, v, w) → 월드."""
    lo, hi = pc['offset'][i]
    inst = (pc.get('instances') or [{}] * len(pc['offset']))[i]
    if pc.get('frame') == 'panel':
        return panel_plane(pc, (lo, hi))
    if pc['plane'] == 'WORLD':
        return trans((0.0, 0.0, lo))
    if pc['plane'] == 'XY':
        m = trans((0.0, 0.0, lo))
    elif pc['plane'] == 'YZ':
        m = mat([(0, 1, 0), (0, 0, 1), (1, 0, 0)], (lo, 0, 0))
    elif pc['plane'] == 'XZ':
        m = mat([(1, 0, 0), (0, 0, 1), (0, -1, 0)], (0, hi, 0))
    elif pc['plane'] == 'OBLIQUE':
        o = b.sn(lo, 0.0)
        m = mat([(1, 0, 0), (0, b.N[0], b.N[1]), (0, b.D[0], b.D[1])], (0, o[0], o[1]))
    else:
        raise ValueError(pc['plane'])
    if inst.get('rot_z'):
        m = mul(rot_z(inst['rot_z']), m)
    return mul(L2W, mul(pose_matrix(b.motion_of(pc), hood_deg, theta), m))


def piece_outline(pc, i):
    if pc['id'] == 'P02':
        xr = pc['instances'][i]['x_range']
        y0, y1 = pc['outline'][0][1], pc['outline'][2][1]
        return b.pts6(b.ccw(b.rect(xr[0], xr[1], y0, y1))), []
    return pc['outline'], pc['holes']


def world_solid(pc, i, hood_deg, theta, finished):
    s = b.piece_solid(pc, i, finished)
    return b.local_to_world(b.place(s, b.motion_of(pc), hood_deg, theta))


def vbbox(pts):
    return [[min(p[k] for p in pts) for k in range(3)], [max(p[k] for p in pts) for k in range(3)]]


def bbox_err(a, c):
    return max(abs(a[j][k] - c[j][k]) for j in range(2) for k in range(3))


def verts(shape):
    return [v.toTuple() for v in shape.Vertices()]


# ---------------------------------------------------------------- 메시

def r4(v):
    return z0(round(float(v), 4))


def mesh_of(shape, to_frame=None, tol=TESS_TOL):
    pts, tris = shape.tessellate(tol, TESS_ANG)
    out_p, index, idx = [], {}, []
    for p in pts:
        q = p.toTuple()
        if to_frame is not None:
            q = apply(to_frame, q)
        key = tuple(r4(c) for c in q)
        if key not in index:
            index[key] = len(index)
            out_p += list(key)
        idx.append(index[key])
    faces = []
    for t in tris:
        a, c, d = idx[t[0]], idx[t[1]], idx[t[2]]
        if a != c and c != d and a != d:
            faces += [a, c, d]
    return dict(positions=out_p, indices=faces)


def mesh_pts(m):
    p = m['positions']
    return [tuple(p[k:k + 3]) for k in range(0, len(p), 3)]


# ---------------------------------------------------------------- 조각

def sub_of(pc):
    if pc['id'] == 'P02':
        return pc['layer']
    return pc.get('sub') or pc.get('side')


def contiguous(offs):
    return len(offs) > 1 and all(abs(offs[k][1] - offs[k + 1][0]) < 1e-6 or abs(offs[k][0] - offs[k + 1][1]) < 1e-6
                                 for k in range(len(offs) - 1))


def export_pieces(hood_deg, theta):
    out, errs, finish_dev = [], [], {}
    counters = {}
    max_vert = 0.0
    for pc in b.PIECES:
        if pc.get('blank') or pc['group'] == 'spare':
            continue
        sub = sub_of(pc)
        stacked = contiguous(pc['offset'])
        for i in range(len(pc['offset'])):
            key = (pc['id'], sub)
            counters[key] = counters.get(key, 0) + 1
            inst_name = pc['id'] + (f'-{sub}' if sub else '') + f'#{counters[key]}'
            inst = (pc.get('instances') or [{}] * len(pc['offset']))[i]
            if pc['id'] == 'P01':
                layer = inst['layer']
            elif pc['id'] == 'P02':
                layer = int(pc['layer'][1:]) + 1
            else:
                layer = i + 1 if stacked else 1
            outline, holes = piece_outline(pc, i)
            m_cm = col_major(piece_matrix(pc, i, hood_deg, theta))
            m = from_col_major(m_cm)                     # 파일에 적히는 (반올림된) 행렬로 검증한다
            assert abs(det3(m) - 1) < 1e-5, (inst_name, det3(m))
            # 검증: outline 압출 꼭짓점 bbox == piece_solid(마감 전) 꼭짓점 bbox
            prism = [apply(m, (u, v, w)) for u, v in outline for w in (0.0, b.ST)]
            raw = world_solid(pc, i, hood_deg, theta, finished=False)
            raw_v = verts(raw)
            err = bbox_err(vbbox(prism), vbbox(raw_v))
            errs.append((err, inst_name))
            # 외곽 꼭짓점 하나하나가 솔리드 꼭짓점 위에 있는가 (거울상·회전 오류 검출)
            for p in prism:
                max_vert = max(max_vert, min(math.dist(p, q) for q in raw_v))
            rec = dict(inst=inst_name, id=pc['id'], sub=sub, name=pc['name'], group=pc['group'], layer=layer,
                       plane=pc['plane'], motion=b.motion_of(pc), color=b.COLORS['panel' if pc['group'] == 'panel' else 'foam'],
                       outline=outline,
                       holes=[dict(c=[h['x'], h['y']], d=h['d']) for h in holes if 'd' in h],
                       cutouts=[h['poly'] for h in holes if 'poly' in h],
                       matrix=m_cm)
            ops = pc.get('finish', [])
            if ops:
                fin = world_solid(pc, i, hood_deg, theta, finished=True)
                rec['finish'] = list(ops)
                rec['finished_mesh'] = mesh_of(fin, rigid_inv(m))
                back = [apply(m, p) for p in mesh_pts(rec['finished_mesh'])]
                assert bbox_err(vbbox(back), vbbox(verts(fin))) < 1e-3, inst_name
                finish_dev[inst_name] = round(bbox_err(vbbox(prism), vbbox(verts(fin))), 4)
            out.append(rec)
    return out, errs, max_vert, finish_dev


# ---------------------------------------------------------------- 구매품 · 철물 · 큐브

HW_NAMES = [  # hardware() 키 → (인스턴스, 설명)
    ('coupler', 'COUPLER#1', '커플링 Ø18 × 25'),
    ('m5_stub', 'F03#1', 'M5×16 + M5 너트 (홀더 스텁)'),
    ('pin_B_R', 'F08#1', '리프터 슬롯 핀 B 오른쪽'),
    ('pin_F_R', 'F08#2', '리프터 슬롯 핀 F 오른쪽'),
    ('pin_B_L', 'F08L#1', '리프터 슬롯 핀 B 왼쪽 (링크 낌, F08L)'),
    ('pin_F_L', 'F08#3', '리프터 슬롯 핀 F 왼쪽'),
    ('pad', 'PAD#1', '리프터 선반 고무 패드'),
    ('hinge_bolt_L', 'F04#1', '후드 왼쪽 피벗 M3×20 + 너트'),
    ('hood_washers_L', 'F04-W#1', '왼쪽 팔 베어링 와셔 2장 (팔에 접착)'),
    ('mg996r_horn', 'MG996R-HORN#1', 'MG996R 원형 혼 + 심 와셔 (F06)'),
    ('ear_bolts', 'F05', 'MG996R 귀 볼트 M3×12'),
    ('crank_pin', 'F09#1', '크랭크 핀 M3×6 + 와셔'),
]
KIT_NAMES = dict(nema17='NEMA17', mg996r='MG996R', sg90='SG90')


def f01_bolts():
    """F01 모터 볼트 M3×10 + 와셔 ×4 (hardware() 에 없음, 3절 표 숫자 그대로): 와셔 z −44~−43.5, 머리 −43.5~−40.5, 끝 −53.5."""
    mh = PH['motor_hole_pitch_mm'] / 2
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = cq.Vector(sx * mh, sy * mh, 0)
            s = (cq.Solid.makeCylinder(PH['washer_m3_d_mm'] / 2, PH['washer_m3_t_mm'], c + cq.Vector(0, 0, -44.0))
                 .fuse(cq.Solid.makeCylinder(PH['head_m3_r_mm'], 3.0, c + cq.Vector(0, 0, -43.5)))
                 .fuse(cq.Solid.makeCylinder(b.M3 / 2, 10.0, c + cq.Vector(0, 0, -53.5))).clean())
            out.append(s)
    return out


def export_parts(hood_deg, theta):
    parts = []
    hw = b.hardware()
    assert sorted(hw) == sorted(k for k, *_ in HW_NAMES), sorted(hw)
    eye = col_major(ident())

    def add(inst, desc, shape, motion, color):
        w = b.local_to_world(b.place(shape, motion, hood_deg, theta))
        parts.append(dict(inst=inst, desc=desc, kind='mesh', motion=motion, color=b.COLORS[color],
                          mesh=mesh_of(w), matrix=eye))

    for key, inst, desc in HW_NAMES:
        shape, motion, color = hw[key]
        if key == 'ear_bolts':
            solids = sorted(shape.Solids(), key=lambda s: tuple(round(c, 3) for c in s.Center().toTuple()))
            assert len(solids) == 4, len(solids)
            for k, s in enumerate(solids, 1):
                add(f'F05#{k}', desc, s, motion, color)
        else:
            add(inst, desc, shape, motion, color)
    for k, s in enumerate(f01_bolts(), 1):
        add(f'F01#{k}', '모터 볼트 M3×10 + 와셔 (3절 표, CAD 에 없던 것을 표 숫자로 추가)', s, 'base', 'hardware')
    kit = b.purchased()
    for key in ('nema17', 'mg996r', 'sg90'):
        add(KIT_NAMES[key], f'키트 모델 {key} (tessellate {TESS_TOL} mm)', kit[key], 'fixed', key)
    # 큐브: 원시 상자 (BoxGeometry 는 가운데 원점)
    cube = b.cube_solid(POSE)
    bb = cube.BoundingBox()
    centre = ((bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, (bb.zmin + bb.zmax) / 2)
    assert POSE != 'flip'
    parts.append(dict(inst='CUBE', desc='57 mm 큐브', kind='box', motion='fixed', color=b.COLORS['cube'],
                      size=[b.C, b.C, b.C], matrix=col_major(mul(L2W, trans(centre)))))
    return parts


def part_points(p):
    if p['kind'] == 'mesh':
        return mesh_pts(p['mesh'])
    m = [[p['matrix'][c * 4 + r] for c in range(4)] for r in range(4)]
    h = [s / 2 for s in p['size']]
    return [apply(m, (sx * h[0], sy * h[1], sz * h[2])) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]


# ---------------------------------------------------------------- 본체

def main():
    hood_deg, theta = b.POSES[POSE]
    info = b.summary()
    pieces, errs, max_vert, finish_dev = export_pieces(hood_deg, theta)
    parts = export_parts(hood_deg, theta)
    names = [p['inst'] for p in pieces] + [p['inst'] for p in parts]
    assert len(names) == len(set(names)), [n for n in names if names.count(n) > 1]
    pts = []
    for p in pieces:
        m = [[p['matrix'][c * 4 + r] for c in range(4)] for r in range(4)]
        pts += [apply(m, (u, v, w)) for u, v in p['outline'] for w in (0.0, b.ST)]
    for p in parts:
        pts += part_points(p)
    bbox = [[r4(v) for v in row] for row in vbbox(pts)]
    worst = max(errs)
    p02 = sum(1 for p in pieces if p['id'] == 'P02')
    sheets = info['sheets']
    expect = sheets - info['per_id']['P02'] + p02
    check = dict(
        max_bbox_err_mm=round(worst[0], 6), worst_inst=worst[1], bbox_tol_mm=BBOX_TOL,
        bbox_compare='outline 압출(matrix) 꼭짓점 bbox vs piece_solid(finished=False) 꼭짓점 bbox (월드, OPEN)',
        max_outline_vertex_err_mm=round(max_vert, 6),
        piece_count=len(pieces), sheet_count=sheets, summary_sheets=sheets, p02_strips=info['per_id']['P02'], p02_placed=p02,
        piece_count_note=f'놓인 조각 {len(pieces)} = 본 제작 {sheets}장 − P02 띠 {info["per_id"]["P02"]} + P02 토막 {p02} '
                         '(띠 1장을 8토막으로 나눠 놓는다). 블랭크 H05·H06, 여분 제외.',
        part_count=len(parts), names_unique=True,
        finished_bbox_dev_mm=dict(sorted(finish_dev.items())),
        finished_note='finish 가 있는 조각은 마감(모따기·경사·데크 경사) 때문에 outline 압출과 bbox 가 다르다 → finished_mesh 를 쓴다.',
    )
    assert check['max_bbox_err_mm'] <= BBOX_TOL, worst
    assert check['max_outline_vertex_err_mm'] <= BBOX_TOL, max_vert
    assert len(pieces) == expect, (len(pieces), expect)
    data = dict(units='mm', frame=f'world (Z 위, 책상 Z_w = {b.TABLE})', pose=POSE.upper(), thickness=b.ST,
                table_zw=b.TABLE, tilt_deg=PH['tilt_deg'],
                piece_frame=dict(XY='u→x, v→y, w→+z', YZ='u→y, v→z, w→+x', XZ='u→x, v→z, w→−y (y = hi − w)',
                                 WORLD='u→X, v→Y_w, w→+Z_w', OBLIQUE='u→x, v→N, w→D', panel='_panel_place 작업평면',
                                 note='국소 → 월드는 x축 둘레 +tilt_deg. matrix 는 (u, v, w) → 월드, 행렬식 +1'),
                motion=dict(hood=dict(axis_point_world=[r4(v) for v in apply(L2W, (0.0, *b.HINGE))],
                                      axis_dir_world=[1.0, 0.0, 0.0], open_deg=hood_deg,
                                      close_deg=b.POSES['close'][0],
                                      note='OPEN 행렬에 들어 있다. CLOSE 로 보이려면 이 축 둘레 (close − open)° 회전'),
                            crank_theta_deg=theta),
                pieces=pieces, parts=parts, bbox=bbox, check=check)
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(text + '\n', encoding='utf-8')
    size = OUT.stat().st_size
    print(f'{OUT.relative_to(b.ROOT)}: {size} bytes, pieces {len(pieces)}, parts {len(parts)}, '
          f'max_bbox_err {check["max_bbox_err_mm"]} ({worst[1]}), max_vertex_err {check["max_outline_vertex_err_mm"]}')
    if size > MAX_BYTES:
        print('too large:', size, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
