"""Check V4 print STL edges, signed volume and expected part quantities."""
import json
from pathlib import Path
import numpy as np
import build_robot_v4 as d
from robot_v4_manual_data import PRINTS,JIGS

def main():
    report={}
    paths=list((d.OUT/'print').glob('*.stl'))+list((d.OUT/'assembly_kit/print').glob('*.stl'))+list((d.OUT/'assembly_kit/jigs').glob('*.stl'))
    assert {p.stem for p in paths}=={n for _,n,_,_ in PRINTS+JIGS},'BOM/file names mismatch'
    for path in paths:
        raw=path.read_bytes();n=int.from_bytes(raw[80:84],'little')
        assert len(raw)==84+50*n,(path,'binary STL length')
        dt=np.dtype([('normal','<f4',(3,)),('v','<f4',(3,3)),('attr','<u2')])
        tri=np.frombuffer(raw,dt,count=n,offset=84)['v'].astype(float)
        points,idx=np.unique(np.round(tri.reshape(-1,3),5),axis=0,return_inverse=True)
        face=idx.reshape(-1,3)
        edges=np.sort(np.concatenate([face[:,[0,1]],face[:,[1,2]],face[:,[2,0]]]),axis=1)
        _,counts=np.unique(edges,axis=0,return_counts=True)
        volume=float(np.sum(np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])))/6)
        closed=bool(np.all(counts==2));size=np.ptp(points,axis=0)
        report[str(path.relative_to(d.OUT))]={'triangles':n,'closed_two_faces_per_edge':closed,
          'positive_volume_mm3':volume,'size_mm':size.tolist(),'passed':closed and volume>0}
    ok=all(r['passed'] for r in report.values())
    result={'passed':ok,'unique_parts':len(report),'printed_quantity':sum(q for _,_,_,q in PRINTS+JIGS),
      'limitations':'Rounded vertex weld 1e-5 mm, edges and signed volume only; not self-intersection, strength or printability certification.','parts':report}
    (d.OUT/'assembly_kit/mesh_checks.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('PASS' if ok else 'FAIL',len(report),'meshes;',result['printed_quantity'],'printed items')
    print('Failures:',[n for n,r in report.items() if not r['passed']])
    raise SystemExit(0 if ok else 1)

if __name__=='__main__':main()
