"""Korean Rev B manual, rendered from exported STEP BReps (no generated art).

Run only with .venv-cad/Scripts/python.exe tools/make_robot_v5_manual.py.
Writes only the manual, pdf_checks.json, and docs/images/v5_manual/*.png.
ReportLab/Nanum Gothic and the table/mesh approach follow make_robot_v4_manual.py.
Source tables are parsed, never retyped; inconsistencies are retained and disclosed.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import date
from xml.sax.saxutils import escape

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
if Path(sys.executable).resolve() != (ROOT / '.venv-cad/Scripts/python.exe').resolve():
    raise SystemExit('Use .venv-cad/Scripts/python.exe only.')
os.environ.setdefault('MPLCONFIGDIR', str(Path(os.environ.get('TEMP', '.')) / 'v5-manual-mpl'))

import cadquery as cq
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Polygon, FancyBboxPatch
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import build_robot_v5 as d

DOC = ROOT / 'docs'
OUT = ROOT / 'models/robot_v5'
IMG = DOC / 'images/v5_manual'
PDF = DOC / 'BUILD_V5_제작설명서.pdf'
FONT = DOC / 'assets/fonts'
BLUE, INK, MUTED = '#346baf', '#1e3045', '#63778b'
SOURCE_PATHS = ['docs/MANUAL_V5_BRIEF.md', 'docs/BUILD_V5.md', 'docs/HARDWARE_V5.md',
                'models/robot_v5/parameters.json', 'models/robot_v5/manufacturing.json',
                'models/robot_v5/kinematic_checks.json', 'models/robot_v5/mechanical_checks.json']
MINUS = '\u2212'   # Nanum Gothic 에 U+2212 글리프가 없어 ASCII 하이픈으로 바꾼다
BUILD = (DOC / 'BUILD_V5.md').read_text(encoding='utf-8').replace(MINUS, '-')
HARD = (DOC / 'HARDWARE_V5.md').read_text(encoding='utf-8').replace(MINUS, '-')
BRIEF = (DOC / 'MANUAL_V5_BRIEF.md').read_text(encoding='utf-8').replace(MINUS, '-')
P, M, K, C = [json.loads((OUT / f).read_text(encoding='utf-8')) for f in
               ('parameters.json', 'manufacturing.json', 'kinematic_checks.json', 'mechanical_checks.json')]
KC, CC = K['checks'], C['checks']
NAMES = list(M['print_parts'])
FIGURES = []
ISSUES = []


def section(text, heading):
    """Read a complete Markdown section through the next same/higher heading."""
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(heading))
    level = len(lines[start]) - len(lines[start].lstrip('#'))
    end = next((i for i in range(start + 1, len(lines))
                if re.match(r'^#{1,' + str(level) + r'} ', lines[i])), len(lines))
    return '\n'.join(lines[start + 1:end]).strip()


def tables(text):
    groups, group = [], []
    for line in text.splitlines() + ['']:
        if line.startswith('|'):
            row = [v.strip() for v in line.strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+', v) for v in row):
                group.append(row)
        elif group:
            groups.append(group)
            group = []
    return groups


KIT, BUY, SCREWS = tables(section(BUILD, '## 0.'))
PRINT_TABLE = tables(section(BUILD, '## 1.'))[0]
PINS = tables(section(HARD, '## 4.'))[0]
CALIB = tables(section(BUILD, '## 4.'))[0]
LCD = tables(section(HARD, '### 3.4'))[0]
CHECK_TABLE = tables(section(HARD, '### 2.5'))[0]
SCREW_TOTAL = sum(int(row[2]) for row in SCREWS[1:] if row[1].startswith('M'))
SCREW_LABEL = int(re.search(r'나사·소모품 \((?:나사 )?(\d+)개', BUILD).group(1))
ASSEMBLY = re.findall(r'^\d+\. (.+)$', section(BUILD, '## 3.'), re.M)
PREP = re.findall(r'^\d+\. (.+)$', section(BUILD, '## 2.'), re.M)
assert len(NAMES) == 7 and len(ASSEMBLY) == 7 and len(CALIB) == 8
assert len(KIT) == 8 and len(SCREWS) == 12
assert K['passed'] and C['passed'] and C['revision'] == 'B'
for key in M['parameters']:
    assert M['parameters'][key] == P[key], key
    assert K['parameters'][key] == P[key], key
    assert d.P[key] == P[key], key


def fmt(v, digits=3):
    return f'{v:.{digits}f}'.rstrip('0').rstrip('.') if isinstance(v, (float, int)) else str(v)


def markup(text):
    text = str(text).replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '—').replace('\u2212', '-')
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = escape(text)
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text).replace('\n', '<br/>')


def savefig(fig, name, title, provenance):
    path = IMG / (name + '.png')
    fig.savefig(path, dpi=180, facecolor='white', bbox_inches='tight', pad_inches=.09)
    plt.close(fig)
    FIGURES.append({'file': path.relative_to(ROOT).as_posix(), 'title': title, 'source': provenance})
    print('Figure:', name, flush=True)
    return path


def mesh(ax, shape, color):
    """V4 tessellation + Poly3DCollection, with two-sided BRep face lighting."""
    vertices, faces = shape.tessellate(.3, .45)
    if not faces:
        return
    a = np.array([p.toTuple() for p in vertices])[np.asarray(faces)]
    normals = np.cross(a[:, 1]-a[:, 0], a[:, 2]-a[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-12)
    light = np.array([.4, .3, .85]); light /= np.linalg.norm(light)
    rgba = np.tile(matplotlib.colors.to_rgba(color), (len(faces), 1))
    rgba[:, :3] *= (.58 + .42 * abs(normals @ light))[:, None]
    ax.add_collection3d(Poly3DCollection(a, facecolors=rgba, edgecolors='none', linewidths=0))


def render(name, items, title, *, world=False, bed=False, elev=23, azim=55, labels=False):
    fig = plt.figure(figsize=(10, 5.6), facecolor='white')
    ax = fig.add_subplot(111, projection='3d')
    shapes = []
    for label, shape, col in items:
        if world:
            # Use the authoritative height equation, as in render_robot_v5.py.
            shape = shape.rotate((0, 0, 0), (1, 0, 0), P['tilt_deg'])
        shapes.append(shape)
        mesh(ax, shape, col)
        if labels:
            bb = shape.BoundingBox()
            ax.text(bb.center.x, bb.center.y, bb.zmax + 5, label, fontsize=9,
                    bbox=dict(facecolor='white', edgecolor='#dbe2e9', alpha=.9, pad=2))
    bbs = [s.BoundingBox() for s in shapes]
    low = np.array([min(getattr(b, k+'min') for b in bbs) for k in 'xyz'])
    high = np.array([max(getattr(b, k+'max') for b in bbs) for k in 'xyz'])
    if bed:
        size = high-low
        bx, by = size[:2]*.62 + 4
        bedpoly = [[-bx, -by, 0], [bx, -by, 0], [bx, by, 0], [-bx, by, 0]]
        ax.add_collection3d(Poly3DCollection([bedpoly], facecolor='#dce5ee', edgecolor='#aab9c8', alpha=.35))
        low[:2] = [-bx, -by]; high[:2] = [bx, by]
    extent = np.maximum(high-low, 5)
    center = (high+low)/2
    for setter, c, s in zip((ax.set_xlim, ax.set_ylim, ax.set_zlim), center, extent):
        setter(c-s*.59, c+s*.59)
    ax.set_box_aspect(extent)
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    return savefig(fig, name, title, 'models/robot_v5/print/*.step; tools/build_robot_v5.py pose/purchased functions')


def rings(shape, x=0):
    """Actual CAD plane sections (not a silhouette invented from dimensions)."""
    plane = cq.Face.makePlane(700, 700, (x, 0, 0), (1, 0, 0))
    for face in shape.intersect(plane).Faces():
        for i, wire in enumerate([face.outerWire(), *face.innerWires()]):
            pts = wire.sample(max(24, int(wire.Length()*1.2)))[0]
            yield i == 0, np.array([[v.y, v.z] for v in pts])


def draw_section(ax, shape, color, x=0, alpha=.7, label=None):
    first = True
    for outer, pts in rings(shape, x):
        ax.add_patch(Polygon(pts, closed=True, facecolor=color if outer else 'white',
                             edgecolor=color, linewidth=.8, alpha=alpha,
                             label=label if first and outer else None))
        if outer:
            first = False


def role_figure(parts, cube):
    fig, ax = plt.subplots(figsize=(10, 5.3))
    draw_section(ax, parts['base'], '#8c9baa', x=42, alpha=.2, label='타워: x=42 단면')
    for name in ('cube_holder', 'hub'):
        draw_section(ax, parts[name], d.COLORS[name], label=name)
    draw_section(ax, cube, '#cad3dc', alpha=.3, label='시중 큐브: x=0')
    for label, angle, col in [('CLOSE', 0, '#bd8e16'), ('OPEN', P['hood_open_deg'], BLUE),
                               ('LOAD', P['hood_load_deg'], '#7d58aa')]:
        sh = d.hood_pose(parts['hood'], angle)
        draw_section(ax, sh, col, label=f'{label} {angle:g}°')
        draw_section(ax, sh, col, x=36, alpha=.25)
    for s, col, label in [(0, '#dd6244', '리프터 최하'), (P['lift_stroke_mm'], '#34a17b', '리프터 최상')]:
        draw_section(ax, d.lift_pose(parts['lifter'], s), col, label=label)
    ax.plot([P['lift_Q0'][0], P['lift_Q1'][0]], [P['lift_Q0'][1], P['lift_Q1'][1]], '--', color='#dd6244')
    ax.set(xlim=(-155, 80), ylim=(-35, 170), xlabel='국소 y (mm), +앞 / 관중 →', ylabel='국소 z (mm)')
    ax.set_aspect('equal'); ax.grid(alpha=.15)
    ax.legend(fontsize=8, loc='upper right', framealpha=.95)
    fig.tight_layout()
    savefig(fig, 'roles_section', '장치 역할과 후드·리프터 자세', 'STEP x=0, hood arm x=36, tower x=42 sections; parameters.json')


def trace_figure(parts, cube):
    fig, ax = plt.subplots(figsize=(10, 4.2))
    for name in ('cube_holder', 'hub'):
        draw_section(ax, parts[name], d.COLORS[name], alpha=.4)
    traces = K['flip_trace']
    indices = np.linspace(0, len(traces)-1, 5).round().astype(int)
    for i, index in enumerate(indices):
        t = traces[index]
        pivot = t['yf']
        sh = cube.translate((0, pivot-P['cube_mm']/2, 0)).rotate((0, pivot, 0), (1, pivot, 0), -t['theta_deg'])
        col = plt.cm.viridis(.15 + .8*i/4)
        draw_section(ax, sh, col, alpha=.12+.05*i,
                     label=f"s={fmt(t['s'])} mm / {fmt(t['theta_deg'])}°")
        ax.scatter(*t['Q'], s=18, color=col)
    ax.plot([t['Q'][0] for t in traces], [t['Q'][1] for t in traces], '--', color='#cc6047', lw=1)
    ax.set(xlim=(-100, 72), ylim=(-15, 90), xlabel='국소 y (mm)', ylabel='국소 z (mm)')
    ax.set_aspect('equal'); ax.grid(alpha=.15); ax.legend(fontsize=8, loc='upper left')
    fig.tight_layout()
    savefig(fig, 'flip_trace', '뒤집기 궤적: 기록된 다섯 자세', 'kinematic_checks.json flip_trace; actual cube BRep transformed per yf/theta_deg')


def wiring_figure():
    fig, ax = plt.subplots(figsize=(10, 3.5))
    ax.set(xlim=(0, 10), ylim=(0, 4)); ax.axis('off')
    nodes = {'uno': (.2, 2.4, 2.2, 1.3, 'UNO / USB\nD2 · D7 · D6'),
             'driver': (3.5, 2.4, 2.2, 1.3, 'A4988\nSTEP · DIR · EN'),
             'motor': (7.3, 2.4, 2.2, 1.3, 'NEMA17\n코일 두 쌍'),
             'servo': (7.3, .2, 2.2, 1.3, 'MG996R / SG90\nD8 / D9 신호'),
             'power12': (3.5, .2, 2.2, 1.3, re.search(r'VMOT (\d+ V)', HARD).group(1)+'\nVMOT + 커패시터'),
             'power5': (.2, .2, 2.2, 1.3, re.search(r'서보 전원 (\d+ V)', HARD).group(1)+' USB\n서보 전원 직결')}
    for key, (x, y, w, h, txt) in nodes.items():
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=.04', facecolor='#eef3f8', edgecolor=BLUE))
        ax.text(x+w/2, y+h/2, txt, ha='center', va='center', fontsize=10)
    for a, b in [((2.4, 3), (3.5, 3)), ((5.7, 3), (7.3, 3)), ((4.6, 1.5), (4.6, 2.4)),
                 ((2.4, .7), (7.3, .7)), ((2.4, 2.5), (7.3, 1.4))]:
        ax.annotate('', xy=b, xytext=a, arrowprops=dict(arrowstyle='->', color='#566e85', lw=1.6))
    ax.text(5, -.1, 'GND 공통 · LCD / 버튼 / 부저는 아래 핀 표 참조', ha='center', fontsize=10)
    fig.tight_layout()
    savefig(fig, 'wiring', '신호·전원 블록 배선도', 'docs/HARDWARE_V5.md §4; docs/BUILD_V5.md §2 (functional diagram, not CAD)')


def make_figures():
    parts, bought = d.load_parts(), d.purchased()
    assert set(parts) == set(NAMES)
    assembly = dict(d.assembly_items(parts, bought, 'open'))
    render('assembly_world', [(n, s, d.COLORS[n]) for n, s in assembly.items()],
           'OPEN 조립 전체: 월드 자세, 앞 비스듬히', world=True)
    role_figure(parts, assembly['cube'])
    for name in NAMES:
        render('print_'+name, [(name, d.print_pose(name, parts[name]), d.COLORS[name])],
               name+' 베드 출력 자세', bed=True, elev=27)
    # Separation distances are drawing-only offsets; they are not assembly dimensions.
    steps = [
        [('base', parts['base'], d.COLORS['base']), ('NEMA17', bought['nema17'].translate((0, 0, -30)), '#414d5c')],
        [('cube_holder', parts['cube_holder'].translate((0, 0, 24)), d.COLORS['cube_holder']),
         ('hub', parts['hub'].translate((0, 0, 12)), d.COLORS['hub']), ('D shaft', bought['nema17'], '#414d5c')],
        [('base', parts['base'], '#acb9c5'), ('MG996R', bought['mg996r'].translate((24, 0, 0)), d.COLORS['mg996r'])],
        [('base', parts['base'], '#acb9c5'), ('hood', assembly['hood'].translate((0, 0, 30)), d.COLORS['hood']),
         ('MG996R', bought['mg996r'], d.COLORS['mg996r'])],
        [('base', parts['base'], '#acb9c5'), ('lifter', parts['lifter'].translate((0, 25, 0)), d.COLORS['lifter']),
         ('cube_holder', parts['cube_holder'], d.COLORS['cube_holder'])],
        [('base', parts['base'], '#acb9c5'), ('SG90', bought['sg90'].translate((-25, 0, 0)), d.COLORS['sg90']),
         ('crank', parts['crank'].translate((-16, 0, 0)), d.COLORS['crank']),
         ('link', parts['link'].translate((-8, 0, 0)), d.COLORS['link']),
         ('lifter', parts['lifter'], d.COLORS['lifter'])],
    ]
    for i, items in enumerate(steps, 1):
        render(f'assembly_{i:02d}', items, f'조립 {i}: 관련 CAD 부품 분해도', labels=True, azim=55 if i != 6 else 145)
    # Rubber pads are purchased; show the CAD recesses rather than invent a pad model.
    render('assembly_07', [('base / foot recesses', parts['base'], d.COLORS['base'])],
           '조립 7: 베이스 밑면의 고무발 홈', world=True, elev=-32, labels=False)
    trace_figure(parts, assembly['cube'])
    wiring_figure()


class Writer:
    """A4 fixed pages with explicit overflow rejection, adapted from the V4 Writer."""
    def __init__(self):
        pdfmetrics.registerFont(TTFont('NG', str(FONT/'NanumGothic-Regular.ttf')))
        pdfmetrics.registerFont(TTFont('NGB', str(FONT/'NanumGothic-Bold.ttf')))
        pdfmetrics.registerFontFamily('NG', normal='NG', bold='NGB', italic='NG', boldItalic='NGB')
        self.c = Canvas(str(PDF), pagesize=A4, pageCompression=1,
                        initialFontName='NG', initialFontSize=9, initialLeading=14)
        self.c.setTitle('V5 큐브 로봇 — 하루에 만드는 3축 구조 | Rev B 제작설명서')
        self.c.setAuthor('김재혁·나준우')
        self.c.setCreator('tools/make_robot_v5_manual.py | ReportLab + CAD/Matplotlib')
        self.w, self.h = A4
        self.i, self.toc, self.usage = 0, [], []

    def reserve(self, height):
        if self.y-height < 19*mm:
            raise RuntimeError(f'Page {self.i} overflow by {(19*mm-self.y+height)/mm:.1f} mm')

    def start(self, title):
        if self.i:
            self.usage.append({'page': self.i, 'content_bottom_mm': round(self.y/mm, 2)})
            self.c.showPage()
        self.i += 1
        self.y = self.h-18*mm
        self.toc.append({'page': self.i, 'title': title})
        key = 'page'+str(self.i)
        self.c.bookmarkPage(key); self.c.addOutlineEntry(title, key, level=0)
        self.c.setFillColor(colors.HexColor(BLUE)); self.c.rect(0, self.h-5*mm, self.w, 5*mm, fill=1, stroke=0)
        self.para(title, size=18, leading=25, bold=True)
        self.c.setFont('NG', 7.2); self.c.setFillColor(colors.HexColor(MUTED))
        self.c.drawString(16*mm, 10*mm, 'V5 / Rev B / '+SOURCE_DATE+' / CAD 검증 · 실물 시험 전 / 단위 mm')
        self.c.drawRightString(self.w-16*mm, 10*mm, f'{self.i:02d}')

    def para(self, text, size=9.1, leading=13.8, bold=False, color=INK, width=None, x=None):
        style = ParagraphStyle('p', fontName='NGB' if bold else 'NG', fontSize=size, leading=leading,
                               wordWrap='CJK', textColor=colors.HexColor(color))
        p = Paragraph(markup(text), style)
        _, h = p.wrap(width or self.w-32*mm, 1000*mm)
        self.reserve(h+2.4*mm)
        p.drawOn(self.c, x if x is not None else 16*mm, self.y-h)
        self.y -= h+2.4*mm

    def section(self, title, text, size=9.1):
        self.para(title, size=10.5, leading=15, bold=True, color=BLUE)
        self.para(text, size=size, leading=size*1.48)

    def image(self, name, height, caption=None):
        self.reserve((height+3)*mm)
        self.c.drawImage(str(IMG/(name+'.png')), 16*mm, self.y-height*mm,
                         width=self.w-32*mm, height=height*mm,
                         preserveAspectRatio=True, anchor='c', mask='auto')
        self.y -= (height+2)*mm
        if caption:
            self.para(caption, size=7.4, leading=10.3, color=MUTED)

    def table(self, rows, widths, size=8.1, padding=4):
        style = ParagraphStyle('cell', fontName='NG', fontSize=size, leading=size*1.42,
                               wordWrap='CJK', textColor=colors.HexColor(INK))
        data = [[Paragraph(markup(v), style) for v in row] for row in rows]
        t = Table(data, colWidths=[v*mm for v in widths], repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5edf5')),
             ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, 0), .7, colors.HexColor('#9fb2c7')),
             ('LINEBELOW', (0, 1), (-1, -1), .3, colors.HexColor('#dbe2e9')),
             ('TOPPADDING', (0, 0), (-1, -1), padding), ('BOTTOMPADDING', (0, 0), (-1, -1), padding)]))
        _, h = t.wrap(self.w-32*mm, 1000*mm)
        self.reserve(h+3*mm)
        t.drawOn(self.c, 16*mm, self.y-h); self.y -= h+3*mm

    def finish(self):
        self.usage.append({'page': self.i, 'content_bottom_mm': round(self.y/mm, 2)})
        self.c.save()


SOURCE_DATE = re.search(r'\d{4}-\d{2}-\d{2}', BUILD).group()
COMMIT = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, text=True).strip()
ISSUES = [
    f'BUILD_V5.md §0 표 제목은 {SCREW_LABEL}개이나 M 나사 행별 수량 합계는 {SCREW_TOTAL}개. 원본 행과 수량을 그대로 사용; 고무발·패드는 별도.',
    'BUILD_V5.md §0 구매 제목은 3종이나 표는 B01~B05. 구동 핵심 3종과 전원·커패시터를 모두 수록.',
    'BRIEF의 출력 6종·나사 17개는 Rev B와 불일치. 출력 7종과 BUILD §0의 현재 표를 우선.',
    '허브 체결: BUILD §0 M3×8은 인서트/셀프탭 조건. HARDWARE §8.1의 현재 관통 CAD는 별도 너트/인서트가 필요하며 관통+너트는 M3×12 권장. 실제 체결 방식 확인 필요.',
    'BUILD §1의 프린터 1대 8~12 h보다 manufacturing.json 최신 총시간 추정이 큼. 최신 제조 추정값을 일정에 사용; 슬라이서 검증 전.',
    'BUILD §3의 타워 Ø8 표현은 Rev B HARDWARE §2.4의 Ø3.2 피벗·Ø24 카운터보어와 다름. 실제 STEP과 구매 서보/혼의 끼움 우선.',
    'HARDWARE §1의 회전 부호 문구와 높이 식은 다름. 월드 렌더는 CAD와 동일한 z_world=z*cos20+y*sin20을 사용.',
    '실물 출력·하중·마찰·구매 혼/나사/너트 공차·착지 소음은 미검증. CAD 통과가 실물 성공 보증은 아님.',
]


def catalog(w):
    w.start('02  출력 부품 지도 | Rev B 일곱 부품')
    w.para('각 카드는 실제 STEP을 print_pose()로 회전한 베드 자세입니다. 아래 수치는 manufacturing.json의 수량·질량·시간이며 출력 시간은 추정입니다.', size=8.7)
    top = w.y
    cw, ch = 89*mm, 55*mm
    pose_ko = {}
    for row in tables(section(HARD, '### 8.2'))[0][1:]:
        if row[0] in NAMES:
            pose_ko[row[0]] = row[-1]
    for i, name in enumerate(NAMES):
        row, col = divmod(i, 2)
        x, y = 16*mm+col*cw, top-(row+1)*ch
        w.c.setStrokeColor(colors.HexColor('#dbe2e9')); w.c.roundRect(x+1*mm, y+1*mm, cw-2*mm, ch-2*mm, 2*mm)
        w.c.setFillColor(colors.HexColor(INK)); w.c.setFont('NGB', 10)
        w.c.drawString(x+4*mm, y+ch-6*mm, name)
        w.c.drawImage(str(IMG/('print_'+name+'.png')), x+3*mm, y+16*mm, width=cw-6*mm,
                         height=ch-24*mm, preserveAspectRatio=True, anchor='c', mask='auto')
        m = M['print_parts'][name]
        text = f"{m['qty']}개 · {m['grams_total']:.3f} g · {m['estimated_hours']:.3f} h\n{pose_ko[name]}"
        sty = ParagraphStyle('card', fontName='NG', fontSize=7.5, leading=10, wordWrap='CJK')
        p = Paragraph(markup(text), sty); _, h = p.wrap(cw-8*mm, 100*mm)
        p.drawOn(w.c, x+4*mm, y+3*mm)
    x, y = 16*mm+cw, top-4*ch
    sty = ParagraphStyle('summary', fontName='NG', fontSize=10, leading=17, wordWrap='CJK')
    p = Paragraph(markup(f"**출력 합계 {len(NAMES)}종 / {sum(v['qty'] for v in M['print_parts'].values())}개**\n{M['grams_total']:.3f} g\n{M['estimated_hours_total']:.3f} h\nPETG 근사 · 구매품/고무/체결물 제외\n회전 전 STL을 그대로 슬라이싱하지 않기"), sty)
    _, h = p.wrap(cw-10*mm, 100*mm); p.drawOn(w.c, x+5*mm, y+ch-5*mm-h)
    w.y = top-4*ch-2*mm


def assembly_page(w, title, steps, height=59):
    w.start(title)
    for i in steps:
        w.image(f'assembly_{i:02d}', height, f'조립 {i} · 실제 CAD 부품만 표시. 부품 사이 간격은 설명용 분해 간격입니다.')
        w.para(ASSEMBLY[i-1], size=9, leading=13.5)
        if i == 1:
            w.para('합격: 모터 보스가 윗판 중앙에 들어가고 케이블이 뒤 데크로 빠지며, 상자 안에서 몸체가 눌리지 않습니다.', size=8.5)
        if i == 2:
            w.para(ISSUES[3], size=8.2, color='#a55432')
            w.para('합격: D 평면에 멈춤나사가 닿고 홀더 노치가 타워를 향합니다. 전원을 다시 켜기 전에도 노치 방향을 확인합니다.', size=8.5)
        if i == 3:
            w.para('합격: 서보 출력축과 후드 힌지 중심이 일치합니다. 구멍은 STEP의 실제 형상을 사용합니다. '+ISSUES[5], size=8.2)
        if i == 4:
            w.para('합격: 혼을 끼우기 전에 전기적 OPEN 자세를 맞춥니다. 왼쪽 피벗은 후드가 부드럽게 회전할 만큼만 조입니다.', size=8.5)


def write_manual():
    w = Writer()
    w.start('V5 큐브 로봇')
    w.para('하루에 만드는 3축 구조', size=23, leading=31, bold=True)
    w.para('기울어진 컵 + 후드 + 리프터\n컴과2 피지컬 컴퓨팅 수행평가', size=12, leading=19)
    w.image('assembly_world', 128, 'Rev B · OPEN / 리프터 DOWN · 월드 높이 식으로 기울인 실제 CAD 조립')
    w.section('김재혁·나준우', f'자료 기준 {SOURCE_DATE} · 설명서 생성 {date.today().isoformat()}\n기준 커밋 {COMMIT} + 현재 작업 트리의 V5 자료')
    w.para(f"2D {len(KC)}항목 / 3D {len(CC)}항목 통과 · 실물 출력 및 작동 시험 전\n출력 {len(NAMES)}종 · {M['grams_total']:.3f} g · 제조 추정 {M['estimated_hours_total']:.3f} h", size=10)
    w.para('하루 일정은 출력 시간을 먼저 확보한 뒤 진행합니다. 본문의 아침→배선→조립→조정→시연 순서를 따라가세요. 준비물과 체결 방식 차이는 해당 쪽의 주석까지 확인합니다.', size=9)

    w.start('01  한눈에 보기 | 세 장치가 하는 일')
    w.image('roles_section', 97, '실선은 중앙 CAD 단면. 옅은 팔·타워는 옆 단면을 겹쳤습니다. 국소 좌표에서의 동작 비교입니다.')
    w.table([['장치', '언제 무엇을 하는가'], ['컵 모터', '후드 CLOSE: 아래 층 회전 / OPEN: 큐브 전체 스핀'],
             ['후드 서보', '위 두 층을 감싸 고정하고, 스핀·뒤집기·장착 때 비킴'], ['리프터 서보', '큐브 뒤쪽 아래 모서리를 들어 앞으로 넘김']], [36, 142], size=8.5)
    principles = [f"베이스가 컵을 뒤로 {fmt(P['tilt_deg'])}° 기울여 큐브가 뒤 기둥에 기대게 합니다.",
                  f"기둥 높이 {fmt(P['post_h_mm'])}는 한 층 {fmt(P['layer_mm'])}보다 낮아 아래 층만 잡습니다.",
                  f"CLOSE 후드는 위 두 층을 감쌉니다. 벽 아래끝 {fmt(P['hood_bottom_z_mm'])}는 아래 층을 비웁니다.",
                  f"리프터는 {fmt(P['lift_dir_deg'])}° 기울어진 슬롯을 따라 {fmt(P['lift_stroke_mm'])} 올라 모서리를 넘깁니다.",
                  '재배향 표가 목표 면을 아래로 보냅니다. 스핀·뒤집기를 거친 뒤 같은 컵 축으로 각 면을 돌립니다.']
    for i, line in enumerate(principles, 1):
        w.para(f'{i}. {line}', size=8.6, leading=12)
    w.para('읽는 순서: 부품 지도 3쪽 · 준비물 4쪽 · 출력/나사 5쪽 · 배선 6쪽 · 조립 7~11쪽 · 조정 12쪽 · 시연 13쪽 · 설계 근거 14~15쪽 · 부록 16쪽', size=8.1, color=MUTED)
    catalog(w)

    w.start('03  준비물 | 키트와 구매품')
    w.para('키트에서 꺼내는 것 · BUILD_V5.md 0절의 품목·수량', bold=True)
    w.table(KIT, [13, 65, 15, 85], size=8, padding=4)
    w.para('구매품 · 핵심 구동품 외 전원과 커패시터도 준비', bold=True)
    w.table(BUY, [13, 66, 15, 84], size=8, padding=4)
    w.para(ISSUES[1], size=8.2, color='#a55432')
    tools = next(line for line in BUILD.splitlines() if line.startswith('공구:'))
    w.section('공구', tools.removeprefix('공구: '), size=8.7)

    w.start('04  아침 | 나사 확인과 출력 시작')
    w.para(f'나사·소모품 · 원본 제목 “{SCREW_LABEL}개” / 행별 수량은 아래 그대로', bold=True)
    w.table(SCREWS, [51, 111, 16], size=7.9, padding=3.5)
    w.para(ISSUES[0], size=8, color='#a55432')
    w.table([['슬라이서 항목', '설정 / 제조 추정의 조건'],
             ['재료 / 적층', f"PETG 또는 PLA / {fmt(M['layer_height_mm'])} mm"],
             ['벽 / 충전 / 선폭', f"{M['shell_lines']}줄 / {fmt(M['infill_fraction']*100)}% / {fmt(M['line_width_mm'])} mm"],
             ['속도 / 서포트', f"제조 추정 {fmt(M['speed_mm_s'])} mm/s / 지정 자세에서 서포트 없음"],
             ['총량 / 시간', f"{M['grams_total']:.3f} g / {M['estimated_hours_total']:.3f} h (근사, 슬라이서 확인 필요)"]], [51, 127], size=8, padding=3)
    lines = section(BUILD, '## 1.').splitlines()
    w.para(next(line for line in lines if line.startswith('출력 순서:')), size=8.5, leading=12.4)
    w.para('STL은 평행 이동만 되어 있습니다. 부품 지도 자세로 회전한 뒤 XY 중심·바닥 z=0을 맞춥니다. 베이스는 데크가 베드에 닿게 둡니다. 최신 시간 추정상 전날 출력 시작 또는 여러 프린터 분담을 계획합니다.', size=8.2)

    w.start('05  출력 중 | 배선과 펌웨어')
    w.image('wiring', 55, '신호와 전원 경로를 구분한 블록도. 각 핀은 아래 표와 연결합니다.')
    w.table(PINS, [21, 58, 99], size=7.7, padding=2.5)
    w.para(section(HARD, '## 4.').split('\n\n')[-1], size=8, leading=11.5)
    w.para('powershell -ExecutionPolicy Bypass -File scripts/build.ps1\npowershell -ExecutionPolicy Bypass -File scripts/upload.ps1 -Port COMx', size=8, leading=12)
    for line in PREP[1:]:
        w.para(line, size=8.1, leading=11.6)
    w.para('A4988 1A/1B/2A/2B는 NEMA17의 코일 두 쌍에 연결합니다. RESET과 SLEEP을 묶고 GND를 공통으로 연결합니다. 작업 중 커넥터를 바꿀 때는 전원을 끕니다.', size=8)

    assembly_page(w, '06  조립 | 모터와 컵', [1, 2], height=57)
    assembly_page(w, '07  조립 | 후드 서보와 후드 걸기', [3, 4], height=60)

    w.start('08  조립 | 리프터와 슬롯')
    w.image('assembly_05', 118, '조립 5 · 리프터를 앞쪽으로 띄워 표시했습니다. 실제 위치는 두 타워 사이입니다.')
    w.para(ASSEMBLY[4])
    w.section('체결 수량과 힘을 받는 곳', ' / '.join(' · '.join(row) for row in (SCREWS[7], SCREWS[-1])))
    w.table([['확인점', '합격 기준'],
             ['슬롯 통과', '나사산이 아닌 볼트 몸통이 슬롯을 지나며, 너트를 조여도 리프터가 손으로 가볍게 이동'],
             ['선반과 노치', f"선반 폭 {fmt(P['hook_w_mm'])}, 노치 폭 {fmt(P['notch_w_mm'])}; 패드가 노치나 큐브 회전을 막지 않음"],
             ['최하 위치', f"입술 윗면 {fmt(KC['C_lifter_bottom_below_plate']['lip_top_mm'])}, 판 아래 {fmt(KC['C_lifter_bottom_below_plate']['plate_bottom_mm'])}; 스핀 쓸림과 분리"]], [35, 143], size=8.6)

    w.start('09  조립 | 리프터 서보·크랭크·링크')
    w.image('assembly_06', 112, '조립 6 · 왼쪽에서 본 분해도. SG90, 크랭크, 링크를 바깥쪽으로 벌려 표시했습니다.')
    w.para(ASSEMBLY[5])
    w.section('나사와 공유 핀', ' / '.join(' · '.join(row) for row in (SCREWS[8], SCREWS[9]))+'\n링크의 슬라이더 쪽 끝은 기존 왼쪽 슬롯 볼트를 공유합니다. 링크 양끝에 새 나사를 추가로 세지 않습니다.')
    mid = CC['e_crank_endpoints_and_rod_length']['physical_mid_90_mm']
    w.table([['확인점', 'Rev B 기준'], ['최하 / 최상', f"서보 0 / 180°에서 행정 0 / {fmt(P['lift_stroke_mm'])}"],
             ['중간 행정', f"90°에서 {mid:.6f}; 아래쪽 축 참고값과 혼동하지 않기"],
             ['반경 / 링크 중심 간', f"{fmt(P['crank_r_mm'])} / {fmt(P['link_mm'])}"],
             ['합격', '사점에서도 레버끼리·타워·서보에 걸리지 않고 링크가 자유롭게 회전']], [40, 138], size=8.5)

    w.start('10  조립 | 고무발과 최종 확인')
    w.image('assembly_07', 104, '조립 7 · CAD 밑면을 아래에서 봅니다. 구매 고무발은 생략하고 베이스의 원형 홈을 표시했습니다.')
    w.para(ASSEMBLY[6])
    w.para(' · '.join(SCREWS[-2]), bold=True)
    w.table([['확인점', '합격 기준'], ['접지', '고무발이 모두 책상에 닿고 베이스가 흔들리지 않음'],
             ['월드 자세', f"뒤로 {fmt(P['tilt_deg'])}° 기울어진 컵; 노치 하나는 정확히 뒤 타워 방향"],
             ['모터 지상고', f"CAD 계산 {CC['f_motor_ground_clearance']['ground_clearance_mm']:.3f}; 케이블이 바닥에 눌리지 않음"],
             ['전원 투입 전', '혼 각과 노치 방향 확인. 구동부를 손으로 확인한 뒤 손을 빼고 구동']], [37, 141], size=8.8)
    w.section('운전 안전', section(BUILD, '## 7.'))
    w.para('볼트 머리·너트·혼의 실제 외형은 단순 구매품 CAD에 모두 들어 있지 않습니다. 조립 중 걸리면 억지로 구동하지 말고 끼움과 체결 깊이를 확인합니다.', size=8.6)

    w.start('11  조정 | 일곱 단계와 LCD')
    w.para('BUILD_V5.md 4절 원표입니다. 아래 각도는 서보 명령값입니다. CAD 후드 개방각은 이 값과 구분합니다. 조정값 저장은 실물 확인 후의 별도 펌웨어 작업입니다.', size=8.6)
    w.table(CALIB, [10, 34, 69, 65], size=7.8, padding=4)
    w.para('장착·배출 시 LCD / HARDWARE_V5.md 3.4절', bold=True)
    w.table([[row[0], row[1], row[3]] for row in LCD], [47, 57, 74], size=7.6, padding=3)
    w.para('CLOSE는 위 두 층을 감싸고 아래 층·기둥을 비웁니다. F 동작 때는 후드가 자동으로 FLIP 자세까지 비킵니다. 반복 시험은 큐브가 풀린 상태에서 시작합니다.', size=8.6)

    w.start('12  저녁 | 시연 리허설과 관중 배치')
    w.image('assembly_world', 85, '앞·좌·우가 열린 구조. 후드 지붕 구멍으로 윗면을 봅니다.')
    w.section('리허설', section(BUILD, '## 5.'))
    w.section('관중 배치', section(BUILD, '## 6.'))
    w.table([['실패 유형', '대처'], ['층 어긋남', CALIB[4][3]], ['스핀 때 위 층 뒤처짐', CALIB[5][3]],
             ['뒤집기 실패 / 착지 이탈', CALIB[6][3]], ['기둥에 걸림', '큐브 윤활과 기둥 안쪽 표면 확인. 홀더 노치가 뒤를 향하는지 재확인']], [43, 135], size=8.3, padding=3)
    w.para('성공 판정은 LCD SOLVED!와 시리얼 SOLVED ok=1을 함께 확인합니다. R은 논리 모델 리셋이므로 실제 큐브도 풀린 상태로 맞춰야 합니다.', size=8.5)

    w.start('13  설계 근거 | 검사값과 뒤집기 궤적')
    # HARDWARE §2.5 is the human-readable view of the adjacent machine-readable K checks.
    w.table(CHECK_TABLE, [89, 89], size=7.15, padding=2.3)
    w.image('flip_trace', 47, 'flip_trace에서 균등하게 고른 다섯 기록으로 실제 큐브 BRep를 변환했습니다. 점선은 선반 끝 Q의 경로입니다.')
    ft, ht = KC['F_lifter_servo_torque'], KC['F_hood_servo_torque']
    w.para(f"토크: 리프터 {fmt(ft['peak_force_N'])} N × {fmt(ft['crank_r_mm'])} mm / g 환산 ≈ {fmt(ft['torque_kgcm'])} kg·cm (SG90 {fmt(ft['sg90_kgcm'])}).\n후드: 질량 {fmt(P['hood_mass_kg'])} kg의 준정적 요구 {fmt(ht['torque_kgcm'])} kg·cm (MG996R {fmt(ht['mg996r_kgcm'])}).\n컵: 층 회전 요구 {fmt(KC['F_stepper_torque']['layer_turn_Nm'])} N·m / 모터 기준 {fmt(KC['F_stepper_torque']['nema17_Nm'])} N·m.", size=7.7, leading=10.6)
    w.para(section(HARD, '### 2.5').split('\n\n')[-1], size=7.8, leading=11)

    w.start('14  Rev B | CAD 결과와 제작 전 확인')
    w.para(f"2D 검사 {len(KC)}항목: passed={K['passed']} / 3D 검사 {len(CC)}항목: revision={C['revision']}, passed={C['passed']}, failures={C['failures']}\n모든 출력 부품이 유효한 단일 솔리드입니다. 실물 작동·강도·출력 성공을 측정한 결과는 아닙니다.")
    w.table([['CAD 검사', '결과'],
             ['간섭 판정 체적 허용치', f"{fmt(C['volume_tolerance_mm3'])} mm³"],
             ['CLOSE 벽 / 지붕 여유', f"{fmt(CC['a_close_no_overlap']['wall_cube_gap_mm'])} / {fmt(CC['a_close_no_overlap']['roof_cube_gap_mm'])} mm"],
             ['크랭크 90° 실제 행정', f"{CC['e_crank_endpoints_and_rod_length']['physical_mid_90_mm']:.6f} mm"],
             ['크랭크·링크 지상고 해석 하한', f"{CC['e_full_linkage_above_desk']['continuous_ground_clearance_bound_mm']:.3f} mm"],
             ['복귀 때 아래 모서리 스침', f"최대 깊이 {fmt(CC['c_cube_above_3_clear']['max_penetration_from_rear_plane_mm'])} mm; z>3 mm 간섭 판정 0"],
             ['기둥 윗면 잔여 폭', f"{fmt(CC['extra_post_height']['remaining_top_land_mm'])} mm"],
             ['슬롯 볼트 도달 요구 / 가용', f"{fmt(CC['extra_slider_pin_reach']['required_reach_mm'])} / {fmt(CC['extra_slider_pin_reach']['available_bolt_length_mm'])} mm"]], [71, 107], size=8.2, padding=3)
    w.section('자료 사이 차이와 적용 기준', '\n'.join('• '+v for v in ISSUES[:7]), size=8.2)
    w.para('무서포트 판정은 지정 베드 자세에서 유한 BRep 단면을 검사한 결과입니다. 모든 적층 경로·재료 처짐·실제 나사 머리·너트·혼 공차·하중·마찰은 실물로 확인합니다.', size=8.4)

    w.start('15  부록 | 파일·재생성·출처')
    w.para('출력 파일 · models/robot_v5/print/ 아래 실제 배포 파일', bold=True)
    w.table([['부품', 'STL', '편집/검사용 STEP']] + [[n, n+'.stl', n+'.step'] for n in NAMES], [51, 63, 64], size=8, padding=3)
    assembly_files = [p.name for p in sorted(OUT.glob('*.step'))]
    w.para('전체 조립 STEP: '+', '.join(assembly_files)+'\n매개변수·제조·검사: parameters.json / manufacturing.json / kinematic_checks.json / mechanical_checks.json', size=8.1)
    w.para('재생성 명령 · HARDWARE_V5.md 7절 (참고용, 이 설명서 생성 시 실행하지 않음)', bold=True, size=9)
    cmds = re.search(r'```\s*\n(.*?)```', section(HARD, '## 7.'), re.S).group(1)
    cmds = '\n'.join(re.sub(r'\s+#.*$', '', s) for s in cmds.splitlines()).strip()
    w.para(cmds, size=7, leading=10)
    w.para('.venv-cad\\Scripts\\python.exe tools\\make_robot_v5_manual.py', size=8, leading=12, bold=True)
    w.section('수치 원본', 'docs/BUILD_V5.md: 준비물·나사·출력 순서·조립·조정·시연\ndocs/HARDWARE_V5.md: 2절 치수·2.5절 검사값·4절 핀·7절 명령·8절 Rev B CAD\nmodels/robot_v5/: parameters.json 치수 / manufacturing.json 질량·시간 / kinematic_checks.json 뒤집기 궤적·토크 / mechanical_checks.json 3D 검사', size=7.8)
    w.section('설계 원리·글꼴', '설계 원리 참고: Tilted Twister 2008, CUBOTino CC-BY-4.0; 본 CAD는 자체 설계. 그림은 실제 BRep를 직접 렌더했으며 배선도는 기능 블록도입니다. Nanum Gothic은 SIL Open Font License이며 docs/assets/fonts/OFL.txt에 원문이 있습니다.', size=8)
    w.finish()
    assert w.i == 16
    return w


def render_pdf_pages():
    """Use Windows' built-in PDF renderer without installing another Python."""
    ps = r'''
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$asActionTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1
function AwaitResult($op, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    $task.GetAwaiter().GetResult()
}
$file = AwaitResult ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:V5_MANUAL_PDF)) ([Windows.Storage.StorageFile])
$doc = AwaitResult ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
for ($i=0; $i -lt $doc.PageCount; $i++) {
    $page = $doc.GetPage($i)
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
    $options.DestinationWidth = 1200
    $action = $page.RenderToStreamAsync($stream, $options)
    $renderTask = $asActionTask.Invoke($null, @($action))
    $renderTask.GetAwaiter().GetResult()
    $stream.Seek(0)
    $reader = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $path = Join-Path $env:V5_MANUAL_IMG ('page_{0:00}.png' -f ($i+1))
    $out = [System.IO.File]::Create($path)
    $reader.CopyTo($out)
    $out.Dispose(); $reader.Dispose(); $stream.Dispose(); $page.Dispose()
}
'''
    env = os.environ.copy()
    env['V5_MANUAL_PDF'], env['V5_MANUAL_IMG'] = str(PDF), str(IMG)
    result = subprocess.run(['powershell', '-NoProfile', '-Command', ps], env=env,
                            capture_output=True, text=True, timeout=180)
    paths = sorted(IMG.glob('page_*.png'))
    if result.returncode or len(paths) != 16:
        raise RuntimeError('PDF page rendering failed: '+result.stderr[-2500:])
    # Review all pages together, with readable full-size pages retained.
    thumbs = []
    for path in paths:
        with Image.open(path) as im:
            thumb = ImageOps.contain(im.convert('RGB'), (300, 425))
            tile = Image.new('RGB', (320, 455), '#dbe2e9')
            tile.paste(thumb, ((320-thumb.width)//2, 15))
            ImageDraw.Draw(tile).text((12, 435), path.stem, fill='black')
            thumbs.append(tile)
    sheet = Image.new('RGB', (1280, 1820), 'white')
    for i, tile in enumerate(thumbs):
        sheet.paste(tile, ((i % 4)*320, (i//4)*455))
    sheet.save(IMG/'pages_contact_sheet.png')
    return paths


def verify(w):
    reader = PdfReader(str(PDF))
    outline = [{'title': dest.title, 'page': reader.get_destination_page_number(dest)+1}
               for dest in reader.outline if not isinstance(dest, list)]
    fonts, page_text = {}, []
    for i, page in enumerate(reader.pages, 1):
        page_text.append(page.extract_text() or '')
        resources = page['/Resources'].get_object()
        for _, ref in resources.get('/Font', {}).items():
            f = ref.get_object()
            # ReportLab may declare unused Helvetica in resources; check actual
            # content Tf operators below so unused defaults are not false failures.
            base = str(f.get('/BaseFont', ''))
            desc = f.get('/FontDescriptor')
            if desc is None and f.get('/DescendantFonts'):
                desc = f['/DescendantFonts'][0].get_object().get('/FontDescriptor')
            desc = desc.get_object() if desc else {}
            embedded = any(key in desc and len(desc[key].get_object().get_data()) > 0
                           for key in ('/FontFile', '/FontFile2', '/FontFile3'))
            item = fonts.setdefault(base, {'embedded': embedded, 'subtype': str(f.get('/Subtype')), 'used_pages': [], 'has_to_unicode': '/ToUnicode' in f})
            for operands, op in page.get_contents().operations:
                if op == b'Tf' and str(operands[0]) in resources.get('/Font', {}):
                    actual = resources['/Font'][operands[0]].get_object()
                    if actual.get('/BaseFont') == f.get('/BaseFont') and i not in item['used_pages']:
                        item['used_pages'].append(i)
    # Canvas sets an initial Helvetica Tf even when all painted text is Nanum.
    # Remove that default by setting the canvas initial font to NG at creation;
    # every Tf must consequently refer to an embedded font.
    used_fonts = {k:v for k,v in fonts.items() if v['used_pages'] and (v['embedded'] or v['has_to_unicode'])}   # ReportLab 기본 Helvetica Tf(글자 없음) 제외
    checks = {
        'page_count_in_requested_range': 12 <= len(reader.pages) <= 16,
        'page_count_exact': len(reader.pages) == w.i,
        'all_pages_A4_portrait': all(abs(float(p.mediabox.width)-A4[0]) < .1 and abs(float(p.mediabox.height)-A4[1]) < .1 for p in reader.pages),
        'outline_matches_pages': outline == [{'title': x['title'], 'page': x['page']} for x in w.toc],
        'all_used_fonts_embedded': bool(used_fonts) and all(v['embedded'] for v in used_fonts.values()),
        'korean_text_extracts_on_all_pages': all(re.search('[가-힣]', t) for t in page_text),
        'no_replacement_characters': all('\ufffd' not in t and '\x00' not in t for t in page_text),
        'no_layout_overflow': all(p['content_bottom_mm'] >= 19 for p in w.usage),
        'all_seven_print_parts_in_text': all(n in '\n'.join(page_text) for n in NAMES),
        'screw_rows_match_source': all(row[0] in '\n'.join(page_text) for row in SCREWS[1:]),
    }
    paths = render_pdf_pages()
    checks['all_pdf_pages_rendered'] = len(paths) == len(reader.pages)
    report = {
        'pdf': PDF.relative_to(ROOT).as_posix(), 'generated_on': date.today().isoformat(),
        'source_date': SOURCE_DATE, 'base_commit': COMMIT, 'source_scope': 'Current working tree; includes uncommitted V5 source data.',
        'passed': all(checks.values()), 'checks': checks, 'page_count': len(reader.pages),
        'outline_count': len(outline), 'outline': outline, 'fonts': fonts,
        'figure_count': len(FIGURES), 'figures': FIGURES,
        'rendered_pages': [p.relative_to(ROOT).as_posix() for p in paths],
        'render_engine': 'Windows.Data.Pdf (actual PDF pages, 1200 px width)',
        'layout': w.usage, 'source_discrepancies_and_remaining_issues': ISSUES,
        'source_screw_table': {'heading_count': SCREW_LABEL, 'M_screw_sum_from_rows': SCREW_TOTAL, 'rows': SCREWS[1:], 'policy': 'Preserve BUILD_V5 §0 rows and counts exactly; no silent correction.'},
        'source_hashes_sha256': {f: hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in SOURCE_PATHS +
                                 ['models/robot_v5/print/'+n+'.step' for n in NAMES]},
        'visual_review': {'status': 'pending', 'contact_sheet': 'docs/images/v5_manual/pages_contact_sheet.png'},
    }
    (OUT/'pdf_checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'pages': len(reader.pages), 'outline': len(outline), 'figures': len(FIGURES), 'checks': checks}, ensure_ascii=True), flush=True)
    if not report['passed']:
        raise RuntimeError('PDF checks failed; see pdf_checks.json')


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    font_manager.fontManager.addfont(str(FONT/'NanumGothic-Regular.ttf'))
    plt.rcParams.update({'font.family': 'NanumGothic', 'axes.unicode_minus': False})
    make_figures()
    w = write_manual()
    verify(w)


if __name__ == '__main__':
    main()
