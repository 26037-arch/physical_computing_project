import * as THREE from 'three';
import { web, type Piece, type Part, type MeshData } from './data';

export type Built = {
  inst: string;
  geom: THREE.BufferGeometry;
  edges: THREE.BufferGeometry | null;
  color: string;
  metal: number;
  box: THREE.Box3;
  kind: 'piece' | 'part';
  /** 볼트 등 긴 부품의 축 방향(단위벡터, bbox 가장 긴 축) */
  axis: THREE.Vector3;
  mesh?: THREE.Mesh;
};

const FOAM = '#f4f2ec';
const cache = new Map<string, Built>();

const toMatrix = (m: number[]) => new THREE.Matrix4().fromArray(m);

function meshGeometry(m: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setIndex(m.indices);
  return g;
}

function pieceGeometry(p: Piece): THREE.BufferGeometry {
  if (p.finished_mesh) return meshGeometry(p.finished_mesh);
  const shape = new THREE.Shape(p.outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of p.holes) {
    const path = new THREE.Path();
    path.absarc(h.c[0], h.c[1], h.d / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  for (const c of p.cutouts) shape.holes.push(new THREE.Path(c.map(([u, v]) => new THREE.Vector2(u, v))));
  return new THREE.ExtrudeGeometry(shape, { depth: web.thickness || 3, bevelEnabled: false, curveSegments: 16 });
}

function longAxis(box: THREE.Box3): THREE.Vector3 {
  const s = box.getSize(new THREE.Vector3());
  if (s.x >= s.y && s.x >= s.z) return new THREE.Vector3(1, 0, 0);
  if (s.y >= s.z) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function finish(g: THREE.BufferGeometry, matrix: number[]): THREE.BufferGeometry {
  g.applyMatrix4(toMatrix(matrix));
  // 평평한 면 느낌: 인덱스 풀고 면 법선 계산
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  return flat;
}

function partGeometry(p: Part): THREE.BufferGeometry {
  if (p.kind === 'mesh' && p.mesh) return meshGeometry(p.mesh);
  if (p.kind === 'box' && p.size) return new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  if (p.kind === 'cylinder' && p.size) {
    const g = new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1] ?? 10, 32);
    g.rotateX(Math.PI / 2);
    return g;
  }
  return new THREE.BufferGeometry();
}

export function getBuilt(inst: string): Built | undefined {
  const hit = cache.get(inst);
  if (hit) return hit;
  const piece = web.pieces.find((p) => p.inst === inst);
  if (piece) {
    const geom = finish(pieceGeometry(piece), piece.matrix);
    const b: Built = {
      inst, geom, edges: new THREE.EdgesGeometry(geom, 30),
      color: piece.color || FOAM, metal: 0, box: geom.boundingBox!, kind: 'piece', axis: new THREE.Vector3(0, 0, 1),
    };
    cache.set(inst, b);
    return b;
  }
  const part = web.parts.find((p) => p.inst === inst);
  if (part) {
    const geom = finish(partGeometry(part), part.matrix);
    const metal = /^F\d|^MG996R-HORN/.test(inst) ? 0.55 : 0.1;
    const b: Built = {
      inst, geom, edges: part.kind === 'box' ? new THREE.EdgesGeometry(geom, 30) : null,
      color: part.color || '#a0a6ad', metal, box: geom.boundingBox!, kind: 'part', axis: longAxis(geom.boundingBox!),
    };
    cache.set(inst, b);
    return b;
  }
  return undefined;
}

export function boxOf(insts: string[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const i of insts) {
    const b = getBuilt(i);
    if (b) box.union(b.box);
  }
  return box;
}

const dbl = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/** 가림 판정용: 실제 삼각형과 광선이 만나는지 */
export function meshOf(b: Built): THREE.Mesh {
  if (!b.mesh) b.mesh = new THREE.Mesh(b.geom, dbl);
  return b.mesh;
}
