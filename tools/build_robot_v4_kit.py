"""Rev A assembly kit. World Y is up. Purchased panels/metal are NOT prints.

Run AFTER build_robot_v4.py. Exports fabrication STEP/DXF, printable fixtures,
the complete framed STEP and a machine-readable bill of parts. Millimetres.
"""
import csv, json, math
from pathlib import Path
import cadquery as cq
import ezdxf
import build_robot_v4 as d

OUT=d.OUT/'assembly_kit'
B=d.box; C=d.cyl; F=d.fuse

def design():
    metal={}; prints={}; panels={}; fixtures={}
    base=B(621,18,621,(0,-341,0))
    # Bottom angle bolts: one through each foot, paired around each side.
    for a in (-1,1):
        for b in (-200,200):
            base=base.cut(C(4.5,-352,-330,(0,1,0),(a*278.5,0,b)))
            base=base.cut(C(4.5,-352,-330,(0,1,0),(b,0,a*278.5)))
    # D profile end cores.
    for x in (-20,20):
        base=base.cut(C(6.6,-352,-330,(0,1,0),(x,0,-67)))
    for x in (-20,12):
        for z in (-55.5,-32.5):
            base=base.cut(C(3.6,-352,-330,(0,1,0),(x,0,z)))
    panels['panel_base']=base
    for face in ('F','R','B','L'):
        loc=d.face_location_v4(face)
        s=B(450,621 if face in 'RL' else 597,12,(-107,0,276))
        for x in (-20,20): s=s.cut(C(6.6,269,283,origin=(x,-67,0)))
        for x,y in [(h,k) for h in (-250,60) for k in (-278.5,278.5)]+[(-312,-200),(-312,200)]:
            s=s.cut(C(4.5,269,283,origin=(x,y,0)))
        # Four long rods anchor the servo cradle; metal sleeves set its Z.
        for x in (-20,12):
            for y in (-55.5,-32.5): s=s.cut(C(3.6,269,283,origin=(x,y,0)))
        panels['panel_'+face]=s.moved(loc)
    # Profile envelopes include three cores only, NOT a vendor slot drawing.
    for face in d.FACES_V4:
        length=303.5 if face=='D' else 270
        # Start 2 mm outboard: square 2060 front ends otherwise overlap at R/D.
        s=B(60,20,length-2,(0,-67,(length+2)/2))
        for x in (-20,0,20): s=s.cut(C(5,-1,length+1,origin=(x,-67,0)))
        metal['profile_'+face]=s.moved(d.face_location_v4(face))
    # 8 vertical corner angles (two heights), 8 base angles.
    for sx in (-1,1):
        for sz in (-1,1):
            for h in (-250,60):
                s=F(B(40,40,3,(sx*278.5,h,sz*297)),B(3,40,40,(sx*297,h,sz*278.5)))
                s=s.cut(C(4.5,-320,320,(0,0,1),(sx*278.5,h,0)))
                s=s.cut(C(4.5,-320,320,(1,0,0),(0,h,sz*278.5)))
                metal[f'corner_{sx}_{sz}_{h}']=s.clean()
    for face in ('F','R','B','L'):
        for yy in (-200,200):
            s=F(B(40,40,3,(-312,yy,268.5)),B(3,40,40,(-330.5,yy,250)))
            s=s.cut(C(4.5,266,271,origin=(-312,yy,0)))
            s=s.cut(C(4.5,-334,-328,(1,0,0),(0,yy,250)))
            metal[f'base_angle_{face}_{yy}']=s.moved(d.face_location_v4(face))
    # Lock guide/servo mount to a metal spine, positively tied to D extrusion.
    s=B(6,124,126,(-33,-15,235))
    for y,z,dd in [(-67,240,5.4),(-67,280,5.4),(-9,180,4.4),(-9,190,4.4),
                    (9,180,4.4),(9,190,4.4),(38,241,3.4),(24,291,3.4),
                    (-21,208,3.4),(-21,216,3.4)]:
        s=s.cut(C(dd,-37,-29,(1,0,0),(0,y,z)))
    metal['lock_spine']=s.clean().moved(d.face_location_v4('D'))
    # A replaceable switch bracket. Its cross-arm clears the sliding bar clamp.
    s=F(B(62,6,16,(1,-21,212)),B(4,35.5,16,(30,-6.25,212)),B(20,3.5,17,(22,9.75,211.5)))
    for z in (208,216):s=s.cut(C(3.4,-31,33,(1,0,0),(0,-21,z)))
    for x in (18.75,25.25):
        slot=cq.Workplane('XZ',origin=(x,12,211.9)).slot2D(8,2.4,90).extrude(5).val()
        s=s.cut(slot)
    prints['lock_switch_bracket']=(s.clean(),1)
    # Rail alignment gauge: end faces reference the actual cube centre plane.
    # A rigid 57-mm dummy is used only with motors off, then removed.
    fixtures['alignment_cube']=(B(57,57,57,(0,0,28.5)),1)
    coupon=B(58,28,12,(0,0,6))
    bar=d.P['lock_bar_mm']
    for x,dd in ((-20,bar+.2),(0,bar+.3),(20,bar+.4)):
        coupon=coupon.cut(B(dd,dd,14,(x,0,6)))
    fixtures['square_fit_coupon']=(coupon.clean(),1)
    # Fixed insertion depth is measured from the printed plate front (z=5):
    # gauge thickness = plate front (5) + pin engagement below the cube face.
    # Pockets clear the pad bosses (strip: (0,+-14.5) 8x4; D: corners 8x8).
    t=5+d.P['pin_engagement_mm']
    jig=B(50,50,t,(0,0,t/2)).cut(C(22,-1,t+1))
    for y in (-19.1,19.1):jig=jig.cut(C(3.3,-1,t+1,origin=(0,y,0)))
    for y in (-d.P['strip_pad_y_mm'],d.P['strip_pad_y_mm']):jig=jig.cut(B(d.P['strip_pad_mm'][0]+.6,d.P['strip_pad_mm'][1]+.6,t+2,(0,y,t/2)))
    for x in (-19.1,19.1):
        for y in (-19.1,19.1):jig=jig.cut(B(8.6,8.6,t+2,(x,y,t/2)))
    fixtures['pin_depth_gauge']=(jig.clean(),1)
    return panels,metal,prints,fixtures

def flat_dxf(name,shape,axis):
    """Export true 1:1 planar contours (curves tessellated at 0.03 mm)."""
    # Cut a sheet at its middle; section wires include all drill holes.
    bb=shape.BoundingBox(); mid={'X':(bb.xmin+bb.xmax)/2,'Y':(bb.ymin+bb.ymax)/2,'Z':(bb.zmin+bb.zmax)/2}[axis]
    normal={'X':(1,0,0),'Y':(0,1,0),'Z':(0,0,1)}[axis]
    origin=tuple(mid*v for v in normal)
    section=cq.Workplane(cq.Plane(origin=origin,normal=normal)).add(shape).section().val()
    doc=ezdxf.new('R2010'); ms=doc.modelspace(); doc.units=4
    for wire in section.Wires():
        pts,_=wire.tessellate(.03,.1) if hasattr(wire,'tessellate') else ([],[])
        # CadQuery Shape tessellation does not tessellate wires; use ordered edges.
        coords=[]
        for edge in wire.Edges():
            def project(p):
                return (p[1],p[2]) if axis=='X' else (p[0],p[2]) if axis=='Y' else (p[0],p[1])
            if edge.geomType()=='CIRCLE' and abs(edge.Length()-2*math.pi*edge.radius())<1e-5:
                ms.add_circle(project(edge.arcCenter().toTuple()),edge.radius())
                continue
            points=edge.sample(50 if edge.geomType()!='LINE' else 2)[0]
            xyz=[p.toTuple() for p in points]
            p2=[project(p) for p in xyz]
            # Each edge as a separate polyline preserves exact endpoint topology.
            ms.add_lwpolyline(p2)
    doc.saveas(OUT/'cut'/(name+'.dxf'))

def build():
    panels,metal,prints,fixtures=design()
    for sub in ('cut','print','jigs'):(OUT/sub).mkdir(parents=True,exist_ok=True)
    info={'revision':'V4 assembly Rev A','source_commit':'b37de3e9','integration_base_commit':'513647021cccfc23386335948cd5963cadf98bcb','units':'mm','physical_validation':False,'parts':{}}
    for group,parts in [('cut',{**panels,**metal}),('print',prints),('jigs',fixtures)]:
        for name,value in parts.items():
            shape,qty=value if isinstance(value,tuple) else (value,1)
            assert shape.isValid() and len(shape.Solids())==1,(name,len(shape.Solids()))
            cq.exporters.export(shape,str(OUT/group/(name+'.step')))
            bb=shape.BoundingBox()
            if group!='cut':d.v2.export_shape(name,shape,OUT/group)
            info['parts'][name]={'qty':qty,'group':group,'valid':True,'size_mm':[bb.xlen,bb.ylen,bb.zlen]}
            if name.startswith('panel_') or name=='lock_spine':
                axis='Y' if name=='panel_base' else 'X' if name in ('panel_R','panel_L','lock_spine') else 'Z'
                flat_dxf(name,shape,axis)
    # Profiles are envelopes: unmodelled T slots must be selected from a drawing.
    cubes,derived,instances,modules,lock=d.make_design()
    asm=cq.Assembly(name='RobotV4_build_RevA')
    for name,kind,shape in d.assembly_items(instances,modules,lock):
        asm.add(shape,name=name.replace('/','__'),color=cq.Color(d.color(kind)))
    for name,shape in {**panels,**metal}.items():
        asm.add(shape,name=name,color=cq.Color('#b99870' if name.startswith('panel') else '#9daab6'))
    for name,(shape,_) in prints.items():
        asm.add(shape.moved(d.face_location_v4('D')),name=name,color=cq.Color('#476b95'))
    asm.save(str(OUT/'robot_build_assembly.step'))
    (OUT/'kit_manifest.json').write_text(json.dumps(info,indent=2),encoding='utf-8')
    print('Assembly kit:',len(info['parts']),'parts; full framed STEP exported',flush=True)

if __name__=='__main__':build()
