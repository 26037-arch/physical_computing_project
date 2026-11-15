// V5 겹침 점검 — 3D 제작 설명서(build.js)의 장면을 그대로 읽어 부품끼리 파고드는 곳을 찾는다.
//   화면: build.html 의 "겹침 점검" 버튼.   명령줄: node tools/check_overlap_v5.js (헤드리스 Chrome 으로 같은 함수를 돌린다)
// 방법: 물체 A 의 겉면에서 EPS 만큼 안으로 들인 표본점이 물체 B 안에 MIN_DEPTH 보다 깊이 들어가 있으면 겹침이다
//   (닫힌 삼각형 면에 광선을 쏴 교차 횟수의 홀짝으로 안팎을 가린다). 맞닿기만 한 면·EPS 보다 얕은 끼워 맞춤은 겹침이 아니다.
//   케이블·점퍼선은 곡선을 반지름 r 인 줄로 보고 따로 다룬다 (휘는 것이므로 그림의 길이 예시라는 점을 결과에 구분해 적는다).
// 한계: 표본 간격 약 2 mm, 자세는 띄엄띄엄(후드 5°, 리프터 3 mm, 컵 7.5°, 조립 진행 5 %) — 연속 운동의 증명이 아니다.
//   나사·핀·혼·패드처럼 일부러 물리는 것은 뺀다. 출력 부품끼리의 정밀 검사는 tools/check_robot_v5_cad.py(BRep)가 원본이다.
(function (global) {
  'use strict';
  const EPS = .15, MIN_DEPTH = .1, GRID = 2.0, CELL = 1.0, CABLE_STEP = 1.2, FLEX_SLACK = .3, DESK_SLACK = .3;
  let M = null, THREE = null;
  const cache = new Map();

  // ---------- 삼각형 묶음: BVH + 표본점 ----------
  function prep(geometry) {
    let c = cache.get(geometry.uuid); if (c) return c;
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const tri = new Float32Array(g.attributes.position.array), n = tri.length / 9;
    let vol = 0;
    for (let i = 0; i < n; i++) { const o = i * 9;
      vol += tri[o] * (tri[o + 4] * tri[o + 8] - tri[o + 5] * tri[o + 7]) - tri[o + 1] * (tri[o + 3] * tri[o + 8] - tri[o + 5] * tri[o + 6]) + tri[o + 2] * (tri[o + 3] * tri[o + 7] - tri[o + 4] * tri[o + 6]); }
    const sign = vol < 0 ? -1 : 1;                           // 법선이 안쪽을 보는 면 묶음이면 뒤집는다
    const idx = new Uint32Array(n), cen = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { idx[i] = i; for (let k = 0; k < 3; k++) cen[i * 3 + k] = (tri[i * 9 + k] + tri[i * 9 + 3 + k] + tri[i * 9 + 6 + k]) / 3; }
    function node(a, b) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = a; i < b; i++) { const o = idx[i] * 9; for (let v = 0; v < 9; v++) { const k = v % 3, x = tri[o + v]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; } }
      const nd = { lo, hi, a, b, l: null, r: null };
      if (b - a > 8) {
        const k = hi[0] - lo[0] > hi[1] - lo[1] ? (hi[0] - lo[0] > hi[2] - lo[2] ? 0 : 2) : (hi[1] - lo[1] > hi[2] - lo[2] ? 1 : 2);
        const sub = Array.from(idx.subarray(a, b)).sort((p, q) => cen[p * 3 + k] - cen[q * 3 + k]); idx.set(sub, a);
        const m = (a + b) >> 1; nd.l = node(a, m); nd.r = node(m, b);
      }
      return nd;
    }
    const root = n ? node(0, n) : null;
    // 표본점: 삼각형 무게중심·꼭짓점 근처·변 위·넓은 면의 격자. 모두 법선 반대쪽으로 EPS 들인다.
    const pts = [], seen = new Set();
    const E1 = [0, 0, 0], E2 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const o = i * 9, A = [tri[o], tri[o + 1], tri[o + 2]], B = [tri[o + 3], tri[o + 4], tri[o + 5]], C = [tri[o + 6], tri[o + 7], tri[o + 8]];
      for (let k = 0; k < 3; k++) { E1[k] = B[k] - A[k]; E2[k] = C[k] - A[k]; }
      let nx = E1[1] * E2[2] - E1[2] * E2[1], ny = E1[2] * E2[0] - E1[0] * E2[2], nz = E1[0] * E2[1] - E1[1] * E2[0];
      const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
      nx *= sign / nl; ny *= sign / nl; nz *= sign / nl;
      const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      const face = (Math.abs(nx) > Math.abs(ny) ? (Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 0 : 1) : (nz > 0 ? 4 : 5)) : (Math.abs(ny) > Math.abs(nz) ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5)));
      const put = (x, y, z) => { const key = Math.round(x / CELL) + ',' + Math.round(y / CELL) + ',' + Math.round(z / CELL) + ',' + face; if (seen.has(key)) return; seen.add(key); pts.push(x - nx * EPS, y - ny * EPS, z - nz * EPS); };
      const bary = (u, v) => put(A[0] + E1[0] * u + E2[0] * v, A[1] + E1[1] * u + E2[1] * v, A[2] + E1[2] * u + E2[2] * v);
      put(G[0], G[1], G[2]);
      const V3 = [A, B, C]; let maxEdge = 0;
      for (let e = 0; e < 3; e++) {
        const p = V3[e], q = V3[(e + 1) % 3], len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (len > maxEdge) maxEdge = len;
        const toG = Math.hypot(G[0] - p[0], G[1] - p[1], G[2] - p[2]) || 1, pull = Math.min(.3, toG * .3) / toG;
        put(p[0] + (G[0] - p[0]) * pull, p[1] + (G[1] - p[1]) * pull, p[2] + (G[2] - p[2]) * pull);                   // 꼭짓점 근처
        const K = Math.min(80, Math.ceil(len / GRID));
        for (let j = 0; j < K; j++) { const t = (j + .5) / K, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t;
          const d = Math.hypot(G[0] - x, G[1] - y, G[2] - z) || 1, pl = Math.min(.3, d * .3) / d; put(x + (G[0] - x) * pl, y + (G[1] - y) * pl, z + (G[2] - z) * pl); }   // 변 위
      }
      const N = Math.min(80, Math.ceil(maxEdge / GRID));
      if (N > 1) for (let a = 0; a < N; a++) for (let b = 0; a + b < N; b++) { bary((a + 1 / 3) / N, (b + 1 / 3) / N); if (a + b < N - 1) bary((a + 2 / 3) / N, (b + 2 / 3) / N); }
    }
    g.computeBoundingBox();
    c = { tri, idx, root, pts: new Float32Array(pts), box: g.boundingBox.clone(), n };
    cache.set(geometry.uuid, c); return c;
  }
  // 광선(원점 p, 방향 d) 과 삼각형 묶음: 교차 횟수와 가장 가까운 거리
  function cast(c, px, py, pz, dx, dy, dz) {
    let count = 0, near = Infinity; if (!c.root) return { count, near };
    const tri = c.tri, idx = c.idx, stack = [c.root], ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    while (stack.length) {
      const nd = stack.pop(), lo = nd.lo, hi = nd.hi;
      let t0 = (lo[0] - px) * ix, t1 = (hi[0] - px) * ix, tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
      t0 = (lo[1] - py) * iy; t1 = (hi[1] - py) * iy; tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      t0 = (lo[2] - pz) * iz; t1 = (hi[2] - pz) * iz; tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      if (tmax < 0 || tmin > tmax) continue;
      if (nd.l) { stack.push(nd.l, nd.r); continue; }
      for (let i = nd.a; i < nd.b; i++) {
        const o = idx[i] * 9, ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
        const e1x = tri[o + 3] - ax, e1y = tri[o + 4] - ay, e1z = tri[o + 5] - az, e2x = tri[o + 6] - ax, e2y = tri[o + 7] - ay, e2z = tri[o + 8] - az;
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-12 && det < 1e-12) continue;
        const f = 1 / det, sx = px - ax, sy = py - ay, sz = pz - az, u = f * (sx * hx + sy * hy + sz * hz); if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = f * (dx * qx + dy * qy + dz * qz); if (v < 0 || u + v > 1) continue;
        const t = f * (e2x * qx + e2y * qy + e2z * qz); if (t > 1e-9) { count++; if (t < near) near = t; }
      }
    }
    return { count, near };
  }
  const D1 = [.5377, .2113, .8162], D2 = [-.3181, .7732, -.5486];   // 면·모서리와 나란하지 않은 두 방향
  const AX = [[1, 1e-7, 1e-7], [-1, 1e-7, 1e-7], [1e-7, 1, 1e-7], [1e-7, -1, 1e-7], [1e-7, 1e-7, 1], [1e-7, 1e-7, -1]];
  // 점이 닫힌 면 묶음 안에 있으면 표면까지의 대략 깊이(6축 중 가장 가까운 거리), 밖이면 0
  function depthIn(c, x, y, z) {
    const b = c.box; if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y || z < b.min.z || z > b.max.z) return 0;
    if (!(cast(c, x, y, z, D1[0], D1[1], D1[2]).count & 1) || !(cast(c, x, y, z, D2[0], D2[1], D2[2]).count & 1)) return 0;
    let d = Infinity; for (const a of AX) { const r = cast(c, x, y, z, a[0], a[1], a[2]); if (r.near < d) d = r.near; }
    return d;
  }

  // ---------- 장면 → 물체 ----------
  const RIGID = { print: 1, kit: 1, elec: 1, cube: 1 };
  function bodies() {
    const out = [];
    for (const it of M.items) {
      if (it.kind === 'fastener' || !it.g.visible) continue;
      const b = { key: it.key, name: it.name, kind: it.kind, it, solids: [], cables: [], box: new THREE.Box3() };
      it.g.traverse((o) => {
        if (!o.isMesh || o.userData.skip || !o.visible) return;
        if (o.userData.cable) { b.cables.push(o); return; }
        if (/^Plane/.test(o.geometry.type)) return;
        b.solids.push({ mesh: o, c: prep(o.geometry), box: new THREE.Box3() });
      });
      for (const s of b.solids) { s.box.copy(s.c.box).applyMatrix4(s.mesh.matrixWorld); b.box.union(s.box); }
      b.cables = b.cables.map((o) => cableSamples(o));
      for (const cb of b.cables) b.box.union(cb.box);
      if (b.solids.length || b.cables.length) out.push(b);
    }
    return out;
  }
  function cableSamples(mesh) {
    let s = mesh.userData.cableSamples;
    if (!s) {
      const { curve, r } = mesh.userData.cable, len = curve.getLength(), n = Math.max(4, Math.ceil(len / CABLE_STEP));
      const centre = [], ring = [], rr = Math.max(.1, r - EPS), up = new THREE.Vector3(), side = new THREE.Vector3(), t = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const u = i / n, at = u * len; if (at < 2 || at > len - 2) continue;        // 양 끝 2 mm 는 꽂히는 자리
        curve.getPointAt(u, p); curve.getTangentAt(u, t);
        up.set(0, 0, 1); if (Math.abs(t.z) > .9) up.set(1, 0, 0);
        side.crossVectors(t, up).normalize(); up.crossVectors(side, t).normalize();
        centre.push(p.x, p.y, p.z); ring.push(p.x, p.y, p.z);
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, cx = Math.cos(a) * rr, cy = Math.sin(a) * rr; ring.push(p.x + side.x * cx + up.x * cy, p.y + side.y * cx + up.y * cy, p.z + side.z * cx + up.z * cy); }
      }
      s = mesh.userData.cableSamples = { r, centre: new Float32Array(centre), ring: new Float32Array(ring), local: new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position) };
    }
    return { mesh, r: s.r, centre: s.centre, ring: s.ring, box: s.local.clone().applyMatrix4(mesh.matrixWorld) };
  }

  // ---------- 쌍 검사 ----------
  let rel = null, inv = null, pw = null;                 // attach() 에서 만든다 (THREE 가 그때 정해진다)
  function hit(res, depth, x, y, z) { res.hits++; if (depth > res.depth) { res.depth = depth; res.at = [x, y, z]; } if (res.pts.length < 60) res.pts.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]); }
  // 표본점 배열(local, matrix world) 이 닫힌 면 b 안에 있는지
  function probe(points, world, b, res, extra) {
    inv.copy(b.mesh.matrixWorld).invert(); rel.multiplyMatrices(inv, world);
    const e = rel.elements, bx = b.c.box;
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = points[i + 1], z = points[i + 2];
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (lx < bx.min.x || lx > bx.max.x || ly < bx.min.y || ly > bx.max.y || lz < bx.min.z || lz > bx.max.z) continue;
      const d = depthIn(b.c, lx, ly, lz); if (d < MIN_DEPTH) continue;
      pw.set(x, y, z).applyMatrix4(world); hit(res, d + extra, pw.x, pw.y, pw.z);
    }
  }
  const blank = () => ({ hits: 0, depth: 0, at: null, pts: [] });
  function testPair(A, B, solidOnly) {
    const out = {};
    if (!A.box.intersectsBox(B.box)) return out;
    for (const a of A.solids) for (const b of B.solids) {
      if (!a.box.intersectsBox(b.box)) continue;
      const r = out.rigid || (out.rigid = blank()); probe(a.c.pts, a.mesh.matrixWorld, b, r, EPS); probe(b.c.pts, b.mesh.matrixWorld, a, r, EPS);
    }
    if (solidOnly) return out;
    for (const [X, Y] of [[A, B], [B, A]]) for (const cb of X.cables) for (const b of Y.solids) {
      if (!cb.box.intersectsBox(b.box)) continue;
      const r = out.flex || (out.flex = blank()); probe(cb.ring, cb.mesh.matrixWorld, b, r, EPS);
    }
    for (const ca of A.cables) for (const cb of B.cables) {
      if (!ca.box.intersectsBox(cb.box)) continue;
      const lim = ca.r + cb.r - FLEX_SLACK, ea = ca.mesh.matrixWorld.elements, eb = cb.mesh.matrixWorld.elements;
      const P = ca.centre, Q = cb.centre, ox = ea[12] - eb[12], oy = ea[13] - eb[13], oz = ea[14] - eb[14];   // 선 묶음은 평행 이동만 한다
      for (let i = 0; i < P.length; i += 3) { const x = P[i] + ox, y = P[i + 1] + oy, z = P[i + 2] + oz;
        for (let j = 0; j < Q.length; j += 3) { const dx = x - Q[j], dy = y - Q[j + 1], dz = z - Q[j + 2], d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < lim * lim) { const r = out.flexflex || (out.flexflex = blank()); hit(r, ca.r + cb.r - Math.sqrt(d2), Q[j] + eb[12], Q[j + 1] + eb[13], Q[j + 2] + eb[14]); break; } } }
    }
    return out;
  }
  function testDesk(B, zDesk) {
    const r = blank();
    if (B.box.min.z > zDesk - DESK_SLACK) return r;
    for (const s of B.solids) { const e = s.mesh.matrixWorld.elements, p = s.c.pts;
      for (let i = 0; i < p.length; i += 3) { const z = e[2] * p[i] + e[6] * p[i + 1] + e[10] * p[i + 2] + e[14];
        if (z < zDesk - DESK_SLACK) { pw.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(s.mesh.matrixWorld); hit(r, zDesk - z + EPS, pw.x, pw.y, pw.z); } } }
    for (const cb of B.cables) { const e = cb.mesh.matrixWorld.elements, p = cb.centre;
      for (let i = 0; i < p.length; i += 3) { const z = p[i + 2] + e[14] - cb.r; if (z < zDesk - DESK_SLACK) hit(r, zDesk - z, p[i] + e[12], p[i + 1] + e[13], z); } }
    return r;
  }

  // 일부러 맞물리거나 그림만 겹치는 쌍 — 겹침으로 세지 않는다 (결과의 allowed 에 이유와 함께 남긴다)
  const ALLOW = [
    { a: 'hub', b: 'motor', cls: 'rigid', max: .6, why: '허브 D 구멍이 모터 축에 끼워진다 (억지 끼워 맞춤, 멈춤나사로 고정).' },
    { a: 'crank', b: 'sg90', cls: 'rigid', max: .6, why: '크랭크 포켓이 SG90 스플라인에 끼워진다.' },
    { a: 'hub', b: 'motor', cls: 'rigid', ctx: 'spin', max: 1.2, why: '모터 축은 컵과 함께 돈다. 모델의 축은 몸통과 한 덩어리라 돌지 않아서 D 평면이 어긋나 보일 뿐이다 (축–허브 맞춤은 완성 자세에서 검사).' },
  ];
  function allowed(f) {
    return ALLOW.find((x) => x.cls === f.cls && (!x.ctx || x.ctx === f.ctx) && ((x.a === f.a && x.b === f.b) || (x.a === f.b && x.b === f.a)) && f.depth <= x.max);
  }

  // ---------- 전체 점검 ----------
  function run(opt = {}) { return finish([collect(opt)]); }
  function collect(opt = {}) {
    const t0 = performance.now(), P = M.P, LAST = M.LAST, found = new Map(), stats = { poses: 0, pairs: 0 };
    const saved = { step: M.step };
    function note(ctx, label, A, B, cls, r, pose) {
      if (!r || !r.hits) return;
      const [x, y] = A.key < B.key ? [A, B] : [B, A], key = [ctx, x.key, y.key, cls].join('|');
      let f = found.get(key);
      if (!f) found.set(key, f = { ctx, a: x.key, b: y.key, an: x.name, bn: y.name, cls, depth: 0, hits: 0, poses: 0, first: label, last: label, at: null, pts: [], when: label, pose });
      f.poses++; f.last = label;
      if (r.depth > f.depth) { f.depth = r.depth; f.hits = r.hits; f.at = r.at; f.pts = r.pts; f.when = label; f.pose = pose; }
    }
    function pairs(ctx, label, pose, movers, others, self) {
      stats.poses++; const so = ctx === 'path';
      for (const A of movers) for (const B of others) { if (A === B) continue; stats.pairs++; const r = testPair(A, B, so); for (const cls in r) note(ctx, label, A, B, cls, r[cls], pose); }
      if (self) for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) { stats.pairs++; const r = testPair(movers[i], movers[j], so); for (const cls in r) note(ctx, label, movers[i], movers[j], cls, r[cls], pose); }
    }
    const want = (c) => !opt.ctx || opt.ctx.includes(c);
    const pick = (list, keys) => list.filter((b) => keys.includes(b.key));
    const rest = (list, keys) => list.filter((b) => !keys.includes(b.key));

    // 1) 완성 상태: 보이는 모든 물체끼리 + 책상
    let pose = { step: LAST, t: 1, kin: {} }; M.pose(LAST, 1); let all = bodies();
    if (want('final')) pairs('final', '완성 자세 (후드 OPEN 60°, 리프터 최하)', pose, all, [], true);
    if (want('final')) for (const b of all) note('final', '완성 자세', b, { key: '~desk', name: '책상 면' }, 'desk', testDesk(b, P.table_zw_mm), pose);
    // 2) 후드 0~120°
    if (want('hood')) for (let a = 0; a <= 120; a += 5) { pose = { step: LAST, t: 1, kin: { hood: a } }; M.pose(LAST, 1, pose.kin); all = bodies();
      pairs('hood', '후드 ' + a + '°', pose, pick(all, ['hood']), rest(all, ['hood'])); }
    // 3) 리프터 0~66 mm (후드 FLIP 90°). 큐브는 이때 뒤집히는 중이라 뺀다 — 큐브 궤적은 CAD 검사 d_ 항목이 본다.
    if (want('lift')) for (let s = 0; s <= P.lift_stroke_mm; s += 3) { pose = { step: LAST, t: 1, kin: { hood: P.hood_flip_deg, lift: s } }; M.pose(LAST, 1, pose.kin); all = rest(bodies(), ['cube']);
      pairs('lift', '리프터 ' + s + ' mm', pose, pick(all, ['lifter', 'crank', 'link']), rest(all, ['lifter', 'crank', 'link']), true); }
    // 4) 컵 회전: 후드 OPEN (큐브가 함께 돈다) / 후드 CLOSE (컵·허브만 — 위 두 층은 후드가 잡는다)
    if (want('spin')) for (let a = 0; a <= 90; a += 7.5) {
      pose = { step: LAST, t: 1, kin: { cup: a } }; M.pose(LAST, 1, pose.kin); all = bodies();
      pairs('spin', '컵 ' + a + '° · 후드 OPEN', pose, pick(all, ['holder', 'hub', 'cube']), rest(all, ['holder', 'hub', 'cube']));
      pose = { step: LAST, t: 1, kin: { cup: a, hood: 0, cubeTurns: false } }; M.pose(LAST, 1, pose.kin); all = rest(bodies(), ['cube']);
      pairs('spin', '컵 ' + a + '° · 후드 CLOSE', pose, pick(all, ['holder', 'hub']), rest(all, ['holder', 'hub']));
    }
    // 5) 조립 경로: 단계마다 끼워 넣는 부품이 그림의 직선 경로로 들어올 때 이미 있는 부품을 지나가는지
    const ez = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    if (want('path')) for (let st = 1; st <= LAST; st++) for (let i = 0; i <= 20; i++) {
      if (opt.steps && !opt.steps.includes(st)) continue;
      const t = i / 20, kin = st === LAST ? { hood: P.hood_load_deg + (P.hood_open_deg - P.hood_load_deg) * ez((t - .8) / .2) } : {};
      pose = { step: st, t, kin }; M.pose(st, t, kin); all = bodies();
      const movers = all.filter((b) => b.it.active && RIGID[b.kind]), inStep = (b) => b.it.phases.some((p) => p.step === st);
      let others = all.filter((b) => !b.it.active); if (M.STEPS[st].offRobot) others = others.filter(inStep);
      if (movers.length) pairs('path', M.STEPS[st].nav + ' · 진행 ' + Math.round(t * 100) + ' %', pose, movers, others, i === 20);
    }
    M.pose(saved.step, 1); M.go(saved.step, { t: 1, instant: true });
    return { list: [...found.values()], stats, bodies: all.length, ms: performance.now() - t0 };
  }
  function finish(chunks) {
    const stats = { poses: 0, pairs: 0 }; let ms = 0, nBodies = 0; const raw = [];
    for (const c of chunks) { stats.poses += c.stats.poses; stats.pairs += c.stats.pairs; ms += c.ms; nBodies = Math.max(nBodies, c.bodies); raw.push(...c.list); }
    const list = raw.map((f) => { const al = allowed(f); return Object.assign(f, { depth: +f.depth.toFixed(2), allowed: al ? al.why : '' }); });
    const order = { final: 0, hood: 1, lift: 2, spin: 3, path: 4 }, sev = (f) => (f.allowed ? 9 : f.cls === 'flexflex' ? 5 : f.cls === 'flex' ? 3 : 0);
    list.sort((p, q) => sev(p) - sev(q) || order[p.ctx] - order[q.ctx] || q.depth - p.depth);
    const real = list.filter((f) => !f.allowed);
    const count = (fn) => real.filter(fn).length;
    const summary = {
      rigid_final_or_motion: count((f) => (f.cls === 'rigid' || f.cls === 'desk') && f.ctx !== 'path'),
      rigid_assembly_path: count((f) => f.cls === 'rigid' && f.ctx === 'path'),
      cable_through_part: count((f) => f.cls === 'flex'),
      cable_cable: count((f) => f.cls === 'flexflex'),
      allowed_fits: list.length - real.length,
    };
    return { ok: summary.rigid_final_or_motion === 0 && summary.rigid_assembly_path === 0 && summary.cable_through_part === 0, summary,
      settings: { eps_mm: EPS, min_depth_mm: MIN_DEPTH, sample_mm: GRID, hood_step_deg: 5, lift_step_mm: 3, cup_step_deg: 7.5, path_step: .05 },
      checked: { bodies: nBodies, poses: stats.poses, pair_tests: stats.pairs, ms: Math.round(ms) },
      excluded: 'fastener(나사·볼트·핀·고무발), 원형 혼, 실리콘 패드, 큐브 스티커, 표시용 띠. 조립 경로는 단단한 것끼리만 본다 (선·케이블은 손으로 비켜 놓을 수 있다)',
      limitations: '표본 간격 약 2 mm 와 띄엄띄엄한 자세의 검사다. 구매품은 참고 모델(귀 높이 등은 실측 전 값), 전자부 자리와 케이블 길은 예시다. 연속 운동·강도·마찰은 보지 않는다.',
      findings: list };
  }

  // ---------- 화면 ----------
  const CTX = { final: '완성', hood: '후드 운동', lift: '리프터 운동', spin: '컵 회전', path: '조립 경로' };
  const CLS = { rigid: '부품 ↔ 부품', flex: '케이블 ↔ 부품', flexflex: '선 ↔ 선', desk: '책상 아래' };
  let marks = null, lastResult = null;
  function clearMarks() { if (marks) { marks.parent.remove(marks); marks = null; } }
  function show(f) {
    M.pose(f.pose.step, f.pose.t, f.pose.kin); clearMarks();
    marks = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xff1f3d, depthTest: false, transparent: true, opacity: .9 }), geo = new THREE.SphereGeometry(1.1, 10, 8);
    for (const p of f.pts) { const s = new THREE.Mesh(geo, mat); s.position.set(p[0], p[1], p[2]); s.renderOrder = 30; s.userData.skip = true; marks.add(s); }
    M.scene.add(marks);
    if (f.at) M.flyTo({ az: M.cam.az, el: Math.max(22, M.cam.el), dist: 230, at: f.at, world: true });
  }
  function render(res) {
    lastResult = res; const el = document.getElementById('content'), s = res.summary;
    const pill = (n, good) => `<span class="pill ${n ? 'bad1' : 'ok1'}">${n ? n + '건' : good}</span>`;
    const rows = res.findings.map((f, i) => `<tr data-i="${i}" tabindex="0"><td>${CTX[f.ctx]}</td><td>${f.an} ↔ ${f.bn}<br><span style="color:var(--muted)">${f.allowed ? '의도된 끼워 맞춤 — ' + f.allowed : CLS[f.cls] + ' · ' + f.when + (f.poses > 1 ? ' (' + f.poses + '개 자세)' : '')}</span></td><td>${f.depth.toFixed(1)} mm</td></tr>`).join('');
    el.innerHTML = `<h2>겹침 점검 결과</h2><p class="lead">이 화면의 3D 장면을 그대로 검사했다. 물체 ${res.checked.bodies}개, 자세 ${res.checked.poses}개, 쌍 검사 ${res.checked.pair_tests}회 (${(res.checked.ms / 1000).toFixed(1)} s).</p>` +
      `<table><tr><th>항목</th><th>결과</th></tr>` +
      `<tr><td>완성 자세·구동 범위에서 부품끼리 겹침</td><td>${pill(s.rigid_final_or_motion, '없음')}</td></tr>` +
      `<tr><td>조립 경로(끼우는 방향)에서 부품끼리 겹침</td><td>${pill(s.rigid_assembly_path, '없음')}</td></tr>` +
      `<tr><td>케이블·점퍼선이 부품을 지나감</td><td>${pill(s.cable_through_part, '없음')}</td></tr>` +
      `<tr><td>선끼리 겹쳐 그려진 곳 (참고)</td><td><span class="pill">${s.cable_cable}쌍</span></td></tr>` +
      `<tr><td>의도된 끼워 맞춤 (제외)</td><td><span class="pill">${s.allowed_fits}쌍</span></td></tr></table>` +
      `<div class="${res.ok ? 'ok' : 'bad'}"><b>${res.ok ? '통과' : '확인 필요'}</b> — ${res.ok ? '단단한 부품끼리 겹치는 곳이 없다.' : '아래 목록의 줄을 누르면 그 자세로 가서 겹친 곳을 빨간 점으로 보여 준다.'}</div>` +
      (rows ? `<h3>찾은 곳 (누르면 그 자세로 이동)</h3><table class="find"><tr><th>상황</th><th>물체</th><th>깊이</th></tr>${rows}</table>` : '') +
      `<h3>검사 방법과 한계</h3><ul><li>겉면에서 ${res.settings.eps_mm} mm 들인 표본점(간격 약 ${res.settings.sample_mm} mm)이 다른 물체 안에 ${res.settings.min_depth_mm} mm 넘게 들어가면 겹침으로 센다. 맞닿은 면은 겹침이 아니다.</li>` +
      `<li>자세: 후드 0~120° (5°), 리프터 0~66 mm (3 mm), 컵 0~90° (7.5°), 단계별 조립 진행 (5 %).</li><li>제외: ${res.excluded}.</li><li>${res.limitations}</li></ul>` +
      `<p><button id="btnCheckClose">설명서로 돌아가기</button></p>`;
    el.scrollTop = 0;
    el.querySelector('#btnCheckClose').addEventListener('click', () => { clearMarks(); M.go(M.step); });
    for (const tr of el.querySelectorAll('tr[data-i]')) tr.addEventListener('click', () => show(res.findings[+tr.dataset.i]));
  }
  function attach(manual) {
    M = manual; THREE = manual.THREE; rel = new THREE.Matrix4(); inv = new THREE.Matrix4(); pw = new THREE.Vector3();
    const btn = document.getElementById('btnCheck');
    if (btn) btn.addEventListener('click', () => {
      const el = document.getElementById('content'), order = ['final', 'hood', 'lift', 'spin', 'path'], chunks = [];
      const next = (i) => { if (i === order.length) { render(finish(chunks)); return; }
        el.innerHTML = '<h2>겹침 점검</h2><p class="lead">검사하는 중이다… ' + (i + 1) + ' / ' + order.length + ' · ' + CTX[order[i]] + '</p>';
        setTimeout(() => { try { chunks.push(collect({ ctx: [order[i]] })); next(i + 1); } catch (e) { el.innerHTML = '<div class="bad">검사 실패: ' + (e && e.message) + '</div>'; throw e; } }, 60); };
      next(0);
    });
  }
  // 디버그: 월드 점이 물체(key) 안에 얼마나 깊이 있는지 (밖이면 0)
  function probeAt(key, p) {
    const it = M.byKey[key]; let best = 0; M.scene.updateMatrixWorld(true);
    it.g.traverse((o) => { if (!o.isMesh || o.userData.skip || o.userData.cable || /^Plane/.test(o.geometry.type)) return;
      const q = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(new THREE.Matrix4().copy(o.matrixWorld).invert()); best = Math.max(best, depthIn(prep(o.geometry), q.x, q.y, q.z)); });
    return best;
  }
  global.OverlapV5 = { attach, run, render, show, clearMarks, probeAt, get result() { return lastResult; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
