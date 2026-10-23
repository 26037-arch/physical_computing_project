"""Generate measured CAD previews, 2D DXF cutting files and Korean build PDF."""
import csv,itertools,json,math,textwrap
from pathlib import Path
import cadquery as cq
import ezdxf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,landscape
import build_robot_v3 as d

ROOT=d.ROOT; OUT=d.OUT; DOC=ROOT/'docs'; IMG=DOC/'images'
BLUE='#22639a'; RED='#c34a35'; GRAY='#5c6a76'; GREEN='#39745c'

MAIN_BOM=[
('M01','고정 중앙축','강재 Ø6 h6 ×620; 중앙 36 mm에 깊이 1 mm 평면 가공',1,'구매+밀링'),
('M02','축 평면 키 시임','황동 0.10 ×4.2 ×15.6; 실측 후 두께 조정',1,'절단'),
('M03','중공 회전축','강재 OD12 h6 / ID8.6 이상 ×82; 베어링 면 정밀가공',2,'선반 가공'),
('M04','직결 회전축','강재 Ø8 h6 ×67',4,'구매+절단'),
('M05','코어/센터 고정 링','ID6 / OD12 이하 / 폭5; 소형 금속 클램프 링',4,'구매/가공'),
('M06','SHF6 축 지지대','보어6, 체결 피치32, 설치볼트 M5; 공급 도면 일치',2,'구매'),
('M07','608 베어링','8×22×7; U/R/D/L에 각 2',8,'구매'),
('M08','6001 베어링','12×28×8; F/B에 각 2',4,'구매'),
('M09','F8-16M 추력 베어링','8×16×5; 직결 헤드 앞/뒤',8,'구매'),
('M10','F12-21M 추력 베어링','12×21×5; 중공 헤드 앞/뒤',4,'구매'),
('M11','추력 조정 시임','ID8.1 / OD16 / 합계 두께2; 직결 헤드 뒤',4,'구매'),
('M12','금속 인덱스 휠','OD38×8, 보어8.05 4개 /12.05 2개; 4×Ø3.05 리밍',6,'금속 가공'),
('M13','잠금핀','Ø3 유효길이30 4개 /40 2개; 손잡이 OD≤7, 높이≤3',6,'구매/가공'),
('M14','구동 다월핀','Ø3×16, 4개/면; 앞쪽 돌출8 mm',24,'구매'),
('M15','5→8 커플링','OD≤19×25; 실제 삽입 깊이 확인',4,'구매'),
('M16','NEMA17','1.8°/step, 42.3각, 31피치, 몸체≤40, 5축20 돌출',6,'기존 재사용'),
('M17','GT2 40T 풀리','2 mm 피치/폭6; 5보어 2개, 12보어 2개',4,'구매'),
('M18','GT2 폐루프 벨트','200-2GT-6; 피치길이200, 폭6, 100치',2,'구매'),
('M19','MGN12 레일+H 블록','레일180, 폭12, 높이8; 블록27×45.4, 총 높이13',6,'세트 구매'),
('M20','2060 프로파일','60폭×20높이, 길이246.5; 양 끝 탭 중 뒤쪽 M6 2곳',6,'구매+절단/탭'),
('M21','합판 패널','12T; U/D 584², R/L 560×584, F/B 560²',6,'절단/드릴'),
('M22','모서리 앵글','30×30×20폭, 2T; 각 다리 중심에 Ø4.5, 모서리서15',24,'구매/가공'),
('M23','프로파일 끝판','알루미늄 80×40×3; Ø6.6, 피치40',6,'판재 가공'),
('M24','중앙축 브리지','알루미늄 140×30×5; 홀은 DXF 참조',2,'판재 가공'),
('M25','M5 이송 나사+손잡이','M5×100; 손잡이 OD≤20, 폭≤13',6,'구매'),
('M26','센터 스프링/와셔','F/B: ID≥6.4 OD≤10, 압축길이3 +와셔0.5',2,'세트 구매'),
('M27','나머지 센터 체결','M3×16 +스프링 ID≥3.2 OD≤6.5 +와셔',4,'세트 구매'),
('M28','실리콘 패드','8×8×1, 눌린 두께0.8 목표',24,'절단'),
]
FAST_BOM=[
('F01','M3 인서트 Ø4.6×4','허브24+베어링 하우징48+레일 지지42+코어4',118),
('F02','M4 인서트 Ø5.6×6','허브 세트스크류용, 2개/면',12),
('F03','M3×8','구동판-허브24 +모터24 +MGN 블록24',72),
('F04','M3×6','앞/뒤 베어링 캡, 8개/면',48),
('F05','M3×10','레일 고정42 +이송 너트 덮개12(플라스틱 M3 탭)',54),
('F06','M3×18 +너트','베어링 하우징-캐리지24 +잠금 브래킷12',36),
('F07','M3×20 +너트','분할 코어 관통 조립, 나사 머리 포켓 안쪽',4),
('F08','M4 세트스크류','허브 M4×6 12개 +휠 M4×16 12개; 끝맞춤',24),
('F09','M5 너트','이송당 이동1+양쪽 더블너트4 =30; 손잡이 잼너트6',36),
('F10','M5 와셔 ID5.5/OD10/0.8T','이송 나사 축 방향 지지, 2개/면',12),
('F11','M5×12 +T너트 +와셔','2060과 레일 지지대; x=±20, z=25/120',24),
('F12','M6×30 +와셔','끝판3T+합판12T 통과, 2060 M6 탭 체결',12),
('F13','M5×25 +너트 +와셔','중앙축 브리지-합판',8),
('F14','M5×20 +너트 +와셔','SHF6-중앙축 브리지',4),
('F15','M4×25 +너트 +와셔','24개 모서리 앵글, 다리당 한 개',48),
]
ELECTRIC=[
('E01','UNO R4 WiFi 또는 UNO R3','기존 보드 1; R3 컴파일/가상검증, R4 실물 미검증'),
('E02','A4988 +방열판 6','각 모터 정격/전류 감지저항으로 VREF 설정'),
('E03','12 V DC 어댑터','초기 제안 8~10 A; 실제 전류/온도 측정 후 용량 확정'),
('E04','VMOT 전해콘덴서 6','각 드라이버 가까이 100 µF /25 V 이상(12 V 계통)'),
('E05','모터전원 차단 스위치+퓨즈','12 V 주전원 DC 정격 만족; 스위치로 VMOT 차단'),
('E06','단자대/납땜 기판/배선','모터전류를 브레드보드/UNO 5 V 핀으로 공급하지 않음'),
('E07','LCD1602 I2C, 버튼2, 부저','기존 A4/A5, A0/A1, A2 연결 유지'),
]

def previews():
    IMG.mkdir(parents=True,exist_ok=True)
    cubes,ins,modules,frame=d.make_design()
    def add(ax,s,c,alpha=1):
        vv,ii=s.tessellate(.45,.4)
        if not ii:return
        verts=np.array([v.toTuple() for v in vv]);tri=verts[np.array(ii)]
        ax.add_collection3d(Poly3DCollection(tri,facecolors=c,edgecolors=c,linewidths=0,alpha=alpha,shade=True,lightsource=matplotlib.colors.LightSource(315,45)))
    def setup(ax,lim):
        for fn in (ax.set_xlim,ax.set_ylim,ax.set_zlim):fn(*lim)
        ax.set_box_aspect((1,1,1));ax.set_axis_off();ax.view_init(22,-45)
    fig=plt.figure(figsize=(10,8),facecolor='white');ax=fig.add_subplot(projection='3d')
    for n,k,s,pos in ins:add(ax,s, '#e6a949' if 'edge' in k else '#62a3b5' if 'corner' in k else '#ddd7c9')
    for face in d.v2.FACES:
        hs,hw=modules[face in 'FB']; shift=0 if face in 'FB' else 24
        for n,s in {**hs,**hw}.items():
            if n.startswith(('pin_','axial_pad','feed_','profile_bolt')):continue
            fixed=n in ('rail_support','rail_MGN12','handwheel_envelope')
            placed=s.translate((0,0,0 if fixed else shift)).moved(d.v2.face_location(face))
            add(ax,placed,BLUE if n in hs else '#9ca5ab')
    for n,s in frame.items():
        if n in ('panel_U','panel_F','panel_R'):continue
        add(ax,s,RED if 'axle_' in n else '#e1c69f' if n.startswith('panel_') else '#818f9a',.20 if n.startswith('panel_') else 1)
    setup(ax,(-325,325));ax.view_init(20,40)
    ax.set_title('V3 - fixed core axle / hollow F-B drives / metal face locks\nFront, right and upper panels hidden for assembly access',fontsize=13)
    fig.savefig(IMG/'robot_v3_assembly.png',dpi=180,bbox_inches='tight');plt.close(fig)
    fig=plt.figure(figsize=(11,7),facecolor='white');ax=fig.add_subplot(projection='3d')
    hs,hw=modules[True]
    for n,s in {**hs,**hw}.items():
        if n=='rail_support' or n.startswith(('feed_','handwheel','profile_bolt')):continue
        add(ax,s,BLUE if n in hs else '#ddba64' if n.startswith(('pulley','belt')) else '#929da5',.25 if n in ('bearing_housing','bearing_front_cap','bearing_rear_cap') else 1)
    add(ax,d.cyl(6,-30,165),RED)
    add(ax,d.index_pin(True,True),RED)
    ax.set_xlim(-40,95);ax.set_ylim(-60,40);ax.set_zlim(-15,165);ax.set_box_aspect((135,100,180));ax.view_init(22,42);ax.set_axis_off()
    ax.set_title('F/B hollow head - stationary axle passes through the rotating spindle\n40T : 40T belt keeps a 1:1 ratio; housing shown translucent',fontsize=13)
    fig.savefig(IMG/'robot_v3_hollow_head.png',dpi=180,bbox_inches='tight');plt.close(fig)

def dxf_files():
    folder=OUT/'purchase_and_cut';folder.mkdir(exist_ok=True)
    def file(name,w,h,holes,window=None):
        doc=ezdxf.new('R2010');doc.units=4
        for n,col in [('CUT',7),('DRILL',1)]:doc.layers.new(n,dxfattribs={'color':col})
        ms=doc.modelspace();ms.add_lwpolyline([(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)],close=True,dxfattribs={'layer':'CUT'})
        if window:
            a,b=window;ms.add_lwpolyline([(-a/2,-b/2),(a/2,-b/2),(a/2,b/2),(-a/2,b/2)],close=True,dxfattribs={'layer':'CUT'})
        for x,y,dia in holes:ms.add_circle((x,y),dia/2,dxfattribs={'layer':'DRILL'})
        doc.saveas(folder/(name+'.dxf'))
    for face,(w,h) in {'U':(584,584),'D':(584,584),'R':(560,584),'L':(560,584),'F':(560,560),'B':(560,560)}.items():
        holes=[(x,-67,6.6) for x in (-20,20)]
        for a,b in itertools.product((-265,265),(-180,180)):holes.extend([(a,b,4.5),(b,a,4.5)])
        if face in 'FB':holes.extend((x,y,5.5) for x,y in itertools.product((-60,60),(-10,10)))
        file('panel_'+face,w,h,holes,(100,100))
    file('profile_end_plate',80,40,[(-20,0,6.6),(20,0,6.6)])
    file('shaft_bridge',140,30,[(0,0,6.5),(-16,0,5.5),(16,0,5.5)]+[(x,y,5.5) for x,y in itertools.product((-60,60),(-10,10))])
    with (OUT/'purchase_BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['ID','품목','규격','수량','조달']);w.writerows(MAIN_BOM)
    with (OUT/'fastener_BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['ID','품목','용도','수량']);w.writerows(FAST_BOM)

def pdf():
    DOC.mkdir(exist_ok=True)
    pdfmetrics.registerFont(TTFont('KR','C:/Windows/Fonts/malgun.ttf'))
    pdfmetrics.registerFont(TTFont('KRB','C:/Windows/Fonts/malgunbd.ttf'))
    W,H=landscape(A4); c=canvas.Canvas(str(DOC/'BUILD_V3_제작설계도.pdf'),pagesize=(W,H)); page=0
    def txt(x,y,s,size=10,col=GRAY,bold=False):
        c.setFillColor(colors.HexColor(col));c.setFont('KRB' if bold else 'KR',size);c.drawString(x,y,str(s))
    def wrap(s,width,size):
        lines=[];line=''
        for ch in str(s):
            if ch=='\n' or pdfmetrics.stringWidth(line+ch,'KR',size)>width:
                lines.append(line);line='' if ch=='\n' else ch
            else:line+=ch
        if line:lines.append(line)
        return lines
    def para(x,y,s,width=740,size=10,leading=16,col=GRAY):
        for line in wrap(s,width,size):txt(x,y,line,size,col);y-=leading
        return y-6
    def line(x1,y1,x2,y2,col=GRAY,width=1):
        c.setStrokeColor(colors.HexColor(col));c.setLineWidth(width);c.line(x1,y1,x2,y2)
    def rect(x,y,w,h,col,stroke=None):
        c.setFillColor(colors.HexColor(col));c.setStrokeColor(colors.HexColor(stroke or col));c.rect(x,y,w,h,fill=1,stroke=bool(stroke))
    def start(title,subtitle):
        nonlocal page
        if page:c.showPage()
        page+=1;rect(0,H-14,W,14,BLUE)
        txt(36,H-50,title,21,BLUE,True);txt(36,H-73,subtitle,9)
        line(36,30,W-36,30,'#d8dfe5');txt(36,17,'CUBE ROBOT V3 | 2026-10-23 | 단위 mm | PDF 축척 없음 - 수치/DXF/STEP 우선',8)
        txt(W-61,17,str(page),8)
    def table(x,y,widths,rows,headers=None,size=9,min_h=25,padding=10):
        allrows=([headers] if headers else [])+list(rows)
        for i,row in enumerate(allrows):
            head=i==0 and headers
            texts=[wrap(t,w-12,size) for t,w in zip(row,widths)]
            rh=max(min_h,max(len(z) for z in texts)*(size+3)+padding)
            rect(x,y-rh,sum(widths),rh,BLUE if head else '#eff4f7' if i%2 else '#ffffff')
            xx=x
            for ls,w in zip(texts,widths):
                top=(rh-len(ls)*(size+3))/2
                for j,s in enumerate(ls):txt(xx+6,y-top-size-j*(size+3),s,size,'#ffffff' if head else GRAY,bold=bool(head))
                xx+=w
            y-=rh
        return y
    def dim(x1,x2,y,s):
        line(x1,y,x2,y,BLUE,.7);line(x1,y-4,x1,y+4,BLUE,.7);line(x2,y-4,x2,y+4,BLUE,.7)
        txt((x1+x2)/2-pdfmetrics.stringWidth(s,'KR',9)/2,y+5,s,9,BLUE)
    def image(path,x,y,w,h):c.drawImage(str(path),x,y,w,h,preserveAspectRatio=True,anchor='c',mask='auto')

    start('제작 설계 검토 · V3 중앙축 고정형','6면 핀 구동 큐브 로봇 | 출력·구매·가공을 구분한 조립 시제품 설계')
    table(36,490,[116,278],[
        ('기존 부유 헤드','6개 레일 지지대를 2060 프로파일과 12T 박스 프레임에 체결'),
        ('큐브 전체 회전','중앙 Ø6 고정축 + 코어 D 평면 키 + 양 끝 SHF6'),
        ('반대 면 회전','반대 헤드를 결합한 뒤 금속 인덱스 휠에 잠금핀 삽입'),
        ('모터와 축 충돌','F/B에 Ø12 중공축, 모터를 60 mm 옮긴 1:1 벨트 구동'),
        ('조립 불가능 포켓','M5 이동 너트 포켓 개방 + 탈착식 덮개'),
        ('역방향 축 이탈','뒤쪽 추력 베어링과 금속 인덱스 휠로 축 방향 포획'),
        ('연속 운전 오작동','매 수 H 확인 후 한 수만 구동; X/180초 시간초과 중단')
    ],size=9,min_h=43)
    image(IMG/'robot_v3_assembly.png',432,151,373,340)
    y=para(438,139,'앞·오른쪽·위 패널을 숨긴 실제 CAD 조립도입니다. 회색은 구매/가공품, 청색은 출력물, 적색은 고정 중앙축입니다.',353,9,14)
    para(36,150,'설계 상태: 제작용 CAD 시제품. 기하 검사는 실제 출력·마찰·탈조·강도 시험을 대신하지 않습니다. 한 면부터 조립하여 아래 합격 기준을 통과한 뒤 확대 제작합니다.',390,10,16,RED)
    para(36,81,'기존 V2 STL과 3D 시뮬레이터는 V2 기록으로 보존합니다. V3는 models/robot_v3의 파일을 사용하세요. V1 센터 캡 직결 부품은 V3와 혼용하지 않습니다.',760,9,14)

    start('01 · 고정 중앙축과 코어','중앙축은 돌지 않습니다. F/B 면의 회전은 중공축 바깥 경로로 전달됩니다.')
    yy=397; scale=1.12; cx=W/2
    rect(cx-310*scale,yy-3,620*scale,6,RED)
    for sign in (-1,1):
        rect(cx+sign*292*scale-3,yy-40,6,80,'#ddc7a4')
        rect(cx+sign*302*scale-7,yy-15,14,30,'#778b99')
        txt(cx+sign*274*scale-28,yy-61,'SHF6 고정',9,BLUE)
        rect(cx+sign*28.5*scale-2,yy-27,4,54,'#7db1bd')
    rect(cx-17.2*scale,yy-17.2*scale,34.4*scale,34.4*scale,'#e8e0cd')
    rect(cx-310*scale,yy-2,620*scale,4,RED)
    dim(cx-310*scale,cx+310*scale,yy+74,'중앙축 길이 620')
    dim(cx-292*scale,cx+292*scale,yy+49,'프레임 외형 584')
    dim(cx-28.5*scale,cx+28.5*scale,yy-89,'큐브 외형 57')
    txt(350,yy+28,'분할 코어 + D 평면 키',10,BLUE,True)
    y=para(36,270,'고정 하중 경로: 큐브 코어 → D 평면/황동 시임 → 강재 Ø6 축 → 앞·뒤 SHF6 → 알루미늄 브리지 → 프레임. 구동 경로는 이 고정 경로와 분리합니다.',752,11,18)
    y=table(36,y,[150,600],[
        ('중앙축 가공','Ø6 h6 ×620±0.5. 중앙 z=-18~+18에 평면 1.00 깊이, 평면 좌표 x=+2.00. 모서리 디버링.'),
        ('코어 조립','내부 금속 링 2개(ID6/OD≤12/폭5)를 z=±8~13에 고정. 시임 0.10×4.2×15.6을 평면에 넣고 양쪽 코어를 M3×20 4개로 조임.'),
        ('F/B 센터','기존 유지 트랙 외형을 유지. 관통 Ø6.25, 최소 명목 줄기 벽 1.275. 외부 스프링 3 +와셔0.5 +링5를 면 바깥 0~8.5에 배치.'),
        ('축 정렬/강성','계산 예: 0.10 N·m, 강재 G=79 GPa, 한쪽 280 mm만 반력 가정 시 비틀림 약0.16°. D 평면 유격·프레임 변형은 실측. 두 헤드 지지를 유지.')
    ],size=9,min_h=37)

    start('02 · F/B 중공 구동 헤드','고정축 Ø6 / 회전축 OD12·ID8.6. 중심 모터를 60 mm 옮겨 축 통로를 확보했습니다.')
    image(IMG/'robot_v3_hollow_head.png',28,166,468,338)
    y=table(500,490,[142,163],[
        ('큐브 면/핀 끝','0 / -3'),('구동판 본판','5~11'),('허브','11~28'),
        ('앞 추력 F12-21M','28~33'),('앞 캡','33~35'),('6001 2개','35~43 /46~54'),
        ('뒤 캡/추력','54~56 /56~61'),('금속 잠금 휠','61~69'),('풀리 전체 외형','76~94'),
        ('40T 벨트 치폭','77~83'),('모터 장착판','98~104'),('모터 전면/후면','104 /144'),
        ('중공 회전축','16~98 (길이82)')
    ],headers=('지역 축방향 z','명목 위치'),size=8.5,min_h=25)
    y=para(36,120,'벨트: 200-2GT-6, 40T:40T, 중심거리60. 모터 장착은 ±3 mm 슬롯으로 장력 조절합니다. 구매 풀리 외형은 OD≤28, 전체 길이≤18, 허브 OD≤20을 기준으로 설계했습니다.',750,10,16)
    para(36,y,'중공축 ID8.6과 고정축 Ø6 사이 반경 여유는 1.3 mm입니다. 세트스크류로 중공축을 찌그러뜨리지 않도록 점압흔을 얕게 가공하고, 24 mm 이송 전 구간에서 접촉음과 끌림이 없는지 확인합니다.',750,10,16,RED)

    start('03 · 반대쪽 면 잠금과 한 수 실행','고정 중앙축은 전체 자세를 유지하고, 반대쪽 면의 회전은 별도의 기계식 핀이 막습니다.')
    ox,oy,ss=168,360,5.3
    c.setStrokeColor(colors.HexColor(BLUE));c.setLineWidth(1.2);c.circle(ox,oy,19*ss,fill=0)
    c.circle(ox,oy,6.025*ss,fill=0)
    for x,y in ((16,0),(-16,0),(0,16),(0,-16)):c.circle(ox+x*ss,oy+y*ss,1.525*ss,fill=0)
    rect(ox+16*ss-4,oy-4,8,8,RED);txt(67,238,'금속 휠 Ø38 ×8 / 4×Ø3.05, PCD32',9,BLUE)
    txt(294,464,'잠금핀 규격과 위치',13,BLUE,True)
    table(294,444,[124,170,174],[
        ('구분','U/R/D/L 직결','F/B 중공'),('핀 유효길이','Ø3×30','Ø3×40'),
        ('잠금 위치','x16, y0, z56~86','x16, y0, z56~96'),('주차 위치','x28, y0, z56~86','x28, y0, z64~104'),
        ('손잡이 외형','OD≤7, 높이≤3','OD≤7, 높이≤3'),
        ('휠 축 체결','보어8.05, M4 2곳','보어12.05, M4 2곳')
    ],size=8.5,min_h=29)
    y=para(294,224,'휠/브래킷의 작동 핀 구멍은 실측 핀에 맞춰 Ø3.05로 리밍합니다. 방사 구멍은 45°/135°에서 Ø3.3 후 M4 탭. 휠은 금속 가공하며 잠금 구멍과 탭이 교차하지 않게 합니다.',466,9,14)
    y=para(36,165,'예: F를 돌릴 때 F/B 헤드를 결합 → B 잠금핀 삽입 → F 잠금핀을 주차 구멍으로 이동 → U/R/D/L을 24 mm 후퇴 → H 입력 → F 한 수 회전. 다음 수 전에도 같은 확인을 반복합니다.',750,11,18)
    para(36,y,'축을 바꿀 때: 기존 지지 쌍을 유지한 채 새 쌍을 먼저 결합합니다. 큐브 홈 정렬을 확인한 뒤 새 반대 면을 잠그고 직교 헤드를 후퇴시킵니다. 맞지 않는 핀을 모터 힘으로 밀어 넣지 않습니다.',750,10,16,RED)

    start('04 · 프레임 절단도와 홀 좌표','박스 내부 560³ / 외부 584³. 모든 패널 도면은 면 중심이 원점인 지역 x-y 좌표입니다.')
    ox,oy,s=214,300,.52
    c.setStrokeColor(colors.HexColor(BLUE));c.rect(ox-280*s,oy-280*s,560*s,560*s,fill=0)
    c.rect(ox-50*s,oy-50*s,100*s,100*s,fill=0)
    for a,b in itertools.product((-265,265),(-180,180)):
        for x,y in ((a,b),(b,a)):c.circle(ox+x*s,oy+y*s,2.25*s,fill=0)
    for x in (-20,20):c.circle(ox+x*s,oy-67*s,3.3*s,fill=0)
    for x,y in itertools.product((-60,60),(-10,10)):c.circle(ox+x*s,oy+y*s,2.75*s,fill=0)
    dim(ox-280*s,ox+280*s,oy+160,'F/B 패널 560')
    txt(99,140,'F/B 패널 대표도 · 100×100 작업창',9,BLUE)
    table(416,490,[145,210],[
        ('U/D (상·하)','각 584×584×12, 2장'),('R/L (좌·우)','각 560×584×12, 2장'),('F/B (앞·뒤)','각 560×560×12, 2장'),
        ('2060','246.5 길이 ×6, 앞끝 z=5 /뒤끝251.5'),('패널 공통 구멍','앵글 Ø4.5: (±265,±180),(±180,±265)'),
        ('프로파일 끝 고정','Ø6.6: (±20,-67), 6면 공통'),('F/B 브리지 고정','Ø5.5: (±60,±10), F/B만'),
        ('레일 지지대 고정','M5: x=±20, z=25/120; 축 y 방향')
    ],size=9,min_h=34)
    para(416,170,'2060의 길이방향 끝 코어 피치40, M6 탭 가능 여부를 먼저 확인하세요. 단면이 다르면 끝판/홀 좌표를 구매 도면에 맞춰 수정해야 합니다.',355,9,14,RED)
    para(36,98,'조립 순서: 하판 → 좌/우판 → 뒤판 → 프로파일 6개와 모듈 → 중앙축 브리지/SHF6 → 앞판 → 상판. 각 모서리의 ±180 위치에 30×30 앵글을 넣어 M4 볼트로 체결합니다. 앞판과 상판은 분해 가능하게 유지합니다.',750,10,16)

    start('05 · 출력 수량과 방향','220×220 mm 베드 기준 각 부품 단독 외형 확인. 무서포트 표시는 슬라이서 검토를 생략하라는 뜻이 아닙니다.')
    report=json.loads((OUT/'manufacturing.json').read_text())
    rows=[]
    for n,v in report['print_parts'].items():
        rows.append((n,str(v['qty']),' × '.join(str(round(x,1)) for x in v['bed_size_mm']), '필요/선택 검토' if v['support_review_required'] else '기본 방향 불필요'))
    y=table(36,495,[246,40,190,275],rows,headers=('STL 이름','수량','배치된 X×Y×Z','서포트 / 작업 메모'),size=8.2,min_h=16,padding=4)
    para(36,y-8,'STL은 방향과 바닥 z=0을 반영했습니다. 구동판은 평판 뒤쪽, 코어는 분할면, 캐리지는 옆면, 레일/잠금 브래킷은 넓은 고정면을 바닥으로 둡니다. 공차 시험편 → 큐브 1세트 → 헤드 1개 순서로 출력하세요.',750,9,14)

    start('06 · 구매·가공 부품 A','금속 축·베어링·벨트·레일·스프링은 FDM 출력물로 대체하지 않습니다. 수량은 전체 6면 기준입니다.')
    y=table(36,495,[35,130,480,40,66],MAIN_BOM[:16],headers=('ID','품목','규격 / 확인점','수량','조달'),size=8.8,min_h=24)
    para(36,y-15,'금속 가공 의뢰: 중앙축 평면, 중공축 정밀 외경/보어, 금속 인덱스 휠, 소형 고정 링. STEP 외형과 이 PDF의 탭/가공 지시를 함께 전달하세요. 다월핀·베어링은 완제품을 구매합니다.',750,10,16,RED)

    start('07 · 구매·가공 부품 B','구매 전 제조사 도면으로 실제 외형·체결 깊이·레일 끝단 여유를 대조하세요. 가격과 재고는 조사 범위에 포함하지 않았습니다.')
    y=table(36,495,[35,130,480,40,66],MAIN_BOM[16:],headers=('ID','품목','규격 / 확인점','수량','조달'),size=8.8,min_h=27)
    para(36,y-15,'스프링은 실물 회전 토크를 보며 장력을 정합니다. F/B는 ID≥6.4, OD≤10, 자유길이 약5를 시작값으로 사용합니다. 과도한 압축은 마찰·탈조를 만들며 핀 끝이 소켓 바닥을 누르지 않아야 합니다.',750,10,16,RED)

    start('08 · 체결품 수량과 길이','베어링·모터·인서트 제품별 나사 깊이를 실측합니다. 수량은 예비분을 포함하지 않습니다.')
    y=table(36,495,[34,199,470,48],FAST_BOM,headers=('ID','규격','용도','수량'),size=8.8,min_h=23)
    para(36,y-13,'주요 제한: MGN 블록 탭 깊이 약3.5, 모터 전면 탭은 구매 도면 우선. 허브 세트스크류가 중공축을 뚫지 않아야 합니다. 금속 휠은 조정 후 축의 축 방향 이탈을 막도록 체결하고 추력 베어링을 과하게 예압하지 않습니다.',750,9,14,RED)

    start('09 · 배선과 수동 확인 펌웨어','전자 회로 핀 배치는 유지. V3는 매 수 기구 준비를 확인하는 수동 조립/시운전 모드입니다.')
    table(36,495,[70,215,466],ELECTRIC,headers=('ID','부품','연결/선정 기준'),size=9,min_h=30)
    y=para(36,249,'회전 STEP: U/R/F/D/L/B = D2/3/4/5/6/7. DIR = D8/9/10/11/12/13. 모든 GND 공통. A4988 RESET과 SLEEP을 연결한 뒤 5 V로 끌어올리고, MS1/2/3은 LOW로 고정하여 풀스텝으로 시작합니다. VMOT는 별도 12 V로 공급합니다.',750,10,16)
    y=para(36,y,'시리얼 115200: Q 0 = 실제 모터/수동 확인, Q 1 = 가상 계산(모터 출력 없음). M F 입력 → PREPARE 안내 → 기구를 준비한 뒤 H 한 줄 입력. X 또는 180초 시간초과는 중단하며 완료된 수까지의 모델 상태를 유지합니다. S/V도 매 수 H가 필요합니다.',750,10,16)
    y=para(36,y,'초기 시험은 50 풀스텝=90°, 40T:40T=1:1, 약0.8초/90°와 정착 250 ms입니다. 각 면의 실제 시계방향을 먼저 확인합니다. 탈조·손회전·전원 차단이 생기면 모델 상태를 신뢰할 수 없어 큐브를 실제로 맞춘 뒤 R로 재동기화해야 합니다.',750,10,16)
    para(36,y,'H는 사람의 확인이며 위치 센서가 아닙니다. 자동 결합/후퇴와 자동 잠금은 구현하지 않았습니다. 자동화하려면 이송 구동기, 양 끝 위치 확인, 잠금 상태 확인과 별도 제어 I/O를 추가해야 합니다.',750,10,16,RED)

    start('10 · 조립 순서와 제작 합격 기준','CAD와 가상 풀이 검증이 실물 완성을 의미하지 않습니다. 각 단계에 합격한 뒤 다음 단계를 조립하세요.')
    table(36,495,[60,335,356],[
        ('1. 공차','소켓/축 시험편부터 출력, 실제 핀과 중앙축 대조','다월핀 탈착 가능, D 평면 시임으로 회전 유격 제거, 무리한 압입 없음'),
        ('2. 코어','중앙축에 내부 링2·키 시임·분할 코어 조립','코어를 0.10 N·m로 좌우 가압해 미끄러짐/지속 변위 없음'),
        ('3. 큐브','4개 M3 센터 +F/B 센터/외부 스프링/링 →엣지/코너','손으로 6면을 20회 이상 회전. 걸림·조각 이탈·균열 없음'),
        ('4. 헤드1','베어링·축·허브·구동판·핀·금속 휠·잠금 브래킷','핀 끝 3 mm 삽입, 소켓 바닥 여유1.2. 손으로 90°/180° 역회전 가능'),
        ('5. 프레임','박스 앵글 →2060 →레일 지지대 →가이드/캐리지','모듈이 모두 프레임에 체결. 이송 0~24 mm에 나사 머리/배선 간섭 없음'),
        ('6. 축 고정','브리지와 SHF6 정렬, 중앙축 양 끝 고정','양쪽을 무리하게 당겨 휘지 않게 조립. 중공축과 고정축의 접촉 없음'),
        ('7. 잠금 시험','반대 면 잠금, 작동 면 주차, 직교4면 후퇴','0.10 N·m 시험에서 반대 면/코어의 지속 회전 없음. 목표 변위<0.5°'),
        ('8. 통합 시험','각 면 단일 수 →F F\' →R R\' →U U\' →짧은 수열','매 수 육안/각도계로 검증. 20회 반복 후 누적 위치오차<0.5°, 과열 없음')
    ],headers=('단계','조립 내용','통과 조건(실측 기록 필요)'),size=9,min_h=40)
    checks=json.loads((OUT/'mechanical_checks.json').read_text())
    para(36,118,f"이번 CAD 결과: {'통과' if checks['passed'] else '미통과'}. 3축 ×15/30/45/60/75/90° 표본, 헤드 내부와 0/12/24 mm 이송, 지지 4자세, 프레임 및 축 경로 검사. 검사 허용 부피0.02 mm³. 연속 구간의 수학적 증명이나 강도 검증은 아닙니다.",750,9,14)
    para(36,64,'참고 도면: HIWIN MG 가이드 카탈로그 / HER SHIN SHF 도면 / SMB 6001 도면 / Avid F12-21M / Pololu A4988. 정확한 URL과 검증 로그는 BUILD_V3.md 및 JSON에 보존했습니다.',750,8,12)
    c.save()

if __name__=='__main__':
    previews();dxf_files();pdf();print('CAD images, DXF, BOM CSV, and PDF generated.')
