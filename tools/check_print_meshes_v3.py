"""Binary-STL manifold checks using only the Python standard library.

Vertices are welded at 0.00001 mm. This is not a slicer/overhang check.
"""
import collections,json,struct
from pathlib import Path

def check(path):
    raw=path.read_bytes();count=struct.unpack_from('<I',raw,80)[0]
    assert len(raw)==84+count*50,'Expected binary STL'
    vertices={};parents=[];edges=collections.Counter();winding=collections.Counter();volume=0.;degenerate=0
    def vertex(v):
        key=tuple(round(x,5) for x in v)
        if key not in vertices:vertices[key]=len(parents);parents.append(len(parents))
        return vertices[key]
    def root(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for j in range(count):
        f=struct.unpack_from('<12fH',raw,84+50*j);a,b,c=f[3:6],f[6:9],f[9:12]
        ids=[vertex(v) for v in (a,b,c)]
        if len(set(ids))<3:degenerate+=1
        for u,v in zip(ids,ids[1:]+ids[:1]):
            key=(min(u,v),max(u,v));edges[key]+=1;winding[key]+=1 if u<v else -1
            ru,rv=root(u),root(v)
            if ru!=rv:parents[ru]=rv
        volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    bad=sum(n!=2 for n in edges.values());wrong=sum(n!=0 for n in winding.values())
    components=len({root(i) for i in range(len(parents))})
    return dict(file=path.name,triangles=count,nonmanifold_edges=bad,inconsistent_winding_edges=wrong,
                degenerate_triangles=degenerate,components=components,volume_mm3=round(volume,3),
                passed=bad==0 and wrong==0 and degenerate==0 and components==1 and volume>0)

def main():
    folder=Path(__file__).resolve().parents[1]/'models'/'robot_v3'
    results=[check(p) for p in sorted((folder/'print').glob('*.stl'))]
    report={'passed':bool(results) and all(r['passed'] for r in results),'weld_precision_mm':.00001,
            'limitations':'Topology only; no slicer, support, layer strength or dimensional accuracy validation.','parts':results}
    (folder/'mesh_checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
    if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
