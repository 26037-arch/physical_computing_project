"""build_robot_v5h.py — V5H(3 mm 포맥스 수작업판) 조각 목록 · 조각 솔리드 · 조립.

원본은 docs/V5H_DESIGN.md (2절 부품 분해, 3절 체결, 2.8절 구매품 자리). 치수는 robot_v5h_params.PH.
V5 모듈(build_robot_v5, build_kit_parts_v5)은 import 해서 쓰고 고치지 않는다.

다음 워커용 인터페이스
- PIECES: 조각 목록. 원소(dict)
    id        문서 2절 ID (H01 …). 같은 ID 라도 구멍이 다르면 원소를 나눈다 (예: K04 오른쪽/왼쪽, B07 T1R/T2R).
    name, group  group ∈ holder/hood/lifter/base/crank_link/panel/spare
    count     자를 장수. 블랭크(H05·H06, blank=True)는 본 제작 72장에 세지 않는다.
    plane     'XY' (u,v)=(x,y) · 'YZ' (u,v)=(y,z) +x 쪽에서 본 면 · 'XZ' (u,v)=(x,z) · 'WORLD' (u,v)=(X,Y_w)
              · 'OBLIQUE' (L02 만: (u,v)=(x,n), 두께 방향 D). 패널(C)은 'WORLD' + frame='panel' (자체 좌표).
    offset    인스턴스마다 평면 법선 방향 [lo, hi] (XY→z, YZ→x, XZ→y, WORLD→Z_w, OBLIQUE→s). 길이 = 놓이는 개수.
    outline   2D 꼭짓점 [[u, v], …] 반시계. 호는 잘게 나눈 꼭짓점이고 정확한 호는 arcs 에 따로 적는다.
    holes     {x, y, d} 드릴(d = 비트 지름; method='knife' 면 칼로 딴다) 또는 {poly: [...]} 칼로 따는 창.
              x, y 는 조각 2D 좌표 (u, v).
    notes     도면에 적을 글.
    선택 키   arcs, marks, instances(놓기 변환), finish(사포·경사 마감), blank, spare_of, axis_frame,
              final_section(P02), layer.
- piece_solid(piece, i=0, finished=True): i 번째 인스턴스를 국소 좌표에 놓은 3 mm 솔리드.
- assembly(pose): pose ∈ open/close/flip/load → [(name, shape, color_key)].
- models/robot_v5h/pieces.json: {"pieces": PIECES, …메타}.
"""
import argparse
import json
import math
import re
from pathlib import Path

import cadquery as cq

from robot_v5h_params import PH
import build_robot_v5 as v5

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'robot_v5h'

ST = PH['sheet_t_mm']
TILT = math.radians(PH['tilt_deg'])
CT, SN = math.cos(TILT), math.sin(TILT)
C = PH['cube_mm']
H = C / 2
POST_IN = H + PH['post_clearance_mm']                 # 29.5
POST_OUT = POST_IN + PH['post_t_mm']                  # 34.5
POST_END = POST_OUT - PH['post_arm_mm']               # 17.5
RELIEF_X = PH['post_relief_x_mm']                     # 28.6
RAMP_Y0 = -(PH['post_flip_pivot_y_mm'] - PH['post_flip_margin_mm'])   # 28.5
RAMP_K = 1 / math.tan(math.radians(PH['post_flip_relief_deg']))       # 0.46424
CHAMFER_Z0 = PH['post_h_mm'] - PH['post_chamfer_mm']  # 11 at the inner face
HOOD_IN = H + PH['hood_clearance_mm']                 # 30
HOOD_OUT = HOOD_IN + PH['hood_wall_mm']               # 33
ROOF_Z = C + PH['hood_roof_clear_mm']                 # 58.5
ROOF_TOP = ROOF_Z + PH['hood_roof_t_mm']              # 61.5
HB = PH['hood_bottom_z_mm']
HINGE = (PH['hinge_y_mm'], PH['hinge_z_mm'])
D, N = PH['lift_D'], PH['lift_N']
Q0, B0, F0, B1 = PH['lift_Q0'], PH['lift_B0'], PH['lift_F0'], PH['lift_B1']
SERVO, PIN0 = PH['servo_yz'], PH['crank_pin0_yz']
R, LINK = PH['crank_r_mm'], PH['link_mm']
DECK = PH['deck_top_zw_mm']
TABLE = PH['table_zw_mm']
TOWER_IN = PH['tower_in_x_mm']
M3 = PH['m3_shank_d_mm']

COLORS = dict(v5.COLORS, foam='#f2f2ee', hardware='#a0a6ad', coupler='#c3c7cb', rubber='#2b2b2b',
              horn='#f5f5f5', panel='#f2f2ee')


# ---------------------------------------------------------------- 2D 도우미

def r6(v):
    return round(float(v), 6)


def pts6(pts):
    return [[r6(a), r6(b)] for a, b in pts]


def area(pts):
    return 0.5 * sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))


def ccw(pts):
    pts = [tuple(p) for p in pts]
    return pts if area(pts) > 0 else pts[::-1]


def rect(u0, u1, v0, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def arc(c, r, a0, a1, n):
    """a0 → a1 (도) 호 위의 n+1 점 (양끝 포함)."""
    return [(c[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             c[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def capsule(a, b, r, seg=48):
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    return ccw(arc(b, r, ang - 90, ang + 90, seg) + arc(a, r, ang + 90, ang + 270, seg))


def hexagon(c, af):
    """평면이 u 축에 수직 (꼭짓점이 v 축 위)."""
    ri = af / 2
    ro = af / math.sqrt(3)
    return ccw([(c[0] + ri, c[1] - ro / 2), (c[0] + ri, c[1] + ro / 2), (c[0], c[1] + ro),
                (c[0] - ri, c[1] + ro / 2), (c[0] - ri, c[1] - ro / 2), (c[0], c[1] - ro)])


def octagon(af):
    h = af / 2
    s = h * math.tan(math.radians(22.5))
    return ccw([(h, -s), (h, s), (s, h), (-s, h), (-h, s), (-h, -s), (-s, -h), (s, -h)])


def fillet_corners(pts, corners, r, seg=16):
    """pts 의 꼭짓점 중 corners 에 든 것을 반경 r 호로 바꾼다 (볼록 꼭짓점, 반시계 외곽)."""
    out = []
    n = len(pts)
    for i, p in enumerate(pts):
        if tuple(p) not in corners:
            out.append(p)
            continue
        a, b = pts[i - 1], pts[(i + 1) % n]
        din = ((p[0] - a[0]) / math.dist(a, p), (p[1] - a[1]) / math.dist(a, p))
        dout = ((b[0] - p[0]) / math.dist(p, b), (b[1] - p[1]) / math.dist(p, b))
        c = (p[0] - r * din[0] + r * dout[0], p[1] - r * din[1] + r * dout[1])
        a0 = math.degrees(math.atan2(-dout[1], -dout[0]))
        out += arc(c, r, a0, a0 + 90, seg)
    return out


def sn(s, n, base=B0):
    return (base[0] + s * D[0] + n * N[0], base[1] + s * D[1] + n * N[1])


def floor_z(y, zw=DECK):
    """국소 y 에서 월드 높이 zw 평면의 국소 z."""
    return zw / CT - y * math.tan(TILT)


def world_yw(y, z):
    return y * CT - z * SN


def near(a, b, tol=2e-3):
    a = a if isinstance(a, (tuple, list)) else (a,)
    b = b if isinstance(b, (tuple, list)) else (b,)
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def doc(value, expect, what, tol=2e-3):
    """문서에 적힌 숫자와 파라미터 계산값이 같은지 확인한다 (어긋나면 문서 오류 → 멈춤)."""
    assert near(value, expect, tol), f'{what}: computed {value} != doc {expect}'
    return value


# ---------------------------------------------------------------- 조각 목록

def piece(pid, name, group, plane, outline, offsets, holes=(), notes='', count=None, **extra):
    d = dict(id=pid, name=name, group=group, count=count if count is not None else len(offsets), plane=plane,
             offset=[[r6(a), r6(b)] for a, b in offsets], outline=pts6(ccw(outline)),
             holes=[dict(h, poly=pts6(ccw(h['poly']))) if 'poly' in h else {k: (r6(v) if isinstance(v, float) else v)
                                                                           for k, v in h.items()} for h in holes],
             notes=notes)
    d.update(extra)
    return d


def drill(u, v, d, **kw):
    return dict(x=u, y=v, d=d, **kw)


def window(poly, **kw):
    return dict(poly=poly, **kw)


def make_pieces():
    PS = []
    t = ST
    # ---- 홀더 (H, P)
    w = PH['plate_mm'] / 2
    nh, ny = PH['notch_w_mm'] / 2, PH['notch_y_mm']
    nb = 10.0                                            # 노치 옆 판 띠 (|v| 10 ~ 35)
    sharp = [(-w, -w), (-nh, -w), (-nh, -ny), (nh, -ny), (nh, -w), (w, -w), (w, -nb), (ny, -nb), (ny, nb), (w, nb),
             (w, w), (nh, w), (nh, ny), (-nh, ny), (-nh, w), (-w, w), (-w, nb), (-ny, nb), (-ny, -nb), (-w, -nb)]
    doc(len(sharp), 20, 'H01 sharp vertices')
    rc = PH['plate_corner_r_mm']
    h01 = fillet_corners(sharp, {(-w, -w), (w, -w), (w, w), (-w, w)}, rc)
    PS.append(piece('H01', '판', 'holder', 'XY', h01, [(-PH['plate_t_mm'], 0)],
                    notes='구멍 없음. 바깥 네 모서리만 R1.5(칼 뒤 사포), 노치 안쪽 모서리는 날카롭게. 윗면 투명 포장테이프 한 겹. '
                          '밑면 가운데 HD1, 윗면 네 모서리 기둥 (지그 1).',
                    arcs=[dict(c=[r6(sx * (w - rc)), r6(sy * (w - rc))], r=rc) for sx in (-1, 1) for sy in (-1, 1)]))
    octo = octagon(PH['stack_disc_af_mm'])
    hp = PH['head_pocket_mm'] / 2
    z1 = -PH['plate_t_mm']
    PS.append(piece('H02', 'HD1·HD2 머리 포켓 디스크', 'holder', 'XY', octo, [(z1 - t, z1), (z1 - 2 * t, z1 - t)],
                    holes=[window(rect(-hp, hp, -hp, hp), method='knife', note='Ø5 로 중심 → 지그 4F 사각 플러그(10.10) → 칼')],
                    notes='정팔각 맞변 36. 층 1 = HD1 (z −6~−3), 층 2 = HD2 (z −9~−6).'))
    PS.append(piece('H03', 'HD3 조임판', 'holder', 'XY', octo, [(z1 - 3 * t, z1 - 2 * t)],
                    holes=[drill(0.0, 0.0, PH['hd3_hole_mm'])],
                    notes='가운데 Ø5.0 (볼트가 꼭 맞아 수직을 잡는다). 머리와 너트 사이에 조여진다.'))
    PS.append(piece('H04', 'HD4 너트 잠금판', 'holder', 'XY', octo, [(z1 - 4 * t, z1 - 3 * t)],
                    holes=[window(hexagon((0, 0), PH['nut_pocket_af_mm']), method='knife',
                                  note='육각 8.1 AF, 평면이 x 에 수직. 중심 Ø5 → 지그 4F 육각 플러그(7.70) → 칼')],
                    notes='M5 너트 포켓 (볼트 회전 잠금).'))
    PS.append(piece('H05', '기둥 코너 블랭크', 'holder', 'XY', rect(0, 40, 0, 40), [], count=1, blank=True,
                    notes='40 × 40 블랭크 → 7.9 간격 5 × 5 로 나눠 P01 25개 (20개 사용). 자체 좌표.'))
    PS.append(piece('H06', '기둥 경사 블랭크', 'holder', 'XY', rect(0, 110, 0, 24), [], count=1, blank=True,
                    notes='110 × 24 블랭크 → P02 띠 L0~L3 4개. 자체 좌표.'))
    # P01 코너 기둥 층: +x+y 모서리 기준, z축 둘레 회전으로 네 모서리
    col = [(RELIEF_X, POST_IN), (POST_IN, POST_IN), (POST_IN, RELIEF_X), (POST_OUT, RELIEF_X),
           (POST_OUT, POST_OUT), (RELIEF_X, POST_OUT)]
    for p, e in zip(col, ((28.6, 29.5), (29.5, 29.5), (29.5, 28.6), (34.5, 28.6), (34.5, 34.5), (28.6, 34.5))):
        doc(p, e, 'P01 vertex')
    layers = PH['post_col_layers']
    doc(layers * t, PH['post_h_mm'], 'P01 stack height')
    inst = [dict(offset=[k * t, (k + 1) * t], rot_z=rot, layer=k + 1) for rot in (0, 90, 180, 270) for k in range(layers)]
    PS.append(piece('P01', '코너 기둥 층', 'holder', 'XY', col, [i['offset'] for i in inst], instances=inst,
                    finish=['post_chamfers'],
                    notes='+x+y 모서리 좌표 (나머지는 z축 둘레 90°·180°·270°). 5장을 바깥 두 면(x 34.5, y 34.5) 맞춰 적층 → '
                          '지그 2 H 높이 15.00 → C 모따기 z = 11 + (y − 29.5) → 90° 돌려 z = 11 + (x − 29.5). 윗면 1 × 1 남음.'))
    cut_y = PH['post_ramp_cut_y_mm']
    ramp_len = RELIEF_X - POST_END
    doc(ramp_len, 11.1, 'P02 ramp length')
    final = [(POST_IN, 0), (POST_OUT, 0), (POST_OUT, PH['post_ramp_layers'] * t),
             (RAMP_Y0 + RAMP_K * PH['post_ramp_layers'] * t, PH['post_ramp_layers'] * t), (POST_IN, (POST_IN - RAMP_Y0) / RAMP_K)]
    for p, e in zip(final, ((29.5, 0), (34.5, 0), (34.5, 12.0), (34.070, 12.0), (29.5, 2.154))):
        doc(p, e, 'P02 final section')
    for k, y0 in enumerate(cut_y):
        inst = [dict(offset=[k * t, (k + 1) * t], rot_z=rot, x_range=[r6(sx * POST_END) if sx > 0 else r6(-RELIEF_X),
                                                                     r6(RELIEF_X) if sx > 0 else r6(-POST_END)])
                for rot in (0, 90, 180, 270) for sx in (1, -1)]
        tol = (' 폭 5.0 ~ 5.2 (+0.2/−0): 5.0 보다 좁으면 버린다.' if k == 0 else '')
        PS.append(piece('P02', f'경사 층 띠 L{k}', 'holder', 'XY', rect(0, 110, y0, POST_OUT), [i['offset'] for i in inst],
                        count=1, instances=inst, layer=f'L{k}', finish=['post_ramp'],
                        final_section=pts6(final), ramp_plane='y = 28.5 + 0.46424·z',
                        notes=f'띠 L{k}: 길이 110 (u, 놓일 때 x 방향), 폭 y {y0:.1f} ~ 34.5 (v), 층 z {k * t:.0f}~{(k + 1) * t:.0f}.{tol} '
                              '네 띠를 y 34.5 선 맞춰 적층 → 지그 2 R 경사면 y = 28.5 + 0.46424·z → 지그 2 K 길이 11.10 으로 8개. '
                              '놓는 곳: +y 팔 x 17.5~28.6 (단면 그대로), +x 팔 y 17.5~28.6 (90° 돌림).'))
    # ---- 후드 (K)
    PS.append(piece('K01', '지붕', 'hood', 'XY', rect(-HOOD_OUT, HOOD_OUT, -HOOD_OUT, HOOD_OUT), [(ROOF_Z, ROOF_TOP)],
                    holes=[window(rect(-22, 22, -22, 22), method='knife')],
                    notes='66 × 66, 가운데 44 × 44 창. 세 벽 윗모서리(z 58.5) 위에 얹는다.'))
    doc(PH['hood_roof_hole_mm'], 44.0, 'K01 hole')
    PS.append(piece('K02', '앞벽', 'hood', 'XZ', rect(-HOOD_OUT, HOOD_OUT, HB, ROOF_Z), [(HOOD_IN, HOOD_OUT)],
                    notes='뒤(−y)에서 본 면. 옆벽 앞끝이 이 안쪽면(y 30)에 닿는다.'))
    PS.append(piece('K03', '옆벽', 'hood', 'YZ', rect(-HOOD_OUT, HOOD_IN, HB, ROOF_Z), [(HOOD_IN, HOOD_OUT), (-HOOD_OUT, -HOOD_IN)],
                    notes='+x 쪽에서 본 면. 오른쪽 x 30~33, 왼쪽 x −33~−30 (같은 모양).'))
    hy, hz = HINGE
    fy = PH['hood_arm_front_y_mm']
    hub_r = PH['hinge_hub_d_mm'] / 2
    arm = [(fy, HB), (fy, ROOF_TOP), (hy - hub_r, ROOF_TOP), (hy - hub_r, hz)] + arc(HINGE, hub_r, 180, 270, 24)[1:] + [(-HOOD_OUT, HB)]
    doc(arc(HINGE, hub_r, 180, 270, 2)[1], (-97.071, 32.929), 'K04 arc mid')
    doc(abs(area(arm)), 3560.5, 'K04 area', tol=0.6)
    horn = [drill(hy + PH['horn_hole_r_mm'] * math.cos(math.radians(a)), hz + PH['horn_hole_r_mm'] * math.sin(math.radians(a)),
                  PH['horn_hole_d_mm']) for a in (0, 90, 180, 270)]
    arm_notes = ('외곽 (−3, 21) → (−3, 61.5) → (−100, 61.5) → (−100, 40) → 호 (중심 (−90, 40), r 10) → (−90, 30) → (−33, 21). '
                 '안쪽면 y −33~−3, z 21~58.5 를 옆벽 바깥면에, z 58.5~61.5 를 지붕 옆 모서리에 붙인다.')
    PS.append(piece('K04', '팔 (오른쪽)', 'hood', 'YZ', arm, [(HOOD_OUT, HOOD_OUT + PH['arm_t_mm'])],
                    holes=[drill(hy, hz, 3.2)] + horn, side='R',
                    arcs=[dict(c=list(HINGE), r=hub_r, a0=180, a1=270)],
                    notes=arm_notes + ' 오른쪽: 혼 구멍 Ø2 × 4 (반경 7, 가정). 바깥면(x 36)에 와셔 심 0.5 + MG996R 원형 혼, 안쪽에서 M2.'))
    PS.append(piece('K04', '팔 (왼쪽)', 'hood', 'YZ', arm, [(-HOOD_OUT - PH['arm_t_mm'], -HOOD_OUT)],
                    holes=[drill(hy, hz, 3.2)], side='L', arcs=[dict(c=list(HINGE), r=hub_r, a0=180, a1=270)],
                    notes=arm_notes + ' 왼쪽: 힌지 구멍 양면에 M3 와셔 동심 접착 (베어링 면).'))
    # ---- 리프터 (L)
    qy, qz = Q0
    sl, stt, lt, lh = PH['shelf_len_mm'], PH['shelf_t_mm'], PH['lip_t_mm'], PH['lip_h_mm']
    pad = PH['pad_t_mm']
    body = [sn(-1, -5), (qy - sl - lt, qz + lh), (qy - sl, qz + lh), (qy - sl, qz - pad), (qy - 1, qz - pad),
            (qy, qz - 1), (qy, qz - stt), sn(-13, 5), sn(-13, -5)]
    for p, e in zip(body, ((-41.885, -14.591), (-30.330, -5.000), (-27.330, -5.000), (-27.330, -7.400), (-24.830, -7.400),
                           (-23.830, -7.500), (-23.830, -9.000), (-27.637, -20.992), (-36.625, -25.376))):
        doc(p, e, 'L01 vertex')
    doc(abs(area(body)), 216.5, 'L01 area', tol=0.06)
    bs, bn = PH['lifter_bar_s_mm'], PH['lifter_bar_n_mm']
    mortise = [sn(bs[1], bn[0]), sn(bs[1], bn[1]), sn(bs[0], bn[1]), sn(bs[0], bn[0])]
    for p, e in zip(mortise, ((-37.874, -15.972), (-34.279, -14.218), (-31.648, -19.611), (-35.244, -21.365))):
        doc(p, e, 'L01 mortise vertex')
    hw = PH['hook_w_mm'] / 2
    nl = PH['lifter_layers']
    doc(nl * t, PH['hook_w_mm'], 'L01 layers × sheet = hook width')
    PS.append(piece('L01', '몸통 층', 'lifter', 'YZ', body, [(-hw + i * t, -hw + (i + 1) * t) for i in range(nl)],
                    holes=[window(mortise, method='knife', note='막대 홈 6 × 4 (B0 기준 s −10~−4, n −2~2)')],
                    notes='최하 자세(σ 0). 선반 앞면 y −23.830 (z −9.0~−7.5), 선반 윗면 z −7.4 에 고무 0.9 → 윗면 Q0 z −6.5. '
                          '입술 y −30.33~−27.33, 윗면 z −5.0.'))
    half = PH['lifter_bar_half_x_mm']
    PS.append(piece('L02', '막대 띠', 'lifter', 'OBLIQUE', rect(-half, half, bn[0], bn[1]),
                    [(bs[0], bs[0] + t), (bs[0] + t, bs[1])],
                    axis_frame=dict(origin_yz=pts6([B0])[0], u='x', v_dir_yz=pts6([N])[0], thick_dir_yz=pts6([D])[0]),
                    notes='(x, n) 평면 72.6 × 4.0, 두께 방향 D. 띠 a = B0 기준 s −10~−7, 띠 b = s −7~−4. '
                          '막대 끝이 끝판 바깥면(x ±36.3)과 같은 면.'))
    doc(bs[1] - bs[0], 2 * t, 'L02 two strips fill the mortise')
    es, en = PH['endplate_s_mm'], PH['endplate_n_mm']
    endp = [sn(es[0], en[0]), sn(es[1], en[0]), sn(es[1], en[1]), sn(es[0], en[1])]
    for e in ((-42.959, -10.108), (-35.769, -6.601), (-26.563, -25.475), (-33.753, -28.982)):
        assert any(near(p, e) for p in endp), ('L03 vertex', e)
    ex = PH['endplate_x_mm']
    lholes = [drill(B0[0], B0[1], 3.2, note='B 핀, 조립 뒤 지그 4D'), drill(F0[0], F0[1], 3.2, note='F 핀, 조립 뒤 지그 4D'),
              window(mortise, method='knife')]
    PS.append(piece('L03', '끝판', 'lifter', 'YZ', endp, [tuple(ex), (-ex[1], -ex[0])], holes=lholes,
                    axis_frame=dict(origin_yz=pts6([B0])[0], u_dir_yz=pts6([D])[0], v_dir_yz=pts6([N])[0],
                                    outline_su=pts6(rect(es[0], es[1], en[0], en[1])),
                                    holes_su=[[0, 0], [PH['follower_s_mm'], 0]]),
                    notes='B0 기준 (s, n) 21 × 8 사각형 (s −17.5~3.5, n −4~4). 오른쪽 x 33.3~36.3, 왼쪽 x −36.3~−33.3.'))
    # ---- 크랭크·링크 (V)
    cx = PH['crank_x_mm']
    PS.append(piece('V01', '크랭크', 'crank_link', 'YZ', capsule(SERVO, PIN0, PH['crank_w_mm'] / 2), [tuple(cx)],
                    holes=[drill(SERVO[0], SERVO[1], 6.0, note='혼 중심나사'), drill(PIN0[0], PIN0[1], 3.2, note='크랭크 핀')],
                    arcs=[dict(c=pts6([SERVO])[0], r=5.0), dict(c=pts6([PIN0])[0], r=5.0)],
                    notes='캡슐: 중심 SERVO (−82.982, 81.076) ~ 핀 (−68.516, 51.416), 거리 33.000, 반경 5. 최하 자세(θ 0).'))
    hub_end = tuple(SERVO[i] - PH['crank_hub_len_mm'] * D[i] for i in range(2))
    doc(hub_end, (-74.215, 63.100), 'V03 hub end')
    PS.append(piece('V03', '크랭크 허브', 'crank_link', 'YZ', capsule(SERVO, hub_end, PH['crank_hub_r_mm']),
                    [tuple(PH['crank_hub_x_mm'])], holes=[drill(SERVO[0], SERVO[1], 6.0)],
                    arcs=[dict(c=pts6([SERVO])[0], r=7.0), dict(c=pts6([hub_end])[0], r=7.0)],
                    notes='캡슐 SERVO ~ (−74.215, 63.100), 반경 7. SG90 혼(단일 암) 윤곽 창은 실물 혼을 대고 그려 +0.2 로 칼 '
                          '(혼 치수 미확인 — 도면에 창을 그리지 않는다). V01 + V03 접착 후 혼을 창에 끼워 순간접착.'))
    lx = PH['link_x_mm']
    doc(math.dist(PIN0, B0), LINK, 'V02 centre distance')
    PS.append(piece('V02', '링크', 'crank_link', 'YZ', capsule(PIN0, B0, PH['link_w_mm'] / 2), [tuple(lx)],
                    holes=[window(hexagon(PIN0, 5.6), method='knife', note='M3 너트 묻음 (방향 문서 미지정: 평면이 y 에 수직으로 그림)'),
                           drill(B0[0], B0[1], 3.2)],
                    arcs=[dict(c=pts6([PIN0])[0], r=5.0), dict(c=pts6([B0])[0], r=5.0)],
                    notes='캡슐: 크랭크 핀 (−68.516, 51.416) ~ B0 (−37.830, −11.500), 거리 70.000, 반경 5.'))
    # ---- 베이스 (B)
    xh = PH['deck_x_half_mm']
    yw0, yw1 = PH['deck_yw_mm']
    inner = PH['motor_box_outer_mm'] / 2 - t
    win_yw = (world_yw(-inner, floor_z(-inner)), world_yw(inner, floor_z(inner)))
    doc(win_yw, (8.98, 55.81), 'B01 window Y_w', tol=6e-3)
    tb = PH['tower_back_y_mm']
    marks = dict(tower_in=[r6(-TOWER_IN), r6(TOWER_IN)], tower_out=[r6(-TOWER_IN - 2 * t), r6(TOWER_IN + 2 * t)],
                 tower_yw=[r6(world_yw(tb, floor_z(tb))), r6(world_yw(PH['tower_front_low_y_mm'], floor_z(PH['tower_front_low_y_mm'])))],
                 motor_box_x=[-25.0, 25.0], motor_box_yw=[r6(world_yw(-25, floor_z(-25))), r6(world_yw(25, floor_z(25)))],
                 rear_wall_yw=[r6(world_yw(tb, floor_z(tb))), r6(world_yw(PH['rear_wall_y_mm'][1], floor_z(PH['rear_wall_y_mm'][1])))],
                 front_brace_yw=[r6(world_yw(PH['front_brace_y_mm'][0], floor_z(PH['front_brace_y_mm'][0]))),
                                 r6(world_yw(PH['front_brace_y_mm'][1], floor_z(PH['front_brace_y_mm'][1])))],
                 axis_point=[0.0, r6(world_yw(0, floor_z(0)))])
    doc(marks['tower_yw'], (-107.01, 3.66), 'B01 tower marks', tol=6e-3)
    doc(marks['motor_box_yw'], (5.79, 59.00), 'B01 motor box marks', tol=6e-3)
    doc(marks['rear_wall_yw'], (-107.01, -103.82), 'B01 rear wall marks', tol=6e-3)
    doc(marks['front_brace_yw'], (-2.73, 0.47), 'B01 brace marks', tol=6e-3)
    doc(marks['axis_point'], (0, 32.39), 'B01 axis point', tol=6e-3)
    PS.append(piece('B01', '데크', 'base', 'WORLD', rect(-xh, xh, yw0, yw1), [(TABLE, TABLE + t), (TABLE + t, DECK)],
                    holes=[window(rect(-inner, inner, *win_yw), method='knife', note='모터 상자 안쪽 ±22 를 데크 윗면에 투영')],
                    marks=marks,
                    notes='월드 조각 (X, Y_w), 위에서 본 면. 층 1 Z_w −95~−92, 층 2 −92~−89. 층 2 윗면에 지그 4G 표시선(marks).'))
    face = PH['motor_face_z_mm']
    mh = PH['motor_hole_pitch_mm'] / 2
    PS.append(piece('B02', '모터 윗판', 'base', 'XY', rect(-25, 25, -25, 25), [(face, face + t), (face + t, face + 2 * t)],
                    holes=[drill(0.0, 0.0, PH['motor_plate_hole_mm'], method='knife', note='지그 4C 원형 창으로 칼')] +
                          [drill(sx * mh, sy * mh, PH['motor_hole_mm']) for sx in (-1, 1) for sy in (-1, 1)],
                    notes='모터 상자 네 벽 윗모서리(z −50) 위. 모터 앞면이 밑면에 닿고 M3×10 × 4.'))
    bo = PH['motor_box_outer_mm'] / 2
    doc(floor_z(bo), -103.811, 'B03 bottom'); doc(floor_z(inner), -102.719, 'B03 inner bottom')
    PS.append(piece('B03', '모터 상자 앞벽', 'base', 'XZ', rect(-bo, bo, floor_z(bo), face), [(inner, bo)],
                    finish=['deck_bevel'], notes='뒤에서 본 면. 아래 모서리를 지그 5 로 20° 경사 → 안쪽면(y 22) 아래끝 z −102.719.'))
    doc(floor_z(-inner), -86.705, 'B04 bottom'); doc(floor_z(-bo), -85.613, 'B04 outer bottom')
    PS.append(piece('B04', '모터 상자 뒷벽', 'base', 'XZ', rect(-bo, bo, floor_z(-inner), face), [(-bo, -inner)],
                    finish=['deck_bevel'], notes='지그 5 로 20° 경사 → 바깥면(y −25) 아래끝 z −85.613.'))
    side = [(-inner, face), (inner, face), (inner, floor_z(inner)), (-inner, floor_z(-inner))]
    cw = PH['motor_cable_slot_w_mm'] / 2
    cz0 = face - PH['motor_len_mm']
    doc((cz0, cz0 + PH['motor_cable_slot_h_mm']), (-90, -76), 'B05 cable window z')
    PS.append(piece('B05', '모터 상자 옆벽 (오른쪽)', 'base', 'YZ', side, [(inner, bo)], side='R',
                    holes=[window(rect(-cw, cw, cz0, cz0 + PH['motor_cable_slot_h_mm']), method='knife',
                                  note='케이블 창 (모터 커넥터 +x)')],
                    notes='아래 변이 데크 선 (경사 없이 칼로). 앞·뒷벽 사이 (y ±22).'))
    PS.append(piece('B05', '모터 상자 옆벽 (왼쪽)', 'base', 'YZ', side, [(-bo, -inner)], side='L',
                    notes='아래 변이 데크 선. 구멍 없음.'))

    def tower(top):
        fr, fl, st = -35.0, PH['tower_front_low_y_mm'], PH['tower_step_z_mm']
        return [(fr, top - 10), (fr - 10, top), (tb + 10, top), (tb, top - 10), (tb, floor_z(tb)),
                (fl, floor_z(fl)), (fl, st), (fr, st)]
    doc(floor_z(tb), -47.032, 'tower back bottom'); doc(floor_z(PH['tower_front_low_y_mm']), -84.885, 'tower front bottom')
    slot = capsule(F0, B1, 1.7, 24)
    doc(math.dist(F0, B1), PH['slot_len_mm'], 'slot length')
    slot_h = window(slot, method='knife', note='슬롯 폭 3.4, 양끝 R1.7: 지그 4A-1 로 끝 구멍 Ø3.2, 지그 7 로 옆변',
                    slot=dict(a=pts6([F0])[0], b=pts6([B1])[0], w=3.4))
    hinge_h = drill(hy, hz, 3.2, note='힌지')
    tl = [(-TOWER_IN - t, -TOWER_IN), (-TOWER_IN - 2 * t, -TOWER_IN - t)]
    fy_s = SERVO[0] + PH['sg90_body_dir'] * (PH['sg90_body_l_mm'] / 2 - PH['sg90_axis_to_end_mm'])
    leg_y, leg_z = PH['sg90_leg_rear_y_mm'], PH['sg90_leg_bottom_z_mm']
    doc((fy_s - 17 - t, fy_s - 17), leg_y, 'SG90 rear leg y'); doc((SERVO[1] - 50 - t, SERVO[1] - 50), leg_z, 'SG90 bottom leg z')
    PS.append(piece('B06', '왼쪽 타워 T1L·T2L', 'base', 'YZ', tower(95.0), tl, holes=[hinge_h, slot_h],
                    marks=dict(t2l_outer_rear_leg=pts6(rect(leg_y[0], leg_y[1], leg_z[0], SERVO[1] + 10)),
                               t2l_outer_bottom_leg=pts6(rect(leg_y[1], fy_s + 17, leg_z[0], leg_z[1]))),
                    notes='층 1 = T1L x −42.5~−39.5, 층 2 = T2L x −45.5~−42.5. 아래 변 = 데크 선, 앞 위·뒤 위 45° 모따기 10. '
                          'T2L 바깥면 표시: SG90 뒷다리·아랫다리 자리 (marks).'))
    holes_ear = PH['mg996r_ear_holes']
    sign = PH['mg996r_body_sign']
    bc = hy + sign * (PH['mg996r_body_l_mm'] / 2 - PH['mg996r_axis_to_end_mm'])
    calc_ears = sorted((bc + a * PH['mg996r_hole_pitch_l_mm'] / 2, hz + b * PH['mg996r_hole_pitch_w_mm'] / 2)
                       for a in (-1, 1) for b in (-1, 1))
    for p, e in zip(calc_ears, sorted(holes_ear)):
        doc(p, e, 'MG996R ear hole')
    c_mg = PH['mg996r_fit_clear_mm']
    end = PH['mg996r_axis_to_end_mm']
    win_y = tuple(sorted((hy - sign * (end + c_mg), hy + sign * (PH['mg996r_body_l_mm'] - end + c_mg))))
    win_z = (hz - PH['mg996r_body_w_mm'] / 2 - c_mg - .1, hz + PH['mg996r_body_w_mm'] / 2 + c_mg + .1)
    doc(win_y, PH['mg996r_window_y_mm'], 'T2R window y'); doc(win_z, PH['mg996r_window_z_mm'], 'T2R window z')
    sq = PH['t1r_hinge_square_mm'] / 2
    PS.append(piece('B07', '오른쪽 타워 T1R', 'base', 'YZ', tower(65.0), [(TOWER_IN, TOWER_IN + t)],
                    holes=[slot_h, window(rect(hy - sq, hy + sq, hz - sq, hz + sq), method='knife',
                                          note='혼 허브·나사 끝 여유 24 × 24')] +
                          [drill(a, b, 3.2, note='귀 볼트 끝 여유') for a, b in holes_ear],
                    marks=dict(hinge_centre=list(HINGE)), sub='T1R',
                    notes='x 39.5~42.5. 힌지 위치는 사각 구멍의 중심 표시. 아래 변 = 데크 선, 45° 모따기 10.'))
    PS.append(piece('B07', '오른쪽 타워 T2R', 'base', 'YZ', tower(65.0), [(TOWER_IN + t, TOWER_IN + 2 * t)],
                    holes=[slot_h, window(rect(*win_y, *win_z), method='knife', note='MG996R 창 41.5 × 20.8 (몸통 −y)')] +
                          [window(hexagon(p, 5.6), method='knife', note='M3 너트 묻음 (평면이 y 에 수직)') for p in holes_ear],
                    sub='T2R', notes='x 42.5~45.5. 육각 포켓에 M3 너트를 바깥면과 같은 높이로 눌러 넣고 순간접착.'))
    px = PH['ear_pad_x_mm']
    PS.append(piece('B08', '귀 패드 P1F', 'base', 'YZ', rect(win_y[1], win_y[1] + 7, *win_z), [tuple(px)],
                    holes=[drill(a, b, 3.2) for a, b in holes_ear if a > hy], sub='P1F',
                    notes='T2R 바깥면(x 45.5)에 접착.'))
    PS.append(piece('B08', '귀 패드 P1R', 'base', 'YZ', rect(win_y[0] - 7, win_y[0], *win_z), [tuple(px)],
                    holes=[drill(a, b, 3.2) for a, b in holes_ear if a < hy], sub='P1R',
                    notes='T2R 바깥면(x 45.5)에 접착.'))
    rw = PH['rear_wall_y_mm']
    doc(floor_z(rw[1]), -48.124, 'B09 bottom')
    PS.append(piece('B09', '리어월', 'base', 'XZ', rect(-TOWER_IN, TOWER_IN, floor_z(rw[1]), PH['rear_wall_top_z_mm']), [tuple(rw)],
                    finish=['deck_bevel'], notes='지그 5 로 20° 경사 → 바깥면(y −131) 아래끝 z −47.032. 두 타워 안쪽면·데크에 접착.'))
    sy, sz = SERVO
    c_sg, e_sg = PH['sg90_fit_clear_mm'], PH['sg90_axis_to_end_mm']
    way = PH['sg90_body_dir']
    pocket_y = tuple(sorted((sy - way * (e_sg + c_sg), sy + way * (PH['sg90_body_l_mm'] - e_sg + c_sg))))
    pocket_z = (sz - PH['sg90_body_w_mm'] / 2 - c_sg, sz + PH['sg90_body_w_mm'] / 2 + c_sg)
    doc(pocket_y, (-99.882, -76.582), 'B10 window y'); doc(pocket_z, (74.676, 87.476), 'B10 window z')
    sg_holes = [drill(fy_s + a * PH['sg90_hole_pitch_mm'] / 2, sz, 2.0, note='M2 셀프탭 안내') for a in (-1, 1)]
    doc((sg_holes[0]['x'], sg_holes[1]['x']), (-102.082, -74.382), 'B10 holes')
    plate10 = rect(fy_s - 17, fy_s + 17, sz - 50, sz + 10)
    spx = PH['sg90_plate_x_mm']
    PS.append(piece('B10', 'SG90 판 (바깥층)', 'base', 'YZ', plate10, [(spx[0], spx[0] + t)],
                    holes=[window(rect(*pocket_y, *pocket_z), method='knife', note='SG90 몸통 22.7 × 12.2 + 0.3/면')] + sg_holes,
                    sub='outer', notes='x −63.8~−60.8. 바깥면 = SG90 귀 윗면.'))
    PS.append(piece('B10', 'SG90 판 (안층)', 'base', 'YZ', plate10, [(spx[0] + t, spx[1])],
                    holes=[window(rect(*pocket_y, *pocket_z), method='knife')], sub='inner',
                    notes='x −60.8~−57.8. Ø2 를 뚫지 않는다 (M2 가 스스로 판다).'))
    xl = (spx[0], -TOWER_IN - 2 * t)
    PS.append(piece('B11', 'SG90 뒷다리', 'base', 'XZ', rect(*xl, leg_z[0], sz + 10), [tuple(leg_y)],
                    notes='B10 뒷모서리와 T2L 바깥면에 접착.'))
    PS.append(piece('B12', 'SG90 아랫다리', 'base', 'XY', rect(*xl, leg_y[1], fy_s + 17), [tuple(leg_z)],
                    notes='B10 아랫모서리, B11, T2L 에 접착.'))
    fb = PH['front_brace_y_mm']
    doc(floor_z(fb[1]), -83.793, 'B13 bottom')
    PS.append(piece('B13', '앞 보강판', 'base', 'XZ', rect(-TOWER_IN, TOWER_IN, floor_z(fb[1]), PH['front_brace_top_z_mm']), [tuple(fb)],
                    finish=['deck_bevel'], notes='지그 5 로 20° 경사 → 바깥면(y −33) 아래끝 z −82.701. 두 타워 안쪽면·데크에 접착.'))
    # ---- 패널 (C) — 자체 좌표
    pw, ph_, pd = PH['panel_w_mm'] / 2, PH['panel_h_mm'], PH['panel_floor_d_mm']
    lw, lh = PH['panel_lcd_window_mm']
    lc = PH['panel_lcd_window_c']
    bw = PH['panel_button_mm'] / 2
    bcn = PH['panel_button_c']
    PS.append(piece('C01', '패널 앞판', 'panel', 'WORLD', rect(-pw, pw, 0, ph_), [(0, t)], frame='panel',
                    holes=[window(rect(lc[0] - lw / 2, lc[0] + lw / 2, lc[1] - lh / 2, lc[1] + lh / 2), method='knife', note='LCD 창'),
                           window(rect(bcn[0] - bw, bcn[0] + bw, bcn[1] - bw, bcn[1] + bw), method='knife', note='버튼')] +
                          [drill(a, b, 3.2, note='LCD (75 × 31 가정)') for a, b in PH['panel_lcd_holes']],
                    notes='C02 앞모서리 위에 뒤로 20° 기울여 (지그 5). 자체 좌표 (u, v), v 는 아래변부터.'))
    PS.append(piece('C02', '패널 바닥', 'panel', 'WORLD', rect(-pw, pw, -pd, 0), [(0, t)], frame='panel',
                    notes='책상에 놓임. 자체 좌표.'))
    gus = PH['panel_gusset']
    doc(gus[2], (55 * math.cos(math.radians(70)), 55 * math.sin(math.radians(70))), 'C03 apex', tol=1e-3)
    gx = PH['panel_gusset_x_mm']
    PS.append(piece('C03', '패널 거싯', 'panel', 'WORLD', list(gus), [tuple(gx), (-gx[1], -gx[0])], frame='panel',
                    notes='두 변 사이 70°. u ±44~±47, C02 윗면과 C01 뒷면에.'))
    bb = PH['panel_button_back_mm']
    PS.append(piece('C04', '버튼 받침', 'panel', 'WORLD', rect(-bb[0] / 2, bb[0] / 2, bcn[1] - bb[1] / 2, bcn[1] + bb[1] / 2),
                    [(t, 2 * t)], frame='panel', notes='C01 뒷면, 버튼 구멍 중심. 택트 스위치 몸통을 붙인다.'))
    # ---- 여분 (4.3절): 홀더 1벌 + 후드 1벌
    spare_ids = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'K01', 'K02', 'K03', 'K04']
    for p in list(PS):
        if p['id'] in spare_ids:
            s = dict(p, group='spare', spare_of=p['id'], offset=[], count=max(1, len(p['offset'])),
                     name=p['name'] + ' (여분)')
            s.pop('instances', None)
            PS.append(s)
    return PS


PIECES = make_pieces()


# ---------------------------------------------------------------- 솔리드

def _to3(plane, u, v, w):
    if plane == 'XY':
        return (u, v, w)
    if plane == 'YZ':
        return (w, u, v)
    if plane == 'XZ':
        return (u, w, v)
    raise ValueError(plane)


def _wire(plane, pts, w):
    return cq.Wire.makePolygon([cq.Vector(*_to3(plane, u, v, w)) for u, v in pts], close=True)


def _normal(plane):
    return dict(XY=(0, 0, 1), YZ=(1, 0, 0), XZ=(0, 1, 0))[plane]


def _circle_pts(c, d, seg=64):
    return [(c[0] + d / 2 * math.cos(2 * math.pi * i / seg), c[1] + d / 2 * math.sin(2 * math.pi * i / seg)) for i in range(seg)]


def slab(plane, outline, holes, lo, hi):
    """평면 조각: 외곽을 lo → hi 로 밀고 구멍을 판다 (축정렬 평면)."""
    nrm = cq.Vector(*_normal(plane))
    face = cq.Face.makeFromWires(_wire(plane, outline, lo))
    solid = cq.Solid.extrudeLinear(face, nrm * (hi - lo))
    for h in holes:
        if 'd' in h:
            c3 = cq.Vector(*_to3(plane, h['x'], h['y'], lo - 1))
            cut = cq.Solid.makeCylinder(h['d'] / 2, hi - lo + 2, c3, nrm)
        else:
            f = cq.Face.makeFromWires(_wire(plane, h['poly'], lo - 1))
            cut = cq.Solid.extrudeLinear(f, nrm * (hi - lo + 2))
        solid = solid.cut(cut)
    return solid.clean()


def world_to_local(shape):
    return shape.rotate((0, 0, 0), (1, 0, 0), -PH['tilt_deg'])


def local_to_world(shape):
    return shape.rotate((0, 0, 0), (1, 0, 0), PH['tilt_deg'])


def _yz_prism(poly, x0, x1):
    f = cq.Face.makeFromWires(_wire('YZ', poly, x0))
    return cq.Solid.extrudeLinear(f, cq.Vector(x1 - x0, 0, 0))


def _xz_prism(poly, y0, y1):
    f = cq.Face.makeFromWires(_wire('XZ', poly, y0))
    return cq.Solid.extrudeLinear(f, cq.Vector(0, y1 - y0, 0))


def _finish(shape, op):
    big = 200
    if op == 'post_chamfers':
        # z > 11 + (v − 29.5) 를 잘라 낸다 (v = y, 그다음 v = x)
        cut_y = _yz_prism([(20, CHAMFER_Z0 - POST_IN + 20), (40, CHAMFER_Z0 - POST_IN + 40), (40, 40), (20, 40)], 0, 40)
        cut_x = _xz_prism([(20, CHAMFER_Z0 - POST_IN + 20), (40, CHAMFER_Z0 - POST_IN + 40), (40, 40), (20, 40)], 0, 40)
        return shape.cut(cut_y).cut(cut_x).clean()
    if op == 'post_ramp':
        # +y 팔: y < 28.5 + k·z 를 잘라 낸다
        cut = _yz_prism([(0, -1), (RAMP_Y0 - RAMP_K, -1), (RAMP_Y0 + RAMP_K * 30, 30), (0, 30)], -40, 40)
        return shape.cut(cut).clean()
    if op == 'deck_bevel':
        below = world_to_local(cq.Solid.makeBox(2 * big, 4 * big, big, cq.Vector(-big, -2 * big, DECK - big)))
        return shape.cut(below).clean()
    raise ValueError(op)


def _panel_place(pc, inst_offset, outline, holes):
    """패널 조각을 월드 좌표에 놓고 국소 좌표로 돌린다. 패널 원점: 책상 위, 로봇 앞 (위치는 문서 미지정)."""
    t = ST
    y_front = PH['deck_yw_mm'][1] + PH.get('panel_gap_mm', 58.0) + PH['panel_floor_d_mm']
    pt = math.radians(PH['panel_tilt_deg'])
    e_up = cq.Vector(0, -math.sin(pt), math.cos(pt))
    e_n = cq.Vector(0, math.cos(pt), math.sin(pt))
    floor_top = TABLE + t
    front_origin = cq.Vector(0, y_front, floor_top + t * math.sin(pt))
    if pc['id'] == 'C02':
        plane = cq.Plane(cq.Vector(0, y_front, TABLE), cq.Vector(1, 0, 0), cq.Vector(0, 0, 1))
        lo, hi = 0, t
    elif pc['id'] == 'C01':
        plane = cq.Plane(front_origin, cq.Vector(1, 0, 0), -e_n)
        lo, hi = 0, t
    elif pc['id'] == 'C04':
        plane = cq.Plane(front_origin, cq.Vector(1, 0, 0), -e_n)
        lo, hi = t, 2 * t
    elif pc['id'] == 'C03':
        back = front_origin - e_n * t
        x0 = inst_offset[1]                               # 법선 −x 로 3 mm 민다
        plane = cq.Plane(cq.Vector(x0, back.y, back.z), cq.Vector(0, -1, 0), cq.Vector(-1, 0, 0))
        lo, hi = 0, t
    else:
        raise ValueError(pc['id'])
    wp = cq.Workplane(plane).workplane(offset=lo).polyline(outline).close()
    for h in holes:
        if 'd' in h:
            wp = wp.pushPoints([(h['x'], h['y'])]).circle(h['d'] / 2)
        else:
            wp = wp.polyline(h['poly']).close()
    solid = wp.extrude(hi - lo).val()
    return world_to_local(solid)


def piece_solid(pc, i=0, finished=True):
    """조각 pc 의 i 번째 인스턴스 솔리드 (국소 좌표). 블랭크·여분은 원점 근처 XY 평판."""
    t = ST
    if pc.get('blank') or pc['group'] == 'spare' or not pc['offset']:
        plane = 'XY' if pc['plane'] in ('XY', 'WORLD', 'OBLIQUE') else pc['plane']
        return slab(plane, pc['outline'], pc['holes'], 0, t)
    lo, hi = pc['offset'][i]
    inst = (pc.get('instances') or [{}] * len(pc['offset']))[i]
    if pc.get('frame') == 'panel':
        return _panel_place(pc, (lo, hi), pc['outline'], pc['holes'])
    if pc['plane'] == 'WORLD':
        s = slab('XY', pc['outline'], pc['holes'], lo, hi)
        return world_to_local(s)
    if pc['plane'] == 'OBLIQUE':
        n0, n1 = pc['outline'][0][1], pc['outline'][2][1]
        x0, x1 = pc['outline'][0][0], pc['outline'][1][0]
        poly = [sn(lo, n0), sn(hi, n0), sn(hi, n1), sn(lo, n1)]
        return _yz_prism(ccw(poly), x0, x1)
    if pc['id'] == 'P02':
        y0, y1 = pc['outline'][0][1], pc['outline'][2][1]
        xr = inst['x_range']
        s = slab('XY', rect(xr[0], xr[1], y0, y1), [], lo, hi)
    else:
        s = slab(pc['plane'], pc['outline'], pc['holes'], lo, hi)
    if finished:
        for op in pc.get('finish', []):
            s = _finish(s, op)
    if inst.get('rot_z'):
        s = s.rotate((0, 0, 0), (0, 0, 1), inst['rot_z'])
    return s


def instance_name(pc, i):
    base = pc['id'] + ('_' + pc['sub'] if pc.get('sub') else '') + ('_' + pc['side'] if pc.get('side') else '')
    if pc['id'] == 'P02':
        base += '_' + pc['layer']
    return f'{base}_{i + 1}' if len(pc['offset']) > 1 else base


# ---------------------------------------------------------------- 구매품 · 철물

def _cyl_x(r, x0, x1, c):
    return cq.Solid.makeCylinder(r, x1 - x0, cq.Vector(x0, c[0], c[1]), cq.Vector(1, 0, 0))


def _ring_x(r_out, r_in, x0, x1, c):
    return _cyl_x(r_out, x0, x1, c).cut(_cyl_x(r_in, x0 - 1, x1 + 1, c))


def _span(a, b):
    return (min(a, b), max(a, b))


def purchased():
    """2.8절 자리. 키트 참고 모델(V5 kit_solid)을 V5H 기준면에 놓는다."""
    o = (0, 0, 0)
    face = PH['motor_face_z_mm']
    nema = v5.kit_solid('nema17').rotate(o, (0, 0, 1), 90).translate((0, 0, face))
    bb = nema.BoundingBox()
    assert abs(bb.zmax - face - PH['motor_shaft_len_mm']) < .01 and bb.xmax > PH['motor_mm'] / 2 + 3, 'NEMA17 connector must face +x'
    mg = v5.kit_solid('mg996r').rotate(o, (0, 0, 1), 90).rotate(o, (0, 1, 0), -90).translate((PH['mg996r_case_top_x_mm'] + 37.0, *HINGE))
    if PH['mg996r_body_sign'] < 0:
        mg = mg.rotate((0, *HINGE), (1, *HINGE), 180)
    bb = mg.BoundingBox()
    centre = (bb.ymin + bb.ymax) / 2                     # 귀(54)가 몸통(40.9) 가운데에 있다
    doc((centre - PH['mg996r_body_l_mm'] / 2, centre + PH['mg996r_body_l_mm'] / 2), (-120.7, -79.8), 'MG996R body y', tol=0.01)
    doc(bb.xmin, PH['mg996r_case_top_x_mm'] - 2.5 - 3.2, 'MG996R spline tip x', tol=0.01)
    sg = v5.kit_solid('sg90').rotate(o, (0, 0, 1), 90 * PH['sg90_body_dir']).rotate(o, (0, 1, 0), 90)
    sg = sg.translate((PH['sg90_mount_outer_x_mm'] - 19.5, *SERVO))
    doc(sg.BoundingBox().xmax, PH['sg90_spline_tip_x_mm'], 'SG90 spline tip x', tol=0.01)
    return dict(nema17=nema, mg996r=mg, sg90=sg)


def hardware():
    """단순 모형 (3절 체결 표의 x/z 위치). 키 = (이름, 움직이는 묶음, 색)."""
    hw = {}
    wt, nm, wr, nr, hr = PH['washer_m3_t_mm'], PH['nut_m3_m_mm'], PH['washer_m3_d_mm'] / 2, PH['nut_m3_r_mm'], PH['head_m3_r_mm']
    sr = M3 / 2
    # 커플링 + M5 스텁 (컵과 함께 돈다)
    ct, cb = PH['coupler_top_z_mm'], PH['coupler_bottom_z_mm']
    coupler = cq.Solid.makeCylinder(PH['coupler_od_mm'] / 2, ct - cb, cq.Vector(0, 0, cb)).cut(
        cq.Solid.makeCylinder(PH['coupler_bore_mm'] / 2, ct - cb + 2, cq.Vector(0, 0, cb - 1)))
    hw['coupler'] = (coupler, 'cup', 'coupler')
    seat = PH['head_seat_z_mm']
    head_k = 5.0                                          # 가정: M5 렌치볼트 머리 높이 (한계 6)
    head = cq.Solid.makeCylinder(PH['m5_head_d_max_mm'] / 2 - 0.25, head_k, cq.Vector(0, 0, seat))
    shank = cq.Solid.makeCylinder(2.5, seat - PH['bolt_tip_z_mm'], cq.Vector(0, 0, PH['bolt_tip_z_mm']))
    nz = PH['m5_nut_z_mm']
    nut = cq.Workplane('XY', origin=(0, 0, nz[0])).polygon(6, 2 * PH['m5_nut_r_mm']).extrude(nz[1] - nz[0]).val()
    nut = nut.rotate((0, 0, 0), (0, 0, 1), 30)            # 평면이 x 에 수직 (HD4 포켓과 같은 방향)
    hw['m5_stub'] = (head.fuse(shank).fuse(nut.cut(cq.Solid.makeCylinder(2.5, 10, cq.Vector(0, 0, nz[0] - 1)))).clean(), 'cup', 'hardware')
    # 리프터 슬롯 핀 4개 (F08, F08L) — 리프터와 함께 움직인다
    for side in (1, -1):
        for nmn, c in (('B', B0), ('F', F0)):
            parts = [_cyl_x(hr, *_span(side * 29.8, side * 33.3), c),                 # 머리 + 와셔
                     _cyl_x(sr, *_span(side * 32.8, side * 52.8), c),                 # 몸통 (M3×20)
                     _cyl_x(nr, *_span(side * 36.3, side * 38.7), c),                 # 너트 A (끝판에 꽉)
                     _cyl_x(wr, *_span(side * 38.7, side * 39.2), c),                 # 와셔
                     _cyl_x(wr, *_span(side * 45.5, side * 46.0), c)]                 # 와셔 (타워 바깥)
            if side < 0 and nmn == 'B':
                parts += [_cyl_x(wr, -49.5, -49.0, c), _cyl_x(nr, -51.9, -49.5, c)]   # 링크 너머 와셔 + 너트 B
            else:
                parts += [_cyl_x(nr, *_span(side * 46.0, side * 48.4), c)]           # 너트 B
            s = parts[0]
            for p in parts[1:]:
                s = s.fuse(p)
            hw[f'pin_{nmn}_{"R" if side > 0 else "L"}'] = (s.clean(), 'lifter', 'hardware')
    # 리프터 고무 패드
    hw['pad'] = (cq.Solid.makeBox(PH['hook_w_mm'], 2.5, PH['pad_t_mm'],
                                  cq.Vector(-PH['hook_w_mm'] / 2, Q0[0] - 1 - 2.5, Q0[1] - PH['pad_t_mm'])), 'lifter', 'rubber')
    # 왼쪽 피벗 F04 — 타워에 고정
    hb = [_cyl_x(hr, -49.0, -45.5, HINGE), _cyl_x(sr, -46.0, -26.0, HINGE), _cyl_x(nr, -39.5, -37.1, HINGE),
          _cyl_x(nr, -32.3, -27.5, HINGE)]
    s = hb[0]
    for p in hb[1:]:
        s = s.fuse(p)
    hw['hinge_bolt_L'] = (s.clean(), 'base', 'hardware')
    # 왼쪽 팔 베어링 와셔 (후드와 함께 돈다)
    hw['hood_washers_L'] = (_ring_x(wr, 1.6, -36.5, -36.0, HINGE).fuse(_ring_x(wr, 1.6, -33.0, -32.5, HINGE)).clean(), 'hood', 'hardware')
    # MG996R 원형 혼 + 심 와셔 (후드와 함께 돈다)
    hx = PH['horn_disc_x_mm']
    horn = _ring_x(PH['horn_d_mm'] / 2, 3.0, hx[0], hx[1], HINGE)
    for a in (0, 90, 180, 270):
        c = (HINGE[0] + PH['horn_hole_r_mm'] * math.cos(math.radians(a)), HINGE[1] + PH['horn_hole_r_mm'] * math.sin(math.radians(a)))
        horn = horn.fuse(_ring_x(wr, 1.6, hx[0] - PH['horn_shim_mm'], hx[0], c))
    hw['mg996r_horn'] = (horn.clean(), 'hood', 'horn')
    # MG996R 귀 볼트 F05 (×4) — 타워에 고정
    ear_top = PH['mg996r_ear_top_x_mm']
    eb = None
    for c in PH['mg996r_ear_holes']:
        parts = [_cyl_x(sr, 41.2, 53.2, c), _cyl_x(wr, 52.7, 53.2, c), _cyl_x(2.75, 53.2, 56.2, c),
                 _cyl_x(wr, PH['ear_pad_x_mm'][1], ear_top - 0.2, c)]
        for p in parts:
            eb = p if eb is None else eb.fuse(p)
    hw['ear_bolts'] = (eb.clean(), 'base', 'hardware')
    # 크랭크 핀 F09 — 크랭크와 함께 돈다
    cp = _cyl_x(2.75, -55.5, -52.5, PIN0).fuse(_cyl_x(sr, -52.5, -46.7, PIN0)).fuse(_ring_x(wr, 1.6, -49.5, -49.0, PIN0))
    hw['crank_pin'] = (cp.clean(), 'crank', 'hardware')
    return hw


# ---------------------------------------------------------------- 움직임

def linkage(theta):
    """크랭크 각 θ (최하 0°) → (리프터 이동 s, 크랭크 핀, B)."""
    a = math.radians(theta)
    axial, lateral = -R * math.cos(a), R * math.sin(a)
    pin = tuple(SERVO[i] + axial * D[i] + lateral * N[i] for i in range(2))
    s = LINK + R + axial - math.sqrt(LINK * LINK - lateral * lateral)
    return s, pin, tuple(B0[i] + s * D[i] for i in range(2))


def theta_for_s(s):
    """리프터 이동 s (0~66) 에 맞는 크랭크 각 (0~180)."""
    lo, hi = 0.0, 180.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if linkage(mid)[0] < s:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def hood_pose(shape, angle):
    return shape.rotate((0, *HINGE), (1, *HINGE), angle)


def lift_pose(shape, s):
    return shape.translate((0, D[0] * s, D[1] * s))


def crank_pose(shape, theta):
    return shape.rotate((0, *SERVO), (1, *SERVO), theta)


def link_pose(shape, theta):
    _, pin, slider = linkage(theta)
    a0 = math.degrees(math.atan2(B0[1] - PIN0[1], B0[0] - PIN0[0]))
    a1 = math.degrees(math.atan2(slider[1] - pin[1], slider[0] - pin[0]))
    return shape.rotate((0, *PIN0), (1, *PIN0), a1 - a0).translate((0, pin[0] - PIN0[0], pin[1] - PIN0[1]))


MOTION = dict(holder='cup', hood='hood', lifter='lifter', base='base', panel='panel')
CRANK_IDS = ('V01', 'V03')


def motion_of(pc):
    if pc['group'] == 'crank_link':
        return 'crank' if pc['id'] in CRANK_IDS else 'link'
    return MOTION[pc['group']]


_CACHE = {}


def solids():
    """한 번만 만든다: {이름: (솔리드, 움직임 묶음, 색, 조각 ID)} (최하·CLOSE 자세)."""
    if 'solids' not in _CACHE:
        out = {}
        for pc in PIECES:
            if pc.get('blank') or pc['group'] == 'spare':
                continue
            for i in range(len(pc['offset'])):
                s = piece_solid(pc, i)
                assert s.isValid() and len(s.Solids()) == 1, (instance_name(pc, i), s.isValid(), len(s.Solids()))
                out[instance_name(pc, i)] = (s, motion_of(pc), 'panel' if pc['group'] == 'panel' else 'foam', pc['id'])
        for name, (s, mot, col) in hardware().items():
            out[name] = (s, mot, col, 'HW')
        for name, s in purchased().items():
            out[name] = (s, 'fixed', name, 'KIT')
        _CACHE['solids'] = out
    return _CACHE['solids']


def cube_solid(pose):
    cube = cq.Solid.makeBox(C, C, C, cq.Vector(-H, -H, 0))
    if pose == 'flip':
        piv = PH['post_flip_pivot_y_mm']
        cube = cube.translate((0, piv - H, 0)).rotate((0, piv, 0), (1, piv, 0), -PH['post_flip_relief_deg'])
    return cube


POSES = dict(open=(PH['hood_open_deg'], 0.0), close=(0.0, 0.0), flip=(PH['hood_flip_deg'], 180.0), load=(PH['hood_load_deg'], 0.0))


def place(shape, motion, hood_deg=0.0, theta=0.0):
    if motion == 'hood':
        return hood_pose(shape, hood_deg)
    if motion == 'lifter':
        return lift_pose(shape, linkage(theta)[0])
    if motion == 'crank':
        return crank_pose(shape, theta)
    if motion == 'link':
        return link_pose(shape, theta)
    return shape


def assembly(pose):
    """pose ∈ open/close/flip/load → [(이름, 솔리드, 색 키)] (포맥스 조각 + 구매품 + 철물 + 큐브)."""
    hood_deg, theta = POSES[pose]
    items = [(n, place(s, mot, hood_deg, theta), col) for n, (s, mot, col, _) in solids().items()]
    items.append(('cube', cube_solid(pose), 'cube'))
    return items


# ---------------------------------------------------------------- 내보내기

def _step_deterministic(path):
    """STEP 을 두 번 내보내도 같은 바이트가 되게: 머리말 시각을 고정하고, OCC 가 해시 순서로 쓰는
    색 지정 블록을 (대상 표현, 대상 형상) 순으로 정렬해 다시 번호를 매긴다. 형상 번호는 이미 결정적이다."""
    text = path.read_text(encoding='utf-8', errors='surrogateescape')
    text = re.sub(r"FILE_NAME\('([^']*)','[^']*'", r"FILE_NAME('\1','2026-11-18T00:00:00'", text, count=1)
    key = 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION'
    start = text.rfind('\n#', 0, text.find(key)) if key in text else -1
    if key in text:
        head = text[:start + 1]
        body, tail = text[start + 1:].split('ENDSEC;', 1)
        ents = {int(m.group(1)): m.group(2) for m in re.finditer(r'#(\d+) = (.*?);\s*(?=#\d+ = |$)', body, re.S)}
        refs = lambda e: [int(x) for x in re.findall(r'#(\d+)', ents[e])]
        groups = []
        for eid, txt in ents.items():
            if txt.startswith(key):
                *styled_items, rep = refs(eid)
                for styled in styled_items:
                    target = refs(styled)[-1]
                    e = refs(styled)[0]
                    while not ents[e].startswith('COLOUR_RGB'):
                        e = refs(e)[-1]
                    rgb = re.search(r"COLOUR_RGB\('',(.*)\)", ents[e].replace('\n', '')).group(1)
                    groups.append((rep, target, rgb))
        n = min(ents)
        out = []
        for rep, target, rgb in sorted(groups):
            out += [f"#{n} = {key}('',(#{n + 1}),#{rep});", f"#{n + 1} = STYLED_ITEM('color',(#{n + 2}),#{target});",
                    f"#{n + 2} = PRESENTATION_STYLE_ASSIGNMENT((#{n + 3}));", f"#{n + 3} = SURFACE_STYLE_USAGE(.BOTH.,#{n + 4});",
                    f"#{n + 4} = SURFACE_SIDE_STYLE('',(#{n + 5}));", f"#{n + 5} = SURFACE_STYLE_FILL_AREA(#{n + 6});",
                    f"#{n + 6} = FILL_AREA_STYLE('',(#{n + 7}));", f"#{n + 7} = FILL_AREA_STYLE_COLOUR('',#{n + 8});",
                    f"#{n + 8} = COLOUR_RGB('',{rgb});"]
            n += 9
        text = head + '\n'.join(out) + '\nENDSEC;' + tail
    path.write_text(text, encoding='utf-8', errors='surrogateescape')


def export_assembly(pose, path):
    asm = cq.Assembly(name='RobotV5H_' + pose)
    for name, s, col in assembly(pose):
        asm.add(s, name=name, color=cq.Color(COLORS[col]))
    asm.save(str(path))
    _step_deterministic(path)


def summary():
    main = [p for p in PIECES if p['group'] != 'spare' and not p.get('blank')]
    ids = sorted({p['id'] for p in main})
    per_id = {i: sum(p['count'] for p in main if p['id'] == i) for i in ids}
    spare = [p for p in PIECES if p['group'] == 'spare']
    return dict(types=len(ids), sheets=sum(per_id.values()), per_id=per_id,
                blanks=[p['id'] for p in PIECES if p.get('blank')],
                spare_pieces=sum(p['count'] for p in spare), spare_per_id={p['id']: sum(q['count'] for q in spare if q['id'] == p['id']) for p in spare})


def build(per_piece_step=False):
    OUT.mkdir(parents=True, exist_ok=True)
    info = summary()
    assert info['types'] == 33 and info['sheets'] == 72, info
    assert info['spare_pieces'] == 13, info
    data = dict(source='docs/V5H_DESIGN.md 2절', units='mm', sheet_t_mm=ST,
                conventions=dict(XY='(u,v)=(x,y), +z 에서 내려다봄, offset=z', YZ='(u,v)=(y,z), +x 쪽에서 본 면, offset=x',
                                 XZ='(u,v)=(x,z), 뒤(−y)에서 본 면, offset=y', WORLD='(u,v)=(X,Y_w), 위에서 봄, offset=Z_w',
                                 OBLIQUE='L02: (u,v)=(x,n), 두께 방향 D, offset=s (B0 기준)',
                                 panel='C01~C04: 자체 좌표 (2.7절)', holes='d=드릴 비트 (method=knife 면 칼), poly=칼로 따는 창'),
                lift=dict(D=pts6([D])[0], N=pts6([N])[0], Q0=pts6([Q0])[0], B0=pts6([B0])[0], F0=pts6([F0])[0], B1=pts6([B1])[0],
                          servo=pts6([SERVO])[0], pin0=pts6([PIN0])[0]),
                summary=info, pieces=PIECES)
    (OUT / 'pieces.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print('pieces.json:', info['types'], 'types,', info['sheets'], 'sheets, spare', info['spare_pieces'], flush=True)
    sol = solids()
    print('built', len(sol), 'solids', flush=True)
    if per_piece_step:
        folder = OUT / 'pieces'
        folder.mkdir(exist_ok=True)
        for n, (s, *_r) in sol.items():
            p = folder / (n + '.step')
            cq.exporters.export(s, str(p))
            _step_deterministic(p)
    for pose in ('open', 'close', 'flip'):
        export_assembly(pose, OUT / f'assembly_{pose}.step')
        print('assembly', pose, flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--piece-steps', action='store_true', help='조각별 STEP 도 내보낸다 (models/robot_v5h/pieces/)')
    build(ap.parse_args().piece_steps)
