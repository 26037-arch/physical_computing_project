#!/usr/bin/env python3
"""V5H 포맥스 재단 도면 PDF (A4, 1:1) 생성 + 도면 검사(M1~M4).

입력  : models/robot_v5h/pieces.json (조각 외곽·구멍·notes), docs/V5H_DESIGN.md 4.2절 (판 배치표)
출력  : docs/V5H_재단도면.pdf, models/robot_v5h/cutsheet_checks.json

PDF 좌표에서 1 mm = 72/25.4 pt 이다 (그림판 = 페이지 mm 좌표계, 축 [0,W]x[0,H] mm 가 용지 전체).
조각 2D 좌표는 pieces.json 그대로 쓰고, 자기 축 조각(L03·V01~V03)만 회전해서 그린다(거울상 없음, 쪽에 회전각 표시).
같은 입력이면 같은 PDF (생성 시각 메타데이터 없음).

사용: python3 tools/make_v5h_cutsheet.py
"""
import json
import math
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Polygon  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PIECES = ROOT / "models" / "robot_v5h" / "pieces.json"
DESIGN = ROOT / "docs" / "V5H_DESIGN.md"
OUT_PDF = ROOT / "docs" / "V5H_재단도면.pdf"
OUT_CHECKS = ROOT / "models" / "robot_v5h" / "cutsheet_checks.json"

PT = 72.0 / 25.4          # 1 mm = PT pt
A4 = (210.0, 297.0)
SHEET_W, SHEET_H = 300.0, 450.0
OV_SCALE = 0.55           # 배치 개요 축척 (표시용, 도면 아님)

# 선 굵기(pt). 검사가 굵기로 선을 찾는다 — 서로 겹치지 않게 유지.
LW_OUTLINE = 0.9
LW_RULER = 1.1
LW_TICK = 0.5

C_OUT = "#000000"
C_DRILL = "#c00000"
C_KNIFE = "#0050a0"
C_GLUE = "#2a8a2a"
C_DIM = "#666666"

FONT_FILES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

PLANE_INFO = {
    "XY": ("XY", "+z 에서 내려다본 면", "x", "y", "z"),
    "YZ": ("YZ", "+x 쪽에서 본 면 (+y 가 오른쪽)", "y", "z", "x"),
    "XZ": ("XZ", "뒤(−y)에서 앞을 본 면 (+x 가 오른쪽)", "x", "z", "y"),
    "WORLD": ("월드", "위에서 본 면 (u=X, v=Y_w, +Y_w 앞)", "X", "Y_w", "Z_w"),
    "OBLIQUE": ("비스듬", "(x, n) 평면, 두께 방향 D", "x", "n", "s"),
}
PCA_ROTATE = {"L03", "V01", "V02", "V03"}


def setup_fonts():
    for f in FONT_FILES:
        if not Path(f).exists():
            sys.exit("한글 글꼴을 찾지 못했다: " + f + " (fc-list :lang=ko 확인)")
        fm.fontManager.addfont(f)
    matplotlib.rcParams.update({
        "pdf.fonttype": 42,
        "font.family": ["DejaVu Sans", "Noto Sans CJK KR"],
        "path.simplify": False,
        "hatch.linewidth": 0.25,
        "axes.unicode_minus": True,
    })


# --------------------------------------------------------------------------- 데이터

def load_pieces():
    data = json.loads(PIECES.read_text(encoding="utf-8"))
    return data


def load_layout():
    """설계 문서 4.2절 배치표를 읽는다 → {'A': [row...], 'B': [row...]}"""
    text = DESIGN.read_text(encoding="utf-8")
    start = text.index("### 4.2")
    end = text.index("### 4.3")
    sec = text[start:end]
    sheets = {}
    cur = None
    for line in sec.splitlines():
        m = re.match(r"\*\*판 ([AB])\*\*", line.strip())
        if m:
            cur = m.group(1)
            sheets[cur] = []
            continue
        if cur and line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) != 6 or cells[0] in ("조각",) or set(cells[0]) <= set("-: "):
                continue
            name = cells[0]
            sheets[cur].append({
                "label": name,
                "id": name.split()[0],
                "spare": "여분" in name,
                "x": float(cells[1]), "y": float(cells[2]),
                "w": float(cells[3]), "h": float(cells[4]),
                "rot": cells[5].startswith("예"),
            })
    return sheets


def bbox(pts):
    a = np.asarray(pts, dtype=float)
    return a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max()


def rot(pts, ang):
    c, s = math.cos(ang), math.sin(ang)
    return [(c * x - s * y, s * x + c * y) for x, y in pts]


def rotation_for(piece):
    """자기 축 조각: 긴 축이 수평이 되는 회전각(rad, -90°~90°). 아니면 0."""
    if piece["id"] not in PCA_ROTATE:
        return 0.0
    a = np.asarray(piece["outline"], dtype=float)
    a = a - a.mean(axis=0)
    w, v = np.linalg.eigh(a.T @ a)
    d = v[:, int(np.argmax(w))]
    ang = -math.atan2(d[1], d[0])
    while ang > math.pi / 2:
        ang -= math.pi
    while ang <= -math.pi / 2:
        ang += math.pi
    return ang


def geometry(piece):
    """페이지 좌표계(자기 축 조각만 회전)로 옮긴 조각."""
    ang = rotation_for(piece)

    def T(p):
        return rot([p], ang)[0] if ang else (p[0], p[1])

    g = {"ang": ang, "outline": [T(p) for p in piece["outline"]], "drill": [], "knife": [], "marks": []}
    for h in piece["holes"]:
        note = h.get("note")
        if "poly" in h:
            g["knife"].append({"poly": [T(p) for p in h["poly"]], "note": note, "slot": h.get("slot")
                               and {"a": T(h["slot"]["a"]), "b": T(h["slot"]["b"]), "w": h["slot"]["w"]}})
        elif h.get("method") == "knife":
            g["knife"].append({"circle": T((h["x"], h["y"])), "d": h["d"], "note": note})
        else:
            g["drill"].append({"c": T((h["x"], h["y"])), "d": h["d"], "note": note})
    for kn in g["knife"]:
        sl = kn.get("slot")
        if sl:  # 슬롯 양끝 구멍 Ø3.2 (문서: 지그 4A-1 로 끝 구멍 Ø3.2)
            for key in ("a", "b"):
                g["drill"].append({"c": sl[key], "d": 3.2, "note": "슬롯 끝 구멍"})
    return g


def fmt(v):
    return f"{v:g}"


def fnum(v):
    s = f"{v:.1f}".replace("-", "−")
    return s


def text_units(s, fs):
    u = 0.0
    for ch in s:
        u += fs * 0.3528 * (1.0 if ord(ch) > 0x2E80 else 0.56)
    return u


def wrap(s, fs, width_mm):
    lines = []
    for para in s.split("\n"):
        cur = ""
        cw = 0.0
        for ch in para:
            w = fs * 0.3528 * (1.0 if ord(ch) > 0x2E80 else 0.56)
            if cw + w > width_mm and cur:
                lines.append(cur)
                cur, cw = "", 0.0
            cur += ch
            cw += w
        lines.append(cur)
    return lines


# --------------------------------------------------------------------------- 그리기 도우미

class Page:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.fig = plt.figure(figsize=(w / 25.4, h / 25.4))
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, w)
        self.ax.set_ylim(0, h)
        self.ax.axis("off")

    def line(self, pts, lw=0.5, color="k", ls="-", cap="butt", **kw):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        self.ax.plot(xs, ys, color=color, lw=lw, ls=ls, solid_capstyle=cap, snap=False, **kw)

    def poly(self, pts, lw=0.5, color="k", ls="-", hatch=None, fill=None, closed=True):
        p = Polygon(pts, closed=closed, fill=fill is not None, facecolor=fill if fill else "none",
                    edgecolor=color, lw=lw, ls=ls, hatch=hatch, snap=False)
        self.ax.add_patch(p)

    def text(self, x, y, s, fs=8, ha="left", va="baseline", color="k", bold=False, rotation=0):
        self.ax.text(x, y, s, fontsize=fs, ha=ha, va=va, color=color,
                     fontweight="bold" if bold else "normal", rotation=rotation)

    def circle(self, c, r, lw=0.5, color="k", ls="-"):
        t = np.linspace(0, 2 * math.pi, 73)
        self.line([(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in t], lw=lw, color=color, ls=ls)

    def footer(self, n, total):
        self.text(self.w / 2, 4.0, f"V5H 재단 도면 · 쪽 {n} / {total} · 인쇄: A4, 실제 크기(100%), 맞춤 끄기",
                  fs=6.5, ha="center", color=C_DIM)


def ruler(pg, x0, y0, label=True):
    """100 mm 기준선 + 10 mm 눈금 (선 굵기 LW_RULER 가 기준선)"""
    pg.line([(x0, y0), (x0 + 100.0, y0)], lw=LW_RULER)
    for i in range(11):
        h = 4.0 if i in (0, 5, 10) else 2.5
        pg.line([(x0 + 10.0 * i, y0), (x0 + 10.0 * i, y0 + h)], lw=LW_TICK)
        if label:
            pg.text(x0 + 10.0 * i, y0 - 3.4, str(i * 10), fs=5.5, ha="center", color=C_DIM)
    pg.text(x0 + 50.0, y0 + 6.0, "100 mm 기준선 (자로 재서 100 ± 0.5 mm)", fs=6.5, ha="center", bold=True)


def draw_cross(pg, c, size=3.0):
    pg.line([(c[0] - size, c[1]), (c[0] + size, c[1])], lw=0.45, color=C_DRILL)
    pg.line([(c[0], c[1] - size), (c[0], c[1] + size)], lw=0.45, color=C_DRILL)


def poly_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


# --------------------------------------------------------------------------- 조각 쪽

def piece_pages_list(data):
    return [p for p in data["pieces"] if p["group"] != "spare"]


def sheet_text_for(layout, pid):
    out = []
    for s in ("A", "B"):
        main = [r for r in layout[s] if r["id"] == pid and not r["spare"]]
        spare = [r for r in layout[s] if r["id"] == pid and r["spare"]]
        if main:
            out.append(f"판 {s} ×{len(main)}")
        if spare:
            out.append(f"여분 판 {s} ×{len(spare)}")
    return " · ".join(out) if out else "판 배치 없음"


def offset_text(piece):
    info = PLANE_INFO[piece["plane"]]
    seen = []
    for o in piece.get("offset", []):
        t = f"{fnum(o[0])} … {fnum(o[1])}"
        if t not in seen:
            seen.append(t)
    if not seen:
        return "블랭크(자체 좌표)" if piece.get("blank") else "—"
    return f"{info[4]} {' / '.join(seen)}"


def draw_piece_page(pg, piece, data, layout, num, total, meta):
    g = geometry(piece)
    out = g["outline"]
    x0, y0, x1, y1 = bbox(out)
    w, h = x1 - x0, y1 - y0
    landscape = pg.w > pg.h
    info = PLANE_INFO[piece["plane"]]
    spare_n = data["summary"]["spare_per_id"].get(piece["id"], 0)
    # 같은 ID 여분은 ID 단위로 한 번만 말한다(변형 구분 없음)
    # 배치 위치: 위쪽 기준
    top = (pg.h - 40.0) if landscape else 252.0
    left = (pg.w - w) / 2.0
    ox, oy = left - x0, top - h - y0

    def P(p):
        return (p[0] + ox, p[1] + oy)

    # 제목 영역
    title_y = pg.h - 9.0
    pg.text(12, title_y, f"{piece['id']}", fs=20, bold=True)
    pg.text(34 if len(piece['id']) <= 3 else 38, title_y, piece["name"], fs=15, bold=True)
    cnt = piece["count"]
    cnt_txt = f"장수 {cnt}"
    ln2 = f"{cnt_txt}  ·  평면 {info[0]} — {info[1]}  ·  위치(국소 {offset_text(piece)})"
    pg.text(12, title_y - 8.0, ln2, fs=8.5)
    extra = []
    if spare_n:
        extra.append(f"여분 +{spare_n}")
    if piece.get("blank"):
        extra.append("블랭크: 먼저 이 사각을 자른 뒤 지그로 나눈다")
    if piece.get("layer"):
        extra.append(f"층 {piece['layer']}")
    if piece.get("sub"):
        extra.append(f"구분 {piece['sub']}")
    if piece.get("side"):
        extra.append("오른쪽" if piece["side"] == "R" else "왼쪽")
    ang = g["ang"]
    if abs(ang) > 1e-9:
        extra.append(f"자기 축 기준으로 {math.degrees(ang):.2f}° 회전해 그림 (거울상 아님)")
    ln3 = f"외곽 {w:.1f} × {h:.1f} mm  ·  재단: {sheet_text_for(layout, piece['id'])}"
    if extra:
        ln3 += "  ·  " + "  ·  ".join(extra)
    for i, ln in enumerate(wrap(ln3, 8.0, pg.w - 24)):
        pg.text(12, title_y - 14.5 - 4.2 * i, ln, fs=8.0, color="#333333")

    # 붙이는 선 / 접는 선
    legend_glue = False
    marks = piece.get("marks")
    if marks and piece["id"] == "B01":
        legend_glue = True
        yw0, yw1 = marks["tower_yw"]
        for xa, xb, lab in ((-45.5, -39.5, "타워 L"), (39.5, 45.5, "타워 R")):
            pg.poly([P((xa, yw0)), P((xb, yw0)), P((xb, yw1)), P((xa, yw1))], lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
        mx = marks["motor_box_x"]
        my = marks["motor_box_yw"]
        pg.poly([P((mx[0], my[0])), P((mx[1], my[0])), P((mx[1], my[1])), P((mx[0], my[1]))],
                lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
        pg.text(*P((0, (my[0] + my[1]) / 2)), "모터 상자", fs=6.5, ha="center", color=C_GLUE)
        for key, lab in (("rear_wall_yw", "리어월"), ("front_brace_yw", "앞 보강판")):
            a, b = marks[key]
            for yy in (a, b):
                pg.line([P((-39.5, yy)), P((39.5, yy))], lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
            pg.text(*P((0, (a + b) / 2 + 1.5)), lab, fs=6.0, ha="center", color=C_GLUE)
        ax_, ay_ = marks["axis_point"]
        draw_cross(pg, P((ax_, ay_)), 3.0)
        pg.text(*P((ax_ + 4, ay_ + 1)), "축 점", fs=6, color=C_DRILL)
        pg.text(*P((-47.5, yw1 + 4)), "타워 자리", fs=6.0, color=C_GLUE)
    if piece["id"] == "K04":
        legend_glue = True
        pg.poly([P((-33, 21)), P((-3, 21)), P((-3, 58.5)), P((-33, 58.5))], lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
        pg.text(*P((-18, 40)), "옆벽 바깥면에\n붙이는 면", fs=6.0, ha="center", va="center", color=C_GLUE)
        pg.line([P((-33, 58.5)), P((-3, 58.5))], lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
        pg.text(*P((-18, 56.0)), "z 58.5 위 = 지붕 옆", fs=5.5, ha="center", va="top", color=C_GLUE)

    # 블랭크 안내 (H05 자리 격자, H06 띠 자리)
    if piece["id"] == "H05":
        p01 = next(q for q in data["pieces"] if q["id"] == "P01")
        bx0, by0, bx1, by1 = bbox(p01["outline"])
        for i in range(5):
            for j in range(5):
                sx = 1.0 + 7.9 * i - bx0
                sy = 1.0 + 7.9 * j - by0
                pg.poly([P((p[0] + sx, p[1] + sy)) for p in p01["outline"]], lw=0.3, color=C_DIM, ls=(0, (2, 1)))
        pg.text(left + w / 2, top - h - 5, "점선 = P01 25개 자리(참고, 간격 7.9). 나누기는 지그로.", fs=6.0, ha="center", color=C_DIM)
    if piece["id"] == "H06":
        y = 1.0
        for q in data["pieces"]:
            if q["id"] == "P02":
                qx0, qy0, qx1, qy1 = bbox(q["outline"])
                hh = qy1 - qy0
                pg.poly([P((0, y)), P((110, y)), P((110, y + hh)), P((0, y + hh))], lw=0.3, color=C_DIM, ls=(0, (2, 1)))
                pg.text(*P((2, y + hh / 2)), f"{q['layer']}  폭 {hh:.1f}", fs=4.5, va="center", color=C_DIM)
                y += hh + 2.0
        pg.text(left + w / 2, top - h - 5, "점선 = P02 띠 L0~L3 자리(참고, 띠 사이 2 mm).", fs=6.0, ha="center", color=C_DIM)

    # 칼로 따는 창
    for kn in g["knife"]:
        if "poly" in kn:
            pts = [P(p) for p in kn["poly"]]
            pg.poly(pts, lw=0.6, color=C_KNIFE, ls=(0, (3, 1.6)), hatch="////")
            kx0, ky0, kx1, ky1 = bbox(pts)
            if (kx1 - kx0) >= 14 and (ky1 - ky0) >= 5:
                tw, th = kx1 - kx0, ky1 - ky0
                pg.text((kx0 + kx1) / 2, ky1 - 2.2, f"칼 창 {tw:.1f}×{th:.1f}", fs=5.5, ha="center", va="center",
                        color=C_KNIFE)
        else:
            c = P(kn["circle"])
            pg.circle(c, kn["d"] / 2, lw=0.6, color=C_KNIFE, ls=(0, (3, 1.6)))
            pg.poly([(c[0] + kn["d"] / 2 * math.cos(a), c[1] + kn["d"] / 2 * math.sin(a))
                     for a in np.linspace(0, 2 * math.pi, 72, endpoint=False)], lw=0.0, color=C_KNIFE, hatch="////")
            draw_cross(pg, c, 2.5)

    # 외곽선 (실선, 칼로 자르는 선)
    pg.poly([P(p) for p in out], lw=LW_OUTLINE, color=C_OUT)

    # 칼날 방향 화살표(가장 긴 변 4개, 바깥쪽에서 선으로)
    sgn = 1.0 if poly_area(out) > 0 else -1.0
    edges = []
    for i in range(len(out)):
        a, b = out[i], out[(i + 1) % len(out)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        edges.append((L, a, b))
    edges.sort(key=lambda e: -e[0])
    for L, a, b in edges[:4]:
        if L < 12:
            continue
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        nx, ny = (b[1] - a[1]) / L * sgn, -(b[0] - a[0]) / L * sgn
        tip = P((mx + nx * 1.0, my + ny * 1.0))
        tail = P((mx + nx * 6.0, my + ny * 6.0))
        pg.line([tail, tip], lw=0.4, color=C_DIM)
        hx, hy = -nx, -ny
        for s2 in (1, -1):
            hd = (tip[0] + (hx * math.cos(0.45) - s2 * hy * math.sin(0.45)) * 1.6,
                  tip[1] + (hy * math.cos(0.45) + s2 * hx * math.sin(0.45)) * 1.6)
            pg.line([tip, hd], lw=0.4, color=C_DIM)
        tt = P((mx + nx * 8.2, my + ny * 8.2))
        pg.text(tt[0], tt[1], "칼", fs=5.5, ha="center", va="center", color=C_DIM)

    # 드릴 구멍 (십자 + 원 + Ø 글자)
    placed = []
    for dr in g["drill"]:
        c = P(dr["c"])
        r = dr["d"] / 2
        pg.circle(c, r, lw=0.5, color=C_DRILL)
        draw_cross(pg, c, max(2.6, r + 1.6))
    cx_mid = left + w / 2
    cy_mid = top - h / 2
    for dr in g["drill"]:
        c = P(dr["c"])
        r = dr["d"] / 2
        label = f"Ø{fmt(dr['d'])}"
        lw_ = text_units(label, 6.5) + 0.6
        lh_ = 2.6
        best = None
        base = math.atan2(c[1] - cy_mid, c[0] - cx_mid)
        for k in range(8):
            a = base + k * math.pi / 4 + (0.0 if k % 2 == 0 else 0.0)
            rad = max(2.6, r + 1.6) + 0.8
            tx = c[0] + rad * math.cos(a)
            ty = c[1] + rad * math.sin(a)
            ha = "left" if math.cos(a) >= -0.1 else "right"
            bx0 = tx if ha == "left" else tx - lw_
            box = (bx0, ty - lh_ / 2, bx0 + lw_, ty + lh_ / 2)
            clash = sum(1 for b in placed if not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]))
            for o in g["drill"]:
                oc = P(o["c"])
                if o is dr:
                    continue
                if box[0] - 1.5 < oc[0] < box[2] + 1.5 and box[1] - 1.5 < oc[1] < box[3] + 1.5:
                    clash += 1
            if best is None or clash < best[0]:
                best = (clash, tx, ty, ha, box)
            if clash == 0:
                break
        placed.append(best[4])
        pg.text(best[1], best[2], label, fs=6.5, ha=best[3], va="center", color=C_DRILL)
    for kn in g["knife"]:
        if "circle" in kn:
            c = P(kn["circle"])
            pg.text(c[0] + kn["d"] / 2 + 1.0, c[1] + kn["d"] / 2 + 1.0, f"Ø{fmt(kn['d'])} (칼)", fs=6.5, color=C_KNIFE)

    # 치수선
    tx0, ty1 = left, top
    dy = top + 11.0
    pg.line([(left, dy), (left + w, dy)], lw=0.3, color=C_DIM)
    for xx in (left, left + w):
        pg.line([(xx, top + 1.0), (xx, dy + 1.5)], lw=0.3, color=C_DIM)
    pg.text(left + w / 2, dy + 1.0, f"{w:.1f}", fs=6.5, ha="center", color=C_DIM)
    dx = left - 11.0
    pg.line([(dx, top - h), (dx, top)], lw=0.3, color=C_DIM)
    for yy in (top - h, top):
        pg.line([(left - 1.0, yy), (dx - 1.5, yy)], lw=0.3, color=C_DIM)
    pg.text(dx - 1.0, top - h / 2, f"{h:.1f}", fs=6.5, ha="right", va="center", color=C_DIM, rotation=90)

    # 방향 표시
    pg.text(pg.w - 12, pg.h - 9.0, f"→ +{info[2]}   ↑ +{info[3]}", fs=8, ha="right", color=C_DIM)

    # 글 영역: notes · 구멍 목록 · 창 목록
    ty = top - h - 14.0
    lines = []
    if piece.get("notes"):
        lines += wrap("메모: " + piece["notes"], 7.5, pg.w - 24)
    if g["drill"]:
        groups = {}
        for dr in g["drill"]:
            groups.setdefault(dr["d"], []).append(dr)
        for d_ in sorted(groups):
            pos = ", ".join(f"({fnum(q['c'][0])}, {fnum(q['c'][1])})" for q in groups[d_])
            notes = sorted({q["note"] for q in groups[d_] if q["note"]})
            s = f"드릴 Ø{fmt(d_)} × {len(groups[d_])}: {pos}"
            if notes:
                s += "  — " + " / ".join(notes)
            lines += wrap(s, 7.5, pg.w - 24)
    ks = []
    for kn in g["knife"]:
        if "poly" in kn:
            kx0, ky0, kx1, ky1 = bbox(kn["poly"])
            s = f"칼 창 {kx1 - kx0:.1f} × {ky1 - ky0:.1f} (중심 {fnum((kx0 + kx1) / 2)}, {fnum((ky0 + ky1) / 2)})"
        else:
            s = f"칼 원 Ø{fmt(kn['d'])} (중심 {fnum(kn['circle'][0])}, {fnum(kn['circle'][1])})"
        if kn.get("note"):
            s += " — " + kn["note"]
        ks.append(s)
    for s in ks:
        lines += wrap(s, 7.5, pg.w - 24)
    if not g["drill"] and not g["knife"] and not piece.get("blank"):
        lines += ["구멍·창 없음."]
    if "pieces.json 에 자세한 도면 정보 없음" in "":
        pass
    ylim_bottom = 31.0
    ny = ty
    for ln in lines:
        if ny < ylim_bottom:
            meta.setdefault("overflow", []).append(piece["id"])
            break
        pg.text(12, ny, ln, fs=7.5)
        ny -= 3.9
    meta["text_lines"] = len(lines)

    # 범례 + 안내
    gx = 128.0
    pg.line([(gx, 31.0), (gx + 10, 31.0)], lw=LW_OUTLINE - 0.1, color=C_OUT)  # 굵기를 달리해 검사가 외곽선만 찾게 한다
    pg.text(gx + 12, 31.0, "외곽선 = 칼로 자르는 선", fs=6.0, va="center")
    pg.line([(gx, 27.5), (gx + 10, 27.5)], lw=0.6, color=C_KNIFE, ls=(0, (3, 1.6)))
    pg.text(gx + 12, 27.5, "점선·해칭 = 칼로 따는 창", fs=6.0, va="center")
    draw_cross(pg, (gx + 5, 24.0), 2.2)
    pg.text(gx + 12, 24.0, "십자 + Ø = 드릴 구멍 중심", fs=6.0, va="center")
    pg.line([(gx, 20.5), (gx + 10, 20.5)], lw=0.5, color=C_GLUE, ls=(0, (6, 1.5, 1, 1.5)))
    pg.text(gx + 12, 20.5, "일점쇄선 = 붙이는 선" + ("" if legend_glue else " (이 조각은 없음)"), fs=6.0, va="center")
    pg.text(gx, 16.5, "칼날은 선 바깥(버리는 쪽)에 붙여 3~4번 나눠 긋고,\n쇠자는 조각 쪽에 누른다. 접는 선 없음(포맥스는 붙인다).", fs=5.5, va="top", color=C_DIM)
    ruler(pg, 12.0, 20.0)
    pg.footer(num, total)
    meta.update({"origin": (ox, oy), "w": w, "h": h, "landscape": landscape, "ang_deg": math.degrees(ang)})


# --------------------------------------------------------------------------- 첫 쪽 · 배치 개요

def cover_page(pg, data, layout, entries, pagemap, total):
    pg.text(12, 284, "V5H 포맥스 재단 도면", fs=22, bold=True)
    pg.text(12, 277, "컴퓨터과학2 피지컬컴퓨팅 · 큐브 풀이 로봇 V5H · 3 mm 포맥스 수작업 부품 (1 : 1)", fs=9.5)
    box = [
        "인쇄 안내 (꼭 읽을 것)",
        "1. 용지 A4, 배율 100 % = '실제 크기', '용지에 맞춤/맞추기'는 끈다. (PDF 뷰어: 페이지 크기 조정 → 실제 크기)",
        "2. 인쇄 뒤 아래 100 mm 기준선을 자로 잰다 (100 ± 0.5 mm). 다르면 인쇄 배율을 고쳐 다시 찍는다.",
        "3. 조각마다 A4 1쪽. 외곽선(실선) 대로 칼로 자른다. 구멍은 십자 중심에 Ø 값 드릴, 점선·해칭은 칼로 딴다.",
        "4. 출력물은 포맥스(두께 3.0 가정)에 붙인다. 판은 300 × 450 두 장 — 배치는 2~3쪽, 여분 13조각 포함.",
        "5. 거울상 주의: 각 쪽에 '어느 쪽에서 본 면'을 적었다. 조각 좌표는 설계 문서 0.3절 그대로.",
    ]
    y = 270
    for i, s in enumerate(box):
        pg.text(12, y, s, fs=9.5 if i == 0 else 8.0, bold=(i == 0))
        y -= 5.6 if i else 6.4
    ruler(pg, 12.0, 224.0)
    pg.text(12, 214.0, "조각 목록 (ID 별 · 장수 = 본 제작, 괄호 = 여분)", fs=9.5, bold=True)

    cols = [("ID", 12), ("이름", 62), ("장수", 18), ("평면 · 보는 방향", 50), ("재단 판", 38), ("쪽", 10)]
    xs = [12.0]
    for _, wd in cols:
        xs.append(xs[-1] + wd)
    ytab = 208.0
    for (name, _), x in zip(cols, xs):
        pg.text(x + 0.5, ytab, name, fs=7.2, bold=True)
    pg.line([(12, ytab - 1.5), (xs[-1], ytab - 1.5)], lw=0.4)
    y = ytab - 5.8
    ids = []
    for p in entries:
        if p["id"] not in ids:
            ids.append(p["id"])
    sp = data["summary"]["spare_per_id"]
    for pid in ids:
        ps = [p for p in entries if p["id"] == pid]
        cnt = sum(p["count"] for p in ps)
        name = ps[0]["name"]
        if len(ps) > 1:
            name = re.sub(r"\s*\(.*?\)|\s+[LRT]\d.*$|\s+P1[FR]$", "", name).strip() + f" ({len(ps)}종)"
        plane = PLANE_INFO[ps[0]["plane"]]
        plane_s = f"{plane[0]} · {plane[1].split(' (')[0]}"
        pgs = [pagemap[id(p)] for p in ps]
        pgtxt = f"{min(pgs)}" if len(pgs) == 1 else f"{min(pgs)}~{max(pgs)}"
        cells = [pid, name, f"{cnt}" + (f" (+{sp[pid]})" if pid in sp else "") + (" 블랭크" if ps[0].get("blank") else ""),
                 plane_s, sheet_text_for(layout, pid), pgtxt]
        for c, x, (_, wd) in zip(cells, xs, cols):
            s = c
            while text_units(s, 6.6) > wd - 1.0 and len(s) > 3:
                s = s[:-2]
            pg.text(x + 0.5, y, s if s == c else s + "…", fs=6.6)
        y -= 4.6
        pg.line([(12, y + 3.0), (xs[-1], y + 3.0)], lw=0.15, color="#bbbbbb")
    pg.footer(1, total)
    return y


def overview_page(pg, sname, rows, layout_polys, num, total, spare_n):
    s = OV_SCALE
    x0, y0 = 22.0, 26.0
    pg.text(12, 286, f"배치 개요 — 판 {sname} (300 × 450 mm)", fs=14, bold=True)
    pg.text(12, 280, f"축척 아님: 판 전체를 {s:.2f} 배로 줄여 그렸다 (조각 도면은 1:1 이고 쪽마다 있다). "
            f"여분 {spare_n}조각 포함, 칸 사이 2.0 mm, 판 가장자리 2.0 mm.", fs=7.0, color="#333333")
    pg.poly([(x0, y0), (x0 + SHEET_W * s, y0), (x0 + SHEET_W * s, y0 + SHEET_H * s), (x0, y0 + SHEET_H * s)],
            lw=0.8, color="k")
    # 가장자리 여백선 2 mm
    m = 2.0 * s
    pg.poly([(x0 + m, y0 + m), (x0 + (SHEET_W - 2) * s, y0 + m), (x0 + (SHEET_W - 2) * s, y0 + (SHEET_H - 2) * s),
             (x0 + m, y0 + (SHEET_H - 2) * s)], lw=0.2, color=C_DIM, ls=(0, (2, 2)))
    for r, poly in zip(rows, layout_polys):
        rx, ry = x0 + r["x"] * s, y0 + r["y"] * s
        rw, rh = r["w"] * s, r["h"] * s
        pg.poly([(rx, ry), (rx + rw, ry), (rx + rw, ry + rh), (rx, ry + rh)], lw=0.35, color="k",
                fill="#e9eefb" if r["spare"] else "#f4f4f4", hatch="///" if r["spare"] else None)
        if poly is not None:
            pg.poly([(x0 + px * s, y0 + py * s) for px, py in poly], lw=0.25, color="#445577")
        label = r["id"] + ("*" if r["spare"] else "")
        short = min(rw, rh)
        if short >= 4.0 or (max(rw, rh) >= 14 and short >= 2.2):
            vert = rh > rw * 1.4
            pg.text(rx + rw / 2, ry + rh / 2, label, fs=5.2 if short < 6 else 6.0, ha="center", va="center",
                    rotation=90 if vert else 0)
        else:
            pg.text(rx + rw + 0.6, ry + rh / 2, label, fs=4.2, va="center", color=C_DIM)
    # 범례
    lx = 12.0
    pg.poly([(lx, 9.5), (lx + 6, 9.5), (lx + 6, 12.5), (lx, 12.5)], lw=0.35, fill="#f4f4f4")
    pg.text(lx + 8, 11.0, "본 제작", fs=6.0, va="center")
    pg.poly([(lx + 25, 9.5), (lx + 31, 9.5), (lx + 31, 12.5), (lx + 25, 12.5)], lw=0.35, fill="#e9eefb", hatch="///")
    pg.text(lx + 33, 11.0, "* = 여분", fs=6.0, va="center")
    ruler(pg, 80.0, 14.0, label=False)
    pg.text(80.0 + 50.0, 9.0, "↑ 이 선만 실제 100 mm. 판 그림은 줄여 그렸다.", fs=5.5, ha="center", color=C_DIM)
    pg.footer(num, total)


def build_layout_polys(rows, data):
    """배치 행마다 조각 다각형을 판 좌표로 놓는다(개요용). 표의 사각형이 조각 외곽 사각형보다 작으면 불일치(오류),
    0.15 mm 넘게 크면 여유(정보)로 따로 센다."""
    by_id = {}
    for p in data["pieces"]:
        by_id.setdefault(p["id"], []).append(p)
    mism = []
    slack = []
    polys = []
    for r in rows:
        chosen = None
        for p in by_id.get(r["id"], []):
            g = geometry(p)
            x0, y0, x1, y1 = bbox(g["outline"])
            w, h = x1 - x0, y1 - y0
            ew, eh = (h, w) if r["rot"] else (w, h)
            if ew <= r["w"] + 0.01 and eh <= r["h"] + 0.01 and r["w"] - ew <= 6.0 and r["h"] - eh <= 6.0:
                chosen = (g["outline"], r["w"] - ew, r["h"] - eh)
                break
        if chosen is None:
            mism.append(r["label"])
            polys.append(None)
            continue
        pts, sw, sh = chosen
        if max(sw, sh) > 0.15:
            slack.append(f"{r['label']} (+{max(sw, sh):.2f})")
        if r["rot"]:
            pts = [(-(py), px) for px, py in pts]   # (u,v) -> (-v,u) : 회전만
        bx0, by0, _, _ = bbox(pts)
        polys.append([(px - bx0 + r["x"], py - by0 + r["y"]) for px, py in pts])
    return polys, mism, slack


# --------------------------------------------------------------------------- 검사

def check_m1(layout, data):
    rects = []
    for s in ("A", "B"):
        for r in layout[s]:
            rects.append((s, r))
    min_gap = 1e9
    worst = None
    inside = True
    for s, r in rects:
        if not (r["x"] >= 2.0 - 1e-9 and r["y"] >= 2.0 - 1e-9 and r["x"] + r["w"] <= 298.0 + 1e-9
                and r["y"] + r["h"] <= 448.0 + 1e-9):
            inside = False
    for s in ("A", "B"):
        rr = layout[s]
        for i in range(len(rr)):
            for j in range(i + 1, len(rr)):
                a, b = rr[i], rr[j]
                dx = max(a["x"] - (b["x"] + b["w"]), b["x"] - (a["x"] + a["w"]))
                dy = max(a["y"] - (b["y"] + b["h"]), b["y"] - (a["y"] + a["h"]))
                gap = max(dx, dy)
                if gap < min_gap:
                    min_gap = gap
                    worst = (a["label"], b["label"])
    spare_cnt = sum(1 for _, r in rects if r["spare"])
    # 조각 수: 본 제작 = 50 (블랭크로 묶은 수), 여분 13
    main_cnt = len(rects) - spare_cnt
    ok = inside and min_gap >= 2.0 - 1e-6 and spare_cnt == 13 and len(rects) == 63
    return {"id": "M1", "value": round(min_gap, 6), "limit": 2.0, "ok": bool(ok),
            "detail": {"rects": len(rects), "main": main_cnt, "spare": spare_cnt, "inside_[2,298]x[2,448]": inside,
                       "tightest_pair": list(worst) if worst else None}}


def kabsch_residual(orig, got):
    P = np.asarray(orig, float)
    Q = np.asarray(got, float)
    n = len(P)
    best = None
    Pc = P - P.mean(axis=0)
    for sh in range(n):
        Q2 = np.roll(Q, -sh, axis=0)
        Qc = Q2 - Q2.mean(axis=0)
        H = Pc.T @ Qc
        U, S, Vt = np.linalg.svd(H)
        d = np.sign(np.linalg.det(Vt.T @ U.T))
        D = np.diag([1.0, d if d != 0 else 1.0])
        R = Vt.T @ D @ U.T
        res = np.abs(Qc - Pc @ R.T).max()
        if best is None or res < best[0]:
            best = (res, math.degrees(math.atan2(R[1, 0], R[0, 0])), float(d))
    return best


def pdf_checks(pdf_path, pages_meta, entries, data, layout_ok):
    import pdfplumber
    k = 25.4 / 72.0
    ruler_errs = []
    ruler_pages = 0
    m3_max = 0.0
    m3_fail = []
    m4_margin = 1e9
    m4_fail = []
    text_missing = []
    mirror_flag = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        n_pages = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            meta = pages_meta[i]
            objs = list(page.lines) + list(page.curves) + list(page.rects)
            # M2
            rl = [o for o in objs if abs(o["linewidth"] - LW_RULER) < 1e-3]
            if len(rl) != 1:
                ruler_errs.append((i + 1, "ruler_count", len(rl)))
            else:
                pts = rl[0]["pts"]
                L = math.hypot(pts[-1][0] - pts[0][0], pts[-1][1] - pts[0][1]) * k
                ruler_errs.append((i + 1, "len", abs(L - 100.0)))
                ruler_pages += 1
            if meta["kind"] != "piece":
                continue
            piece = meta["piece"]
            H = page.height
            ol = [o for o in objs if abs(o["linewidth"] - LW_OUTLINE) < 1e-3]
            if len(ol) != 1:
                m3_fail.append((piece["id"], "outline_count", len(ol)))
                continue
            pts = [(x * k, (H - y) * k) for x, y in ol[0]["pts"]]
            if len(pts) > 1 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-6:
                pts = pts[:-1]
            orig = piece["outline"]
            if len(pts) != len(orig):
                # 사각형 등은 pdfminer 가 꼭짓점을 줄일 수 있다
                m3_fail.append((piece["id"], "vertex_count", (len(pts), len(orig))))
                continue
            res, ang, det = kabsch_residual(orig, pts)
            m3_max = max(m3_max, res)
            if res > 0.01:
                m3_fail.append((piece["id"], "residual", res))
            # M4: 인쇄 가능 영역 안(여백 10 mm)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            wmm, hmm = page.width * k, page.height * k
            marg = min(min(xs) - 10.0, wmm - 10.0 - max(xs), min(ys) - 10.0, hmm - 10.0 - max(ys))
            m4_margin = min(m4_margin, marg)
            if marg < 0:
                m4_fail.append((piece["id"], marg))
            dims = sorted([max(xs) - min(xs), max(ys) - min(ys)])
            if dims[0] > 190.0 or dims[1] > 277.0:
                m4_fail.append((piece["id"], "dims", dims))
            txt = page.extract_text() or ""
            need = [piece["id"], f"장수 {piece['count']}"]
            for h in piece["holes"]:
                if "d" in h:
                    need.append(f"Ø{fmt(h['d'])}")
            for t in need:
                if t not in txt:
                    text_missing.append((piece["id"], t))
    m2_val = max([e[2] for e in ruler_errs if e[1] == "len"] or [1e9])
    m2_bad = [e for e in ruler_errs if e[1] == "ruler_count"]
    m2 = {"id": "M2", "value": round(m2_val, 6), "limit": 0.01,
          "ok": bool(m2_val <= 0.01 and not m2_bad and ruler_pages == n_pages),
          "detail": {"pages": n_pages, "pages_with_one_ruler": ruler_pages, "bad": m2_bad}}
    m3 = {"id": "M3", "value": round(m3_max, 6), "limit": 0.01,
          "ok": bool(m3_max <= 0.01 and not m3_fail and not text_missing),
          "detail": {"pieces_checked": len(entries), "fail": m3_fail, "text_missing": text_missing}}
    n_piece_pages = sum(1 for m in pages_meta if m["kind"] == "piece")
    m4 = {"id": "M4", "value": round(m4_margin, 3), "limit": 0.0,
          "ok": bool(n_piece_pages == len(entries) and not m4_fail and m4_margin >= 0),
          "detail": {"piece_pages": n_piece_pages, "pieces": len(entries), "overview_pages": 2, "cover_pages": 1,
                     "total_pages": n_pages, "fail": m4_fail, "limit_note": "value = 인쇄 여백 10 mm 안쪽 최소 여유(mm)"}}
    return [m2, m3, m4], n_pages


# --------------------------------------------------------------------------- main

def main():
    setup_fonts()
    data = load_pieces()
    layout = load_layout()
    entries = piece_pages_list(data)
    total = 1 + 2 + len(entries)
    pagemap = {id(p): 4 + i for i, p in enumerate(entries)}

    m1 = check_m1(layout, data)
    polys = {}
    mism = {}
    slack = {}
    for s in ("A", "B"):
        polys[s], mism[s], slack[s] = build_layout_polys(layout[s], data)
    spare_by_sheet = {s: sum(1 for r in layout[s] if r["spare"]) for s in layout}

    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    pages_meta = []
    meta_pdf = {"Title": "V5H cutsheet", "Author": "", "Subject": "", "Keywords": "", "CreationDate": None,
                "Creator": "make_v5h_cutsheet.py"}
    with PdfPages(str(OUT_PDF), metadata=meta_pdf) as pdf:
        pg = Page(*A4)
        cover_page(pg, data, layout, entries, pagemap, total)
        pdf.savefig(pg.fig)
        plt.close(pg.fig)
        pages_meta.append({"kind": "cover"})
        for k_, s in enumerate(("A", "B")):
            pg = Page(*A4)
            overview_page(pg, s, layout[s], polys[s], 2 + k_, total, spare_by_sheet[s])
            pdf.savefig(pg.fig)
            plt.close(pg.fig)
            pages_meta.append({"kind": "overview", "sheet": s})
        for i, p in enumerate(entries):
            x0, y0, x1, y1 = bbox(geometry(p)["outline"])
            wd, ht = x1 - x0, y1 - y0
            size = (297.0, 210.0) if wd > ht else (210.0, 297.0)
            pg = Page(*size)
            meta = {"kind": "piece", "piece": p}
            draw_piece_page(pg, p, data, layout, 4 + i, total, meta)
            pdf.savefig(pg.fig)
            plt.close(pg.fig)
            pages_meta.append(meta)

    checks, n_pages = pdf_checks(OUT_PDF, pages_meta, entries, data, True)
    overflow = [m["piece"]["id"] for m in pages_meta if m.get("overflow")]
    all_checks = [m1] + checks
    result = {
        "checks": all_checks,
        "pdf": str(OUT_PDF.relative_to(ROOT)),
        "pages": n_pages,
        "layout_size_mismatch_rows": mism,
        "layout_rect_slack_over_0.15mm": slack,
        "text_overflow_pieces": overflow,
        "rotated_pieces": {m["piece"]["id"]: round(m["ang_deg"], 3) for m in pages_meta
                           if m["kind"] == "piece" and abs(m["ang_deg"]) > 1e-6},
    }
    OUT_CHECKS.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for c in all_checks:
        print(f"{c['id']}: value={c['value']} limit={c['limit']} ok={c['ok']}")
    print(f"쪽수 {n_pages}, 레이아웃 크기 불일치 {sum(len(v) for v in mism.values())}, 글 넘침 {overflow}")
    return 0 if all(c["ok"] for c in all_checks) else 1


if __name__ == "__main__":
    sys.exit(main())
