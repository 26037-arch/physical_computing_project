"""Export V3 assembly-coordinate meshes for the Three.js simulator.

The print STLs have rotated bed orientations and MUST NOT be translated back
using V2 offsets. These meshes come directly from the V3 CAD solids instead.
Outer panels are represented by an open perimeter frame and mounting beams.
"""
import base64,json,tempfile
from pathlib import Path
import build_robot_v3 as d

def main():
    cubes,instances,modules,frame=d.make_design()
    params={**d.v2.P,**d.P,'piece_mm':18.8,'pitch_mm':19.1,'retract_mm':24}
    data={'version':3,'params':params,'parts':{},'modules':{},'cube':[], 'frame':[], 'pins':{},
          'limitations':'Kinematic visualization; open outer frame is a display variant of the panel-frame CAD. No structural/contact simulation.'}
    output=d.ROOT/'sim/models.js';output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent,prefix='mesh-export-') as scratch:
        def mesh(key,shape):
            p=Path(scratch)/'part.stl';shape.exportStl(str(p),tolerance=.10,angularTolerance=.2)
            data['parts'][key]={'b64':base64.b64encode(p.read_bytes()).decode('ascii')}
            return key
        fixed={'rail_support','rail_MGN12','feed_screw_M5','feed_front_washer','feed_rear_washer','feed_front_nut','feed_rear_nut','feed_front_jam_nut','feed_rear_jam_nut','handwheel_envelope'}
        spin={'drive_plate','shaft_hub','spindle_8mm','spindle_hollow_12x8_6','coupling_5x8','motor_shaft','pulley_40T_driven','index_wheel_8','index_wheel_12'}
        for hollow,(heads,hw) in modules.items():
            kind='hollow' if hollow else 'direct';data['modules'][kind]=[]
            for name,shape in {**heads,**hw}.items():
                group='frame' if name in fixed or name.startswith('profile_bolt_head_') else 'spin' if name in spin or name.startswith(('pin_','axial_pad_')) else 'motorSpin' if name in ('motor_shaft_offset','pulley_40T_driver') else 'motor' if name.startswith('motor_NEMA17') else 'carriage'
                if group=='motorSpin':shape=shape.translate((-60,0,0))
                color='#346f9e' if name in heads else '#e9b642' if name.startswith(('pulley','belt')) else '#242c36' if name.startswith('motor_NEMA17') else '#d16a4d' if name.startswith('axial_pad') else '#b5c2cd'
                data['modules'][kind].append({'key':mesh(kind+'/'+name,shape),'name':name,'group':group,'color':color})
            data['pins'][kind]={}
            for locked in (False,True):
                name='locked' if locked else 'park';data['pins'][kind][name]=mesh(kind+'/index_pin_'+name,d.index_pin(hollow,locked))
        for name,kind,shape,pos in instances:
            shape=shape.translate(tuple(-p*19.1 for p in pos))
            data['cube'].append({'key':mesh('cube/'+name,shape),'name':name,'kind':kind,'pos':list(pos)})
        # Hardware that retains F/B centers stays on the stationary central axle.
        for sign in (-1,1):
            for name,s in [('spring',d.cyl(10,28.5,31.5).cut(d.cyl(6.4,28,32))),('washer',d.cyl(12,31.5,32).cut(d.cyl(6.4,31,33))),('collar',d.cyl(12,32,37).cut(d.cyl(6.05,31,38))),('core_collar',d.cyl(12,8,13).cut(d.cyl(6.05,7,14)))]:
                if sign<0:s=s.rotate((0,0,0),(1,0,0),180)
                label=f'axle_{name}_{sign}'
                data['frame'].append({'key':mesh(label,s),'name':label,'color':'#d9ab65','group':'axle'})
        for name,s in frame.items():
            if name.startswith(('panel_','corner_bracket_')):continue
            group='axle' if name.startswith(('fixed_axle','core_flat_shim')) else 'outer'
            color='#ed7653' if name.startswith('fixed_axle') else '#d9ab65' if 'shim' in name else '#8397a8'
            data['frame'].append({'key':mesh('frame/'+name,s),'name':name,'group':group,'color':color})
        # Open perimeter: original external 584-mm envelope, no opaque panels.
        for axis in range(3):
            other=[i for i in range(3) if i!=axis]
            for a in (-286,286):
                for b in (-286,286):
                    dims=[12,12,12];dims[axis]=584;center=[0,0,0];center[other[0]]=a;center[other[1]]=b
                    name=f'perimeter_{axis}_{a}_{b}'
                    data['frame'].append({'key':mesh(name,d.box(*dims,center)),'name':name,'group':'outer','color':'#667d90'})
        for face in d.v2.FACES:
            cross=d.box(560,40,12,(0,-67,257.5))
            for x in (-20,20):cross=cross.cut(d.cyl(6.6,250,265,origin=(x,-67,0)))
            name='mounting_crossbar_'+face
            data['frame'].append({'key':mesh(name,cross.moved(d.v2.face_location(face))),'name':name,'group':'outer','color':'#71899d'})
            if face in 'FB':
                cross=d.box(560,30,12,(0,0,257.5)).cut(d.cyl(6.5,250,265))
                name='shaft_crossbar_'+face
                data['frame'].append({'key':mesh(name,cross.moved(d.v2.face_location(face))),'name':name,'group':'outer','color':'#8aa3b6'})
    output.write_text('// Generated from V3 CAD by tools/export_sim_v3.py; assembly-coordinate STL in mm.\n(function(g){const M='+json.dumps(data,separators=(',',':'))+';g.CubeModels=M;if(typeof module!=="undefined"&&module.exports)module.exports=M;})(typeof globalThis!=="undefined"?globalThis:this);\n',encoding='utf-8')
    print(json.dumps({'parts':len(data['parts']),'bytes':output.stat().st_size,'version':3}))

if __name__=='__main__':main()
