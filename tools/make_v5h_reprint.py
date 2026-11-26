"""V5H 재단 가이드 — 고른 조각만 A4 한 장에 다시 찍기 (부러졌거나 잘못 자른 조각 재제작용).

사용: python3 tools/make_v5h_reprint.py L03 V01 V02 V03   → docs/V5H_재단가이드_재출력.pdf
조각 ID 는 재단도면·지그·A4 가이드와 같다. 장수는 원래 필요한 장수 그대로 찍는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_v5h_cutsheet as cs  # noqa: E402
import make_v5h_templates_a4 as t4  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

OUT = cs.ROOT / "docs" / "V5H_재단가이드_재출력.pdf"


def main(ids):
    cs.setup_fonts()
    data = cs.load_pieces()
    items = [it for it in t4.build_items(data) if it["piece"]["id"] in ids]
    missing = sorted(set(ids) - {it["piece"]["id"] for it in items})
    if missing:
        sys.exit(f"없는 조각 ID: {', '.join(missing)}")
    total_of, seen = {}, {}
    for it in items:
        pid = it["piece"]["id"]
        total_of[pid] = total_of.get(pid, 0) + 1
        seen[pid] = seen.get(pid, 0) + 1
        it["k"] = seen[pid]
    npages = t4.pack(items)
    meta = {"Title": "V5H 재단 가이드 재출력 " + " ".join(ids), "Author": "V5H",
            "Creator": "make_v5h_reprint.py", "Producer": "matplotlib", "CreationDate": None}
    with PdfPages(str(OUT), metadata=meta) as pdf:
        for i in range(npages):
            pg = cs.Page(*cs.A4)
            t4.header(pg, i + 1, npages, i == 0)
            pg.text(8, 30, "재출력: " + " · ".join(f"{k} ×{v}" for k, v in total_of.items()), fs=7, bold=True)
            for it in items:
                if it["page"] == i:
                    t4.draw_item(pg, it, total_of)
            pdf.savefig(pg.fig)
            cs.plt.close(pg.fig)
    print(f"{OUT.relative_to(cs.ROOT)}: {npages}쪽 (조각 {len(items)}장: {total_of})")


if __name__ == "__main__":
    main(sys.argv[1:] or ["L03", "V01", "V02", "V03"])
