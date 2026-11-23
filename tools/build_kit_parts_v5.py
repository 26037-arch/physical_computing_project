"""V5 가 쓰는 키트·구매 부품의 참고용 3D 모델 (CadQuery).

docs/KIT_PARTS.md 의 "V5 에 쓰는 부품" 표와 짝이다. 출력은 models/kit_parts_v5/ 의
<이름>.step (색이 있는 조립체), <이름>.stl (한 덩어리), kit_parts_layout.step,
kit_parts.json (치수·원점·출처·실측 필요 여부), docs/images/kit_parts_v5.png.

치수는 제조사 도면·판매처 표기값이다. 호환품마다 0.5 mm 안팎 다르므로 끼워 맞춤에
쓰기 전에 캘리퍼스로 재서 PARTS 표의 값을 고친다 (approx=True 는 도면 없이 넣은 값).
출력 부품(models/robot_v5/print)과 달리 인쇄용이 아니다.

실행: <cadquery 가 설치된 python> tools/build_kit_parts_v5.py [--no-png]
"""
import argparse
import json
from pathlib import Path

import cadquery as cq

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'kit_parts_v5'
PNG = ROOT / 'docs' / 'images' / 'kit_parts_v5.png'
MIL = .0254
PITCH = 2.54

PCB, BLACK, METAL, WHITE = '#0e7c86', '#22252a', '#b9bec6', '#f1eee2'
BLUE, DARK, GOLD, GREEN = '#2f66c4', '#3a3f48', '#c9a23a', '#2f7d4f'

SRC = dict(
    uno='Arduino ABX00087 datasheet 13절 (Mounting Holes And Board Outline)',
    lcd='HD44780 1602A 모듈 도면 (80×36, 구멍 75×31) · 판매처 표기 80×36×18',
    sg90='TowerPro 공식 제품 표 SG90: A 30.3 B 22.7 C 27 D 12.2 E 32.3 F 17 (귀 두께·축 위치는 가정)',
    mg996r='TowerPro 공식 제품 표 MG996R: A 42.7 B 40.9 C 37 D 20 E 54 F 26.8 (귀 두께·축 위치는 가정)',
    nema='NEMA 17 규격 (42.3 각, 구멍 31, 보스 Ø22) · 17HS4401 (길이 40, 축 Ø5 D컷)',
    a4988='Pololu A4988 carrier dimension diagram (0.6×0.8 in)',
    bb='MB-102 830 tie-point (165×55×8.5) · 구멍 격자는 tools/make_wiring_v5.js 와 같음',
    mini='SYB-170 미니 브레드보드 (47×35×8.5)',
    tact='12×12×7.3 택트 스위치 (리드 5.08×12.5) + 원형 캡',
    buzzer='12095 능동 부저 (Ø12×9.5, 핀 간격 7.6)',
    cap='100 µF 25 V 전해 커패시터 (Ø6.3×11, 리드 간격 2.5)',
)


def box(sx, sy, sz, x=0., y=0., z=0.):
    """XY 가운데가 (x, y), 밑면이 z 인 상자."""
    return cq.Workplane('XY').box(sx, sy, sz, centered=(True, True, False)).translate((x, y, z))


def cyl(d, h, x=0., y=0., z=0.):
    return cq.Workplane('XY').circle(d / 2).extrude(h).translate((x, y, z))


def holes(wp, pts, d):
    bb = wp.val().BoundingBox()
    cut = cq.Workplane('XY').pushPoints(pts).circle(d / 2).extrude(bb.zlen + 2).translate((0, 0, bb.zmin - 1))
    return wp.cut(cut)


def pins(pts, size, length, z):
    return cq.Workplane('XY').pushPoints(pts).rect(size, size).extrude(length).translate((0, 0, z))


# ---------------------------------------------------------------- 보드류

def uno_r4_wifi():
    """원점: 기판 왼쪽 아래 모서리(USB 쪽이 x=0), 기판 밑면 z=0."""
    t = 1.6
    outline = [(0, 0), (64.98, 0), (68.58, 3.6), (68.58, 37.5), (66.04, 40.04),
               (66.04, 51.3), (64.0, 53.34), (0, 53.34)]
    pcb = cq.Workplane('XY').polyline(outline).close().extrude(t)
    pcb = holes(pcb, [(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56)], 3.2)
    hdr = None
    for x0, n, y in ((740, 10, 2000), (1800, 8, 2000), (1100, 8, 100), (2000, 6, 100)):
        h = box(n * PITCH, PITCH, 8.5, (x0 + 50 * (n - 1)) * MIL, y * MIL, t)
        hdr = h if hdr is None else hdr.union(h)
    hdr = hdr.union(box(2 * PITCH, 3 * PITCH, 2.5, 64.6, 27.9, t))          # ICSP 받침
    icsp = pins([(64.6 + dx, 27.9 + dy) for dx in (-1.27, 1.27) for dy in (-2.54, 0, 2.54)], .64, 8.5, t)
    usb = box(7.4, 8.94, 3.2, 2.7, 38.1, t)                                 # USB-C, 1 mm 돌출
    jack = box(13.5, 9., 11., 4.95, 7.6, t)                                  # DC 잭 (V5 는 쓰지 않음)
    esp = box(15.4, 20.5, 2.4, 55.5, 24., t)                                 # ESP32-S3-MINI-1
    mcu = box(10., 10., 1.4, 31., 13., t)                                    # RA4M1
    matrix = box(26., 13., .8, 36., 31., t)                                  # 12×8 LED
    rst = box(4.2, 3.2, 2., 3.3, 49.6, t)
    return [('pcb', pcb, PCB), ('headers', hdr, BLACK), ('icsp_pins', icsp, GOLD), ('usb_c', usb, METAL),
            ('dc_jack', jack, BLACK), ('esp32', esp, METAL), ('ra4m1', mcu, DARK),
            ('led_matrix', matrix, WHITE), ('reset', rst, METAL)]


def lcd1602_i2c():
    """원점: 기판 왼쪽 아래 모서리, 기판 밑면 z=0, 화면이 +z. 백팩은 z<0."""
    t = 1.6
    pcb = holes(box(80, 36, t, 40, 18), [(2.5, 2.5), (77.5, 2.5), (2.5, 33.5), (77.5, 33.5)], 3.0)
    bezel = box(71.2, 25.2, 7.0, 40, 18, t)
    glass = box(64.5, 14.5, .2, 40, 18, t + 7.0)
    led = box(4.2, 14., 4.6, 77.6, 18, t)                                    # 백라이트 탭
    strip = box(16 * PITCH, PITCH, 2.5, 8 + 7.5 * PITCH, 33.5, -2.5)         # 16핀 헤더
    bx0, bw, bd = 5.2, 41.6, 19.2
    back = box(bw, bd, t, bx0 + bw / 2, 34.8 - bd / 2, -2.5 - t)
    zb = -2.5 - t
    pot = box(6.8, 6.8, 4.8, bx0 + 31, 22.5, zb - 4.8)
    chip = box(10.3, 7.5, 2.3, bx0 + 19, 23.5, zb - 2.3)
    hdr = box(2.5, 4 * PITCH, 2.5, bx0 + 1.6, 25.2, zb - 2.5)
    hpins = cq.Workplane('YZ').pushPoints([(25.2 + (i - 1.5) * PITCH, zb - 1.25) for i in range(4)]) \
        .rect(.64, .64).extrude(-8.5).translate((bx0 + .4, 0, 0))            # VCC GND SDA SCL, -x 로 나옴
    return [('pcb', pcb, GREEN), ('bezel', bezel, BLACK), ('glass', glass, BLUE), ('backlight', led, WHITE),
            ('header16', strip, BLACK), ('i2c_backpack', back, DARK), ('contrast_pot', pot, BLUE),
            ('pcf8574', chip, BLACK), ('i2c_header', hdr, BLACK), ('i2c_pins', hpins, GOLD)]


def a4988():
    """원점: 기판 가운데, 기판 밑면 z=0. 핀 줄은 y=±6.35, 긴 변이 x."""
    t = 1.6
    pts = [((i - 3.5) * PITCH, s * 6.35) for i in range(8) for s in (-1, 1)]
    pcb = box(20.32, 15.24, t)
    spacer = box(8 * PITCH, PITCH, 2.5, 0, 6.35, -2.5).union(box(8 * PITCH, PITCH, 2.5, 0, -6.35, -2.5))
    sink = box(9, 9, 5, 0, 0, t + .9)
    for i in range(-2, 3):                                                   # 핀 사이 홈 5줄
        sink = sink.cut(box(.9, 9.2, 3.8, i * 1.7, 0, t + .9 + 1.4))
    return [('pcb', pcb, '#b3262b'), ('spacers', spacer, BLACK), ('pins', pins(pts, .64, 6.1, -8.6), GOLD),
            ('driver_ic', box(5, 5, .9, 0, 0, t), BLACK), ('heatsink', sink, METAL),
            ('vref_pot', cyl(3.2, 1.6, 6.2, -3.2, t), METAL)]


# ---------------------------------------------------------------- 구동품

def sg90():
    """원점: 출력축 중심, 몸통 밑면 z=0. 귀 밑면 z=17, 케이스 윗면 z=27, 축 끝 z=30.3."""
    # TowerPro 공식 표: A 30.3(전체) B 22.7(몸통 길이) C 27(케이스 윗면) D 12.2 E 32.3(귀) F 17(귀 밑면).
    # 표에 없는 값(가정): 귀 두께 2.5, 축은 몸통 끝에서 6.1, 귀 구멍 간격 27.7.
    cx = 22.7 / 2 - 6.1                                                      # 몸통 가운데 (축에서 +x)
    body = box(22.7, 12.2, 23.0, cx)
    ear = box(32.3, 12.2, 2.5, cx, 0, 17.0)
    ear = holes(ear, [(cx - 13.85, 0), (cx + 13.85, 0)], 2.2)
    ear = ear.cut(box(2.4, 1.2, 2.5, cx - 15.45, 0, 17.0)).cut(box(2.4, 1.2, 2.5, cx + 15.45, 0, 17.0))
    top = cyl(11.8, 4.0, 0, 0, 23.0).union(cyl(5.5, 4.0, 6.2, 0, 23.0))
    return [('case', body.union(ear).union(top), BLUE), ('spline', cyl(4.8, 3.3, 0, 0, 27.0), WHITE),
            ('cable', box(1.5, 3.8, 1.4, cx + 12, 0, 4.), '#8a4b21')]


def mg996r():
    """원점: 출력축 중심, 몸통 밑면 z=0. 귀 밑면 z=26.8, 케이스 윗면 z=37, 축 끝 z=42.7."""
    # TowerPro 공식 표: A 42.7(전체) B 40.9(몸통 길이) C 37(케이스 윗면) D 20 E 54(귀) F 26.8(귀 밑면).
    # 표에 없는 값(가정): 귀 두께 2.5, 축은 몸통 끝에서 10.2, 귀 구멍 49.5 × 10.
    cx = 40.9 / 2 - 10.2
    body = box(40.9, 20.0, 37.0, cx)
    ear = box(54.0, 20.0, 2.5, cx, 0, 26.8)
    ear = holes(ear, [(cx + sx * 24.75, sy * 5.) for sx in (-1, 1) for sy in (-1, 1)], 4.4)
    boss = cyl(13., 2.5, 0, 0, 37.0)
    return [('case', body.union(ear).union(boss), BLACK), ('spline_25t', cyl(5.8, 3.2, 0, 0, 39.5), GOLD),
            ('cable', box(1.6, 7.6, 2.6, cx + 21.1, 0, 3.), '#8a4b21')]


def nema17(shaft_len_mm=24.0):
    """원점: 축 중심, 장착면 z=0. 몸통은 z<0 (길이 40), 축은 z>0."""
    body = cq.Workplane('XY').rect(42.3, 42.3).extrude(-40.).edges('|Z').chamfer(5.)
    body = body.cut(cq.Workplane('XY').pushPoints([(sx * 15.5, sy * 15.5) for sx in (-1, 1) for sy in (-1, 1)])
                    .circle(1.5).extrude(-4.5))                              # M3 탭 깊이 4.5
    body = body.union(cyl(22., 2.))
    shaft = cyl(5., shaft_len_mm).cut(box(2., 6., 20., 3.0, 0, shaft_len_mm - 20.))  # 끝에서 20 mm D컷
    conn = box(16., 5., 9.5, 0, -23.6, -40.)
    return [('body', body, DARK), ('shaft', shaft, METAL), ('connector', conn, WHITE)]


# ---------------------------------------------------------------- 브레드보드·소자

def _breadboard(w, d, cols, rails):
    """원점: 가운데, 밑면 z=0. 열은 x, 가운데 홈은 x 축."""
    body = box(w, d, 8.5).cut(box(w, 3., 3., 0, 0, 5.5))
    xs = [(i - (cols - 1) / 2) * PITCH for i in range(cols)]
    pts = [(x, s * (1.5 + r) * PITCH) for x in xs for r in range(5) for s in (-1, 1)]
    if rails:
        # 레일 n 번 x: 5개 묶음 사이 1칸, 25–26 사이 2칸 (make_wiring_v5.js railX 와 같다)
        rx = [(1 + i + i // 5 + (1 if i >= 25 else 0)) * PITCH + xs[0] for i in range(50)]
        pts += [(x, s * k * PITCH) for x in rx for k in (8.5, 9.5) for s in (-1, 1)]
    body = body.cut(cq.Workplane('XY').pushPoints(pts).rect(1.1, 1.1).extrude(3.).translate((0, 0, 5.5)))
    return [('body', body, WHITE)], len(pts)


def breadboard_830():
    parts, n = _breadboard(165.1, 54.6, 63, True)
    assert n == 830, n
    return parts


def breadboard_mini_170():
    parts, n = _breadboard(47., 35., 17, False)
    assert n == 170, n
    return parts


def tact_switch_12():
    """원점: 가운데, 몸통 밑면 z=0 (브레드보드 윗면). 다리 x=±6.25, y=±2.54."""
    legs = cq.Workplane('XY').pushPoints([(sx * 6.25, sy * 2.54) for sx in (-1, 1) for sy in (-1, 1)]) \
        .rect(.3, .7).extrude(3.5 + 2.).translate((0, 0, -3.5))
    return [('body', box(12, 12, 3.6), BLACK), ('plate', box(12, 12, .3, 0, 0, 3.6), METAL),
            ('stem', box(3.8, 3.8, 3.4, 0, 0, 3.9), BLACK), ('cap', cyl(11.6, 5.6, 0, 0, 6.3), '#e2c229'),
            ('legs', legs, METAL)]


def buzzer_12():
    """원점: 가운데, 밑면 z=0. 핀 x=±3.8 (7.6 mm — 브레드보드에서는 3칸에 벌려 꽂는다)."""
    body = cyl(12., 9.5).cut(cyl(2.2, 1.5, 0, 0, 8.))
    legs = cq.Workplane('XY').pushPoints([(-3.8, 0), (3.8, 0)]).circle(.3).extrude(6.5).translate((0, 0, -6.5))
    return [('body', body, BLACK), ('legs', legs, METAL)]


def cap_100uf():
    """원점: 가운데, 밑면 z=0. 리드 x=±1.25."""
    legs = cq.Workplane('XY').pushPoints([(-1.25, 0), (1.25, 0)]).circle(.25).extrude(15.).translate((0, 0, -15.))
    return [('can', cyl(6.3, 11.2), '#20305c'), ('legs', legs, METAL)]


# name: (builder, 번호, 품목, 기대 외형(x, y, z) 또는 None, 출처, approx)
PARTS = {
    'uno_r4_wifi': (uno_r4_wifi, 'K01', 'Arduino UNO R4 WiFi', None, SRC['uno'], False),
    'lcd1602_i2c': (lcd1602_i2c, 'K02', 'LCD1602 + I2C 백팩', None, SRC['lcd'], True),
    'tact_switch_12': (tact_switch_12, 'K03', '택트 스위치 12×12 + 캡', None, SRC['tact'], True),
    'buzzer_12': (buzzer_12, 'K04', '능동 부저 Ø12', (12., 12., 16.), SRC['buzzer'], False),
    'sg90': (sg90, 'K05', 'SG90 9 g 서보', (32.3, 12.2, 30.3), SRC['sg90'], True),
    'breadboard_830': (breadboard_830, 'K06', '브레드보드 830홀 (키트 밖)', (165.1, 54.6, 8.5), SRC['bb'], False),
    'breadboard_mini_170': (breadboard_mini_170, 'K06', '미니 브레드보드 170홀 (키트)', (47., 35., 8.5), SRC['mini'], False),
    'nema17': (nema17, 'B01', 'NEMA17 스텝모터 40 mm', (42.3, 47.25, 64.), SRC['nema'], False),
    'a4988': (a4988, 'B02', 'A4988 드라이버 + 방열판', (20.32, 15.24, 16.1), SRC['a4988'], False),
    'mg996r': (mg996r, 'B03', 'MG996R 서보', (54., 20., 42.7), SRC['mg996r'], True),
    'cap_100uf': (cap_100uf, 'B05', '100 µF 전해 커패시터', (6.3, 6.3, 26.2), SRC['cap'], False),
}


def compound(bodies):
    return cq.Compound.makeCompound([b.val() for _, b, _ in bodies])


def assembly(name, bodies):
    a = cq.Assembly(name=name)
    for sub, wp, color in bodies:
        r, g, b = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
        a.add(wp, name=f'{name}_{sub}', color=cq.Color(r, g, b))
    return a


def render(built):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LightSource, to_rgb
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    import numpy as np
    names = list(built)
    fig = plt.figure(figsize=(16, 9), dpi=110)
    light = LightSource(azdeg=-50, altdeg=55)
    for k, name in enumerate(names):
        ax = fig.add_subplot(3, 4, k + 1, projection='3d')
        faces, colors = [], []
        for _, wp, color in built[name]:
            verts, tris = wp.val().tessellate(.15, .3)
            f = np.array([p.toTuple() for p in verts])[np.array(tris)]
            n = np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0])
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            shade = .45 + .55 * np.clip(n @ light.direction, 0, 1)
            faces.append(f)
            colors.append(np.outer(shade, to_rgb(color)))
        faces = np.concatenate(faces)                      # 한 컬렉션이어야 삼각형끼리 깊이 정렬된다
        ax.add_collection3d(Poly3DCollection(faces, facecolors=np.concatenate(colors), edgecolors='none'))
        lo, hi = faces.reshape(-1, 3).min(0), faces.reshape(-1, 3).max(0)
        mid, span = (lo + hi) / 2, (hi - lo).max() / 2 * 1.05
        for setlim, m in zip((ax.set_xlim, ax.set_ylim, ax.set_zlim), mid):
            setlim(m - span, m + span)
        ax.set_box_aspect((1, 1, 1))
        ax.view_init(elev=28, azim=-58)
        ax.set_axis_off()
        size = hi - lo
        ax.set_title(f'{PARTS[name][1]}  {name}\n{size[0]:.1f} × {size[1]:.1f} × {size[2]:.1f} mm', fontsize=10)
    fig.tight_layout()
    PNG.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(PNG)
    print('Rendered', PNG.relative_to(ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-png', action='store_true')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    built, report, layout, x = {}, {}, cq.Assembly(name='kit_parts_v5'), 0.
    for name, (fn, code, title, expect, source, approx) in PARTS.items():
        bodies = fn()
        whole = compound(bodies)
        for sub, wp, _ in bodies:
            assert wp.val().isValid(), (name, sub)
        bb = whole.BoundingBox()
        size = [round(v, 3) for v in (bb.xlen, bb.ylen, bb.zlen)]
        if expect:
            assert all(abs(a - b) < .06 for a, b in zip(size, expect)), (name, size, expect)
        asm = assembly(name, bodies)
        asm.export(str(OUT / f'{name}.step'))
        whole.exportStl(str(OUT / f'{name}.stl'), tolerance=.05, angularTolerance=.15)
        if not name.startswith('breadboard'):              # 구멍 830개가 STEP 을 13 MB 로 만든다 — 낱개 파일만
            layout.add(asm, name=name, loc=cq.Location((x - bb.xmin, -bb.ymin, -bb.zmin)))
            x += bb.xlen + 15.
        report[name] = dict(code=code, title=title, size_mm=size,
                            bbox_min_mm=[round(v, 3) for v in (bb.xmin, bb.ymin, bb.zmin)],
                            origin=(fn.__doc__ or _breadboard.__doc__).strip().split('\n')[0],
                            bodies=[b[0] for b in bodies], source=source, measure_before_fit=approx)
        built[name] = bodies
        print('Exported', name, size, flush=True)
    layout.export(str(OUT / 'kit_parts_layout.step'))
    (OUT / 'kit_parts.json').write_text(json.dumps(dict(
        note='Reference envelopes of kit/purchased parts for V5; not printable parts. Units mm.',
        cadquery=cq.__version__, parts=report), indent=2, ensure_ascii=False), encoding='utf-8')
    if not args.no_png:
        render(built)


if __name__ == '__main__':
    main()
