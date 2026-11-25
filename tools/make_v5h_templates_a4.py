"""V5H 포맥스 재단 가이드 — A4 모아찍기판 (1:1, 지그 출력 없이 종이 본으로 자르기용).

docs/V5H_재단도면.pdf 는 조각 1장 = 1쪽(46쪽)이라 인쇄·붙이기가 번거롭다.
이 스크립트는 같은 pieces.json 으로 본 제작 조각을 장수만큼 A4 에 빽빽이 모아(0°/90° 회전) 찍는다.
마지막 쪽은 지그 대신 쓰는 종이 각도자(20°, 45°, 65.1°)와 드릴 구멍 표시 요령.

인쇄: A4, 실제 크기(100%), 맞춤 끄기 → 쪽마다 100 mm 기준선을 자로 재서 확인.
사용: python3 tools/make_v5h_templates_a4.py  → docs/V5H_재단가이드_A4.pdf
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_v5h_cutsheet as cs  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

OUT = cs.ROOT / "docs" / "V5H_재단가이드_A4.pdf"
W, H = cs.A4
X0, X1 = 8.0, 194.0           # 쓸 수 있는 가로 범위 (작은 조각 옆 이름표 자리 8 mm 남김)
Y0, Y1 = 22.0, 275.0          # 아래: 기준선·꼬리말, 위: 제목
GAP = 4.0                     # 조각 사이 (칼날 + 손 여유)


def rot90(p):
    return (-p[1], p[0])


def item_geom(piece, turned):
    g = cs.geometry(piece)
    if not turned:
        return g
    t = rot90
    g2 = {"ang": g["ang"], "outline": [t(p) for p in g["outline"]], "drill": [], "knife": []}
    for d in g["drill"]:
        g2["drill"].append({**d, "c": t(d["c"])})
    for k in g["knife"]:
        k2 = dict(k)
        if "poly" in k:
            k2["poly"] = [t(p) for p in k["poly"]]
        else:
            k2["circle"] = t(k["circle"])
        g2["knife"].append(k2)
    return g2


def build_items(data):
    items = []
    for p in data["pieces"]:
        if p.get("group") == "spare" or p.get("blank"):
            continue   # 블랭크(H05·H06)는 P01·P02 를 한 장씩 그리므로 뺀다
        for i in range(p["count"]):
            x0, y0, x1, y1 = cs.bbox(item_geom(p, False)["outline"])
            items.append({"piece": p, "k": i + 1, "w": x1 - x0, "h": y1 - y0})
    return items


def pack(items):
    """선반(shelf) 채우기: 큰 것부터, 긴 변을 가로로. 쪽이 차면 다음 쪽."""
    for it in items:
        it["turn"] = it["h"] > it["w"] and it["h"] <= X1 - X0
        if it["turn"]:
            it["w"], it["h"] = it["h"], it["w"]
        assert it["w"] <= X1 - X0 and it["h"] <= Y1 - Y0, it["piece"]["id"]
    items.sort(key=lambda it: (-it["h"], -it["w"], it["piece"]["id"]))
    pages, shelves = [], []   # shelf: [page, y_top, height, x_cursor]
    for it in items:
        placed = False
        for sh in shelves:
            if it["h"] <= sh[2] + 1e-9 and sh[3] + it["w"] <= X1 + 1e-9:
                it["page"], it["x"], it["y"] = sh[0], sh[3], sh[1] - it["h"]
                sh[3] += it["w"] + GAP
                placed = True
                break
        if placed:
            continue
        pg = len(pages) - 1
        top = pages[pg] if pages else None
        if top is None or top - it["h"] < Y0:
            pages.append(Y1)
            pg = len(pages) - 1
            top = Y1
        sh = [pg, top, it["h"], X0 + it["w"] + GAP]
        shelves.append(sh)
        pages[pg] = top - it["h"] - GAP
        it["page"], it["x"], it["y"] = pg, X0, top - it["h"]
    return len(pages)


def draw_item(pg, it, total_of):
    p = it["piece"]
    g = item_geom(p, it["turn"])
    x0, y0, _, _ = cs.bbox(g["outline"])
    ox, oy = it["x"] - x0, it["y"] - y0

    def P(q):
        return (q[0] + ox, q[1] + oy)

    for kn in g["knife"]:
        if "poly" in kn:
            pg.poly([P(q) for q in kn["poly"]], lw=0.5, color=cs.C_KNIFE, ls=(0, (3, 1.6)), hatch="////")
        else:
            c = P(kn["circle"])
            pg.circle(c, kn["d"] / 2, lw=0.5, color=cs.C_KNIFE, ls=(0, (3, 1.6)))
    pg.poly([P(q) for q in g["outline"]], lw=cs.LW_OUTLINE, color=cs.C_OUT)
    for d in g["drill"]:
        c = P(d["c"])
        pg.circle(c, d["d"] / 2, lw=0.4, color=cs.C_DRILL)
        cs.draw_cross(pg, c, max(1.8, d["d"] / 2 + 1.2))
        pg.text(c[0] + d["d"] / 2 + 0.8, c[1] + 0.8, f"Ø{d['d']:g}", fs=4.2, color=cs.C_DRILL)
    # 이름표: 조각 가운데
    cx, cy = it["x"] + it["w"] / 2, it["y"] + it["h"] / 2
    n = total_of[p["id"]]
    tag = p.get("sub") or {"R": "오른", "L": "왼"}.get(p.get("side"), "")
    lab = p["id"] + (f" {tag}" if tag else "") + (f" {it['k']}/{n}" if n > 1 else "")
    fs = 7.5 if min(it["w"], it["h"]) >= 12 else 5.0
    if min(it["w"], it["h"]) < 7:
        pg.text(it["x"] + it["w"] + 0.6, cy, lab, fs=4.2, va="center", bold=True)
    else:
        pg.text(cx, cy, lab, fs=fs, ha="center", va="center", bold=True,
                rotation=90 if it["h"] > it["w"] * 1.8 and it["w"] < 14 else 0)
    if it["turn"]:
        pg.text(it["x"] + 0.8, it["y"] + it["h"] - 2.6, "↻90°", fs=4.0, color=cs.C_DIM)


def header(pg, n, total, first):
    pg.text(8, 286, "V5H 포맥스 재단 가이드 (A4 모아찍기, 1:1)", fs=10.5, bold=True)
    pg.text(202, 286, f"{n} / {total}", fs=9, ha="right", bold=True)
    pg.text(8, 281, "검정 실선 = 칼로 자르는 선 · 빨강 십자 = 드릴 (지름 표기) · 파랑 점선·빗금 = 칼로 따내는 창"
            " · 조각 ID 는 재단도면.pdf·지그와 같음", fs=5.8, color=cs.C_DIM)
    if first:
        pg.text(8, 277.4, "사용: 종이를 조각보다 조금 크게 오려 딱풀로 포맥스에 붙임 → 드릴 자리는 송곳으로 먼저 찍기 →"
                " 쇠자 대고 실선 따라 칼질 여러 번 → 종이 떼기. 3 mm 를 겹쳐 쓰는 조각은 1장씩 따로 자른 뒤 붙인다.",
                fs=5.6, color="#333333")
    cs.ruler(pg, 55, 12.5)
    pg.text(W / 2, 3.5, "인쇄: A4 · 실제 크기 100 % · 페이지 맞춤 끄기 — 기준선이 100 mm 가 아니면 다시 인쇄", fs=6,
            ha="center", color=cs.C_DIM)


def angle_page(pg, n, total):
    header(pg, n, total, False)
    pg.text(8, 270, "종이 각도자 — 지그 대신 쓰는 각도 본 (오려서 포맥스 옆에 대고 연필로 긋거나, 사포질할 때 확인)",
            fs=8, bold=True)
    specs = [(20.0, "20° — 베이스 쐐기·데크 아래 모서리 경사 (지그 5 대신)"),
             (45.0, "45° — 기둥 윗모서리 모따기 4 mm (지그 2 C 홈 대신)"),
             (65.1, "65.1° — 기둥 FLIP 비움 경사 (지그 2 R 홈 대신)")]
    y = 196.0
    for ang, txt in specs:
        a = math.radians(ang)
        hgt = min(50.0, 120.0 * math.tan(a))
        base = hgt / math.tan(a)
        pg.poly([(20, y), (20 + base, y), (20 + base, y + hgt)], lw=cs.LW_OUTLINE)
        pg.line([(20 + base - 4, y), (20 + base - 4, y + 4), (20 + base, y + 4)], lw=0.3, color=cs.C_DIM)
        r = 12.0
        pg.line([(20 + r * math.cos(t), y + r * math.sin(t)) for t in [a * i / 20 for i in range(21)]], lw=0.5,
                color=cs.C_DRILL)
        pg.text(20, y - 6.5, f"{ang:g}°", fs=11, bold=True, color=cs.C_DRILL)
        tx, ty = (20 + base + 6, y + hgt / 2) if base < 90 else (20, y + hgt + 9)
        pg.text(tx, ty + 3, txt, fs=7.5)
        pg.text(tx, ty - 3, "왼쪽 꼭짓점을 모서리에, 밑변을 판 면에 맞춰 댄다.", fs=6, color=cs.C_DIM)
        y -= 72.0
    pg.text(8, 40, "드릴 표시 요령: 종이를 붙인 채 송곳으로 십자 가운데를 찍고 → Ø2 로 먼저 뚫고 → 표기 지름으로 넓힌다."
            " 같은 위치에 겹치는 판은 붙인 뒤 한 번에 관통.", fs=6.2)
    pg.text(8, 34, "슬롯(칼 창)은 양끝 Ø3.2 를 먼저 뚫고 쇠자로 두 변을 이어 자른다."
            " 홀더 기둥 틈(1.0)·후드 틈(1.5)은 큐브에 마스킹테이프를 감아 맞춘다.", fs=6.2)


def main():
    cs.setup_fonts()
    data = cs.load_pieces()
    items = build_items(data)
    total_of = {}
    for it in items:
        total_of[it["piece"]["id"]] = total_of.get(it["piece"]["id"], 0) + 1
    seen = {}
    for it in items:   # ID 단위 일련번호 (같은 ID 의 변형 T1R/T2R 등도 이어서 센다)
        seen[it["piece"]["id"]] = seen.get(it["piece"]["id"], 0) + 1
        it["k"] = seen[it["piece"]["id"]]
    npages = pack(items)
    total = npages + 1
    meta = {"Title": "V5H 포맥스 재단 가이드 (A4 모아찍기)", "Author": "V5H", "Creator": "make_v5h_templates_a4.py",
            "Producer": "matplotlib", "CreationDate": None}
    with PdfPages(str(OUT), metadata=meta) as pdf:
        for i in range(npages):
            pg = cs.Page(W, H)
            header(pg, i + 1, total, i == 0)
            for it in items:
                if it["page"] == i:
                    draw_item(pg, it, total_of)
            pdf.savefig(pg.fig)
            cs.plt.close(pg.fig)
        pg = cs.Page(W, H)
        angle_page(pg, total, total)
        pdf.savefig(pg.fig)
        cs.plt.close(pg.fig)
    print(f"{OUT.relative_to(cs.ROOT)}: {total}쪽 (조각 {len(items)}장, 각도자 1쪽)")




# --------------------------------------------------------------------------- 판 맞춤 타일 (300×450 판 = A4 4쪽)
OUT_TILE = cs.ROOT / "docs" / "V5H_재단가이드_판맞춤.pdf"
TW, TH = 150.0, 225.0          # 판을 2×2 로 나눈 한 칸
OV = 8.0                       # 이웃 칸과 겹쳐 찍는 폭 (맞춰 붙이기용)
PX0, PY0 = 10.0, 30.0          # 쪽 위 그리는 원점 (판 좌표 → 쪽 좌표)


def layout_items(data):
    rows_by = cs.load_layout()
    by_id = {}
    for p in data["pieces"]:
        by_id.setdefault(p["id"], []).append(p)
    out = {}
    for sname, rows in rows_by.items():
        lst = []
        for r in rows:
            for p in by_id.get(r["id"], []):
                g = cs.geometry(p)
                x0, y0, x1, y1 = cs.bbox(g["outline"])
                w, h = x1 - x0, y1 - y0
                ew, eh = (h, w) if r["rot"] else (w, h)
                if ew <= r["w"] + 0.01 and eh <= r["h"] + 0.01 and r["w"] - ew <= 6.0 and r["h"] - eh <= 6.0:
                    if r["rot"]:
                        g = item_geom(p, True)
                    gx0, gy0, _, _ = cs.bbox(g["outline"])
                    lst.append({"row": r, "piece": p, "g": g, "dx": r["x"] - gx0, "dy": r["y"] - gy0})
                    break
            else:
                raise SystemExit(f"배치표 행에 맞는 조각 없음: {r['label']}")
        out[sname] = lst
    return out


def draw_tile(pg, sname, col, row, items, n, total):
    # 이 칸이 보여 줄 판 범위 (겹침 포함)
    bx0 = col * TW - (OV if col else 0)
    by0 = row * TH - (OV if row else 0)
    bx1 = (col + 1) * TW + (OV if col == 0 else 0)
    by1 = (row + 1) * TH + (OV if row == 0 else 0)
    ox, oy = PX0 - bx0, PY0 - by0

    def P(q):
        return (q[0] + ox, q[1] + oy)

    ax = pg.ax
    import matplotlib.patches as mp
    clip = mp.Rectangle((PX0, PY0), bx1 - bx0, by1 - by0, transform=ax.transData)
    # 판 테두리
    pg.poly([P((0, 0)), P((300, 0)), P((300, 450)), P((0, 450))], lw=1.4, color="#888888")
    for it in items:
        g, dx, dy = it["g"], it["dx"], it["dy"]
        Q = lambda q: P((q[0] + dx, q[1] + dy))  # noqa: E731
        spare = it["row"]["spare"]
        col_out = "#888888" if spare else cs.C_OUT
        for kn in g["knife"]:
            if "poly" in kn:
                pg.poly([Q(q) for q in kn["poly"]], lw=0.5, color=cs.C_KNIFE, ls=(0, (3, 1.6)), hatch="////")
            else:
                c = Q(kn["circle"])
                pg.circle(c, kn["d"] / 2, lw=0.5, color=cs.C_KNIFE, ls=(0, (3, 1.6)))
        pg.poly([Q(q) for q in g["outline"]], lw=cs.LW_OUTLINE, color=col_out, ls="-" if not spare else (0, (4, 2)))
        for d in g["drill"]:
            c = Q(d["c"])
            pg.circle(c, d["d"] / 2, lw=0.4, color=cs.C_DRILL)
            cs.draw_cross(pg, c, max(1.8, d["d"] / 2 + 1.2))
        r = it["row"]
        cx, cy = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
        lab = r["label"]
        fs = 6.5 if min(r["w"], r["h"]) >= 12 else 4.2
        if not (bx0 + 3 <= cx <= bx1 - 3 and by0 + 3 <= cy <= by1 - 3):
            continue   # 이름표는 가운데가 이 칸에 있을 때만 (이웃 칸에 찍힘)
        pg.text(*P((cx, cy)), lab, fs=fs, ha="center", va="center", bold=not spare,
                color="#888888" if spare else "k",
                rotation=90 if r["h"] > r["w"] * 1.8 and r["w"] < 16 else 0)
    # 칸 밖은 잘라 내기
    for a in list(ax.patches) + list(ax.lines) + list(ax.texts):
        a.set_clip_on(True)
        a.set_clip_path(clip)
    # 겹침 띠·맞춤 십자
    if col == 1:
        x = P((150, 0))[0]
        pg.line([(x, PY0), (x, PY0 + by1 - by0)], lw=0.4, color="#d08000", ls=(0, (2, 2)))
    if col == 0:
        x = P((150, 0))[0]
        pg.line([(x, PY0), (x, PY0 + by1 - by0)], lw=0.4, color="#d08000", ls=(0, (2, 2)))
    if row == 1:
        y = P((0, 225))[1]
        pg.line([(PX0, y), (PX0 + bx1 - bx0, y)], lw=0.4, color="#d08000", ls=(0, (2, 2)))
    if row == 0:
        y = P((0, 225))[1]
        pg.line([(PX0, y), (PX0 + bx1 - bx0, y)], lw=0.4, color="#d08000", ls=(0, (2, 2)))
    for mx in (60.0, 150.0, 240.0):
        for my in (110.0, 225.0, 340.0):
            if (mx == 150.0 or my == 225.0) and bx0 <= mx <= bx1 and by0 <= my <= by1:
                c = P((mx, my))
                pg.circle(c, 2.5, lw=0.5, color="#d08000")
                pg.line([(c[0] - 4, c[1]), (c[0] + 4, c[1])], lw=0.5, color="#d08000")
                pg.line([(c[0], c[1] - 4), (c[0], c[1] + 4)], lw=0.5, color="#d08000")
    # 제목 (잘라 내기 없음)
    names = {(0, 1): "왼쪽 위", (1, 1): "오른쪽 위", (0, 0): "왼쪽 아래", (1, 0): "오른쪽 아래"}
    pg.text(10, 286, f"판 {sname} — {names[(col, row)]} 칸  (300×450 판을 A4 4장으로 나눔)", fs=10.5, bold=True)
    pg.text(200, 286, f"{n} / {total}", fs=9, ha="right", bold=True)
    pg.text(10, 280.5, "주황 점선 = 이웃 칸과 겹치는 선 · 주황 십자 = 맞춤 표시 (두 장의 십자를 겹쳐 붙임) · 회색 굵은 선 = 판 가장자리"
            " · 회색 점선 조각 = 여분", fs=5.8, color=cs.C_DIM)
    pg.text(10, 276.5, "검정 실선 = 자르는 선 · 빨강 십자 = 드릴 · 파랑 빗금 = 칼로 따는 창 · 판 귀퉁이(왼쪽 아래 = 0,0)를 판 모서리에 맞춘다",
            fs=5.8, color=cs.C_DIM)
    cs.ruler(pg, 55, 12.5)
    pg.text(cs.A4[0] / 2, 3.5, "인쇄: A4 · 실제 크기 100 % · 페이지 맞춤 끄기 — 기준선이 100 mm 가 아니면 다시 인쇄", fs=6,
            ha="center", color=cs.C_DIM)


def main_tiles():
    cs.setup_fonts()
    data = cs.load_pieces()
    sheets = layout_items(data)
    order = [(0, 1), (1, 1), (0, 0), (1, 0)]
    total = 4 * len(sheets) + 1
    meta = {"Title": "V5H 포맥스 재단 가이드 (판 맞춤 A4 타일)", "Author": "V5H", "Creator": "make_v5h_templates_a4.py",
            "Producer": "matplotlib", "CreationDate": None}
    n = 0
    with PdfPages(str(OUT_TILE), metadata=meta) as pdf:
        for sname in sorted(sheets):
            for col, row in order:
                n += 1
                pg = cs.Page(*cs.A4)
                draw_tile(pg, sname, col, row, sheets[sname], n, total)
                pdf.savefig(pg.fig)
                cs.plt.close(pg.fig)
        pg = cs.Page(*cs.A4)
        angle_page(pg, total, total)
        pdf.savefig(pg.fig)
        cs.plt.close(pg.fig)
    cnt = sum(len(v) for v in sheets.values())
    print(f"{OUT_TILE.relative_to(cs.ROOT)}: {total}쪽 (판 {len(sheets)}장 × 4칸, 배치 {cnt}개)")


if __name__ == "__main__":
    main()
    main_tiles()
