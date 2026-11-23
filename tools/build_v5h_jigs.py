"""build_v5h_jigs.py — V5H 출력 지그 7종 STL. 원본은 docs/V5H_DESIGN.md 5절(지그), 6.1절(검사 J), 7절(파라미터).

지그 치수는 robot_v5h_params.PH 와 build_robot_v5h.PIECES(2절 조각 좌표)에서 계산한다. 문서에 적힌 숫자는
`b.doc()` 로 계산값과 대조만 한다(어긋나면 멈춤). 문서 숫자가 문서 자신의 다른 조건과 모순인 곳은
계산값을 쓰고 index.json 의 doc_errors 에 남긴다.

좌표
- 각 지그는 '사용 좌표'(문서 5절 표의 좌표: 홀더 국소, 후드 CLOSE 국소, 조각 2D (u, v) + 판 법선 w …)에서 만들고,
  `rots` 로 돌려 출력 방향(베드에 닿는 면 z = 0)으로 내보낸다.
- 드릴 가이드·플러그 판: (u, v) = 조각 2D 좌표, w = 판 법선 (w 0 = 조각에 닿는 면, 펜스·핀은 w < 0).
- 출력 보정 `jig_xy_comp_mm`(c): 바깥면은 c 만큼 안으로, 구멍·창은 c 만큼 밖으로 (1b 를 재서 차이의 절반).
  적용 대상: 드릴 안내 구멍·플러그·칼 창·1b 게이지·6b·지그 2 H 구멍 (포켓·소켓 끼움 0.4 는 그대로).
  c ≠ 0 이면 문서 숫자(59.00 등)와 달라지므로 다른 실측값처럼 V5H_ALLOW_DOC_DRIFT=1 로 실행한다(검사 J 는 c 를 반영).

다음 워커용 인터페이스
- make_jigs() → [jig dict]: id('1a' …), jig(번호), file, name, purpose, qty, orient(출력 방향 글), rots,
  solid(사용 좌표 최종), body(각인 전), engr([{text, origin, xdir, normal, size, depth}]), feats(J17 표 행),
  meta(검사용 좌표·기준면).
- 실행: python3 tools/build_v5h_jigs.py → models/robot_v5h/jigs/*.stl + index.json
"""
import functools
import json
import math
from pathlib import Path

import cadquery as cq
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from shapely.geometry import Point, Polygon, box as sbox
from shapely.ops import unary_union
from shapely.prepared import prep

import build_robot_v5h as b
from robot_v5h_params import PH

ROOT = b.ROOT
OUT = b.OUT / 'jigs'

# ---------------------------------------------------------------- 공통 규칙 (5.0절, 7.3절)
ST = PH['sheet_t_mm']
BLADE = PH['blade_t_mm']                  # 칼 안내: 플러그 = 목표 − BLADE, 창 = 목표 + BLADE
CLR = PH['jig_bore_clear_mm']             # 드릴 안내 = 비트 + CLR
COMP = PH['jig_xy_comp_mm']
TAPE = PH['tape_t_mm']
JIG_MAX = PH['jig_max_mm']
TEXT_H = 6.0                              # 각인 글자 크기 (글꼴 크기, 대문자 높이 약 4.45)
LABEL_H = 4.0                             # 구멍 옆 L / R / LR (6 은 구멍 사이에 들어가지 않는다)
ID_H = 8.0                                # 드릴 가이드의 "ON B06" — 큰 글자 (안 들어가면 6)
BADGE_TEXT = 5.0                          # 사용 순서 숫자
BADGE_R = (3.4, 3.9)                      # 숫자 둘레 원형 홈 안·바깥 반경
ENGRAVE = 0.6
HANG_D = 6.0
FENCE_H, FENCE_T = 6.0, 4.0
PIN_FIT = 0.1                             # 핀 = 구멍 비트 − 0.1 (문서 Ø3.10 / Ø4.90)
SLIP = 0.4                                # 끼움 여유 (포켓 70.40, 소켓 16.40, 보스 43.60 …)
FONT = 'DejaVu Sans'
STL_TOL, STL_ANG = 0.01, 0.2                # 현 오차 0.01 mm (프린터 0.1 의 1/10), 각 0.2 rad

H = b.H                                   # 큐브 반폭 28.5
POST_IN, POST_OUT, POST_END, RELIEF_X = b.POST_IN, b.POST_OUT, b.POST_END, b.RELIEF_X
RAMP_Y0, RAMP_K, CHAMFER_Z0 = b.RAMP_Y0, b.RAMP_K, b.CHAMFER_Z0
HOOD_IN, HOOD_OUT, ROOF_Z, HB = b.HOOD_IN, b.HOOD_OUT, b.ROOF_Z, b.HB
HINGE = b.HINGE
D, N, Q0, B0, F0, B1 = b.D, b.N, b.Q0, b.B0, b.F0, b.B1
doc = b.doc
DOC_ERRORS = []
DEVIATIONS = []


def flat(pts):
    return [float(v) for p in pts for v in p]


def pc(pid, **kw):
    """PIECES 에서 id(+ 키 조건)로 조각 하나."""
    m = [p for p in b.PIECES if p['id'] == pid and p['group'] != 'spare' and all(p.get(k) == v for k, v in kw.items())]
    assert len(m) == 1, (pid, kw, len(m))
    return m[0]


def guide(bit):
    return bit + CLR + 2 * COMP


def plug(target):
    return target - BLADE - 2 * COMP


def win(target):
    return target + BLADE + 2 * COMP


# ---------------------------------------------------------------- 솔리드 도우미

def V(*a):
    return cq.Vector(*a)


def box3(x0, x1, y0, y1, z0, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, V(x0, y0, z0))


def cyl(c, r, w0, w1, axis='z'):
    """axis 방향 원통. c = 나머지 두 좌표 (z: (x, y), x: (y, z), y: (x, z))."""
    if axis == 'z':
        return cq.Solid.makeCylinder(r, w1 - w0, V(c[0], c[1], w0), V(0, 0, 1))
    if axis == 'x':
        return cq.Solid.makeCylinder(r, w1 - w0, V(w0, c[0], c[1]), V(1, 0, 0))
    return cq.Solid.makeCylinder(r, w1 - w0, V(c[0], w0, c[1]), V(0, 1, 0))


def prism(poly, w0, w1, axis='z'):
    """2D 다각형 기둥. axis z: (x, y) · x: (y, z) · y: (x, z)."""
    pts = [tuple(map(float, p)) for p in poly]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    if axis == 'z':
        pl = cq.Plane(origin=(0, 0, w0), xDir=(1, 0, 0), normal=(0, 0, 1))
    elif axis == 'x':
        pl = cq.Plane(origin=(w0, 0, 0), xDir=(0, 1, 0), normal=(1, 0, 0))
    else:
        pl = cq.Plane(origin=(0, w1, 0), xDir=(1, 0, 0), normal=(0, -1, 0))
    return cq.Workplane(pl).polyline(pts).close().extrude(w1 - w0).val()


def spoly(g):
    return list(g.exterior.coords)[:-1]


def fuse(*shapes):
    s = functools.reduce(lambda a, c: a.fuse(c), shapes)
    return s.clean()


def cut(s, *tools):
    for t in tools:
        s = s.cut(t)
    return s.clean()


def single(s):
    sol = s.Solids()
    assert len(sol) == 1, len(sol)
    return sol[0]


def tight_bb(shape):
    bb = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape.wrapped, bb, False, False)
    return bb.Get()


_TB = {}


def text_bbox(txt, size):
    key = (txt, size)
    if key not in _TB:
        t = cq.Workplane('XY').text(txt, size, 1.0, combine=False, halign='left', valign='bottom', font=FONT, kind='bold').val()
        x0, y0, _z0, x1, y1, _z1 = tight_bb(t)
        _TB[key] = (x0, x1, y0, y1)
    return _TB[key]


def text_solid(txt, size, origin, xdir, normal, depth=ENGRAVE):
    n = V(*normal)
    o = V(*origin) - n * depth
    pl = cq.Plane(origin=o, xDir=xdir, normal=normal)
    return cq.Workplane(pl).text(txt, size, depth + 0.3, combine=False, halign='left', valign='bottom',
                                 font=FONT, kind='bold').val()


class Engraver:
    """각인 목록을 모았다가 한 번에 판다."""

    def __init__(self):
        self.items = []

    def add(self, txt, origin, xdir, normal, size=TEXT_H):
        self.items.append(dict(text=txt, origin=[float(v) for v in origin], xdir=[float(v) for v in xdir],
                               normal=[float(v) for v in normal], size=size, depth=ENGRAVE))

    def badge(self, num, center, xdir, normal, size=BADGE_TEXT):
        """사용 순서 번호: 숫자 + 둘레 원형 홈 (글꼴에 ①② 가 있어도 크기가 제각각이라 직접 그린다)."""
        n, x = normal, xdir
        y = (n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0])
        tb = text_bbox(str(num), size)
        cx, cy = (tb[0] + tb[1]) / 2, (tb[2] + tb[3]) / 2
        o = [center[i] - cx * x[i] - cy * y[i] for i in range(3)]
        self.add(str(num), o, xdir, normal, size)
        self.items[-1]['badge'] = True
        self.items.append(dict(text='', ring=[list(map(float, center)), BADGE_R[0], BADGE_R[1]], origin=list(map(float, center)),
                               xdir=list(map(float, xdir)), normal=list(map(float, normal)), size=0, depth=ENGRAVE))

    def line(self, p0, p1, w, origin_z, normal=(0, 0, 1)):
        """윗면(+z) 방향 표시선 홈 (폭 w, 깊이 ENGRAVE)."""
        self.items.append(dict(text='', line=[list(p0), list(p1)], width=w, origin=[0, 0, origin_z], xdir=[1, 0, 0],
                               normal=list(normal), size=0, depth=ENGRAVE))

    def apply(self, body):
        tools = []
        for e in self.items:
            if e.get('ring'):
                c, r0, r1 = e['ring']
                n = V(*e['normal'])
                base = V(*c) - n * ENGRAVE
                tools.append(cq.Solid.makeCylinder(r1, ENGRAVE + 0.3, base, n).cut(cq.Solid.makeCylinder(r0, ENGRAVE + 0.3, base, n)))
            elif e.get('line'):
                (x0, y0), (x1, y1) = e['line']
                hw = e['width'] / 2
                z = e['origin'][2]
                tools.append(box3(min(x0, x1) - (hw if y0 != y1 else 0), max(x0, x1) + (hw if y0 != y1 else 0),
                                  min(y0, y1) - (hw if x0 != x1 else 0), max(y0, y1) + (hw if x0 != x1 else 0),
                                  z - ENGRAVE, z + 0.3))
            else:
                tools.append(text_solid(e['text'], e['size'], e['origin'], e['xdir'], e['normal']))
        return single(cut(body, *tools))


# ---------------------------------------------------------------- 2D 배치 (각인·걸이 구멍 자리 찾기)

def find_spot(region, keep, bbox, prefer, step=0.5, margin=0.8):
    """region 안, keep 밖에 bbox(x0,x1,y0,y1, 원점 기준)를 놓을 원점. prefer 에 가장 가까운 격자점 (결정적)."""
    x0, x1, y0, y1 = bbox
    rp = prep(region)
    kp = prep(keep) if keep is not None and not keep.is_empty else None
    minx, miny, maxx, maxy = region.bounds
    best = None
    nx = int((maxx - minx) / step) + 1
    ny = int((maxy - miny) / step) + 1
    for i in range(nx):
        ox = minx - x0 + i * step
        for j in range(ny):
            oy = miny - y0 + j * step
            r = sbox(ox + x0 - margin, oy + y0 - margin, ox + x1 + margin, oy + y1 + margin)
            if not rp.contains(r) or (kp is not None and kp.intersects(r)):
                continue
            d = (round((ox - prefer[0]) ** 2 + (oy - prefer[1]) ** 2, 6), round(ox, 6), round(oy, 6))
            if best is None or d < best:
                best = d
    return None if best is None else (best[1], best[2])


def find_circle(region, keep, d, prefer, step=0.5, margin=1.5):
    r = d / 2 + margin
    rp = prep(region.buffer(-r))
    kp = prep(keep.buffer(r)) if keep is not None and not keep.is_empty else None
    minx, miny, maxx, maxy = region.bounds
    best = None
    for i in range(int((maxx - minx) / step) + 1):
        x = minx + i * step
        for j in range(int((maxy - miny) / step) + 1):
            y = miny + j * step
            p = Point(x, y)
            if not rp.contains(p) or (kp is not None and kp.contains(p)):
                continue
            k = (round((x - prefer[0]) ** 2 + (y - prefer[1]) ** 2, 6), round(x, 6), round(y, 6))
            if best is None or k < best:
                best = k
    assert best is not None, 'no room for circle'
    return best[1], best[2]


def fence_strip(p, q, ext_q=FENCE_T, ext_p=0.0):
    """조각 외곽(반시계) 변 p→q 의 바깥쪽 펜스 띠. 안쪽면이 변 위."""
    L = math.dist(p, q)
    d = ((q[0] - p[0]) / L, (q[1] - p[1]) / L)
    n = (d[1], -d[0])
    a = (p[0] - ext_p * d[0], p[1] - ext_p * d[1])
    c = (q[0] + ext_q * d[0], q[1] + ext_q * d[1])
    return [a, c, (c[0] + FENCE_T * n[0], c[1] + FENCE_T * n[1]), (a[0] + FENCE_T * n[0], a[1] + FENCE_T * n[1])], \
        dict(p=list(p), q=list(q), n=list(n))


# ---------------------------------------------------------------- 지그 레코드

def record(jid, file, name, purpose, qty, orient, rots, body, eng, feats=(), meta=None, ids=(), step=None):
    """ids: 이 지그에 들어가거나 대는 포맥스 조각 ID (pieces.json 과 같은 글자). 각인에 모두 있어야 한다 (J2).
    step: 여러 출력물로 나뉜 지그에서 이 출력물을 쓰는 단계 (각인 "JIG-n STEP k")."""
    known = {p['id'] for p in b.PIECES} | {p.get('sub') for p in b.PIECES if p.get('sub')}
    assert all(i in known for i in ids), [i for i in ids if i not in known]
    solid = eng.apply(body)
    return dict(id=jid, jig=int(jid[0]), file=file, name=name, purpose=purpose, qty=qty, orient=orient, rots=rots,
                solid=solid, body=body, engr=eng.items, feats=list(feats), meta=meta or {}, ids=list(ids), step=step)


def feat(name, kind, bit_or_target, model, probe):
    """J17 표 한 줄. kind ∈ drill(비트+0.15)/plug(목표−칼)/window(목표+칼)/pin(구멍−0.1)/awl."""
    return dict(name=name, kind=kind, target=round(bit_or_target, 6), model=round(model, 6), probe=probe)


# ---------------------------------------------------------------- 판형 지그 (4 계열 공통)

def plate_jig(code, title, rect_doc, T, fences=(), holes=(), windows=(), lighten=(), pins=(), tabs=(),
              prefer_title=None, prefer_hang=None, label_keep_extra=None, notes=()):
    """판 (u, v) = 조각 좌표, w 0~T. holes: dict(c, d, bit, label, kind, name). windows: dict(poly|circle, ...).
    펜스는 w −FENCE_H~0, 핀은 w −len~0. 각인은 윗면(w = T)."""
    fpolys = [Polygon(f) for f in fences]
    outline = sbox(*unary_union([sbox(*rect_doc)] + fpolys + [Polygon(t) for t in tabs]).bounds)
    if outline.bounds != tuple(rect_doc):
        DEVIATIONS.append(f'{code}: 판 범위 {tuple(round(v, 3) for v in rect_doc)} → {tuple(round(v, 3) for v in outline.bounds)} '
                          f'(펜스 두께 {FENCE_T}·라벨 탭이 들어가게 넓힘)')
    ux0, uy0, ux1, uy1 = outline.bounds
    body = box3(ux0, ux1, uy0, uy1, 0, T)
    adds = [prism(f, -FENCE_H, 0) for f in fences]
    for p in pins:
        adds.append(pin_solid(p))
    if adds:
        body = fuse(body, *adds)
    cuts = []
    keep = []
    for h in holes:
        cuts.append(cyl(h['c'], h['d'] / 2, -FENCE_H - 1, T + 1))
        keep.append(Point(h['c']).buffer(h['d'] / 2))
    for w in list(windows) + list(lighten):
        if 'circle' in w:
            c, d = w['circle']
            cuts.append(cyl(c, d / 2, -1, T + 1))
            keep.append(Point(c).buffer(d / 2))
        else:
            cuts.append(prism(w['poly'], -1, T + 1))
            keep.append(Polygon(w['poly']))
    region = outline.buffer(-1.5, join_style=2)
    keepu = unary_union(keep + ([label_keep_extra] if label_keep_extra is not None else []))
    hang = find_circle(outline, unary_union([keepu] + fpolys), HANG_D,
                       prefer_hang or (ux1, uy1))
    cuts.append(cyl(hang, HANG_D / 2, -FENCE_H - 1, T + 1))
    keepu = unary_union([keepu, Point(hang).buffer(HANG_D / 2)])
    body = single(cut(body, *cuts))
    eng = Engraver()
    taken = [keepu.buffer(1.0)]
    # 구멍 옆 L / R / LR — 같은 표시가 10.5 mm 안에 모인 구멍은 하나로 (제목보다 먼저: 구멍 가까이 자리가 좁다)
    groups = []
    for h in holes:
        if not h.get('label'):
            continue
        for g in groups:
            if g['label'] == h['label'] and any(math.dist(h['c'], c) < 10.5 for c in g['cs']):
                g['cs'].append(h['c'])
                break
        else:
            groups.append(dict(label=h['label'], cs=[h['c']]))
    labels = []
    for g in groups:
        lb = text_bbox(g['label'], LABEL_H)
        cx = sum(c[0] for c in g['cs']) / len(g['cs'])
        cy = sum(c[1] for c in g['cs']) / len(g['cs'])
        hull = unary_union([Point(c).buffer(2.5) for c in g['cs']]).convex_hull
        o2 = None
        for reach in (7.0, 11.0, 15.0):
            o2 = find_spot(region.intersection(hull.buffer(reach)), unary_union(taken), lb, (cx + 4, cy), step=0.25, margin=0.4)
            if o2 is not None:
                break
        if o2 is None:
            labels.append(dict(label=g['label'], at=None))
            continue
        eng.add(g['label'], (o2[0], o2[1], T), (1, 0, 0), (0, 0, 1), size=LABEL_H)
        taken.append(sbox(o2[0] + lb[0], o2[1] + lb[2], o2[0] + lb[1], o2[1] + lb[3]).buffer(1.0))
        labels.append(dict(label=g['label'], at=[round(o2[0], 3), round(o2[1], 3)], holes=[list(c) for c in g['cs']]))
    tb = text_bbox(title, TEXT_H)
    o = find_spot(region, unary_union(taken).buffer(0.2), tb, prefer_title or ((ux0 + ux1) / 2, (uy0 + uy1) / 2))
    assert o is not None, f'{code}: 각인 자리 없음'
    eng.add(title, (o[0], o[1], T), (1, 0, 0), (0, 0, 1))
    taken.append(sbox(o[0] + tb[0], o[1] + tb[2], o[0] + tb[1], o[1] + tb[3]).buffer(1.0))
    # 조각 ID·단계 — notes: dict(text, size, prefer). 큰 글자가 안 들어가면 작게
    placed = []
    for nt in notes:
        for size in (nt.get('size', TEXT_H), TEXT_H, 5.0, LABEL_H):
            if size > nt.get('size', TEXT_H):
                continue
            nb = text_bbox(nt['text'], size)
            o3 = find_spot(region, unary_union(taken).buffer(0.2), nb, nt.get('prefer') or (ux0, uy0))
            if o3 is not None:
                break
        assert o3 is not None, f"{code}: '{nt['text']}' 자리 없음"
        eng.add(nt['text'], (o3[0], o3[1], T), (1, 0, 0), (0, 0, 1), size=size)
        taken.append(sbox(o3[0] + nb[0], o3[1] + nb[2], o3[0] + nb[1], o3[1] + nb[3]).buffer(1.0))
        placed.append(dict(text=nt['text'], size=size))
    missing = [l['label'] for l in labels if l['at'] is None]
    assert not missing, f'{code}: 표시 자리 없음 {missing}'
    return body, eng, dict(outline=list(outline.bounds), T=T, hang=list(hang), labels=labels, notes=placed)


def pin_solid(p):
    """밑면 핀 (w −len~0). p: dict(c, d, len, flat=None)."""
    return cyl(p['c'], p['d'] / 2, -p['len'], 0)


def side_text(eng, txt, u, v, w, xdir, normal, badge=None, size=TEXT_H):
    """축 정렬 면 위 한 줄. (u, v) = 면 안에서 xdir·위 방향 좌표 (xdir 성분 u 는 xdir 방향 거리), w = 면 위치.
    badge 가 있으면 줄 앞에 순서 번호."""
    n = normal
    y = (n[1] * xdir[2] - n[2] * xdir[1], n[2] * xdir[0] - n[0] * xdir[2], n[0] * xdir[1] - n[1] * xdir[0])
    ax = [i for i in range(3) if abs(n[i]) > 0.5][0]

    def pt(a, c):
        p = [a * xdir[i] + c * y[i] for i in range(3)]
        p[ax] = w
        return p
    if badge is not None:
        tb = text_bbox(txt, size)
        eng.badge(badge, pt(u + BADGE_R[1], v + (tb[2] + tb[3]) / 2), xdir, normal)
        u += 2 * BADGE_R[1] + 1.2
    eng.add(txt, pt(u, v), xdir, normal, size)


# ---------------------------------------------------------------- JIG-1 홀더 조립 (5.1절)

LEDGE_4D = True                           # 검사 J19 음성 시험용 스위치 (False = 리뷰 전 4D)
J1_BLOCK, J1_H = 110.0, 26.0
J1_POCKET_D, J1_SOCKET_D = 2.0, 5.0
J1_THRU = 44.0                            # 스택 외접원 Ø38.97 + 여유
J1_LEG = 10.0
J1_LEG_Y = 48.0
J1_TAB_T = 4.0
J1_TAB_MARGIN = 2.0                       # 탭 끝과 노치 벽 (x)


def jig1():
    out = []
    pocket = PH['plate_mm'] + SLIP
    doc(pocket, 70.40, '1a pocket')
    half = J1_BLOCK / 2
    tab_l = PH['notch_w_mm'] - 2 * J1_TAB_MARGIN
    tab_c = H - J1_TAB_T / 2
    doc((tab_l, tab_c), (16.0, 26.5), '1b tab')
    sock = (tab_l + SLIP, J1_TAB_T + SLIP)
    doc(sock, (16.40, 4.40), '1a socket')
    zA = J1_H - J1_POCKET_D                     # 면 A 포켓 바닥
    # --- 1a 받침 (면 B = z 0 = 베드)
    body = box3(-half, half, -half, half, 0, J1_H)
    pk = pocket / 2
    cuts = [box3(-pk, pk, -pk, pk, zA, J1_H + 1), box3(-pk, pk, -pk, pk, -1, J1_POCKET_D),
            cyl((0, 0), J1_THRU / 2, -1, J1_H + 1)]
    cuts += [cyl((sx * pk, sy * pk), 1.5, zA - 2.0, J1_H + 1) for sx in (-1, 1) for sy in (-1, 1)]
    for sgn in (-1, 1):
        cuts.append(box3(-sock[0] / 2, sock[0] / 2, sgn * tab_c - sock[1] / 2, sgn * tab_c + sock[1] / 2, zA - J1_SOCKET_D, zA + 0.1))
        cuts.append(box3(sgn * tab_c - sock[1] / 2, sgn * tab_c + sock[1] / 2, -sock[0] / 2, sock[0] / 2, zA - J1_SOCKET_D, zA + 0.1))
        ls = (J1_LEG + SLIP) / 2
        cuts.append(box3(-ls, ls, sgn * J1_LEG_Y - ls, sgn * J1_LEG_Y + ls, -1, J1_SOCKET_D))
        cuts.append(box3(sgn * half - 10, sgn * half + 1, -15, 15, 8, 18) if sgn > 0 else box3(-half - 1, -half + 10, -15, 15, 8, 18))
    hang = (-half + 7, half - 7)
    cuts.append(cyl(hang, HANG_D / 2, -1, J1_H + 1))
    body = single(cut(body, *cuts))
    eng = Engraver()
    # ±y 옆면 (맞닿지 않는 면): 위 줄 = 면 A (단계 4), 가운데 = 이름, 아래 줄 = 면 B (단계 2)
    for sgn in (-1, 1):
        xd = (sgn * -1.0, 0.0, 0.0) if sgn > 0 else (1.0, 0.0, 0.0)
        nrm = (0.0, float(sgn), 0.0)
        side_text(eng, 'JIG-1 HOLDER', -36.0, 11.0, sgn * half, xd, nrm)
        side_text(eng, 'A: H01 P01 P02', -36.0, 19.5, sgn * half, xd, nrm, badge=4)
        side_text(eng, 'B: H01 H02 H03 H04', -36.0, 2.5, sgn * half, xd, nrm, badge=2)
    out.append(record('1a', 'J1a_holder_base.stl', '1a 받침', '면 B: 판 아래 스택을 H01 중심에 / 면 A: 기둥 붙이기 받침', 1,
                      '면 B(z 0)를 베드에', [], body, eng,
                      feats=[feat('1a 포켓 A·B', 'slip', PH['plate_mm'], pocket, dict(gap='x', box=[-pk - 1, pk + 1, -5, 5, zA, J1_H]))],
                      meta=dict(pocket=pocket, zA=zA, pocket_d=J1_POCKET_D), ids=['H01', 'H02', 'H03', 'H04', 'P01', 'P02'], step='2·4'))
    # --- 1b 게이지 (사용 좌표: H01 윗면 z 0)
    g = 2 * POST_IN - 2 * COMP
    doc(g, 59.00, '1b gauge')
    hh = PH['post_h_mm']
    gb = cq.Workplane('XY').box(g, g, hh, centered=(True, True, False)).edges('|Z').chamfer(0.3).val()
    tab_len = PH['plate_t_mm'] + J1_SOCKET_D
    doc(tab_len, 8.0, '1b tab length')
    tabs = []
    for sgn in (-1, 1):
        tabs.append(box3(-tab_l / 2, tab_l / 2, sgn * tab_c - J1_TAB_T / 2, sgn * tab_c + J1_TAB_T / 2, -tab_len, 0))
        tabs.append(box3(sgn * tab_c - J1_TAB_T / 2, sgn * tab_c + J1_TAB_T / 2, -tab_l / 2, tab_l / 2, -tab_len, 0))
    body = fuse(gb, *tabs)
    well = 1.0                              # 윗면(높이 15 기준면)에 글을 파지 않으려고 1 mm 낮춘 글 자리
    body = single(cut(body, cyl((-15, 0), 9, hh - 8, hh + 1), cyl((15, 0), 9, hh - 8, hh + 1), cyl((0, 0), HANG_D / 2, -1, hh + 1),
                      box3(-25.0, 25.0, 10.5, 26.5, hh - well, hh + 1), box3(-25.0, 25.0, -26.5, -10.5, hh - well, hh + 1)))
    eng = Engraver()
    zt = hh - well
    for txt, y in (('JIG-1 STEP 5-7', 19.5), ('H01 P01 P02', 12.0), ('29.5/15', -18.0)):
        bt = text_bbox(txt, TEXT_H)
        eng.add(txt, (-(bt[1] + bt[0]) / 2, y, zt), (1, 0, 0), (0, 0, 1))
    out.append(record('1b', 'J1b_post_gauge.stl', '1b 기둥 게이지', '기둥 안쪽면 |x|,|y| 29.5 · 높이 15 (먼저 출력해 59.00 측정)', 1,
                      '윗면을 베드에, 탭 위로', [('x', 180)], body, eng,
                      feats=[feat('1b 게이지 59.00', 'gauge', 2 * POST_IN, g, dict(gap='x', box=[-31, 31, -20, 20, 0.5, hh - 0.5]))],
                      meta=dict(gauge=g, h=hh, tab_l=tab_l, tab_c=tab_c, tab_t=J1_TAB_T), ids=['H01', 'P01', 'P02'], step='5-7'))
    # --- 1c 볼트 다리 (면 B 를 위로 놓고 면 B = z 0)
    def zb(z_local):
        return -J1_POCKET_D - z_local
    nut_bot = zb(PH['coupler_top_z_mm'])
    boss_bot = nut_bot + 1.0
    bolt_tip = zb(PH['bolt_tip_z_mm'])
    doc((nut_bot, boss_bot, bolt_tip), (14.0, 15.0, 23.0), '1c heights')
    beam0, beam1 = 29.0, 37.0
    bore = guide(PH['hd3_hole_mm'])
    doc(bore, 5.15, '1c bore')
    body = fuse(box3(-8, 8, -60, 60, beam0, beam1), cyl((0, 0), 7.0, boss_bot, beam0),
                box3(-J1_LEG / 2, J1_LEG / 2, J1_LEG_Y - J1_LEG / 2, J1_LEG_Y + J1_LEG / 2, -J1_SOCKET_D, beam0),
                box3(-J1_LEG / 2, J1_LEG / 2, -J1_LEG_Y - J1_LEG / 2, -J1_LEG_Y + J1_LEG / 2, -J1_SOCKET_D, beam0))
    body = single(cut(body, cyl((0, 0), bore / 2, boss_bot - 1, beam1 + 1), cyl((0, 56.0), HANG_D / 2, beam0 - 1, beam1 + 1)))
    eng = Engraver()
    tb = text_bbox('JIG-1 BRIDGE', TEXT_H)
    eng.add('JIG-1 BRIDGE', ((tb[3] + tb[2]) / 2, 6.0, beam1), (0, 1, 0), (0, 0, 1))
    tb = text_bbox('H02 H03 H04', TEXT_H)
    eng.add('H02 H03 H04', ((tb[3] + tb[2]) / 2, -6.0 - (tb[1] - tb[0]), beam1), (0, 1, 0), (0, 0, 1))
    eng.add('JIG-1 STEP 3', (8.0, -30.0, beam0 + 1.8), (0, 1, 0), (1, 0, 0))
    out.append(record('1c', 'J1c_bolt_bridge.stl', '1c 볼트 다리', 'M5 볼트 위쪽을 보어로 잡아 스택을 H01 중심에', 1,
                      '옆으로 눕혀 (x 면을 베드에)', [('y', 90)], body, eng,
                      feats=[feat('1c 보어 M5', 'drill', 5.0, bore, dict(cyl=[0, 0], axis='z'))],
                      meta=dict(nut_bot=nut_bot, boss_bot=boss_bot, bore=bore, zmap='z = -pocket_d - z_local'),
                      ids=['H02', 'H03', 'H04'], step='3'))
    # --- 1d 마개
    plug_d = J1_THRU - SLIP
    plug_h = J1_H - J1_POCKET_D
    doc((plug_d, plug_h), (43.60, 24.00), '1d plug')
    well = 1.0                              # 책상에 닿는 끝면(높이 24 기준)에 글을 파지 않으려고 1 mm 들인 글 자리
    body = single(cut(cyl((0, 0), plug_d / 2, 0, plug_h), cyl((0, 0), 7.5, plug_h - 5, plug_h + 1),
                      cyl((0, 15.0), HANG_D / 2, -1, plug_h + 1), box3(-18.5, 18.5, -9.0, 7.0, -1, well)))
    eng = Engraver()
    for txt, yc, sz in (('JIG-1 PLUG', 2.5, TEXT_H), ('STEP 2 H01', -5.0, 5.0)):
        tb = text_bbox(txt, sz)
        assert -18.0 < -(tb[1] - tb[0]) / 2 and (tb[1] - tb[0]) / 2 < 18.0, txt     # 글 자리(±18.5) 안
        eng.add(txt, ((tb[1] + tb[0]) / 2, yc - (tb[3] + tb[2]) / 2, well), (-1, 0, 0), (0, 0, -1), size=sz)
    out.append(record('1d', 'J1d_center_plug.stl', '1d 가운데 마개', '면 B 사용 때 Ø44 관통을 메워 H01 가운데 받침', 1,
                      '세워서 (각인 끝면을 베드에)', [], body, eng, meta=dict(d=plug_d, h=plug_h), ids=['H01'], step='2'))
    return out


# ---------------------------------------------------------------- JIG-2 기둥 모따기·FLIP 비움 (5.2절)

J2_L, J2_A, J2_V = 140.0, 70.0, 36.0
J2_R_APEX_A, J2_C_APEX_A = 25.0, 55.0
J2_C_LEN = 40.0
J2_H_C = (120.0, 10.0)
J2_K_A = 50.0                             # K 홈 a 중심 (문서에 없음 — H 밀어내기 구멍·손가락 홈을 피한 자리)
J2_K_L0 = 50.0


def jig2():
    relief = math.radians(PH['post_flip_relief_deg'])
    # R: 막대 모서리 (y 34.5, z 0) 에서 비움면까지 거리 = 꼭짓점 높이
    hR = (POST_OUT - RAMP_Y0) * math.sin(relief)
    doc(hR, 5.442, 'J2 R apex height')
    fR1 = J2_R_APEX_A - hR / math.tan(relief)          # W1 (S 와 65.1°)
    fR2 = J2_R_APEX_A + hR * math.tan(relief)          # W2 (S 와 24.9°)
    DOC_ERRORS.append(dict(where='5.2절 JIG-2 R', doc='W1 → (22.625, 0), W2 → (36.875, 0)',
                           computed=f'W1 → ({fR1:.3f}, 0), W2 → ({fR2:.3f}, 0)',
                           why='꼭짓점 (25, 5.442) 에서 65.1°·24.9° 벽이면 발은 25 − 5.442/tan65.1° · 25 + 5.442·tan65.1°. '
                               '문서 발 좌표는 두 벽이 직각이 아니다 (2.375 × 11.875 ≠ 5.442²). 각도·높이(J6 기준)를 따랐다.'))
    # C: 코너 기둥 모서리 (y 34.5, z 0) 에서 모따기면 z = 11 + (y − 29.5) 까지
    hC = abs(0 - CHAMFER_Z0 - (POST_OUT - POST_IN)) / math.sqrt(2)
    doc(hC, 11.314, 'J2 C apex height')
    fC1, fC2 = J2_C_APEX_A - hC, J2_C_APEX_A + hC
    DOC_ERRORS.append(dict(where='5.2절 JIG-2 C', doc='W1 → (39.444, 0), W2 → (62.071, 0)',
                           computed=f'W1 → ({fC1:.3f}, 0), W2 → ({fC2:.3f}, 0)',
                           why='45° 두 벽이면 발은 꼭짓점 a 55 ± 11.314. 문서 값은 36°·58° 벽이 된다. 45°(J7 기준)를 따랐다.'))
    body = box3(0, J2_L, 0, J2_A, 0, J2_V)
    grooveR = prism([(fR1 - 1 / math.tan(relief), -1), (J2_R_APEX_A, hR), (fR2 + 1 * math.tan(relief), -1)], -1, J2_L + 1, axis='x')
    grooveC = prism([(fC1 - 1, -1), (J2_C_APEX_A, hC), (fC2 + 1, -1)], -1, J2_C_LEN, axis='x')
    hole = 6.0 + 2 * COMP
    hdepth = PH['post_h_mm']
    hc = J2_H_C
    ramp_len = RELIEF_X - POST_END
    kw = (POST_OUT - POST_IN) + PH['post_ramp_l0_tol_mm'][0]
    kd = PH['post_ramp_layers'] * ST + 0.5
    doc((kw, kd, ramp_len), (5.20, 12.5, 11.10), 'J2 K')
    knife = 2 * BLADE
    doc(knife, 0.8, 'J2 knife slot')
    cuts = [grooveR, grooveC,
            box3(hc[0] - hole / 2, hc[0] + hole / 2, hc[1] - hole / 2, hc[1] + hole / 2, -1, hdepth),
            cyl((hc[0], hc[1]), 2.0, hdepth - 0.5, J2_V + 1),
            box3(J2_K_L0, J2_L + 1, J2_K_A - kw / 2, J2_K_A + kw / 2, J2_V - kd, J2_V + 1),
            box3(J2_K_L0 + ramp_len, J2_K_L0 + ramp_len + knife, J2_K_A - 8, J2_K_A + 8, J2_V - 14, J2_V + 1),
            box3(50, 90, -1, 5, 10.5, 25.5), box3(50, 90, J2_A - 5, J2_A + 1, 10.5, 25.5),
            cyl((133.0, 62.0), HANG_D / 2, -1, J2_V + 1)]
    body = cut(body, *cuts)
    pins = [cyl((L, 18.0), 2.0, -6.0, 0.0, axis='y') for L in (15.0, 125.0)] + \
           [cyl((L, 18.0), 2.0, J2_A, J2_A + 6.0, axis='y') for L in (15.0, 125.0)]
    body = single(fuse(body, *pins))
    eng = Engraver()
    eng.add('JIG-2 POST 65.1 / 45 / 15.00', (8.0, 0.0, 27.5), (1, 0, 0), (0, -1, 0))
    # 윗면(v 36, 맞닿지 않음): 스테이션마다 순서 번호 + 조각 ID. ① H 높이 ② C 모따기 (P01) ③ R 비움 ④ K 자르기 (P02)
    for num, txt, u, v in ((1, 'H P01', 96.0, 18.0), (2, 'C P01', 4.0, 53.0), (3, 'R P02', 4.0, 28.0), (4, 'K P02', 66.0, 58.0)):
        side_text(eng, txt, u, v, J2_V, (1.0, 0.0, 0.0), (0.0, 0.0, 1.0), badge=num)
    meta = dict(R=dict(apex=[J2_R_APEX_A, hR], f1=fR1, f2=fR2), C=dict(apex=[J2_C_APEX_A, hC], f1=fC1, f2=fC2, L=[0, J2_C_LEN]),
                H=dict(c=list(hc), size=hole, depth=hdepth), K=dict(stop=J2_K_L0, knife=[J2_K_L0 + ramp_len, J2_K_L0 + ramp_len + knife],
                                                                    a=J2_K_A, w=kw, depth=kd))
    DEVIATIONS.append('JIG-2: K 홈의 a 위치가 문서에 없어 a 50 (H 밀어내기 구멍 a 10, 손가락 홈 a 0~5·65~70 을 피함) 으로 정함')
    return [record('2', 'J2_post_bevel.stl', 'JIG-2 기둥 모따기·FLIP 비움', '경사 막대 65.1° 비움면, 코너 기둥 45° 모따기 2면·높이 15.00, 경사 11.10 자르기', 1,
                   'S 면(사포면)을 위로', [('x', 180)], body, eng,
                   meta=meta, ids=['P01', 'P02'])]


# ---------------------------------------------------------------- JIG-3 후드 심 (5.3절)

def jig3():
    out = []
    fl_top = HB - TAPE
    body_half = HOOD_IN - TAPE
    front = HOOD_IN - TAPE
    back = -HOOD_OUT
    top = ROOF_Z - TAPE - 0.10
    boss = PH['hood_roof_hole_mm'] - SLIP
    boss_top = top + 2.6
    doc((fl_top, body_half, top, boss, boss_top), (20.92, 29.92, 58.32, 43.60, 60.92), 'J3a')
    fl_bot = fl_top - 4.0
    sock = 12.0 + SLIP
    sock_c = (0.0, HINGE[1])                 # (x, z)
    shell = fuse(box3(-38, 38, -38, 38, fl_bot, fl_top), box3(-body_half, body_half, back, front, fl_top, top),
                 box3(-boss / 2, boss / 2, -boss / 2, boss / 2, top, boss_top))
    wt = 3.0
    cav = cq.Workplane('XY').box(2 * (body_half - wt), front - wt - (back + wt), top - wt - (fl_bot - 1),
                                 centered=False).edges('>Z').chamfer(25.0).val().translate(V(-(body_half - wt), back + wt, fl_bot - 1))
    column = box3(-(sock / 2 + wt), sock / 2 + wt, back, back + 15.0 + wt, fl_bot, sock_c[1] + sock / 2 + wt)
    body = fuse(cut(shell, cav), column)
    body = single(cut(body, box3(-sock / 2, sock / 2, back - 1, back + 15.0, sock_c[1] - sock / 2, sock_c[1] + sock / 2),
                      cyl((34.0, 34.0), HANG_D / 2, fl_bot - 1, fl_top + 1)))
    eng = Engraver()
    for txt, z in (('JIG-3 HOOD', 51.5), ('60x60 z21', 22.0)):
        tb = text_bbox(txt, TEXT_H)
        eng.add(txt, (-(tb[1] + tb[0]) / 2, back, z), (1, 0, 0), (0, -1, 0))
    # 뒷면 (후드에 닿지 않음): ② 앞벽 K02 ③ 옆벽 K03 ④ 지붕 K01 ⑤ 팔 K04 (3b 를 이 소켓에)
    for num, txt, u, z in ((2, 'K02', -28.4, 41.0), (3, 'K03', 8.1, 41.0), (4, 'K01', -28.4, 30.5), (5, 'K04', 8.1, 30.5)):
        side_text(eng, txt, u, z, back, (1.0, 0.0, 0.0), (0.0, -1.0, 0.0), badge=num)
    out.append(record('3a', 'J3a_hood_shim.stl', '3a 후드 심', '앞벽·옆벽·지붕을 감싸 붙여 안치수 60 × 60, 벽 아래끝 z 21, 지붕 z 58.5', 1,
                      '플랜지를 베드에', [], body, eng,
                      meta=dict(fl_top=fl_top, half=body_half, front=front, top=top, boss=boss, back=back, sock=sock, sock_c=sock_c),
                      ids=['K01', 'K02', 'K03'], step='1-4'))
    # --- 3b 팔 로케이터
    hy, hz = HINGE
    z0, z1 = hz - 6, hz + 6
    beam = box3(-6, 6, hy - 6, back + 15.0, z0, z1)
    bar = box3(-31, 31, hy - 6, hy + 6, z0, z1)
    body = fuse(beam, bar)
    body = single(cut(body, cyl((hy, hz), 1.6, -32, 32, axis='x'), cyl((0, hy + 13.0), HANG_D / 2, z0 - 1, z1 + 1)))
    eng = Engraver()
    tb = text_bbox('JIG-3 ARM', TEXT_H)
    eng.add('JIG-3 ARM', (-(tb[3] + tb[2]) / 2, back - 3.0, z1), (0, -1, 0), (0, 0, 1))
    tb = text_bbox('K04 STEP 5', TEXT_H)
    eng.add('K04 STEP 5', (-(tb[1] + tb[0]) / 2, hy - (tb[3] + tb[2]) / 2, z1), (1, 0, 0), (0, 0, 1))
    out.append(record('3b', 'J3b_arm_locator.stl', '3b 팔 로케이터', '두 팔 힌지 구멍을 (−90, 40) 에 (M3×20 두 개를 핀으로)', 1,
                      '눕혀서 (z 34 면을 베드에)', [], body, eng, meta=dict(hole=[hy, hz], hole_d=3.2), ids=['K04'], step='5'))
    return out


# ---------------------------------------------------------------- JIG-4 드릴 가이드 (5.4절)

def capsule_solid(a, c, r, w0, w1):
    """참 원호 캡슐 (검사가 원통면 반경을 잰다)."""
    L = math.dist(a, c)
    p = ((c[1] - a[1]) / L * r, -(c[0] - a[0]) / L * r)
    rect = [(a[0] + p[0], a[1] + p[1]), (c[0] + p[0], c[1] + p[1]), (c[0] - p[0], c[1] - p[1]), (a[0] - p[0], a[1] - p[1])]
    return fuse(cyl(a, r, w0, w1), cyl(c, r, w0, w1), prism(b.ccw(rect), w0, w1))


def flag_plug(code, lines, plug_poly=None, plug_solid=None, t=6.0, post_c=(0, 0), post_d=12.0, post_h=12.0,
              bore=None, holes=(), pin=None, dir_line=False, flag_dir='u'):
    """플러그 + 손잡이 기둥 + 깃발(각인 여러 줄·걸이 구멍). 플러그 밑면 w 0, 핀은 w < 0.
    lines[0] = 지그 이름 줄, 나머지 = 조각 ID 등. dir_line = 플러그 평면 방향 표시선 (깃발 긴 방향과 같음)."""
    body = prism(plug_poly, 0, t) if plug_poly is not None else plug_solid
    w0 = t + post_h
    ft = 3.0
    bbs = [text_bbox(l, TEXT_H) for l in lines]
    tw = max(bb[1] - bb[0] for bb in bbs)
    lo = -(post_d / 2 + 1.5)
    t0 = post_d / 2 + 1.5                   # 글 시작 (기둥 중심에서)
    hang_c = t0 + tw + 2.0 + HANG_D / 2
    hi = hang_c + HANG_D / 2 + 2.5
    pitch = 7.0
    n = len(lines)
    fw = max(14.0, 4.0 + n * pitch + (2.0 if dir_line else 0.0))
    if flag_dir == 'u':
        fl = box3(post_c[0] + lo, post_c[0] + hi, post_c[1] - fw / 2, post_c[1] + fw / 2, w0, w0 + ft)
        hang = (post_c[0] + hang_c, post_c[1])
    else:
        fl = box3(post_c[0] - fw / 2, post_c[0] + fw / 2, post_c[1] + lo, post_c[1] + hi, w0, w0 + ft)
        hang = (post_c[0], post_c[1] + hang_c)
    parts = [body, cyl(post_c, post_d / 2, t - 0.01, w0 + 0.01), fl]
    if pin:
        parts.append(cyl(pin['c'], pin['d'] / 2, -pin['len'], 0.01))
    body = fuse(*parts)
    cuts = [cyl(hang, HANG_D / 2, w0 - 1, w0 + ft + 1)]
    if bore:
        cuts.append(cyl(bore[0], bore[1] / 2, -1, w0 + ft + 1))
    for h in holes:
        cuts.append(cyl(h['c'], h['d'] / 2, -1, t + 1))
    body = single(cut(body, *cuts))
    eng = Engraver()
    shift = 1.0 if dir_line else 0.0
    for k, (txt, tb) in enumerate(zip(lines, bbs)):
        ck = ((n - 1) / 2 - k) * pitch + shift
        if flag_dir == 'u':
            eng.add(txt, (post_c[0] + t0 - tb[0], post_c[1] + ck - (tb[3] + tb[2]) / 2, w0 + ft), (1, 0, 0), (0, 0, 1))
        else:                                   # 글 위쪽 = −u
            eng.add(txt, (post_c[0] - ck + (tb[3] + tb[2]) / 2, post_c[1] + t0 - tb[0], w0 + ft), (0, 1, 0), (0, 0, 1))
    if dir_line:
        e = fw / 2 - 1.4
        if flag_dir == 'u':
            eng.line((post_c[0] + t0, post_c[1] - e), (post_c[0] + hi - 2.0, post_c[1] - e), 0.8, w0 + ft)
        else:
            eng.line((post_c[0] + e, post_c[1] + t0), (post_c[0] + e, post_c[1] + hi - 2.0), 0.8, w0 + ft)
    return body, eng


def jig4():
    out = []
    PLATE_ORIENT = '펜스(·핀) 쪽을 위로 — 판 윗면(각인)을 베드에'
    flip = [('x', 180)]
    hy, hz = HINGE
    # ---- 4A-1 타워 4장
    b06 = pc('B06')
    t1r = pc('B07', sub='T1R')
    slot = next(h for h in b06['holes'] if 'slot' in h)['slot']
    hinge_h = next(h for h in b06['holes'] if h.get('note') == '힌지')
    ears = [(h['x'], h['y']) for h in t1r['holes'] if 'd' in h and h.get('note') == '귀 볼트 끝 여유']
    assert len(ears) == 4
    tb_, fl, st = PH['tower_back_y_mm'], PH['tower_front_low_y_mm'], PH['tower_step_z_mm']
    pA = (tb_, b.floor_z(tb_))
    pB = (fl, b.floor_z(fl))
    pC = (fl, st)
    for p in (pA, pB, pC):
        assert any(math.dist(p, q) < 1e-5 for q in b06['outline']), p
    f_bot, e_bot = fence_strip(pA, pB)
    f_frt, e_frt = fence_strip(pB, pC, ext_q=0.0, ext_p=FENCE_T)
    ang = math.degrees(math.acos(-(e_bot['n'][0] * e_frt['n'][0] + e_bot['n'][1] * e_frt['n'][1])))
    doc(ang, 70.0, '4A-1 fence angle', tol=1e-6)
    bit = 3.2
    holes = [dict(c=(hinge_h['x'], hinge_h['y']), d=guide(bit), bit=bit, label='LR', name='힌지'),
             dict(c=tuple(slot['a']), d=guide(bit), bit=bit, label='LR', name='F0'),
             dict(c=tuple(slot['b']), d=guide(bit), bit=bit, label='LR', name='B1')]
    holes += [dict(c=e, d=guide(bit), bit=bit, label='R', name='귀') for e in sorted(ears)]
    mk = b06['marks']
    legs = unary_union([Polygon(mk['t2l_outer_rear_leg']), Polygon(mk['t2l_outer_bottom_leg'])])
    lc = list(Polygon(legs.exterior).exterior.coords)[:-1]
    awl = []
    for i, p in enumerate(lc):
        a, c = lc[i - 1], lc[(i + 1) % len(lc)]
        cross = (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])
        if abs(cross) > 1e-9 and (cross > 0) == Polygon(lc).exterior.is_ccw:
            awl.append((round(p[0], 6), round(p[1], 6)))
    awl = sorted(awl)
    doc(flat(sorted(awl)), flat(sorted([(-108.232, 28.076), (-108.232, 91.076), (-105.232, 91.076), (-71.232, 28.076), (-71.232, 31.076)])),
        '4A-1 awl marks')
    holes += [dict(c=p, d=1.2, bit=None, label='L', name='송곳', kind='awl') for p in awl]
    lighten = [dict(poly=b.rect(-121.0, -82.0, -28.0, 22.0)), dict(poly=b.rect(-121.0, -82.0, 54.0, 82.0)),
               dict(poly=b.rect(-62.0, -36.0, 58.0, 84.0))]
    body, eng, m = plate_jig('4A-1', 'JIG-4A1 TOWER', (-134.0, -88.0, -24.0, 97.0), 10.0, fences=[f_bot, f_frt], holes=holes,
                             lighten=lighten, prefer_title=(-95, 90), prefer_hang=(-131, 94),
                             notes=[dict(text='ON B06 B07', size=ID_H, prefer=(-125, 2)), dict(text='T1L T2L T1R T2R', prefer=(-125, -38)),
                                    dict(text='JIG-4 STEP 5', prefer=(-125, 30))])
    feats = [feat(f"4A-1 {h['name']} {tuple(round(v, 3) for v in h['c'])}", 'drill' if h['bit'] else 'awl', h['bit'] or 1.2, h['d'],
                  dict(cyl=list(h['c']), axis='z')) for h in holes]
    out.append(record('4A-1', 'J4A1_tower_drill.stl', '4A-1 타워 드릴 가이드', '타워 4장 (+x 면 위): 힌지·F0·B1 [LR], 귀 [R], SG90 다리 송곳 [L]', 1,
                      PLATE_ORIENT, flip, body, eng, feats, meta=dict(m, holes=[dict(h, c=list(h['c'])) for h in holes],
                                                                     fences=[e_bot, e_frt]), ids=['B06', 'B07', 'T1R', 'T2R'], step='5'))
    # ---- 4A-2 T2R 창
    t2r = pc('B07', sub='T2R')
    wpoly = next(h for h in t2r['holes'] if 'poly' in h and 'MG996R' in h.get('note', ''))['poly']
    wy = (min(p[0] for p in wpoly), max(p[0] for p in wpoly))
    wz = (min(p[1] for p in wpoly), max(p[1] for p in wpoly))
    wc = ((wy[0] + wy[1]) / 2, (wz[0] + wz[1]) / 2)
    ww, wh = win(wy[1] - wy[0]), win(wz[1] - wz[0])
    doc((ww, wh, wc[0], wc[1]), (41.90, 21.20, -100.250, 40.000), '4A-2 window')
    pin_d = bit - PIN_FIT
    doc(pin_d, 3.10, '4A-2 pin')
    pins = [dict(c=e, d=pin_d, len=ST) for e in sorted(ears)]
    tab = b.rect(-129.0, -71.5, 53.0, 80.0)
    DEVIATIONS.append('4A-2: 판 z 27~53 의 창 둘레 띠(2.4~4 mm)에 각인·걸이 구멍이 들어가지 않아 위쪽 라벨 탭 z 53~80 을 붙임')
    body, eng, m = plate_jig('4A-2', 'JIG-4A2 T2R', (-129.0, 27.0, -71.5, 53.0), 8.0, pins=pins, tabs=[tab],
                             windows=[dict(poly=b.rect(wc[0] - ww / 2, wc[0] + ww / 2, wc[1] - wh / 2, wc[1] + wh / 2))],
                             prefer_title=(-118, 74), prefer_hang=(-76, 75),
                             notes=[dict(text='ON B07 T2R', size=ID_H, prefer=(-124, 63)), dict(text='JIG-4 STEP 5', prefer=(-124, 55))])
    out.append(record('4A-2', 'J4A2_t2r_window.stl', '4A-2 T2R 창 가이드', 'T2R MG996R 창 41.5 × 20.8 칼 안내 (핀 4개를 귀 구멍에)', 1,
                      PLATE_ORIENT, flip, body, eng,
                      [feat('4A-2 창 y', 'window', wy[1] - wy[0], ww, dict(gap='x', box=[wc[0] - 25, wc[0] + 25, wc[1] - 5, wc[1] + 5, 1, 7])),
                       feat('4A-2 창 z', 'window', wz[1] - wz[0], wh, dict(gap='y', box=[wc[0] - 10, wc[0] + 10, wc[1] - 11.5, wc[1] + 11.5, 1, 7]))] +
                      [feat(f'4A-2 핀 {p["c"]}', 'pin', bit, pin_d, dict(cyl=list(p['c']), axis='z')) for p in pins],
                      meta=dict(m, window_c=list(wc), window=[ww, wh], pins=[list(p['c']) for p in pins]), ids=['B07', 'T2R'], step='5'))
    # ---- 4B 팔각 플러그
    af = plug(PH['stack_disc_af_mm'])
    doc(af, 35.60, '4B octagon')
    bore = guide(5.0)
    body, eng = flag_plug('4B', ['JIG-4B STEP 2', 'ON H02 H03 H04'], plug_poly=b.octagon(af), t=6.0, bore=((0, 0), bore))
    out.append(record('4B', 'J4B_octagon_plug.stl', '4B HD1~HD4 팔각 플러그', '정팔각 맞변 36 칼 안내, 가운데 Ø5 보어', 1,
                      '깃발을 베드에 (플러그 밑면 위로)', flip, body, eng,
                      [feat('4B 팔각 맞변', 'plug', PH['stack_disc_af_mm'], af, dict(gap='x', box=[-19, 19, -3, 3, 0.5, 5.5])),
                       feat('4B 보어 M5', 'drill', 5.0, bore, dict(cyl=[0, 0], axis='z'))], ids=['H02', 'H03', 'H04'], step='2'))
    # ---- 4C 모터 윗판
    b02 = pc('B02')
    mh = [(h['x'], h['y']) for h in b02['holes'] if h['d'] == PH['motor_hole_mm']]
    cw = win(PH['motor_plate_hole_mm'])
    doc(cw, 23.40, '4C window')
    holes = [dict(c=p, d=guide(3.2), bit=3.2, name='모터') for p in sorted(mh)]
    fx, ex = fence_strip((-25.0, 31.0 - FENCE_T), (-25.0, -25.0))
    fy, ey = fence_strip((-25.0, -25.0), (31.0 - FENCE_T, -25.0), ext_q=0.0, ext_p=FENCE_T)
    body, eng, m = plate_jig('4C', 'JIG-4C MOTOR', (-31.0, -31.0, 31.0, 31.0), 8.0, fences=[fx, fy], holes=holes,
                             windows=[dict(circle=((0.0, 0.0), cw))], prefer_title=(0, 22), prefer_hang=(27.5, 27.5),
                             notes=[dict(text='ON B02', size=ID_H, prefer=(-12, -22)), dict(text='STEP 8', prefer=(-25, 0))])
    out.append(record('4C', 'J4C_motor_plate.stl', '4C 모터 윗판 가이드', 'B02 ×2: M3 구멍 4개 (±15.5), 원형 창 Ø23', 1, PLATE_ORIENT, flip, body, eng,
                      [feat(f'4C 구멍 {p}', 'drill', 3.2, guide(3.2), dict(cyl=list(p), axis='z')) for p in sorted(mh)] +
                      [feat('4C 원형 창', 'window', PH['motor_plate_hole_mm'], cw, dict(cyl=[0, 0], axis='z'))],
                      meta=dict(m, holes=[list(p) for p in sorted(mh)], fences=[ex, ey]), ids=['B02'], step='8'))
    # ---- 4D 리프터 (리프터 국소 좌표, 바닥판을 베드에)
    qy, qz = Q0
    shelf_bot = qz - PH['shelf_t_mm']
    lip_y = qy
    hw = PH['hook_w_mm'] / 2
    col_in = hw + 0.1
    ex_ = PH['endplate_x_mm'][1]
    arm_in = ex_ + 0.2
    doc((shelf_bot, lip_y, col_in, arm_in), (-9.0, -23.83, 7.6, 36.5), '4D datums')
    y0, y1 = -45.0, -20.0
    parts = [box3(-44.5, 44.5, y0, y1, -35.0, -32.0)]
    for s in (-1, 1):
        parts.append(box3(min(s * arm_in, s * 44.5), max(s * arm_in, s * 44.5), y0, y1, -32.0, -5.0))
        parts.append(box3(min(s * col_in, s * 16.0), max(s * col_in, s * 16.0), -28.0, y1, -32.0, shelf_bot))
    parts.append(box3(-16.0, 16.0, lip_y, y1, shelf_bot, shelf_bot + 1.0))
    # 끝판 받침 턱 (리뷰 수정): 팔 안쪽에서 끝판(L03) 아래 변 n = −4 을 받친다. 기둥 윗면 z −9 에는 아무것도 앉지 않아
    # 리프터가 3.02 처지던 것을 막는다. 턱 윗면(법선 N) + 멈춤턱(−y 면)이면 −z 로 움직일 길이 없다 (0.899·v_y + 0.438·v_z ≥ 0, v_y ≤ 0 → v_z ≥ 0).
    en0 = PH['endplate_n_mm'][0]
    arm_yz = sbox(y0, -32.0, y1, -5.0)
    far = 200.0
    below = Polygon([b.sn(-far, en0), b.sn(far, en0), b.sn(far, en0 - far), b.sn(-far, en0 - far)])
    ledge_poly = spoly(arm_yz.intersection(below))
    ledge_x = (PH['endplate_x_mm'][0] + 0.2, arm_in)
    if LEDGE_4D:
        for s_ in (-1, 1):
            parts.append(prism(ledge_poly, min(s_ * ledge_x[0], s_ * (ledge_x[1] + 0.01)), max(s_ * ledge_x[0], s_ * (ledge_x[1] + 0.01)), axis='x'))
    body = fuse(*parts)
    bd = guide(3.2)
    body = single(cut(body, cyl(B0, bd / 2, -46, 46, axis='x'), cyl(F0, bd / 2, -46, 46, axis='x'),
                      cyl((0.0, -41.0), HANG_D / 2, -36, -31)))
    eng = Engraver()
    tb = text_bbox('JIG-4D', TEXT_H)
    yc = (y0 + y1) / 2
    eng.add('JIG-4D', (44.5, yc + (tb[1] - tb[0]) / 2 * -1, -34.2), (0, 1, 0), (1, 0, 0))
    eng.add('JIG-4D', (-44.5, yc + (tb[1] - tb[0]) / 2, -34.2), (0, -1, 0), (-1, 0, 0))
    # 바닥판 윗면 (리프터와 떨어져 있음): +x 쪽 조각 ID, −x 쪽 단계
    for txt, xc in (('L01-L03', 25.0), ('STEP 6', -25.0)):
        tb = text_bbox(txt, 5.0)
        eng.add(txt, (xc + (tb[3] + tb[2]) / 2, -43.0 - tb[0], -32.0), (0, 1, 0), (0, 0, 1), size=5.0)
    out.append(record('4D', 'J4D_lifter_drill.stl', '4D 리프터 드릴 가이드', '조립한 리프터 끝판에 B0·F0 핀 구멍 (두 팔 동축)', 1,
                      '바닥판을 베드에 (x 방향 구멍은 출력 뒤 Ø3.2 로 통과)', [], body, eng,
                      [feat('4D B0', 'drill', 3.2, bd, dict(cyl=list(B0), axis='x')), feat('4D F0', 'drill', 3.2, bd, dict(cyl=list(F0), axis='x'))],
                      meta=dict(shelf_bot=shelf_bot, lip_y=lip_y, col_in=col_in, arm_in=arm_in, B0=list(B0), F0=list(F0),
                                ledge_n=en0, ledge_x=list(ledge_x), ledge=LEDGE_4D), ids=['L01', 'L02', 'L03'], step='6'))
    # ---- 4E 후드 팔
    k04 = pc('K04', side='R')
    top_z, back_y = b.ROOF_TOP, HINGE[0] - PH['hinge_hub_d_mm'] / 2
    doc((top_z, back_y), (61.5, -100.0), '4E edges')
    ftop, etop = fence_strip((-77.0, top_z), (back_y, top_z))
    fbk, ebk = fence_strip((back_y, top_z), (back_y, hz + 1.0), ext_q=0.0)
    hinge_k = next(h for h in k04['holes'] if h['d'] == 3.2)
    horn = [h for h in k04['holes'] if h['d'] == PH['horn_hole_d_mm']]
    holes = [dict(c=(hinge_k['x'], hinge_k['y']), d=guide(3.2), bit=3.2, label='LR', name='힌지')] + \
            [dict(c=(h['x'], h['y']), d=guide(PH['horn_hole_d_mm']), bit=PH['horn_hole_d_mm'], label='R', name='혼') for h in horn]
    DEVIATIONS.append('4E: 판(27 × 39.5)에 조각 ID·단계가 들어가지 않아 아래쪽 라벨 탭 z 12~26 을 붙임 (팔 조각 밖, 빈 자리)')
    body, eng, m = plate_jig('4E', 'JIG-4E', (-103.0, 26.0, -77.0, 64.5), 8.0, fences=[ftop, fbk], holes=holes, tabs=[b.rect(-103.0, -77.0, 12.0, 26.0)],
                             prefer_title=(-99, 53), prefer_hang=(-80, 28),
                             notes=[dict(text='ON K04', size=ID_H, prefer=(-101, 20)), dict(text='STEP 4', prefer=(-101, 13))])
    out.append(record('4E', 'J4E_hood_arm.stl', '4E 후드 팔 드릴 가이드', 'K04 ×2: 힌지 Ø3.2 [LR], 혼 Ø2 ×4 [R] (윗변·뒷변 기준)', 1,
                      PLATE_ORIENT, flip, body, eng,
                      [feat(f"4E {h['name']} {tuple(round(v, 3) for v in h['c'])}", 'drill', h['bit'], h['d'], dict(cyl=list(h['c']), axis='z'))
                       for h in holes],
                      meta=dict(m, hinge=[hinge_k['x'], hinge_k['y']], horn=[[h['x'], h['y']] for h in horn], fences=[etop, ebk],
                                top_z=top_z, back_y=back_y), ids=['K04'], step='4'))
    # ---- 4F-1~4 포켓 플러그
    specs = [('4F-1', 'J4F1_m3_nut_plug.stl', 'M3 너트 포켓 5.6', 'hex', PH['nut_m3_af_mm'] + 0.1, 3.2),
             ('4F-2', 'J4F2_m5_nut_plug.stl', 'M5 너트 포켓 8.1', 'hex', PH['nut_pocket_af_mm'], 5.0),
             ('4F-3', 'J4F3_head_pocket_plug.stl', '머리 포켓 10.5', 'sq', PH['head_pocket_mm'], 5.0),
             ('4F-4', 'J4F4_t1r_square_plug.stl', 'T1R 사각 24', 'sq', PH['t1r_hinge_square_mm'], 3.2)]
    expect = {'4F-1': (5.20, 3.10), '4F-2': (7.70, 4.90), '4F-3': (10.10, 4.90), '4F-4': (23.60, 3.10)}
    fids = {'4F-1': (['B07', 'T2R', 'V02'], '5'), '4F-2': (['H04'], '2'), '4F-3': (['H02'], '2'), '4F-4': (['B07', 'T1R'], '5')}
    for code, file, what, shape, target, pbit in specs:
        a = plug(target)
        pd = pbit - PIN_FIT
        doc((a, pd), expect[code], code)
        poly = b.hexagon((0, 0), a) if shape == 'hex' else b.rect(-a / 2, a / 2, -a / 2, a / 2)
        ids, stp = fids[code]
        body, eng = flag_plug(code, ['JIG-' + code.replace('-', '') + ' STEP ' + stp, 'ON ' + ' '.join(ids)], plug_poly=poly, t=6.0,
                              pin=dict(c=(0, 0), d=pd, len=ST), dir_line=True, flag_dir='v')
        out.append(record(code, file, f'{code} {what} 플러그', f'{what} 칼 안내 (가운데 핀 Ø{pd:.2f} 를 먼저 뚫은 구멍에)', 1,
                          '깃발을 베드에 (핀 위로). 깃발 긴 방향과 표시선 = 평면 방향', flip, body, eng,
                          [feat(f'{code} 맞변', 'plug', target, a, dict(gap='x', box=[-a / 2 - 1, a / 2 + 1, -1, 1, 0.5, 5.5])),
                           feat(f'{code} 핀', 'pin', pbit, pd, dict(cyl=[0, 0], axis='z'))], ids=ids, step=stp))
    # ---- 4G 데크
    b01 = pc('B01')
    mk = b01['marks']
    dwin = next(h for h in b01['holes'] if 'poly' in h)['poly']
    dx = (min(p[0] for p in dwin), max(p[0] for p in dwin))
    dy = (min(p[1] for p in dwin), max(p[1] for p in dwin))
    gw, gh = win(dx[1] - dx[0]), win(dy[1] - dy[0])
    gc = ((dx[0] + dx[1]) / 2, (dy[0] + dy[1]) / 2)
    doc((gw, gh, gc[1]), (44.40, 47.23, 32.395), '4G window', tol=1e-2)   # 문서는 Y_w 를 소수 둘째 자리로 반올림
    xh = PH['deck_x_half_mm']
    yw0, yw1 = PH['deck_yw_mm']
    fl_, efl = fence_strip((-xh, 64.0), (-xh, yw0))
    fb_, efb = fence_strip((-xh, yw0), (50.5, yw0), ext_q=0.0, ext_p=FENCE_T)
    sw = 1.0
    xs = sorted(mk['tower_in'] + mk['tower_out'])
    ty = mk['tower_yw']
    tys = sorted(mk['rear_wall_yw'] + mk['front_brace_yw'])
    slots = []
    bridge = 3.0
    for x in xs:                                     # 세로 표시선 — 3 mm 다리로 끊음
        n = 4
        seg = (ty[1] - ty[0] - (n - 1) * bridge) / n
        for i in range(n):
            a0 = ty[0] + i * (seg + bridge)
            slots.append(dict(poly=b.rect(x - sw / 2, x + sw / 2, a0, a0 + seg), line=('x', x)))
    inner = min(abs(v) for v in mk['tower_in'])
    for y in tys:                                    # 가로 표시선 — 양끝 3 mm 다리
        slots.append(dict(poly=b.rect(-inner + sw / 2 + bridge, inner - sw / 2 - bridge, y - sw / 2, y + sw / 2), line=('y', y)))
    awl = [(x, y) for x in mk['motor_box_x'] for y in mk['motor_box_yw']]
    doc(flat(sorted(awl)), flat(sorted([(-25, 5.79), (25, 5.79), (-25, 59.0), (25, 59.0)])), '4G awl', tol=6e-3)
    holes = [dict(c=p, d=1.2, bit=None, name='송곳', kind='awl') for p in awl]
    lighten = [dict(poly=b.rect(-30.0, 30.0, -95.0, -40.0))]
    body, eng, m = plate_jig('4G', 'JIG-4G DECK', (-50.5, -112.0, 50.5, 64.0), 6.0, fences=[fl_, fb_], holes=holes,
                             windows=[dict(poly=b.rect(gc[0] - gw / 2, gc[0] + gw / 2, gc[1] - gh / 2, gc[1] + gh / 2))] + slots,
                             lighten=lighten, prefer_title=(-20, -30), prefer_hang=(45, 60),
                             notes=[dict(text='ON B01', size=ID_H, prefer=(-20, -20)), dict(text='JIG-4 STEP 8', prefer=(-20, -100))])
    DEVIATIONS.append('4G: 표시 홈을 관통 홈으로 내고 3 mm 다리로 끊음 (끊지 않으면 표시선으로 둘러싸인 판 가운데가 떨어져 나간다)')
    out.append(record('4G', 'J4G_deck.stl', '4G 데크 표시 가이드', 'B01 ×2: 모터 창, 타워·리어월·앞 보강판 표시선, 모터 상자 송곳', 1,
                      PLATE_ORIENT, flip, body, eng,
                      [feat('4G 창 X', 'window', dx[1] - dx[0], gw, dict(gap='x', box=[gc[0] - 24, gc[0] + 24, gc[1] - 5, gc[1] + 5, 1, 5])),
                       feat('4G 창 Y', 'window', dy[1] - dy[0], gh, dict(gap='y', box=[gc[0] - 5, gc[0] + 5, gc[1] - 25, gc[1] + 25, 1, 5]))],
                      meta=dict(m, window_c=list(gc), window=[gw, gh], lines_x=xs, lines_y=tys, line_w=sw, awl=[list(p) for p in awl],
                                tower_yw=ty, fences=[efl, efb]), ids=['B01'], step='8'))
    # ---- 4H-1 SG90 판
    b10 = pc('B10', sub='outer')
    sp = next(h for h in b10['holes'] if 'poly' in h)['poly']
    sy_ = (min(p[0] for p in sp), max(p[0] for p in sp))
    sz_ = (min(p[1] for p in sp), max(p[1] for p in sp))
    s_c = ((sy_[0] + sy_[1]) / 2, (sz_[0] + sz_[1]) / 2)
    sw_, sh_ = win(sy_[1] - sy_[0]), win(sz_[1] - sz_[0])
    doc((sw_, sh_, s_c[0], s_c[1]), (23.70, 13.20, -88.232, 81.076), '4H-1 window')
    rear_y = min(p[0] for p in b10['outline'])
    bot_z = min(p[1] for p in b10['outline'])
    doc((rear_y, bot_z), (-105.232, 31.076), '4H-1 edges')
    fr_, efr = fence_strip((rear_y, 93.0), (rear_y, bot_z))
    fbt, ebt = fence_strip((rear_y, bot_z), (-69.0, bot_z), ext_q=0.0, ext_p=FENCE_T)
    sgh = [(h['x'], h['y']) for h in b10['holes'] if h.get('d') == 2.0]
    holes = [dict(c=p, d=guide(2.0), bit=2.0, name='M2') for p in sgh]
    body, eng, m = plate_jig('4H-1', 'JIG-4H1', (-107.0, 29.0, -69.0, 93.0), 8.0, fences=[fr_, fbt], holes=holes,
                             windows=[dict(poly=b.rect(s_c[0] - sw_ / 2, s_c[0] + sw_ / 2, s_c[1] - sh_ / 2, s_c[1] + sh_ / 2))],
                             prefer_title=(-104, 55), prefer_hang=(-74, 40),
                             notes=[dict(text='ON B10', size=ID_H, prefer=(-104, 64)), dict(text='STEP 8', prefer=(-104, 35))])
    out.append(record('4H-1', 'J4H1_sg90_plate.stl', '4H-1 SG90 판 가이드', 'B10 ×2: SG90 창, M2 안내 구멍 (뒷변·아랫변 기준)', 1,
                      PLATE_ORIENT, flip, body, eng,
                      [feat(f'4H-1 M2 {p}', 'drill', 2.0, guide(2.0), dict(cyl=list(p), axis='z')) for p in sgh] +
                      [feat('4H-1 창 y', 'window', sy_[1] - sy_[0], sw_, dict(gap='x', box=[s_c[0] - 14, s_c[0] + 14, s_c[1] - 3, s_c[1] + 3, 1, 7])),
                       feat('4H-1 창 z', 'window', sz_[1] - sz_[0], sh_, dict(gap='y', box=[s_c[0] - 5, s_c[0] + 5, s_c[1] - 8, s_c[1] + 8, 1, 7]))],
                      meta=dict(m, window_c=list(s_c), holes=[list(p) for p in sgh], fences=[efr, ebt]), ids=['B10'], step='8'))
    # ---- 4H-2 크랭크·허브·링크 플러그 (출력 3개)
    SERVO, PIN0 = b.SERVO, b.PIN0
    hub_end = tuple(SERVO[i] - PH['crank_hub_len_mm'] * D[i] for i in range(2))
    caps = [('4H-2a', 'J4H2a_crank_plug.stl', 'V01 크랭크', SERVO, PIN0, PH['crank_w_mm'] / 2, [(SERVO, 6.0), (PIN0, 3.2)], 'V01'),
            ('4H-2b', 'J4H2b_hub_plug.stl', 'V03 크랭크 허브', SERVO, hub_end, PH['crank_hub_r_mm'], [(SERVO, 6.0)], 'V03'),
            ('4H-2c', 'J4H2c_link_plug.stl', 'V02 링크', PIN0, B0, PH['link_w_mm'] / 2, [(PIN0, 3.2), (B0, 3.2)], 'V02')]
    doc([plug(2 * cp[5]) / 2 for cp in caps], [4.80, 6.80, 4.80], '4H-2 radii')
    doc([math.dist(cp[3], cp[4]) for cp in caps], [33.0, 20.0, 70.0], '4H-2 centre distances')
    DEVIATIONS.append('4H-2: 플러그 3개는 따로 출력 → JIG-4 출력 수가 문서 15 가 아니라 16 (4A-1, 4A-2, 4B, 4C, 4D, 4E, 4F ×4, 4G, 4H-1, 4H-2 ×3, 4H-3)')
    DEVIATIONS.append('4B·4F·4H-2 플러그: 각인(글자 6)·걸이 구멍 Ø6 이 플러그 윗면에 들어가지 않아 손잡이 기둥 위에 깃발(14 × L × 3)을 얹음. '
                      '4H-2 는 문서에 손잡이가 없어 기둥(Ø8 또는 Ø12 × 8)을 더함')
    for code, file, what, a, c, r, hs, vid in caps:
        rr = plug(2 * r) / 2
        mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
        post_c = mid if code != '4H-2b' else c
        post_d = 8.0 if 2 * rr < 12.0 else 12.0
        holes = [dict(c=p, d=guide(dd)) for p, dd in hs]
        body, eng = flag_plug(code, ['JIG-' + code.replace('-', '') + ' STEP 7', 'ON ' + vid], plug_solid=capsule_solid(a, c, rr, 0, 4.0), t=4.0,
                              post_c=post_c, post_d=post_d,
                              post_h=8.0, holes=holes)
        out.append(record(code, file, f'{code} {what} 플러그', f'{what} 캡슐 칼 안내 + 구멍 위치', 1,
                          '깃발을 베드에 (플러그 밑면 위로)', flip, body, eng,
                          [feat(f'{code} 반경', 'plug_r', r, rr, dict(cyl=list(a), axis='z', outer=True))] +
                          [feat(f'{code} 구멍 {tuple(round(v, 3) for v in p)}', 'drill', dd, guide(dd), dict(cyl=list(p), axis='z'))
                           for p, dd in hs],
                          meta=dict(a=list(a), c=list(c), r=rr), ids=[vid], step='7'))
    # ---- 4H-3 패널
    c01 = pc('C01')
    ph_ = PH['panel_h_mm']
    pw = PH['panel_w_mm'] / 2
    lw, lh = PH['panel_lcd_window_mm']
    lcc = PH['panel_lcd_window_c']
    bw = PH['panel_button_mm']
    bcc = PH['panel_button_c']
    doc((win(lw), win(lh), win(bw)), (72.40, 26.40, 12.60), '4H-3 windows')
    fb3, eb3 = fence_strip((-pw, 0.0), (52.0, 0.0), ext_q=0.0, ext_p=FENCE_T)
    fl3, el3 = fence_strip((-pw, 72.0), (-pw, 0.0))
    lholes = [(h['x'], h['y']) for h in c01['holes'] if h.get('d') == 3.2]
    holes = [dict(c=p, d=guide(3.2), bit=3.2, name='LCD') for p in sorted(lholes)]
    body, eng, m = plate_jig('4H-3', 'JIG-4H3 PANEL', (-52.0, -2.0, 52.0, 72.0), 8.0, fences=[fb3, fl3], holes=holes,
                             windows=[dict(poly=b.rect(lcc[0] - win(lw) / 2, lcc[0] + win(lw) / 2, lcc[1] - win(lh) / 2, lcc[1] + win(lh) / 2)),
                                      dict(poly=b.rect(bcc[0] - win(bw) / 2, bcc[0] + win(bw) / 2, bcc[1] - win(bw) / 2, bcc[1] + win(bw) / 2))],
                             prefer_title=(15, 3), prefer_hang=(45, 5),
                             notes=[dict(text='ON C01', size=ID_H, prefer=(-45, 64)), dict(text='JIG-4 STEP 9', prefer=(-45, 3))])
    out.append(record('4H-3', 'J4H3_panel.stl', '4H-3 패널 앞판 가이드', 'C01: LCD 창·버튼 창·LCD 구멍 4개 (아래변·왼변 기준)', 1,
                      PLATE_ORIENT, flip, body, eng,
                      [feat(f'4H-3 LCD {p}', 'drill', 3.2, guide(3.2), dict(cyl=list(p), axis='z')) for p in sorted(lholes)] +
                      [feat('4H-3 LCD 창 u', 'window', lw, win(lw), dict(gap='x', box=[-40, 40, lcc[1] - 3, lcc[1] + 3, 1, 7])),
                       feat('4H-3 LCD 창 v', 'window', lh, win(lh), dict(gap='y', box=[-3, 3, lcc[1] - 15, lcc[1] + 15, 1, 7])),
                       feat('4H-3 버튼 창', 'window', bw, win(bw), dict(gap='x', box=[-8, 8, bcc[1] - 2, bcc[1] + 2, 1, 7]))],
                      meta=dict(m, fences=[eb3, el3]), ids=['C01'], step='9'))
    return out


# ---------------------------------------------------------------- JIG-5 20° 쐐기 (5.5절)

def jig5():
    tilt = math.radians(PH['tilt_deg'])
    hgt, dep, wid = 60.0, 70.0, 60.0
    top_y = -hgt * math.tan(tilt)
    doc(top_y, -21.838, 'J5 top')
    sec = [(0.0, 0.0), (-dep, 0.0), (-dep, hgt), (top_y, hgt)]       # (Y, Z)
    body = prism(sec, -wid / 2, wid / 2, axis='x')
    # 고무줄 핀: 문서 (Y −22, Z 55) 는 핀 가장자리가 앞면 밖으로 0.02 나와 앞면에 기대는 넓은 조각(B09 79)과 겹친다 (J19).
    # 앞면에서 0.5 안쪽으로 옮긴다.
    pin_r = 2.0
    pin_at = [(min(y, -z * math.tan(tilt) - pin_r - 0.5), z) for y, z in ((-5.0, 5.0), (-22.0, 55.0))]
    if pin_at[1][0] != -22.0:
        DEVIATIONS.append(f'JIG-5: 위 고무줄 핀 Y −22 → {pin_at[1][0]:.3f} (가장자리가 앞면 밖 0.02 → 앞면 안쪽 0.5)')
    pins = [cyl((y, z), pin_r, wid / 2 - 0.01, wid / 2 + 6, axis='x') for y, z in pin_at] + \
           [cyl((y, z), pin_r, -wid / 2 - 6, -wid / 2 + 0.01, axis='x') for y, z in pin_at]
    body = fuse(body, *pins)
    body = single(cut(body, box3(-wid / 2 - 7, wid / 2 + 7, -65.0, -35.0, 32.5, 47.5), cyl((-64.0, 6.0), HANG_D / 2, -wid / 2 - 7, wid / 2 + 7, axis='x')))
    eng = Engraver()
    eng.add('JIG-5 20°', (wid / 2, -62.0, 14.0), (0, 1, 0), (1, 0, 0))
    # +X 면 (맞닿지 않음): 대상 조각, ① 밑면 사포질 ② 앞면에 기대 접착
    eng.add('B03 B04 B09', (wid / 2, -62.0, 21.0), (0, 1, 0), (1, 0, 0))
    eng.add('B13 C01', (wid / 2, -62.0, 27.0), (0, 1, 0), (1, 0, 0))
    eng.badge(1, (wid / 2, -45.0, 6.0), (0, 1, 0), (1, 0, 0))
    eng.badge(2, (wid / 2, -30.0, 52.0), (0, 1, 0), (1, 0, 0))
    DEVIATIONS.append('JIG-5: 문서는 X 면을 베드에 두라 하지만 두 X 면에 고무줄 핀이 있어 불가 → 밑면(Z 0, 사포 기준면)을 베드에. 앞면은 뒤로 눕는 면이라 서포트 없음')
    return [record('5', 'J5_wedge20.stl', 'JIG-5 20° 쐐기', 'XZ 조각 아래 모서리 20° 사포질 · 데크에 20° 로 세워 접착', 1,
                   '밑면(Z 0)을 베드에', [], body, eng, meta=dict(sec=sec, tilt=PH['tilt_deg'], pins=pin_at),
                   ids=['B03', 'B04', 'B09', 'B13', 'C01'])]


# ---------------------------------------------------------------- JIG-6 직각·간격 (5.6절)

def jig6():
    out = []
    L, Hh, T = 50.0, 40.0, 10.0
    body = fuse(box3(0, L, 0, T, 0, Hh), box3(0, T, 0, L, 0, Hh))
    # 안쪽 모서리 3 × 3 모따기 (접착제 빠짐). 꼭짓점을 빈 쪽으로 0.5 넘겨야 두 다리가 선 하나로만 이어지지 않는다
    relief = prism([(T - 3.0, T), (T, T - 3.0), (T + 0.5, T + 0.5)], -1, Hh + 1)
    sl = 3.0 + 0.1
    body = single(cut(body, relief, box3(15.0, 45.0, T / 2 - sl / 2, T / 2 + sl / 2, Hh - 8.0, Hh + 1),
                      cyl((30.0, 16.0), 7.5, -1, T + 1, axis='y'), cyl((30.0, 20.0), 7.5, -1, T + 1, axis='x'),
                      cyl((44.0, 34.0), HANG_D / 2, -1, T + 1, axis='x')))
    eng = Engraver()
    eng.add('JIG-6 90°', (14.0, 0.0, 28.0), (1, 0, 0), (0, -1, 0))
    eng.add('STEP 1', (14.0, 0.0, 34.5), (1, 0, 0), (0, -1, 0))
    eng.add('B03-B07 B09', (2.0, 0.0, 2.0), (1, 0, 0), (0, -1, 0))
    eng.add('B11-B13 C01', (0.0, 48.0, 2.0), (0, -1, 0), (-1, 0, 0))
    out.append(record('6a', 'J6a_corner.stl', '6a 코너 블록', '모터 상자 모서리·타워 ⊥ 데크·리어월·보강판·SG90 다리·패널 직각', 2,
                      '다리 하나(y 0 바깥면)를 베드에', [('x', 90)], body, eng, meta=dict(T=T),
                      ids=['B03', 'B04', 'B05', 'B06', 'B07', 'B09', 'B11', 'B12', 'B13', 'C01'], step='1'))
    span = 2 * PH['tower_in_x_mm'] - 2 * COMP
    doc(span, 79.00, '6b')
    body = single(cut(box3(0, span, 0, 30, 0, 30), cyl((span / 2, 15.0), 9.0, -1, 31, axis='y'), cyl((7.0, 15.0), HANG_D / 2, -1, 31, axis='y')))
    eng = Engraver()
    txt = 'JIG-6 79.0 = 2x39.5'
    tb = text_bbox(txt, TEXT_H)
    eng.add(txt, ((span - (tb[1] - tb[0])) / 2 - tb[0], 15 - (tb[3] + tb[2]) / 2, 30.0), (1, 0, 0), (0, 0, 1))
    eng.add('STEP 2', (11.5, 0.0, 24.5), (1, 0, 0), (0, -1, 0))
    eng.add('B06 B07', (50.0, 0.0, 24.5), (1, 0, 0), (0, -1, 0))
    DEVIATIONS.append('6b: 문서 각인은 "79.0 = 2x39.5" 뿐이라 J2(JIG- 각인)를 위해 "JIG-6 " 을 앞에 붙임')
    out.append(record('6b', 'J6b_spacer79.stl', '6b 간격 막대', '두 타워 안쪽면 간격 79.00 (= 2 × 39.5)', 2,
                      '눕혀서 (z 0 면을 베드에)', [], body, eng, meta=dict(span=span), ids=['B06', 'B07'], step='2'))
    # 6c 슬롯 정렬 U (타워 국소 좌표)
    # 핀은 지그 7 로 낸 슬롯 끝(폭 3.4, R1.7)에 들어간다 → 슬롯 폭 − 0.1. 문서 Ø3.10 은 Ø3.2 드릴 구멍 기준이라
    # 슬롯 끝에서 0.15 처진다 (J19).
    slot_w = next(h for h in pc('B06')['holes'] if 'slot' in h)['slot']['w']
    pind = slot_w - PIN_FIT
    DEVIATIONS.append(f'6c: 핀 Ø3.10 → Ø{pind:.2f} (슬롯 끝 R1.7 에 꽂히므로 슬롯 폭 3.4 − 0.1; Ø3.10 이면 처짐 0.15)')
    pts = [F0, B1]
    hull = unary_union([sbox(-145.0, 20.0, -135.0, 35.0)] + [Point(p).buffer(8.0, 256) for p in pts]).convex_hull
    poly = spoly(hull)
    parts = [box3(-56.0, 56.0, -145.0, -135.0, 20.0, 35.0)]
    for s in (-1, 1):
        parts.append(prism(poly, min(s * 46.0, s * 56.0), max(s * 46.0, s * 56.0), axis='x'))
    pins = []
    for s in (-1, 1):
        for p in pts:
            c = cyl(p, pind / 2, min(s * 46.0, s * 41.0), max(s * 46.0, s * 41.0), axis='x')
            flat = box3(-60, 60, p[0] - pind / 2 - 1, p[0] - pind / 2 + 0.3, p[1] - 3, p[1] + 3)
            pins.append(c.cut(flat).Solids()[0])
    body = fuse(*parts, *pins)
    body = single(cut(body, cyl((38.0, -140.0), HANG_D / 2, 19, 36)))
    eng = Engraver()
    txt = 'JIG-6c SLOT ALIGN'
    tb = text_bbox(txt, TEXT_H)
    eng.add(txt, (-(tb[1] + tb[0]) / 2 - 6.0, -140.0 - (tb[3] + tb[2]) / 2, 35.0), (1, 0, 0), (0, 0, 1))
    txt = 'STEP 3 B06 B07'
    tb = text_bbox(txt, TEXT_H)
    eng.add(txt, (-(tb[1] + tb[0]) / 2, -145.0, 22.0), (1, 0, 0), (0, -1, 0))
    out.append(record('6c', 'J6c_slot_align.stl', '6c 슬롯 정렬 U', '두 타워 슬롯 끝 F0·B1 을 한 몸으로 묶어 평행·동축', 1,
                      '뒤 들보 뒷면(y −145)을 베드에, 두 팔이 수직, 핀 D 평면이 아래', [('x', 90)], body, eng,
                      [feat(f'6c 핀 {tuple(round(v, 3) for v in p)}', 'pin', slot_w, pind, dict(cyl=list(p), axis='x')) for p in pts],
                      meta=dict(pins=[list(p) for p in pts], pin_d=pind), ids=['B06', 'B07'], step='3'))
    return out


# ---------------------------------------------------------------- JIG-7 슬롯 가이드 (5.7절)

def jig7():
    b06 = pc('B06')
    slot = next(h for h in b06['holes'] if 'slot' in h)['slot']
    a, c, sw = tuple(slot['a']), tuple(slot['b']), slot['w']
    L = math.dist(a, c)
    ww = win(sw)
    doc((L, ww), (80.0, 3.80), 'J7 window')
    T = 5.0
    body = box3(-15.0, 95.0, -15.0, 15.0, 0, T)
    ear = box3(20.0, 60.0, 15.0 - 0.01, 40.0, 0, T)
    pind = 3.2 - PIN_FIT
    body = fuse(body, ear, cyl((0.0, 0.0), pind / 2, -ST, 0.01), cyl((L, 0.0), pind / 2, -ST, 0.01))
    window = box3(0.0, L, -ww / 2, ww / 2, -1, T + 1)
    bridges = [box3(-0.6, 0.6, -ww / 2 - 0.1, ww / 2 + 0.1, 0, T), box3(L - 0.6, L + 0.6, -ww / 2 - 0.1, ww / 2 + 0.1, 0, T)]
    body = fuse(cut(body, window), *bridges)
    body = single(cut(body, cyl((40.0, 27.5), 9.0, -1, T + 1), cyl((89.0, -9.0), HANG_D / 2, -1, T + 1)))
    eng = Engraver()
    txt = 'JIG-7 SLOT 3.4 x 80'
    tb = text_bbox(txt, TEXT_H)
    eng.add(txt, (-12.0 - tb[0], 4.5, T), (1, 0, 0), (0, 0, 1))
    eng.add('ON B06 B07', (10.0, -11.5, T), (1, 0, 0), (0, 0, 1))
    frame = dict(origin=list(a), s=[(c[0] - a[0]) / L, (c[1] - a[1]) / L])
    return [record('7', 'J7_slot_guide.stl', 'JIG-7 리프터 슬롯 가이드', '타워 4장 슬롯 폭 3.4 · F0~B1 80 칼 안내 (핀 2개를 끝 구멍에)', 1,
                   '핀을 위로 눕혀서 (판 윗면을 베드에)', [('x', 180)], body, eng,
                   [feat('7 창 폭', 'window', sw, ww, dict(gap='y', box=[10, 70, -3, 3, 1, 4])),
                    feat('7 핀 s 0', 'pin', 3.2, pind, dict(cyl=[0, 0], axis='z')), feat('7 핀 s 80', 'pin', 3.2, pind, dict(cyl=[L, 0], axis='z'))],
                   meta=dict(frame=frame, L=L, w=ww, slot_w=sw), ids=['B06', 'B07'])]


# ---------------------------------------------------------------- 내보내기

def make_jigs():
    DOC_ERRORS.clear()
    DEVIATIONS.clear()
    return jig1() + jig2() + jig3() + jig4() + jig5() + jig6() + jig7()


AXES = dict(x=(1, 0, 0), y=(0, 1, 0), z=(0, 0, 1))


def to_print(solid, rots):
    s = solid
    for ax, deg in rots:
        s = s.rotate(V(0, 0, 0), V(*AXES[ax]), deg)
    x0, y0, z0, _x1, _y1, _z1 = tight_bb(s)
    return s.translate(V(-x0, -y0, -z0))


def export_stl(solid, path):
    cq.exporters.export(solid, str(path), tolerance=STL_TOL, angularTolerance=STL_ANG)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    jigs = make_jigs()
    files = set()
    index = []
    for j in jigs:
        p = to_print(j['solid'], j['rots'])
        x0, y0, z0, x1, y1, z1 = tight_bb(p)
        export_stl(p, OUT / j['file'])
        files.add(j['file'])
        index.append(dict(file=j['file'], jig=j['jig'], part=j['id'], name=j['name'], purpose=j['purpose'], print_orient=j['orient'],
                          size_mm=[round(x1 - x0, 2), round(y1 - y0, 2), round(z1 - z0, 2)], qty=j['qty'],
                          piece_ids=j['ids'], step=j['step'],
                          engraving=[dict(text=e['text'], size=e['size'], origin=[round(v, 3) for v in e['origin']],
                                          face_normal=[round(v, 3) for v in e['normal']], kind='badge' if e.get('badge') else 'text')
                                     for e in j['engr'] if e['text']]))
        print(f"{j['file']:28s} {x1 - x0:7.2f} {y1 - y0:7.2f} {z1 - z0:7.2f}  x{j['qty']}", flush=True)
    for old in OUT.glob('*.stl'):
        if old.name not in files:
            old.unlink()
    data = dict(source='docs/V5H_DESIGN.md 5절', units='mm', bed='Bambu X2D 256 × 256 (가정), 외곽 ≤ 250',
                material='PLA (주황 권장)', stl_files=len(index), prints=sum(i['qty'] for i in index),
                print_count_by_jig={str(n): sum(i['qty'] for i in index if i['jig'] == n) for n in range(1, 8)},
                text=dict(font=FONT, size=TEXT_H, label_size=LABEL_H, depth=ENGRAVE),
                fits=dict(drill_clear=CLR, blade_t=BLADE, xy_comp=COMP, tape_t=TAPE, slip=SLIP, pin_fit=PIN_FIT),
                doc_errors=DOC_ERRORS, deviations=DEVIATIONS, jigs=index)
    (OUT / 'index.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print('jigs:', len(index), 'STL,', data['prints'], 'prints', flush=True)
    return jigs


if __name__ == '__main__':
    build()
