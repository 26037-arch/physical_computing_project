#!/usr/bin/env python3
"""V5H 조립 렌더 (포맥스 흰색, 구매품은 V5 COLORS) + 지그 STL 한 장 (주황).

출력: docs/images/v5h/v5h_open.png · v5h_close.png · v5h_flip.png · v5h_open_back.png
      docs/images/v5h/v5h_jigs.png  (models/robot_v5h/jigs/*.stl 이 있을 때만; 없으면 건너뛴다)
같은 입력이면 같은 PNG (메타데이터 고정).

사용: python3 tools/render_v5h.py
"""
import math
import struct
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_robot_v5h as b  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "images" / "v5h"
JIGS = ROOT / "models" / "robot_v5h" / "jigs"
JIG_COLOR = "#e8833a"
BG = "#dfe5ec"
PNG_META = {"Software": None}


def setup_fonts():
    f = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    if Path(f).exists():
        fm.fontManager.addfont(f)
    matplotlib.rcParams["font.family"] = ["DejaVu Sans", "Noto Sans CJK KR"]


def triangles_of(shape, tol=(0.3, 0.4)):
    if not shape.Solids():
        return None
    verts, faces = shape.tessellate(*tol)
    if not faces:
        return None
    pts = np.array([v.toTuple() for v in verts])
    return pts[np.array(faces)]


def shade(tri, color):
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-12)
    light = np.array([0.4, 0.3, 0.85])
    light /= np.linalg.norm(light)
    rgba = np.tile(matplotlib.colors.to_rgba(color), (len(tri), 1))
    # 양면 조명: OCC 삼각형 감김 방향이 면마다 달라도 이음매가 생기지 않게
    rgba[:, :3] *= (0.72 + 0.28 * np.abs(n @ light))[:, None]
    return rgba


def draw_triangles(ax, tris, cols, view=(24, 55)):
    allt = np.concatenate(tris)
    allc = np.concatenate(cols)
    ax.add_collection3d(Poly3DCollection(allt, facecolors=allc, edgecolors="none", linewidths=0))
    lo = allt.reshape(-1, 3).min(axis=0) - 4
    hi = allt.reshape(-1, 3).max(axis=0) + 4
    ax.set_xlim(lo[0], hi[0])
    ax.set_ylim(lo[1], hi[1])
    ax.set_zlim(lo[2], hi[2])
    ax.set_box_aspect(list(hi - lo))
    ax.view_init(elev=view[0], azim=view[1])
    ax.set_facecolor(BG)
    ax.tick_params(labelsize=7)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.set_major_locator(MaxNLocator(nbins=4))
    return lo, hi


def render_pose(pose, fname, azim, title):
    hood_deg, theta = b.POSES[pose]
    items = b.assembly(pose)
    tris, cols = [], []
    for name, shape, ckey in items:
        w = b.local_to_world(shape)
        t = triangles_of(w)
        if t is None:
            continue
        tris.append(t)
        cols.append(shade(t, b.COLORS[ckey]))
    fig = plt.figure(figsize=(12, 10), facecolor="white")
    ax = fig.add_subplot(111, projection="3d")
    draw_triangles(ax, tris, cols, (24, azim))
    ax.set_xlabel("X (mm)")
    ax.set_ylabel("Y 앞 (mm)")
    ax.set_zlabel("Z 위 (mm)")
    ax.set_title(f"V5H 포맥스 조립 — {title} (후드 {hood_deg:g}°, 크랭크 θ {theta:g}°)\n"
                 "흰색 = 3 mm 포맥스, 색 = 구매품(V5 색), 월드 좌표", pad=14)
    fig.tight_layout()
    fig.savefig(OUT / fname, dpi=130, metadata=PNG_META)
    plt.close(fig)
    return len(items)


def read_stl(path):
    data = path.read_bytes()
    if len(data) >= 84:
        n = struct.unpack("<I", data[80:84])[0]
        if 84 + 50 * n == len(data):
            arr = np.frombuffer(data[84:], dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]))
            return arr["v"].astype(float)
    pts = []
    for line in data.decode("utf-8", errors="ignore").splitlines():
        s = line.split()
        if len(s) == 4 and s[0] == "vertex":
            pts.append([float(x) for x in s[1:]])
    return np.array(pts).reshape(-1, 3, 3)


def render_jigs():
    files = sorted(JIGS.glob("*.stl")) if JIGS.exists() else []
    if not files:
        print("지그 STL 없음 — v5h_jigs.png 건너뜀 (models/robot_v5h/jigs/*.stl 이 생기면 다시 돌린다)")
        return False
    n = len(files)
    cols = min(4, n)
    rows = math.ceil(n / cols)
    fig = plt.figure(figsize=(4.2 * cols, 3.8 * rows), facecolor="white")
    for i, f in enumerate(files):
        ax = fig.add_subplot(rows, cols, i + 1, projection="3d")
        tri = read_stl(f)
        draw_triangles(ax, [tri], [shade(tri, JIG_COLOR)], (26, 42))
        ax.set_title(f.stem, fontsize=9)
        ax.tick_params(labelsize=5)
    fig.suptitle(f"V5H 출력 지그 ({n}개 STL, 주황)", fontsize=14)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(OUT / "v5h_jigs.png", dpi=110, metadata=PNG_META)
    plt.close(fig)
    return True


def main():
    setup_fonts()
    OUT.mkdir(parents=True, exist_ok=True)
    for pose, azim, title, fname in (("open", 55, "OPEN", "v5h_open.png"),
                                     ("close", 55, "CLOSE", "v5h_close.png"),
                                     ("flip", 55, "FLIP", "v5h_flip.png"),
                                     ("open", 235, "OPEN (뒤에서)", "v5h_open_back.png")):
        n = render_pose(pose, fname, azim, title)
        print(f"{fname}: 부품 {n}개")
    jigs = render_jigs()
    print("지그 그림:", "있음" if jigs else "없음(STL 없음)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
