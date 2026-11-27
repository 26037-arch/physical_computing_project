// 스티커 54자 형식(v5/sim/cube.js toFacelets 와 같음)의 3D 기하.
// 면 순서 U R F D L B, 면당 9칸 왼위→오른아래, 글자 = 그 색이 원래 속한 면.
// 좌표: x 오른쪽(R), y 위(U), z 앞(F). 큐비 중심 좌표는 -1..1 정수.
// 한 수 = 그 면의 바깥 법선 n 을 축으로 -90°·k (바깥에서 보아 시계 방향).
// scripts/check.mjs 가 이 기하로 data 의 stickerSteps 전 구간을 재현해 방향을 검증한다.

export const FACES = 'URFDLB';

export const NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

// 칸 i 의 큐비 좌표 p 와 스티커 법선 n
export function facelet(i) {
  const f = FACES[Math.floor(i / 9)];
  const r = Math.floor((i % 9) / 3);
  const c = i % 3;
  let p;
  if (f === 'U') p = [c - 1, 1, r - 1];
  else if (f === 'R') p = [1, 1 - r, 1 - c];
  else if (f === 'F') p = [c - 1, 1 - r, 1];
  else if (f === 'D') p = [c - 1, -1, 1 - r];
  else if (f === 'L') p = [-1, 1 - r, c - 1];
  else p = [1 - c, 1 - r, -1];
  return { p, n: NORMALS[f], face: f };
}

export const FACELETS = Array.from({ length: 54 }, (_, i) => facelet(i));

export function parseMove(m) {
  const face = m[0];
  const s = m.slice(1);
  const k = s === '' ? 1 : s === '2' ? 2 : 3; // 바깥에서 보아 시계 90° 횟수
  // 애니메이션 각도: ' 는 +90°(반시계), 2 는 -180°
  const angle = k === 3 ? Math.PI / 2 : -k * Math.PI / 2;
  return { face, k, axis: NORMALS[face], angle };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// 축 a(단위 축 벡터) 둘레 +90° (오른손) 회전
function rot90(v, a) {
  // v' = a(a·v) + (a×v)   (cos90=0, sin90=1)
  const d = dot(a, v);
  const cx = a[1] * v[2] - a[2] * v[1];
  const cy = a[2] * v[0] - a[0] * v[2];
  const cz = a[0] * v[1] - a[1] * v[0];
  return [a[0] * d + cx, a[1] * d + cy, a[2] * d + cz];
}

export function rotateVec(v, axis, quartersPositive) {
  let r = v;
  const q = ((quartersPositive % 4) + 4) % 4;
  for (let i = 0; i < q; i++) r = rot90(r, axis);
  return r;
}

export function inLayer(p, axis) {
  return dot(p, axis) === 1;
}

const key = (p, n) => p.join(',') + '|' + n.join(',');
const INDEX = new Map(FACELETS.map((f, i) => [key(f.p, f.n), i]));

// 기하로 한 수를 적용 (검증용)
export function applyMove(stickers, m) {
  const { axis, k } = parseMove(m);
  const out = stickers.split('');
  for (let i = 0; i < 54; i++) {
    const { p, n } = FACELETS[i];
    if (!inLayer(p, axis)) continue;
    const p2 = rotateVec(p, axis, -k);
    const n2 = rotateVec(n, axis, -k);
    out[INDEX.get(key(p2, n2))] = stickers[i];
  }
  return out.join('');
}

// 큐비 26개: 좌표와 붙은 스티커 칸 번호
export const CUBIES = (() => {
  const list = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (x === 0 && y === 0 && z === 0) continue;
    const p = [x, y, z];
    const stickers = [];
    FACELETS.forEach((f, i) => { if (f.p[0] === x && f.p[1] === y && f.p[2] === z) stickers.push(i); });
    list.push({ p, stickers });
  }
  return list;
})();

// 데이터 색만: 큐브 6색
export const COLORS = {
  U: '#eeeeea', // 흰
  R: '#d8423a', // 빨
  F: '#2fa65a', // 초
  D: '#f0cf3a', // 노
  L: '#f0882a', // 주
  B: '#3a6fd8', // 파
};
