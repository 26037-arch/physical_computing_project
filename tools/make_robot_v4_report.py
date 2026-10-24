"""Render the current Korean project report from its Markdown source; check PDF bounds."""
from pathlib import Path
from html import escape
import hashlib
import re
import fitz
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs'
SOURCE = DOC / 'REPORT.md'
TARGET = DOC / 'PROJECT_REPORT_V4_프로젝트보고서.pdf'


def inline(text):
    text = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'\1 (\2)', text)
    text = escape(text)
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    return text.replace('`', '')


def main():
    for name, file in [('Nanum', 'NanumGothic-Regular.ttf'), ('NanumBold', 'NanumGothic-Bold.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(DOC / 'assets/fonts' / file)))
    pdfmetrics.registerFontFamily('Nanum', normal='Nanum', bold='NanumBold')
    body = ParagraphStyle('body', fontName='Nanum', fontSize=9.5, leading=16,
                          wordWrap='CJK', alignment=TA_LEFT, spaceAfter=9)
    title = ParagraphStyle('title', parent=body, fontName='NanumBold', fontSize=22,
                           leading=32, spaceAfter=14, keepWithNext=True)
    heading = ParagraphStyle('heading', parent=body, fontName='NanumBold', fontSize=13,
                             leading=21, spaceBefore=15, spaceAfter=8, keepWithNext=True)
    cell = ParagraphStyle('cell', parent=body, fontSize=8.4, leading=13, spaceAfter=0)
    source = SOURCE.read_text(encoding='utf-8')
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    lines = source.splitlines()
    story = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('# '):
            story.append(Paragraph(inline(line[2:]), title))
            # Same CAD render as the fabrication manual, not a conceptual generated image.
            overview = DOC / 'images/v4_manual/overview.png'
            img = Image(str(overview))
            scale = min(170 * mm / img.imageWidth, 70 * mm / img.imageHeight)
            img.drawWidth = img.imageWidth * scale
            img.drawHeight = img.imageHeight * scale
            story.extend([img, Spacer(1, 5 * mm)])
        elif line.startswith('## '):
            story.append(Paragraph(inline(line[3:]), heading))
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [s.strip() for s in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', s) for s in cells):
                    rows.append([Paragraph(inline(s), cell) for s in cells])
                i += 1
            table = Table(rows, colWidths=[170 * mm / len(rows[0])] * len(rows[0]), repeatRows=1)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8eff6')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('GRID', (0, 0), (-1, -1), .35, colors.HexColor('#cbd5df')),
                ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
                ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.extend([table, Spacer(1, 3 * mm)])
            continue
        else:
            story.append(Paragraph(inline(line), body))
        i += 1

    def footer(canvas, doc):
        canvas.setStrokeColor(colors.HexColor('#346baf'))
        canvas.line(20 * mm, 18 * mm, 190 * mm, 18 * mm)
        canvas.setFont('Nanum', 8)
        canvas.drawString(20 * mm, 13 * mm, 'ROBOT V4 Rev D · 2026-10-24 · 설계·코드 검증 / 실물 시험 전')
        canvas.drawRightString(190 * mm, 13 * mm, str(doc.page))

    pdf = SimpleDocTemplate(str(TARGET), pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
                            topMargin=19 * mm, bottomMargin=24 * mm,
                            title='ROBOT V4 Rev D 프로젝트 보고서', author='김재혁·나준우',
                            subject='Source REPORT.md SHA256 ' + digest)
    pdf.build(story, onFirstPage=footer, onLaterPages=footer)
    report = fitz.open(TARGET)
    text = '\n'.join(page.get_text() for page in report)
    assert len(report) >= 5 and '14. 산출물과 재현 자료' in text
    for page in report:
        assert '\ufffd' not in page.get_text(), 'Replacement glyph in PDF'
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    box = fitz.Rect(span['bbox'])
                    assert box.x0 >= -1 and box.y0 >= -1 and box.x1 <= page.rect.width + 1 and box.y1 <= page.rect.height + 1, span['text']
        for font in page.get_fonts(full=True):
            if 'Nanum' in font[3]:
                assert report.extract_font(font[0])[3], 'Font must be embedded'
    print(f'PASS: report {len(report)} pages, embedded fonts, no clipped spans; source SHA256 {digest}')


if __name__ == '__main__':
    main()
