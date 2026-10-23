"""Render actual CAD and write the Korean V4 assembly PDF, CSV and Markdown.

Fonts: Nanum Gothic (OFL); bundled font licence is retained. No AI image art.
Run after build_robot_v4.py and build_robot_v4_kit.py.
"""
import csv,json,math,re,sys
from pathlib import Path
import numpy as np
import cadquery as cq
import ezdxf
from ezdxf import bbox as dxf_bbox
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4,A2,landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
import build_robot_v4 as d
import build_robot_v4_kit as k
from robot_v4_manual_data import PRINTS,JIGS,BUY,KIT,MATERIAL,FASTENERS,PAGES

ROOT=d.ROOT; DOC=ROOT/'docs'; IMG=DOC/'images'/'v4_manual'
PDF=DOC/'BUILD_V4_상세제작설명서.pdf'
BLUE='#346baf'; RED='#c35a43'; GREEN='#248476'; AMBER='#aa7431'; INK='#1e3045'
ID={name:ident for ident,name,label,qty in PRINTS+JIGS}
LABEL={ident:label for ident,name,label,qty in PRINTS+JIGS}

def mesh(ax,s,c):
    if s.Volume()<1e-6:return
    v,t=s.tessellate(.3,.45)
    if not t:return
    a=np.array([p.toTuple() for p in v])
    poly=Poly3DCollection(a[np.array(t)],facecolors=c,edgecolors=c,linewidths=0,shade=True,
                         lightsource=matplotlib.colors.LightSource(azdeg=300,altdeg=45))
    ax.add_collection3d(poly)

def render(name,items,labels=False,world=False,elev=23,azim=-55,thumb=False):
    path=IMG/(name+'.png')
    if path.exists():return path
    fig=plt.figure(figsize=(3,2.4) if thumb else (10,5.6),facecolor='white')
    ax=fig.add_subplot(111,projection='3d',computed_zorder=False)
    bounds=[]
    for ident,s,c in items:
        if world:s=s.rotate((0,0,0),(1,0,0),90) # world Y becomes display Z
        mesh(ax,s,c)
        bb=s.BoundingBox();bounds.append([bb.xmin,bb.xmax,bb.ymin,bb.ymax,bb.zmin,bb.zmax])
        if labels and ident:
            ax.text((bb.xmin+bb.xmax)/2,(bb.ymin+bb.ymax)/2,(bb.zmin+bb.zmax)/2,ident,
                    fontsize=8,color=INK,bbox=dict(boxstyle='round,pad=.2',facecolor='white',edgecolor='#ced8e1',alpha=.94),zorder=10)
    a=np.array(bounds);lo=a[:,[0,2,4]].min(axis=0);hi=a[:,[1,3,5]].max(axis=0)
    size=np.maximum(hi-lo,1);center=(hi+lo)/2
    for setlim,c,sz in zip((ax.set_xlim,ax.set_ylim,ax.set_zlim),center,size):setlim(c-sz*.58,c+sz*.58)
    ax.set_box_aspect(size);ax.view_init(elev=elev,azim=azim);ax.set_axis_off()
    fig.subplots_adjust(0,0,1,1)
    fig.savefig(path,dpi=110 if thumb else 160,facecolor='white',bbox_inches='tight',pad_inches=.02)
    plt.close(fig);return path

def assets():
    IMG.mkdir(parents=True,exist_ok=True)
    cubes,derived,instances,modules,lock=d.make_design()
    pmap=d.printable_parts(cubes,modules,lock)
    panels,metal,extra,jigs=k.design()
    pmap.update(extra);pmap.update(jigs)
    cards=[]
    for ident,name,label,qty in PRINTS+JIGS:
        s=pmap[name][0]
        path=render('part_'+ident,[(ident,s,BLUE)],thumb=True)
        cards.append((ident,label,str(qty),'출력' if ident[0]=='P' else '지그 출력',path,BLUE))
    h=modules[False][1];hh=modules[True][1];lh=lock[1]
    B=d.box;C=d.cyl;F=d.fuse
    generic={
      'B01':h['motor_NEMA17'],'B02':h['servo_MG996R'],
      'B03':F(B(20,16,2,(0,0,1)),B(8,8,5,(0,0,4.5))),
      'B04':F(B(69,54,2,(0,0,1)),B(13,12,10,(-27,15,7)),B(8,8,11,(-27,-15,7.5))),
      'B05':F(h['rail_MGN12'],h['block_MGN12H']),
      'B06':h['pin_0'],'B07':h['spindle_8mm'],'B08':hh['spindle_hollow_17x12'],
      'B09':lh['lock_bar'],'B10':h['bearing_608_0'],'B11':hh['bearing_6003_0'],
      'B12':h['thrust_F8_16M'],'B13':hh['front_thrust_17x30'],'B14':h['shaft_collar_8'],
      'B15':hh['shaft_collar_17'],'B16':h['coupling_5x8'],
      'B17':F(hh['pulley_40T_driver'],hh['pulley_40T_driven'],hh['belt_200_2GT_6_pitch_envelope']),
      'B18':F(h['engage_switch'],B(16,2,1,(22,-45,159))),
      'B19':F(B(70,36,26,(-40,0,13)),B(70,36,26,(40,0,13))),
      'B20':F(C(3,0,16),C(6,16,19),C(10,-2,0).cut(C(3.5,-3,1))),
      'K01':F(B(80,36,2,(0,0,1)),B(72,25,7,(0,0,5.5)),B(64,16,1,(0,0,9.5))),
      'K02':F(B(6,6,3,(0,0,1.5)),C(3,3,6)),
      'K03':C(12,0,9),
      'K04':F(B(3,3,35,(-5,0,17.5)),B(3,3,35,(0,0,17.5)),B(3,3,35,(5,0,17.5))),
      'M01':F(panels['panel_base'],panels['panel_B']),
      'M02':metal['profile_F'],'M03':metal['corner_1_1_60'],'M04':metal['lock_spine']}
    for group,kind,col in ((BUY,'구매',RED),(KIT,'사진 키트',GREEN),(MATERIAL,'구매·가공',AMBER)):
        for ident,label,qty,note in group:
            s=generic[ident];path=render('part_'+ident,[(ident,s,col)],thumb=True)
            cards.append((ident,label,qty,kind,path,col))
    # General view: F/R panels are intentionally removed for visibility.
    robot=list(d.assembly_items(instances,modules,lock))
    frameitems=[(n,s,AMBER if n.startswith('panel') else '#bbc4ce') for n,s in {**panels,**metal}.items() if n not in ('panel_F','panel_R')]
    robotitems=[('',s,d.color(kind)) for n,kind,s in robot]
    render('overview',frameitems+robotitems,world=True)
    render('frame',[(n,s,AMBER if n.startswith('panel') else '#a5b1bd') for n,s in {**panels,**metal}.items()],world=True)
    exploded=[]
    for n,kind,s,pos in instances:
        ident=ID[kind]
        exploded.append((ident,s.translate(tuple(a*14 for a in pos)),BLUE if kind in ('cube_core','cube_center','center_recessed') else '#53a1a0' if kind=='cube_edge' else '#e5b565'))
    render('cube',exploded,world=True,labels=True)
    heads,hw=modules[False]
    direct=[]
    for name in ['drive_plate_strip','shaft_hub','bearing_front_cap','bearing_housing','bearing_rear_cap']:
        nn=name if name in ('shaft_hub','drive_plate_strip') else name+'_direct'
        shift={'drive_plate_strip':-25,'shaft_hub':-13,'bearing_front_cap':0,'bearing_housing':10,'bearing_rear_cap':24}[name]
        direct.append((ID[nn],heads[name].translate((0,0,shift)),BLUE))
    for name in ['spindle_8mm','bearing_608_0','bearing_608_1','thrust_F8_16M','rear_thrust_F8_16M','shaft_collar_8','coupling_5x8','motor_NEMA17']:
        direct.append(('',hw[name],RED))
    render('direct',direct,labels=True,elev=15,azim=-65)
    render('pin',[('P30',heads['drive_plate_strip'],BLUE),('P07',modules[True][0]['drive_plate_2pin'].translate((70,0,0)),'#8296ad'),('B06',hw['pin_0'],RED),('B06',hw['pin_1'],RED),('J03',jigs['pin_depth_gauge'][0].translate((0,0,-12)), '#b9cedd')],labels=True)
    rail=[('P13',heads['rail_support'],BLUE),('B05',hw['rail_MGN12'],RED),('',hw['block_MGN12H'],RED),('P12',heads['carriage'].translate((0,15,0)), '#8296ad')]
    render('rail',rail,labels=True,elev=15,azim=-65)
    render('servo',[('P14',heads['servo_mount'],BLUE),('B02',hw['servo_MG996R'].translate((0,0,-20)),RED),('P15',heads['servo_clamp'].translate((20,0,0)), '#82a7cf')],labels=True,elev=16)
    profile=metal['profile_F'].moved(d.face_location_v4('F').inverse)
    crop=B(80,70,100,(0,-45,205))
    detail=[('2060',profile.intersect(crop),'#b6bfc8'),
            ('P13',heads['rail_support'].intersect(crop),BLUE),
            ('B05',hw['rail_MGN12'].intersect(crop),'#8394a1'),
            ('P14',heads['servo_mount'],'#57a69c')]
    for label,x,z,front in [('F11-a',-20,239,-51),('F11-b',20,239,-51),('F25',-20,171,-48)]:
        washer=C(10,front,front+1,(0,1,0),(x,0,z))
        head=C(8.5,front+1,front+4.5,(0,1,0),(x,0,z))
        detail.append((label,F(washer,head),RED))
    render('mount_detail',detail,labels=True,elev=17,azim=35)
    cr=[]
    for theta,color in ((0,'#346baf'),(90,'#8babc9'),(180,'#d09b64')):
        crank,link=d.crank_link(theta)
        cr += [(str(theta)+'deg',crank,color),('',link,color)]
    render('crank',cr,labels=True,elev=10,azim=-80)
    Dheads,Dhw=modules[True]
    render('hollow',[(ID.get(d.export_name(n,True),''),s,BLUE) for n,s in Dheads.items() if n not in ('rail_support','servo_mount','servo_clamp','crank','link')]+[('',s,RED) for n,s in Dhw.items() if n in ('spindle_hollow_17x12','bearing_6003_0','bearing_6003_1','pulley_40T_driver','pulley_40T_driven','belt_200_2GT_6_pitch_envelope','motor_NEMA17_offset','shaft_collar_17')],labels=True,elev=18,azim=-60)
    lockitems=[(ID.get(n,''),s,BLUE) for n,s in lock[0].items()]+[('B09',lh['lock_bar'],RED)]
    spine=metal['lock_spine'].moved(d.face_location_v4('D').inverse)
    lockitems += [('M04',spine,AMBER),('P29',extra['lock_switch_bracket'][0],BLUE)]
    render('lock',lockitems,labels=True,elev=18,azim=-65)
    close=[('',s,d.color(kind)) for _,kind,s in robot if s.BoundingBox().ymax>-70 and s.BoundingBox().ymin<60]
    # The alignment gauge is shown separately, not pretending to be a driven cube.
    render('alignment',[(ident,s,c) for ident,s,c in robotitems if s.BoundingBox().xlen<120 and s.BoundingBox().ymin>-100 and s.BoundingBox().ymax<100],world=True)
    render('switch',[('P13',heads['rail_support'],BLUE),('B18',hw['engage_switch'],RED),('P12',heads['carriage'], '#8ba6bf')],labels=True,elev=12,azim=-70)
    # Flip poses use actual cube solids; R/L end layers stay on their heads.
    flip=[]
    for angle,dx in ((0,-95),(90,0),(180,95)):
        for _,kind,s,_ in instances:
            flip.append((str(angle)+'deg' if kind=='cube_core' else '',s.rotate((0,0,0),(1,0,0),angle).translate((dx,0,0)),d.color(kind)))
    render('flip',flip,labels=True,world=True)
    return cards,pmap

class Writer:
    def __init__(self):
        pdfmetrics.registerFont(TTFont('NG',str(DOC/'assets/fonts/NanumGothic-Regular.ttf')))
        pdfmetrics.registerFont(TTFont('NGB',str(DOC/'assets/fonts/NanumGothic-Bold.ttf')))
        pdfmetrics.registerFontFamily('NG',normal='NG',bold='NGB',italic='NG',boldItalic='NGB')
        self.c=Canvas(str(PDF),pagesize=A4,pageCompression=1)
        self.c.setTitle('robot_v4 상세 제작 설명서 · 부품 지도 · 조립 도면 · Rev C')
        self.c.setAuthor('physical_computing_project')
        self.i=0;self.toc=[]
    def para(self,text,size=9.4,leading=14,color=INK,bold=False,width=None,x=None):
        style=ParagraphStyle('p',fontName='NGB' if bold else 'NG',fontSize=size,leading=leading,textColor=colors.HexColor(color),wordWrap='CJK',spaceAfter=0)
        p=Paragraph(text,style);pw,ph=p.wrap(width or self.w-32*mm,1000*mm)
        if self.y-ph<20*mm:raise RuntimeError(f'Page {self.i} overflow: {text[:60]} at {self.y/mm:.1f}')
        p.drawOn(self.c,x if x is not None else 16*mm,self.y-ph);self.y-=ph+3*mm
    def start(self,title,wide=False):
        if self.i:self.c.showPage()
        self.i+=1;self.w,self.h=landscape(A2) if wide else A4
        self.c.setPageSize((self.w,self.h));self.y=self.h-17*mm;self.toc.append((self.i,title))
        self.c.bookmarkPage('page'+str(self.i));self.c.addOutlineEntry(title,'page'+str(self.i),level=0)
        self.c.setFillColor(colors.HexColor(BLUE));self.c.rect(0,self.h-5*mm,self.w,5*mm,fill=1,stroke=0)
        self.para(title,23 if wide else 19,28 if wide else 25,bold=True,width=self.w-30*mm)
        self.c.setFillColor(colors.HexColor('#697b8b'));self.c.setFont('NG',7.4)
        self.c.drawString(16*mm,10*mm,'ROBOT V4 / Rev C / 치수 mm · 실물 시험 전')
        self.c.drawRightString(self.w-16*mm,10*mm,f'{self.i:02d}')
    def image(self,name,height=75):
        f=IMG/(name+'.png')
        self.c.drawImage(str(f),16*mm,self.y-height*mm,width=self.w-32*mm,height=height*mm,preserveAspectRatio=True,anchor='c',mask='auto')
        self.y-=height*mm+3*mm
    def table(self,rows,widths,size=8.1):
        style=ParagraphStyle('cell',fontName='NG',fontSize=size,leading=size*1.43,wordWrap='CJK',textColor=colors.HexColor(INK))
        data=[[Paragraph(str(v),style) for v in row] for row in rows]
        t=Table(data,colWidths=[v*mm for v in widths],repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e5edf5')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor('#9fb2c7')),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#dbe2e9')),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        w,h=t.wrap(self.w-32*mm,1000*mm)
        if self.y-h<20*mm:raise RuntimeError(f'Table overflow page {self.i}: {h/mm}')
        t.drawOn(self.c,16*mm,self.y-h);self.y-=h+4*mm
    def section(self,heading,text):
        self.para(heading,10.5,15,bold=True);self.y+=1*mm
        self.para(text)

def catalog(w,cards):
    w.start('ROBOT V4  |  무엇을 출력하고, 사고, 키트에서 꺼내는가',True)
    w.para('번호는 조립 순서와 연결됩니다. 파랑 P/J = 3D 출력 · 주황 B = 구매 · 초록 K = 사진 속 키트 · 갈색 M = 재료 구매 후 절단/가공',12,18,width=w.w-32*mm)
    top=w.y;columns=11; rows=math.ceil(len(cards)/columns);cw=(w.w-32*mm)/columns;ch=(top-25*mm)/rows
    for i,(ident,label,qty,kind,path,col) in enumerate(cards):
        row,colidx=divmod(i,columns);x=16*mm+cw*colidx;y=top-ch*(row+1)
        w.c.setStrokeColor(colors.HexColor('#dce4ec'));w.c.setFillColor(colors.white)
        w.c.roundRect(x+1*mm,y+1*mm,cw-2*mm,ch-2*mm,2*mm,fill=1,stroke=1)
        w.c.setFillColor(colors.HexColor(col));w.c.roundRect(x+2*mm,y+ch-9*mm,cw-4*mm,7*mm,1*mm,fill=1,stroke=0)
        w.c.setFont('NGB',10);w.c.setFillColor(colors.white);w.c.drawString(x+4*mm,y+ch-7*mm,ident)
        w.c.setFont('NG',8);w.c.drawRightString(x+cw-4*mm,y+ch-7*mm,kind+' · '+qty)
        w.c.drawImage(str(path),x+3*mm,y+14*mm,width=cw-6*mm,height=ch-25*mm,preserveAspectRatio=True,anchor='c',mask='auto')
        sty=ParagraphStyle('cat',fontName='NG',fontSize=8.3,leading=11,wordWrap='CJK',alignment=1)
        p=Paragraph(label,sty);pw,ph=p.wrap(cw-6*mm,12*mm);p.drawOn(w.c,x+3*mm,y+5*mm)
    w.c.setFont('NG',9);w.c.setFillColor(colors.HexColor(INK))
    w.c.drawString(16*mm,18*mm,'출력33종·93개(지그/시험편 포함) / 구매품은 외형 참고도 · 실측 우선 / 키트의 소형 서보·28BYJ-48·ULN2003은 대체품 아님')

def wiring(w):
    c=w.c;top=w.y;left=20*mm
    boxes=[(20,top/mm-26,49,22,'UNO 5V',BLUE),(91,top/mm-26,43,22,'A4988 x5',RED),(148,top/mm-26,43,22,'MG996R x6',RED),
           (91,top/mm-59,43,20,'12V DC',AMBER),(148,top/mm-59,43,20,'6V DC',AMBER)]
    for x,y,a,b,t,col in boxes:
        c.setStrokeColor(colors.HexColor(col));c.setFillColor(colors.HexColor('#f5f8fb'));c.roundRect(x*mm,y*mm,a*mm,b*mm,2*mm,fill=1,stroke=1)
        c.setFillColor(colors.HexColor(INK));c.setFont('NGB',9);c.drawCentredString((x+a/2)*mm,(y+b/2-1)*mm,t)
    c.setStrokeColor(colors.HexColor(INK));c.setLineWidth(1)
    c.line(69*mm,(top/mm-14)*mm,91*mm,(top/mm-14)*mm)
    c.line(134*mm,(top/mm-8)*mm,143*mm,(top/mm-8)*mm);c.line(143*mm,(top/mm-8)*mm,143*mm,(top/mm+1)*mm);c.line(143*mm,(top/mm+1)*mm,45*mm,(top/mm+1)*mm)
    for x in (112.5,169.5):c.line(x*mm,(top/mm-26)*mm,x*mm,(top/mm-39)*mm)
    c.setFont('NG',8);c.drawString(24*mm,(top/mm-42)*mm,'GND 공통 / 양극 전원은 분리')
    w.y-=68*mm

def flat_drawing(w,name,height=88,swap=False):
    """Vector drawing from fabrication DXF, including true circular holes."""
    doc=ezdxf.readfile(k.OUT/'cut'/(name+'.dxf'));space=doc.modelspace()
    bounds=dxf_bbox.extents(space)
    lo=np.array(tuple(bounds.extmin)[:2]);hi=np.array(tuple(bounds.extmax)[:2])
    if swap:lo=lo[::-1];hi=hi[::-1]
    extent=hi-lo;area_w=w.w-48*mm;area_h=(height-16)*mm
    scale=min(area_w/extent[0],area_h/extent[1])
    x0=(w.w-extent[0]*scale)/2;y0=w.y-height*mm+10*mm
    def xy(p):
        q=np.array(tuple(p)[:2]);q=q[::-1] if swap else q
        return x0+(q[0]-lo[0])*scale,y0+(q[1]-lo[1])*scale
    c=w.c;c.setLineWidth(.55);c.setStrokeColor(colors.HexColor(INK))
    for e in space:
        if e.dxftype()=='CIRCLE':
            x,y=xy(e.dxf.center);c.circle(x,y,e.dxf.radius*scale,fill=0,stroke=1)
        elif e.dxftype()=='LINE':
            a,b=xy(e.dxf.start),xy(e.dxf.end);c.line(*a,*b)
        elif e.dxftype()=='LWPOLYLINE':
            pts=[xy(p) for p in e.get_points()];path=c.beginPath();path.moveTo(*pts[0])
            for p in pts[1:]:path.lineTo(*p)
            if e.closed:path.close()
            c.drawPath(path)
    c.setFont('NG',8);c.setFillColor(colors.HexColor(INK))
    c.drawCentredString(w.w/2,y0-5*mm,f'{name} · {extent[0]:g} × {extent[1]:g} mm · 치수 우선')
    c.line(x0,y0-2*mm,x0+extent[0]*scale,y0-2*mm)
    for xx in (x0,x0+extent[0]*scale):c.line(xx,y0-3*mm,xx,y0)
    w.y-=height*mm+3*mm

def write_outputs(cards,pmap):
    w=Writer();catalog(w,cards)
    md=['# robot_v4 상세 제작 설명서 · Rev C','병합 기준: 83ade39 · 기구 원형: b37de3e9 · 조립 단순화: 전산봉/간격관 제거, 위치 결정 턱, 한쪽 체결','']
    # Intro and kit page before bills.
    for title,img,sections in PAGES[:2]:
        w.start(title)
        if img:w.image(img,65)
        for h,t in sections:w.section(h,t)
    w.start('출력 부품표 1/2 · 큐브와 공통 모듈')
    for chunk in (PRINTS[:17],PRINTS[17:]+JIGS):
        if chunk[0][0]=='P18':w.start('출력 부품표 2/2 · D 모듈·잠금·지그')
        rows=[['번호','파일 이름 (.stl)','수량','역할']]+[[i,n,q,l] for i,n,l,q in chunk]
        w.table(rows,[15,76,12,75],7.6)
        w.para('P01~P28, P30: models/robot_v4/print/ · P29: assembly_kit/print/ · J01~J03: assembly_kit/jigs/',8.4,12)
        w.para('부품 수량은 출력 파일 종류와 다릅니다. 큐브 엣지12개·코너8개를 빠뜨리지 마세요. 시험편과 조립 지그는 로봇에 남겨 두지 않습니다.',9,13)
    for group,title in ((BUY[:10],'구매 부품표 1/2'),(BUY[10:],'구매 부품표 2/2'),(KIT+MATERIAL,'키트 재사용·프레임 가공표')):
        w.start(title)
        w.table([['번호','부품 / 수량','구매·가공 시 확인']]+[[i,l+' / '+q,n] for i,l,q,n in group],[14,65,99],8.3)
    for n,chunk in enumerate((FASTENERS[:12],FASTENERS[12:])):
        w.start(f'체결 부품표 {n+1}/2 · 여분 수량 별도')
        w.table([['번호','규격 / 수량','사용 위치']]+[[i,l+' / '+str(q),note] for i,l,q,note in chunk],[14,71,93],7.8)
        w.para('길이는 나사 머리 아래부터 잽니다(접시머리는 규격에 따라 전체 길이). 실제 구매품 두께·머리·너트·와셔를 재고 끝이 막힌 곳에 닿지 않게 합니다. 인서트·금속 링 규격은 실측 우선입니다.',8.4,12)
    for title,img,sections in PAGES[2:]:
        w.start(title)
        if img=='wiring':wiring(w)
        elif img:w.image(img,90)
        for h,t in sections:w.section(h,t)
    w.start('체결 상세 · 실제 쌓임 길이로 확인')
    w.table([['연결','나사 방향 / 쌓임','남겨 둘 조건'],
      ['집-캐리지','Y방향 M3×20: 머리·와셔·6T·6T·와셔·너트','두 면 밀착, 축 비틀림 없음'],
      ['지지대-2060','Y방향 M5×12: 머리·와셔1·P13 6T·T너트','나사 물림 약5, 너트 회전 잠금'],
      ['가이드-금속판','X방향 M4×12: 머리·와셔1·M04 6T·M4 인서트','물림약4, 나사끝 바닥 여유'],
      ['혼-크랭크','X방향 M2×8: 머리·금속 혼·4T 크랭크·너트','혼 실측 두께, 출력축 중심 나사 별도'],
      ['링크 조인트','X방향 평활 Ø3 축+얇은 와셔+잠금 너트','0.1~0.2 옆 유격, 손으로 자유 회전'],
      ['서보-2060 위','Y방향 M5×12 두 개: 머리·와셔1·P14 6T·T너트','돌기/포켓 삽입, 면 밀착'],
      ['서보-2060 아래','Y방향 M5×16 한 개: 와셔1·P14 3T·P13 6T·T너트','물림약6, 슬롯 바닥 여유'],
      ['스위치 받침-판','X방향 M3×12: 와셔1·M04 6T·P29 인서트','P29 인서트2개, 과열 금지']],[35,93,50],8.5)
    w.section('접착층 두께도 치수다','실리콘 패드에는 재료에 맞는 얇은 접착층만 사용한다. 패드와 접착층을 합친 작동 두께를0.8 기준으로 맞춘다. 출력물의 금속 인서트는 열삽입하며, 떨어지는 인서트를 순간접착제로 고정해 하중 부품으로 사용하지 않는다.')
    w.section('나사를 조이면 안 되는 조인트','프레임·베어링 집·서보 캡은 고정 체결이다. 링크 양끝은 회전 조인트다. 같은 힘으로 끝까지 조이면 서보가 움직이지 못한다. 평활 축의 어깨 또는 금속 간격 부시가 조임력을 받고 링크는 자유 회전하도록 실제 조인트 길이를 정한다.')
    w.start('잠금 지지판 M04 · 홀 좌표표')
    w.para('6T 알루미늄 판. D 모듈 국소 좌표로 외곽 y=-77..47,z=172..298, x=-36..-30. 아래 좌표는 X 방향 관통 홀의 중심이다. 구멍은 DXF와 함께 업체에 전달한다.',9.4,14)
    w.table([['y','z','지름','사용처'],['-67','240 / 280','5.4','D2060 옆면 T너트'],['-9 / +9','180 / 190','4.4','P23 네 구멍'],['38','241','3.4','잠금 서보 캡 앞'],['24','291','3.4','잠금 서보 캡 뒤'],['-21','208 / 216','3.4','P29 스위치 받침']],[30,40,25,83],9)
    w.image('lock',85)
    w.para('가공치수의 검수 목표: 홀 중심 ±0.10, 모서리 버 제거. 이 값은 구매 가공 사양 제안이며 완성 로봇의 정밀도를 보증하지 않는다. 기준면을 바꿔 치수를 누적하지 않는다.',9,13)
    w.start('M01 측판 가공도 · 앞/뒤와 좌/우')
    w.para('외곽과 홀은 실제 절단 DXF에서 직접 그렸다. 각 형상에 별도 축척을 적용했으므로 종이를 재지 말고 표시 치수와 DXF를 사용한다. F/B는597×450×12, R/L은621×450×12다.',9.2,14)
    flat_drawing(w,'panel_F',87)
    flat_drawing(w,'panel_R',87,True)
    w.para('모서리/바닥 앵글 홀 Ø4.5 여섯 개, 프로파일 끝 홀 Ø6.6 두 개다. Rev C는 서보 전산봉 홀 네 개를 제거했다. 뒤판은 앞판과 같은 규격이며 앞/뒤 방향 표시는 조립 전에 한다. 좌/우판은 앞/뒤판의 절단면을 덮는다.',9.2,14)
    w.start('M01 바닥 가공도 · 하부 모듈 기준')
    w.para('621×621×18. 바닥 윗면 A가 world y=-332다. 중앙은 큐브 중심선 B/C의 교점이며 D프로파일은 z=-67 중심으로 아래에 고정된다.',9.2,14)
    flat_drawing(w,'panel_base',168)
    w.section('작업대 검수','외곽 두 대각선 차이, 평탄도, Ø6.6 두 개의 중심 위치를 확인한다. Ø4.5 여덟 개는 바닥 앵글용이다. Rev C는 Ø3.6 전산봉 홀 네 개를 제거했다. 뒤틀린 판을 볼트로 강제 평탄화하면 모듈 정렬이 달라진다.')
    w.start('파일·검증 결과·다음 재생성')
    w.section('함께 제공하는 파일','상세 PDF, BUILD_V4.md 원문, assembly_kit/부품표 CSV, 컷용DXF/STEP, 추가 출력물과지그STL, 전체프레임조립STEP를제공한다. ZIP은다운로드한뒤폴더구조그대로푼다. STL은실제크기mm로슬라이서에넣고 STEP는CAD에서편집한다.')
    for f,title in [(d.OUT/'mechanical_checks.json','V4 본체 검사'),(k.OUT/'kit_checks.json','프레임·이송 보강 검사')]:
        if f.exists():
            data=json.loads(f.read_text());w.section(title,f"passed={data.get('passed')} · failure_count={data.get('failure_count')} · 실제 출력/하중 시험은 미실시. 검사 대상과 표본 범위는 같은 이름의JSON에 기록한다.")
    w.section('재생성 명령','python tools/build_robot_v4.py --stl-tolerance 0.1 --stl-angular 0.3<br/>python tools/build_robot_v4_kit.py<br/>python tools/check_robot_v4.py<br/>python tools/check_robot_v4_kit.py<br/>node tools/embed_models_v4.js<br/>python tools/make_robot_v4_manual.py')
    w.section('검증의 범위','기하 검사는 명목강체와 구매외형의 이산자세 검사다. 모든나사머리·스위치레버·혼의실제형상·케이블·탄성변형·마찰·출력수축은 포함되지 않는다. 계산상의안전계수나반복정밀도를증명하지않는다. 본문의실물확인표로제작품별합격을기록한다.')
    w.start('설계 출처와 사용 조건')
    for h,t in [
      ('최신 통합 기준과 기구 원형','병합 기준83ade39: https://github.com/26037-arch/physical_computing_project/commit/83ade39d35a54d3a644a2fec932033650a53e135<br/>기구 원형b37de3e9: https://github.com/26037-arch/physical_computing_project/commit/b37de3e9ccd96e308c293c7b97e6c1e72bd0dcf9<br/>원격의 띠 판·6 mm 막대·원뿔 핀에 a7f8bcd의 프로파일 직결·정렬 턱·인서트를 결합했다.'),
      ('큐브 유지 트랙','Jared Deckard의 MIT 3×3×3 cube puzzle을 재구성한 V2 형상을 계승한다. models/robot_v4/THIRD_PARTY_LICENSE.md에 원본·라이선스를 보존했다. 공개 CAD가 실물 성능을 보증하지는 않는다.'),
      ('전기 참고','Pololu A4988 제품1182의 전류제한·VMOT 콘덴서 설명: https://www.pololu.com/product/1182<br/>실제 복제품의 감지저항·방열·회로는 구매 도면을 우선한다.'),
      ('D 추력 유닛 치수 확인','JTEKT/Koyo AXK1730TN 자료는17×30×2 케이지와 AS1730 1T 와셔를 명시한다. 케이지2+와셔1×2+정밀 시임1=총5T로 맞추는 예다.<br/>https://koyo.jtekt.co.jp/en/products/detail/?pno=AXK1730TN'),
      ('가공 참고','HIWIN MG 카탈로그(MGN12H 설치높이13,20×20 홀), 구매한6003/608/추력베어링·MG996R·2060 단면도를 대조한다. 이 문서의 구매외형은 특정 제조사의 정밀 가공도면이나 구매 보증이 아니다.'),
      ('도해와 글꼴','도해는 CadQuery BRep를 직접 렌더링했다. 숨겨진 체결부를 보이기 위한 분해·생략 장면이 있으며 캡션에 설명했다. 전자부품·전원 카드의3D는 외형 설명용이다. Nanum Gothic은 SIL Open Font License이며 docs/assets/fonts/OFL.txt를 포함했다.')]:w.section(h,t)
    w.c.save()
    # Text source includes all content and every BOM; suitable for later edits.
    for title,img,sections in PAGES:
        md.extend(['## '+title,''])
        if img and img!='wiring':md.extend([f'![{title}](images/v4_manual/{img}.png)',''])
        for h,t in sections:md.extend(['### '+h,'',t,''])
    for title,rows in [('출력 부품',[(i,n,l,str(q)) for i,n,l,q in PRINTS+JIGS]),('구매 부품',BUY+KIT+MATERIAL),('체결 부품',[(i,l,str(q),n) for i,l,q,n in FASTENERS])]:
        md.extend(['## '+title,'','|번호|항목|수량 또는 역할|설명|','|---|---|---|---|'])
        md.extend(['|'+'|'.join(str(v) for v in row)+'|' for row in rows]);md.append('')
    (DOC/'BUILD_V4.md').write_text('\n'.join(md),encoding='utf-8')
    with (k.OUT/'parts_BOM.csv').open('w',newline='',encoding='utf-8-sig') as f:
        cw=csv.writer(f);cw.writerow(['ID','품명','수량','조달','파일/설명'])
        for i,n,l,q in PRINTS+JIGS:cw.writerow([i,l,q,'3D 출력',n+'.stl'])
        for g,mode in ((BUY,'구매'),(KIT,'사진 키트'),(MATERIAL,'구매 후 가공')):
            for i,l,q,n in g:cw.writerow([i,l,q,mode,n])
    with (k.OUT/'fastener_BOM.csv').open('w',newline='',encoding='utf-8-sig') as f:
        cw=csv.writer(f);cw.writerow(['ID','규격','수량','사용처']);cw.writerows(FASTENERS)
    (k.OUT/'manual_page_index.json').write_text(json.dumps(w.toc,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PDF',PDF,'pages',w.i,flush=True)

if __name__=='__main__':
    if '--pdf-only' in sys.argv:
        cards=[]
        for ident,name,label,qty in PRINTS+JIGS:
            cards.append((ident,label,str(qty),'출력' if ident[0]=='P' else '지그 출력',IMG/('part_'+ident+'.png'),BLUE))
        for group,kind,col in ((BUY,'구매',RED),(KIT,'사진 키트',GREEN),(MATERIAL,'구매·가공',AMBER)):
            for ident,label,qty,note in group:cards.append((ident,label,qty,kind,IMG/('part_'+ident+'.png'),col))
        write_outputs(cards,{})
    else:
        cards,parts=assets();write_outputs(cards,parts)
