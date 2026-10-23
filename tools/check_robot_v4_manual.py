"""Check the generated manual's catalog, page bounds and embedded Korean font."""
import hashlib
import json
import re
from pathlib import Path
import fitz
from robot_v4_manual_data import PRINTS, JIGS, BUY, KIT, MATERIAL

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models/robot_v4/assembly_kit'


def main():
    path = ROOT / 'docs/BUILD_V4_상세제작설명서.pdf'
    doc = fitz.open(path)
    expected = {row[0] for row in PRINTS + JIGS + BUY + KIT + MATERIAL}
    found = set(re.findall(r'\b[PJBKM]\d{2}\b', doc[0].get_text()))
    clipped = []
    used_font_names = set()
    for page in doc:
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    used_font_names.add(span['font'])
                    x0, y0, x1, y1 = span['bbox']
                    if x0 < -.5 or y0 < -.5 or x1 > page.rect.width + .5 or y1 > page.rect.height + .5:
                        clipped.append([page.number + 1, span['text'], span['bbox']])
    # ReportLab lists an unused base Helvetica resource. Check fonts that
    # actually appear in text, plus every embedded Nanum subset resource.
    assert all(name.startswith('NanumGothic') for name in used_font_names), used_font_names
    fonts = {font[0] for page in doc for font in page.get_fonts() if 'NanumGothic' in font[3]}
    embedded = all(len(doc.extract_font(xref)[3]) > 0 for xref in fonts)
    toc = doc.get_toc()
    assert len(toc) == len(doc), 'Each page needs a bookmark'
    assert found == expected, ('Catalog IDs', found ^ expected)
    assert embedded and not clipped, ('Fonts/bounds', embedded, clipped)
    assert 'Rev C' in doc.metadata['title']
    assert '전산봉' in ''.join(p.get_text() for p in doc)
    report = dict(passed=True, revision='Rev C', pages=len(doc), first_page_part_ids=sorted(found),
                  bookmarks=len(toc), clipped_text_spans=clipped, fonts_embedded=embedded,
                  pdf_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                  integration_base_commit='83ade39d35a54d3a644a2fec932033650a53e135')
    (OUT / 'pdf_checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'PASS: {len(doc)} pages, {len(found)} catalog IDs, embedded fonts, no clipped spans')


if __name__ == '__main__':
    main()
