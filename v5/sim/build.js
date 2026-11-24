// V5 3D 제작 설명서 — 출력 STL(models.js)·구매품 참고 모델(kit_models.js)·전자부(electronics.js)로
// 기구 조립 → 전자부 배치 → 배선 8단계 → 동작 확인을 단계별로 보여 준다. 단계마다 끼우는 방향을 화살표로 그린다.
// 좌표·치수는 models/robot_v5/parameters.json(= CubeModels.params), 조립 순서는 docs/BUILD_V5.md 3절,
// 배선은 wiring_data.js(= tools/make_wiring_v5.js 의 표). 겹침 검사(overlap.js)는 이 장면을 그대로 읽는다.
// 단위 mm. 국소 홀더 좌표: 원점 = 컵 바닥판 윗면 중심, +y 관중 쪽, +z 바닥 법선 위 (docs/HARDWARE_V5.md 1절).
// 나사는 위치를 알려 주는 단순 도형이다 (실제 나사 머리 모양과 다를 수 있다).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function showError(e) { const el = $('error'); el.hidden = false; el.textContent = (e && e.message) || String(e); }
  window.addEventListener('error', (e) => { if (!/ResizeObserver/.test(String(e.message))) showError(e.error || e.message); });
  try {
    if (!window.THREE) throw new Error('Three.js 를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.');
    const models = window.CubeModels || { params: {}, parts: {} };
    const P = models.params;
    if (!P || !P.print_offsets) throw new Error('models.js 가 없습니다. node tools/embed_models_v5.js 를 먼저 실행하세요.');
    const kit = window.KitModels, W = window.WiringV5;
    if (!kit || !kit.parts) throw new Error('kit_models.js 가 없습니다. tools/export_purchased_v5.py → node tools/embed_kit_v5.js 를 먼저 실행하세요.');
    if (!W || !W.wires) throw new Error('wiring_data.js 가 없습니다. node tools/make_wiring_v5.js 를 먼저 실행하세요.');
    if (!window.ElectronicsV5) throw new Error('electronics.js 를 불러오지 못했습니다.');
    const WIRE0 = 8, LAST = WIRE0 + 9;       // 배선 s 단계 = 설명서 WIRE0 + s 단계, 마지막은 동작 확인

    const deg = (n) => n * Math.PI / 180, clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
    const mix = (a, b, t) => a + (b - a) * t, ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const X = V([1, 0, 0]), Z = V([0, 0, 1]);
    const H = P.cube_mm / 2, TILT = deg(P.tilt_deg);
    const hinge = [0, P.hinge_y_mm, P.hinge_z_mm];
    const liftDir = [-Math.sin(deg(P.lift_dir_deg)), Math.cos(deg(P.lift_dir_deg))];
    const q0 = P.lift_Q0, slot0 = P.lift_B0;
    const crankAxis = P.servo_axes.lift, crankR = P.crank_r_mm, linkL = P.link_centres_mm || P.link_mm;
    const crankX = (P.lever_planes_x_mm.crank[0] + P.lever_planes_x_mm.crank[1]) / 2;
    const linkX = (P.lever_planes_x_mm.link[0] + P.lever_planes_x_mm.link[1]) / 2;
    const tableZ = (y) => (P.table_zw_mm - y * Math.sin(TILT)) / Math.cos(TILT);
    const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

    // ---------- 장면 ----------
    const canvas = $('view'), stage = $('stage');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 5, 6000); camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7780, 1.0));
    for (const [p, power] of [[[160, -260, 380], 1.1], [[-260, 80, 180], .6], [[60, 280, 240], .5]]) {
      const l = new THREE.DirectionalLight(0xffffff, power); l.position.set(p[0], p[1], p[2]); scene.add(l);
    }
    // 월드: 관중은 −y. 국소를 z 로 180° 돌린 뒤 x 로 −20° 기울인다 (뒤가 낮다).
    const tilt = new THREE.Group(); tilt.rotation.x = -TILT; scene.add(tilt);
    const robot = new THREE.Group(); robot.rotation.z = Math.PI; tilt.add(robot);
    const grid = new THREE.GridHelper(1200, 40, 0x7f8f99, 0x9aa8b0); grid.rotation.x = Math.PI / 2; grid.position.z = P.table_zw_mm - .3;
    grid.material.transparent = true; grid.material.opacity = .45; scene.add(grid);
    function applyTheme() { scene.background = new THREE.Color(dark() ? 0x142028 : 0xe6ecf0); }
    applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    // 운동 그룹: 컵 회전, 후드 힌지, 리프터 직선, 크랭크·링크
    const cupKin = new THREE.Group(), hoodKin = new THREE.Group(), liftKin = new THREE.Group();
    const crankKin = new THREE.Group(), linkKin = new THREE.Group(), cubePose = new THREE.Group(), cubeOri = new THREE.Group();
    robot.add(cupKin, hoodKin, liftKin, crankKin, linkKin, cubePose); cubePose.add(cubeOri);
    hoodKin.position.set(hinge[0], hinge[1], hinge[2]); cubePose.position.set(0, 0, H);

    // ---------- 부품(항목) ----------
    const COLORS = { cup: 0x54bfa2, hood: 0x6c98c4, lift: 0xe6ac55, base: 0x52676f, steel: 0xc3ccd2, motor: 0x8f9aa1, servo: 0x2a4563, servoS: 0x3f73a8, rubber: 0x23292e, pcb: 0x15818f, bb: 0xf2f0e6, lcd: 0x2f6b3a };
    const items = [], byKey = {};
    // kind: print(출력) · kit(구매품) · fastener(나사·핀: 겹침 검사에서 뺀다) · elec(전자부) · flex(케이블) · wire(점퍼선) · cube
    function item(key, parent, phases, opt = {}) {
      const g = opt.group || new THREE.Group(); if (!opt.group) parent.add(g);
      const it = { key, g, mats: opt.mats || [], style: '', phases: phases.map((p) => ({ step: p.step, from: V(p.from || [0, 0, 0]), to: V(p.to || [0, 0, 0]), delay: p.delay || 0 })),
        explode: V(opt.explode || [0, 0, 0]), overview: opt.overview !== false, hl: opt.hl !== false, label: opt.label || null, tag: null,
        kind: opt.kind || 'print', name: opt.name || (opt.label && opt.label.text) || key, arrowAt: opt.arrowAt || null, arrowGap: opt.arrowGap, wire: opt.wire || null, note: opt.note || '' };
      items.push(it); byKey[key] = it; return it;
    }
    function material(it, color, metalness = .05, roughness = .6) {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), metalness, roughness });
      it.mats.push(m); return m;
    }
    function add(it, geometry, mat, pos) { const o = new THREE.Mesh(geometry, mat); if (pos) o.position.set(pos[0], pos[1], pos[2]); it.g.add(o); return o; }
    const box = (it, size, center, mat) => add(it, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, center);
    function cyl(it, r, len, center, dir, mat, seg = 28) {
      const o = add(it, new THREE.CylinderGeometry(r, r, len, seg), mat, center);
      o.quaternion.setFromUnitVectors(V([0, 1, 0]), V(dir).normalize()); return o;
    }
    // 나사: seat = 머리 밑면이 닿는 점, dir = 머리에서 끝으로 가는 방향
    function screw(it, mat, seat, dir, len, d = 3, headD = 5.5, headH = 2) {
      const n = V(dir).normalize(), s = V(seat);
      cyl(it, d / 2, len, s.clone().addScaledVector(n, len / 2).toArray(), dir, mat, 14).userData.skip = true;
      cyl(it, headD / 2, headH, s.clone().addScaledVector(n, -headH / 2).toArray(), dir, mat, 18).userData.skip = true;
    }
    function kitGeometry(name) {             // 구매품 참고 모델: 이미 장착 자리(국소 좌표)에 놓여 있다
      const data = kit.parts[name]; if (!data || !data.b64) throw new Error('구매품 모델 없음: ' + name);
      const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
      const dv = new DataView(bytes.buffer), n = dv.getUint32(80, true), pos = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
    }
    function stlGeometry(name, origin = [0, 0, 0]) {
      const data = models.parts[name], off = P.print_offsets[name];
      if (!data || !data.b64 || !off) throw new Error('STL 없음: ' + name);
      const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
      const dv = new DataView(bytes.buffer), n = dv.getUint32(80, true);
      const pos = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++)
        pos[t * 9 + v * 3 + k] = dv.getFloat32(84 + t * 50 + 12 + v * 12 + k * 4, true) + off[k] - origin[k];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
    }

    // 1) 베이스 + 모터
    const base = item('base', robot, [{ step: 1 }], { hl: false, label: { text: '베이스 (타워 2 포함)', at: [0, -70, -40] } });
    add(base, stlGeometry('base'), material(base, COLORS.base));
    const motor = item('motor', robot, [{ step: 1, from: [0, 0, -85] }], { kind: 'kit', explode: [0, 0, -70], label: { text: 'NEMA17 스텝모터', at: [0, 22, -45] }, arrowAt: [26, 0, -66], arrowGap: 4 });
    add(motor, kitGeometry('nema17'), material(motor, COLORS.motor, .6, .45));
    const motorScrews = item('motorScrews', robot, [{ step: 1, from: [0, 0, 45], delay: .5 }], { kind: 'fastener', explode: [0, 0, 28], label: { text: 'M3×8 ×4', at: [15.5, 15.5, -17] } });
    { const s = material(motorScrews, COLORS.steel, .8, .35), top = P.motor_face_z_mm + P.motor_plate_t_mm;
      for (const x of [-15.5, 15.5]) for (const y of [-15.5, 15.5]) screw(motorScrews, s, [x, y, top], [0, 0, -1], 8); }

    // 2) 허브 → 홀더, 3) 홀더 → 축
    const holder = item('holder', cupKin, [{ step: 2, from: [0, 0, 100], to: [0, 0, 60] }, { step: 3, from: [0, 0, 60] }], { explode: [0, 0, 100], label: { text: '컵(홀더)', at: [30, 30, 16] }, arrowAt: [0, 0, 16] });
    add(holder, stlGeometry('cube_holder'), material(holder, COLORS.cup));
    const hub = item('hub', cupKin, [{ step: 2, from: [0, 0, 22], to: [0, 0, 60] }, { step: 3, from: [0, 0, 60] }], { explode: [0, 0, 62], label: { text: '허브', at: [0, 15, -12] }, arrowAt: [0, 0, -19] });
    add(hub, stlGeometry('hub'), material(hub, COLORS.cup));
    const hubScrews = item('hubScrews', cupKin, [{ step: 2, from: [0, 0, 5], to: [0, 0, 60], delay: .45 }, { step: 3, from: [0, 0, 60] }], { kind: 'fastener', explode: [0, 0, 40], label: { text: 'M3 ×2', at: [11, 0, -10] } });
    { const s = material(hubScrews, COLORS.steel, .8, .35), under = -P.plate_t_mm - P.hub_flange_t_mm;
      for (const x of [-11, 11]) screw(hubScrews, s, [x, 0, under], [0, 0, 1], 6); }
    const setScrew = item('setScrew', cupKin, [{ step: 3, from: [30, 0, 0], delay: .6 }], { kind: 'fastener', explode: [45, 0, 62], label: { text: '멈춤나사 M3×6', at: [9, 0, -11] } });
    cyl(setScrew, 1.5, 6, [6, 0, -11], [1, 0, 0], material(setScrew, COLORS.steel, .8, .35), 14).userData.skip = true;

    // 4) 후드 서보
    const mg = item('mg996r', robot, [{ step: 4, from: [55, 0, 0] }], { kind: 'kit', explode: [70, 0, 0], label: { text: 'MG996R (후드 서보)', at: [62, -80, 52] }, arrowAt: [80, hinge[1] + 10, hinge[2]], arrowGap: 4 });
    add(mg, kitGeometry('mg996r'), material(mg, COLORS.servo, .1, .5));   // 축이 힌지 위에서 −x(타워 안쪽)를 본다. 몸통은 앞(+y)으로
    const mgScrews = item('mgScrews', robot, [{ step: 4, from: [40, 0, 0], delay: .5 }], { kind: 'fastener', explode: [105, 0, 0], label: { text: 'M3 ×4', at: [50, hinge[1] + 34.75, hinge[2] + 5] } });
    { const s = material(mgScrews, COLORS.steel, .8, .35);
      for (const y of [hinge[1] + 10.25 - 24.75, hinge[1] + 10.25 + 24.75]) for (const z of [hinge[2] - 5, hinge[2] + 5]) screw(mgScrews, s, [52.7, y, z], [-1, 0, 0], 12); }

    // 5) 후드 (원형 혼 포함) + 왼쪽 피벗
    const hood = item('hood', hoodKin, [{ step: 5, from: [0, 25, 85] }], { explode: [0, 10, 120], label: { text: '후드 + 원형 혼', at: [0, 95, 20] }, arrowAt: [0, 30, 62] });
    { add(hood, stlGeometry('hood', hinge), material(hood, COLORS.hood));
      const s = material(hood, COLORS.steel, .8, .35), k = material(hood, COLORS.rubber, .1, .7);
      cyl(hood, 10.5, 2.5, [37.75, 0, 0], [1, 0, 0], k).userData.skip = true;   // 원형 혼(후드 포켓에 들어가 스플라인에 물린다)
      for (const a of [0, 90, 180, 270]) cyl(hood, 1, 6, [36, 7 * Math.cos(deg(a)), 7 * Math.sin(deg(a))], [1, 0, 0], s, 10).userData.skip = true; }
    const pivot = item('pivot', robot, [{ step: 5, from: [-40, 0, 0], delay: .6 }], { kind: 'fastener', explode: [-75, 0, 0], label: { text: '피벗 M3×25 + 너트', at: [-50, hinge[1], hinge[2] + 6] } });
    { const s = material(pivot, COLORS.steel, .8, .35);
      screw(pivot, s, [-45.5, hinge[1], hinge[2]], [1, 0, 0], 23);
      cyl(pivot, 3.1, 2.4, [-31.8, hinge[1], hinge[2]], [1, 0, 0], s, 6).userData.skip = true; }

    // 6) 리프터 + 오른쪽 슬롯 볼트 + 패드
    const lifter = item('lifter', liftKin, [{ step: 6, from: [0, 0, 70] }], { explode: [0, 95, 25], label: { text: '리프터', at: [0, slot0[0] + 6, slot0[1] + 8] }, arrowAt: [0, slot0[0], slot0[1] + 6] });
    { add(lifter, stlGeometry('lifter'), material(lifter, COLORS.lift));
      box(lifter, [P.hook_w_mm - 1, P.shelf_len_mm - 1.2, .6], [0, q0[0] - (P.shelf_len_mm + 1) / 2, q0[1] + .1], material(lifter, COLORS.rubber, .05, .9)).userData.skip = true; }
    const boltR = item('boltR', liftKin, [{ step: 6, from: [35, 0, 0], delay: .55 }], { kind: 'fastener', explode: [70, 95, 25], label: { text: '슬롯 볼트 M3×20', at: [50, slot0[0], slot0[1]] } });
    screw(boltR, material(boltR, COLORS.steel, .8, .35), [45.5, slot0[0], slot0[1]], [-1, 0, 0], 13);

    // 7) 리프터 서보 + 크랭크 + 링크 + 왼쪽 슬롯 볼트
    const sy = crankAxis[1], sz = crankAxis[2], mount = P.sg90_mount_outer_x_mm;
    const sg = item('sg90', robot, [{ step: 7, from: [-45, 0, 0] }], { kind: 'kit', explode: [-70, 0, 0], label: { text: 'SG90 (리프터 서보)', at: [mount - 14, sy, sz + 10] }, arrowAt: [mount - 22.5, sy - 5, sz], arrowGap: 4 });
    add(sg, kitGeometry('sg90'), material(sg, COLORS.servoS, .1, .5));     // 축이 +x(타워 쪽), 몸통은 뒤(−y)로. 귀 윗면이 판 바깥면
    const sgScrews = item('sgScrews', robot, [{ step: 7, from: [-30, 0, 0], delay: .3 }], { kind: 'fastener', explode: [-105, 0, 0], label: { text: 'M2 ×2', at: [mount - 8, sy + 8.7, sz] } });
    { const s = material(sgScrews, COLORS.steel, .8, .35); for (const y of [sy - 5.25 - 13.85, sy - 5.25 + 13.85]) screw(sgScrews, s, [mount - 5.5, y, sz], [1, 0, 0], 8, 2, 3.8, 1.4); }
    crankKin.position.set(crankX, sy, sz);
    const crank = item('crank', crankKin, [{ step: 7, from: [0, -32, 30], delay: .45 }], { explode: [-20, -55, 40], label: { text: '크랭크', at: [0, 8, -14] }, arrowAt: [0, 0, -16] });
    { add(crank, stlGeometry('crank', [crankX, sy, sz]), material(crank, COLORS.lift));
      const pinY = crankR * liftDir[0] * -1, pinZ = crankR * liftDir[1] * -1;   // 0° = 크랭크가 슬롯 아래쪽을 향한다
      screw(crank, material(crank, COLORS.steel, .8, .35), [-2, pinY, pinZ], [1, 0, 0], 9); }
    linkKin.position.set(linkX, slot0[0], slot0[1]);
    const link = item('link', linkKin, [{ step: 7, from: [0, 0, 60], delay: .6 }], { explode: [0, -85, 5], label: { text: '링크', at: [0, -14, 32] }, arrowAt: [0, -14, 32] });
    add(link, stlGeometry('link', [linkX, slot0[0], slot0[1]]), material(link, COLORS.steel, .35, .5));
    const boltL = item('boltL', liftKin, [{ step: 7, from: [-35, 0, 0], delay: .8 }], { kind: 'fastener', explode: [-70, 95, 25], label: { text: '슬롯 볼트 M3×20', at: [-52, slot0[0], slot0[1]] } });
    screw(boltL, material(boltL, COLORS.steel, .8, .35), [-50, slot0[0], slot0[1]], [1, 0, 0], 17.5);

    // 8) 고무발 + 전자부 (전자부는 월드 좌표, 책상 위)
    const feet = item('feet', robot, [{ step: 8, from: [0, -10, -28] }], { kind: 'fastener', explode: [0, -10, -30], label: { text: '고무발 ×4', at: [20, 18, tableZ(18) + 2] } });
    { const m = material(feet, COLORS.rubber, .05, .9), n = [0, Math.sin(TILT), Math.cos(TILT)];
      for (const [x, y] of [[-20, 18], [20, 18], [-43, -87], [43, -87]]) cyl(feet, 5, 1, [x, y + n[1] * .5, tableZ(y) + n[2] * .5], n, m); }
    // 전자부·케이블·점퍼선: electronics.js 가 월드 좌표(책상 위)에 만든 묶음을 그대로 항목으로 받는다
    scene.updateMatrixWorld(true);
    const eLabels = new Map();
    const E = window.ElectronicsV5.build({ THREE, scene, robot, P, W, maxAniso: renderer.capabilities.getMaxAnisotropy(), label: (text, at, g) => { if (g) eLabels.set(g, { text, at }); } });
    for (const p of E.parts) {
      const flex = /Lead|Cable|usb/.test(p.key), lab = eLabels.get(p.g), at = lab ? (lab.at.isVector3 ? lab.at.toArray() : lab.at) : p.at.toArray();
      item(p.key, scene, [{ step: p.step ? WIRE0 + p.step : 8, from: p.drop.toArray(), delay: p.step ? 0 : .3 }],
        { group: p.g, mats: p.mats, kind: flex ? 'flex' : 'elec', overview: false, name: p.name, note: p.note, label: { text: p.name, at }, arrowAt: p.at.toArray(), arrowGap: 3 });
    }
    { const count = {}, seen = {};
      for (const o of E.wires) count[o.w.step] = (count[o.w.step] || 0) + 1;
      for (const o of E.wires) { const i = seen[o.w.step] = (seen[o.w.step] || 0) + 1;
        item('wire' + o.w.n, scene, [{ step: WIRE0 + o.w.step, from: [0, 0, 26], delay: .25 + .6 * (i - 1) / count[o.w.step] }],
          { group: o.g, mats: o.mats, kind: 'wire', overview: false, name: '#' + o.w.n + ' ' + o.w.la + ' → ' + o.w.lb, wire: o }); } }

    // 9) 큐브 (흰색 아래 · 초록 앞)
    const cube = item('cube', cubeOri, [{ step: LAST, from: [0, 0, 120] }], { kind: 'cube', overview: false, hl: false, label: { text: '3×3 큐브 — 흰색 아래 · 초록 앞', at: [0, 0, 40] }, arrowAt: [0, 0, 32] });
    { const body = material(cube, 0x1b1f23, .05, .5), pitch = P.layer_mm, cg = new THREE.BoxGeometry(pitch - .5, pitch - .5, pitch - .5), sg2 = new THREE.PlaneGeometry(pitch - 3.4, pitch - 3.4);
      const faces = [[[0, 0, 1], 0xffd742], [[0, 0, -1], 0xf6f4e9], [[0, 1, 0], 0x35b76f], [[0, -1, 0], 0x3483d7], [[1, 0, 0], 0xde413f], [[-1, 0, 0], 0xff893e]];
      const fm = faces.map((f) => material(cube, f[1], 0, .45));
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue; add(cube, cg, body, [x * pitch, y * pitch, z * pitch]);
        faces.forEach((f, i) => { const n = f[0]; if (n[0] * x + n[1] * y + n[2] * z !== 1) return;
          const s = add(cube, sg2, fm[i], [x * pitch + n[0] * (pitch / 2 - .2), y * pitch + n[1] * (pitch / 2 - .2), z * pitch + n[2] * (pitch / 2 - .2)]);
          s.quaternion.setFromUnitVectors(Z, V(n)); s.userData.skip = true; });
      } }

    $('modelInfo').textContent = 'Rev ' + (P.revision || '?') + ' · 출력 7종 · 구매품 3종 · 선 ' + E.wires.length + '개 · 단위 mm';

    // ---------- 운동학 (v5/sim/app.js 와 같은 식) ----------
    const kin = { hood: P.hood_open_deg, lift: 0, cup: 0 };
    let restCrank = null, restLink = null;
    function setHood(a) { kin.hood = a; hoodKin.rotation.x = deg(a); }
    function setLifter(s) {
      kin.lift = s; liftKin.position.set(0, liftDir[0] * s, liftDir[1] * s);
      const by = slot0[0] + liftDir[0] * s, bz = slot0[1] + liftDir[1] * s, dy = by - sy, dz = bz - sz, d = Math.hypot(dy, dz);
      const alpha = Math.atan2(dz, dy) + Math.acos(clamp((d * d + crankR * crankR - linkL * linkL) / (2 * d * crankR), -1, 1));
      const ey = sy + crankR * Math.cos(alpha), ez = sz + crankR * Math.sin(alpha), beta = Math.atan2(ez - bz, ey - by);
      if (restCrank === null) { restCrank = alpha; restLink = beta; }
      crankKin.rotation.x = alpha - restCrank; linkKin.position.set(linkX, by, bz); linkKin.rotation.x = beta - restLink;
    }
    setHood(P.hood_open_deg); setLifter(0);
    // 뒤집기 궤적: 선반이 뒤 아래 모서리를 올리면 큐브가 앞 모서리로 서다가 65.1° 에서 넘어간다 (check_robot_v5.py 와 같은 근사)
    const flipStroke = 63.3, flipTheta = P.post_flip_relief_deg || 65.1, flipY = P.post_flip_pivot_y_mm || -28.3;
    const trace = [{ s: 0, th: 0, yf: H }];
    for (let s = 7.3; s < flipStroke; s += 1) {
      const qy = q0[0] + liftDir[0] * s, qz = q0[1] + liftDir[1] * s; let th = Math.asin(clamp(qz / P.cube_mm));
      th = Math.asin(clamp((qz + P.cube_edge_r_mm * Math.sin(th)) / P.cube_mm));
      trace.push({ s, th: th * 180 / Math.PI, yf: Math.min(H, qy - P.cube_edge_r_mm * Math.cos(Math.asin(clamp(qz / P.cube_mm))) + P.cube_mm * Math.cos(th)) });
    }
    trace.push({ s: flipStroke, th: flipTheta, yf: flipY });
    function traceAt(s) {
      if (s <= -q0[1] / liftDir[1]) return { th: 0, yf: H };
      let i = 1; while (i < trace.length - 1 && trace[i].s < s) i++;
      const a = trace[i - 1], b = trace[i], t = clamp((s - a.s) / (b.s - a.s || 1)); return { th: mix(a.th, b.th, t), yf: mix(a.yf, b.yf, t) };
    }
    const baseQ = new THREE.Quaternion();
    function poseFlip(theta, yf) {
      const t = deg(theta); cubePose.position.set(0, yf + H * (-Math.cos(t) + Math.sin(t)), H * (Math.sin(t) + Math.cos(t)));
      cubeOri.quaternion.copy(baseQ).premultiply(new THREE.Quaternion().setFromAxisAngle(X, -t));
    }
    let demo = null, demoTouched = false;   // {ms, dur, fn, done}
    function run(dur, fn, done) { demoTouched = true; demo = { ms: 0, dur, fn, done }; }
    function hoodTo(a, done) { const from = kin.hood; if (Math.abs(from - a) < .01) { if (done) done(); return; } run(350, (t) => setHood(mix(from, a, ease(t))), done); }
    function doSpin() {
      demoTouched = true;
      hoodTo(P.hood_open_deg, () => {
        const c0 = kin.cup; baseQ.copy(cubeOri.quaternion);
        run(600, (t) => { const a = -Math.PI / 2 * ease(t); kin.cup = c0 + a; cupKin.rotation.z = kin.cup; cubeOri.quaternion.copy(baseQ).premultiply(new THREE.Quaternion().setFromAxisAngle(Z, a)); });
      });
    }
    function doFlip() {
      demoTouched = true;
      hoodTo(P.hood_open_deg, () => {
        baseQ.copy(cubeOri.quaternion);
        run(2300, (t) => {
          const ms = t * 2300;
          if (ms < 275) { setHood(mix(P.hood_open_deg, P.hood_flip_deg, ease(ms / 275))); setLifter(0); poseFlip(0, H); }
          else if (ms < 1175) { setHood(P.hood_flip_deg); const s = flipStroke * ease((ms - 275) / 900), p = traceAt(s); setLifter(s); poseFlip(p.th, p.yf); }
          else if (ms < 1425) { setHood(P.hood_flip_deg); setLifter(flipStroke); const u = (ms - 1175) / 250; poseFlip(mix(flipTheta, 90, u * u), flipY); }
          else { poseFlip(90, -H); cubePose.position.set(0, 0, H); setLifter(ms < 2025 ? flipStroke * (1 - ease((ms - 1425) / 600)) : 0);
            setHood(ms < 2025 ? P.hood_flip_deg : mix(P.hood_flip_deg, P.hood_open_deg, ease((ms - 2025) / 275))); }
        });
      });
    }
    function resetKin() { demo = null; demoTouched = false; setHood(P.hood_open_deg); setLifter(0); kin.cup = 0; cupKin.rotation.z = 0; cubeOri.quaternion.identity(); cubePose.position.set(0, 0, H); }

    // ---------- 단계 ----------
    const sw = (c) => `<span class="sw" style="background:#${c.toString(16).padStart(6, '0')}"></span>`;
    const STEPS = [
      { nav: '부품', title: '부품 한눈에 보기', lead: '출력 7종과 구매 3종이 어디에 들어가는지 먼저 본다. ▶ 를 누르면 조립된 모습에서 분해된 모습으로 벌어진다.',
        cam: { az: -58, el: 20, dist: 760, at: [0, -30, 15] },
        parts: [['부품', '재료 · 근사 질량', '수량'],
          [sw(COLORS.base) + '베이스 <code>base.stl</code>', 'PETG/PLA · 166 g · 약 11 h', '1'], [sw(COLORS.hood) + '후드 <code>hood.stl</code>', '54 g · 약 3.7 h', '1'],
          [sw(COLORS.cup) + '컵 <code>cube_holder.stl</code>', '21 g · 약 1.4 h', '1'], [sw(COLORS.cup) + '허브 <code>hub.stl</code>', '4 g', '1'],
          [sw(COLORS.lift) + '리프터 · 크랭크', '2.5 g · 1.6 g', '각 1'], [sw(COLORS.steel) + '링크 <code>link.stl</code>', '3 g', '1'],
          [sw(COLORS.motor) + 'NEMA17 + A4988', '축 Ø5 D컷', '1'], [sw(COLORS.servo) + 'MG996R + 원형 혼 Ø21', '후드', '1'], [sw(COLORS.servoS) + 'SG90 / MG90S', '리프터', '1']],
        body: ['출력 설정: 적층 0.2 mm, 벽 3줄, 충전 20 %, <b>서포트 없음</b>. 놓는 면은 글 설명서 1절 표를 따른다.',
          '출력 순서: 컵·허브 → 리프터·크랭크·링크 → 후드 → 베이스. 컵이 먼저 나오면 큐브를 끼워 기둥 여유(면당 1.0 mm)를 바로 확인한다.',
          '출력이 도는 동안 <a href="../../docs/WIRING_V5_R4.html">배선 안내</a>대로 브레드보드를 꽂고 펌웨어를 올린다.'],
        check: '질량·시간은 CAD 체적에서 계산한 근사값이다 (슬라이서 값이 아니다).' },
      { nav: '① 모터', title: '① 모터 → 베이스', lead: '베이스의 모터 상자에 NEMA17 을 아래에서 넣고 윗판에 고정한다.', ghost: ['base'],
        cam: { az: -62, el: 16, dist: 430, at: [0, 0, -42] },
        parts: [['부품', '규격', '수량'], ['NEMA17 스텝모터', '42×42×40 이하', '1'], ['접시/둥근머리 나사', 'M3×8', '4']],
        body: ['베이스를 뒤집어 들고 모터 보스를 윗판 가운데 Ø23 구멍에 맞춰 넣는다. 상자 안치수 44 mm, 모터 42.3 mm (면당 0.85 mm).',
          '윗판 위에서 M3×8 ×4 (간격 31 mm)를 모터 앞면 탭에 조인다.', '케이블은 모터 상자 뒷벽의 창(폭 18 mm)으로 빼서 뒤 데크(타워 쪽)로 보낸다.'],
        dir: ["<b>모터</b> — 베이스 아래에서 위로 민다. 축이 위, 흰 커넥터가 <b>뒤(타워 쪽)</b>. 커넥터가 뒷벽 창에 온다.", "<b>M3×8 ×4</b> — 윗판 위에서 아래로. 머리가 윗판에 앉는다."],
        check: '축이 구멍 가운데에 있고, 손으로 돌렸을 때 윗판에 닿지 않는다.' },
      { nav: '② 허브', title: '② 허브 → 컵 밑면', lead: '허브 플랜지(Ø30)를 컵 바닥판 밑면 가운데에 붙인다. 그림은 컵을 들어 올린 상태다.', ghost: ['base', 'motor', 'motorScrews'], offRobot: true,
        cam: { az: -55, el: -14, dist: 260, at: [0, 0, 50] },
        parts: [['부품', '규격', '수량'], ['허브', '출력', '1'], ['나사', 'M3 (길이는 아래 주의)', '2']],
        body: ['허브의 D 구멍이 아래를 향하게 하고 플랜지 구멍 2개(중심에서 ±11 mm)를 판 구멍에 맞춘다. 노치 방향과는 무관하다.',
          '플랜지 아래에서 나사 2개를 조인다.'],
        dir: ["<b>허브</b> — 넓은 플랜지가 위(컵 쪽), 긴 목과 D 구멍이 아래(모터 쪽). 컵 밑면 가운데에 아래에서 위로 붙인다.", "<b>M3 ×2</b> — 플랜지 아래에서 위로."],
        check: '판 윗면(큐브가 앉는 면)을 손끝으로 쓸었을 때 나사 끝이 걸리지 않는다.',
        warn: '<b>확인 필요</b> — 판과 플랜지 구멍이 둘 다 Ø3.2 관통이라 나사가 플라스틱에 물리지 않는다. 플랜지 3 + 판 4 = 7 mm 이므로 M3×8 은 큐브 자리로 1 mm 튀어나온다. 판 구멍에 히트셋 인서트를 넣고 M3×6 을 쓰거나, CAD 에서 구멍을 직접 체결용(Ø2.8)으로 고쳐 다시 출력해야 한다.' },
      { nav: '③ 컵', title: '③ 컵 → 모터 축', lead: '허브를 축 D컷에 맞춰 끝까지 끼우고 멈춤나사로 고정한다.', ghost: ['base'],
        cam: { az: -50, el: 14, dist: 330, at: [0, 0, -5] },
        parts: [['부품', '규격', '수량'], ['멈춤나사', 'M3×6 무두', '1']],
        body: ['허브 D 구멍의 평면을 축 D컷 평면에 맞추고 끝까지 누른다. 판 아랫면이 모터 앞면 위 21 mm 에 온다.',
          '허브 옆 구멍으로 M3×6 멈춤나사를 D 평면에 조인다 (윗판과 플랜지 사이 13 mm 틈으로 육각 렌치를 넣는다).',
          '<b>노치 하나가 정확히 뒤(타워 쪽)</b>를 향하게 손으로 돌려 둔다. 전원을 켠 자리가 0° 가 된다.'],
        dir: ["<b>컵 + 허브</b> — 위에서 아래로 축에 끼운다. 기둥 4개가 위, 허브 목이 아래.", "<b>멈춤나사</b> — 허브 옆 구멍으로 수평으로 넣어 축의 D 평면을 누른다. 넣기 전에 축을 손으로 돌려 평면을 나사 구멍 쪽에 맞춘다."],
        check: '컵을 손으로 돌리면 축과 함께 돌고, 위아래로 흔들리지 않는다.' },
      { nav: '④ 후드 서보', title: '④ MG996R → 낮은 타워', lead: '뒤에서 봤을 때 오른쪽, 낮은 타워(높이 65)의 바깥 포켓에 후드 서보를 넣는다.',
        cam: { az: 138, el: 18, dist: 400, at: [52, -82, 38] },
        parts: [['부품', '규격', '수량'], ['MG996R', '180° 서보', '1'], ['나사', 'M3×12 (셀프탭)', '4'], ['스페이서', '4.7 mm (M3 너트 2개 겹침)', '4']],
        body: ['서보 출력축이 타워의 큰 구멍(Ø24 카운터보어) 가운데, 곧 후드 힌지에 오도록 몸체를 포켓(깊이 3 mm)에 넣는다.',
          '귀 4곳(49.5 × 10 mm 간격)과 타워 사이에 4.7 mm 스페이서를 끼우고, 바깥에서 M3×12 를 Ø2.8 구멍에 조인다.', '혼은 아직 끼우지 않는다. 전원을 넣어 75° 로 간 뒤 ⑤에서 맞춘다.'],
        dir: ["<b>MG996R</b> — 낮은 타워 <b>바깥에서 안쪽으로</b> 수평으로 민다. 출력축(금색 스플라인)이 타워 안쪽(컵 쪽)을 보고 뒤쪽 끝에 온다.", "몸통의 긴 쪽이 <b>앞(관중 쪽)</b>으로 뻗고, 케이블은 앞쪽 끝에서 나온다. 귀 2개가 타워 바깥면과 나란하다.", "<b>M3×12 ×4</b> — 귀 바깥에서 타워 쪽으로. 스페이서를 귀와 타워 사이에 먼저 끼운다."],
        check: '출력축이 힌지 구멍과 같은 축 위에 있다.',
        warn: '<b>키트 보정 (2026-11-15)</b> — 귀가 달린 서보 모델로 검사해 포켓을 41.5 mm 로 늘리고 구멍을 Ø2.8 셀프탭으로 바꿨다. 나사 끝이 타워 안쪽면(두께 6 mm)을 넘으면 후드 팔(틈 0.5 mm)에 걸리므로 M3×12 보다 긴 나사를 쓰지 않는다. 귀와 타워 사이 4.7 mm(TowerPro 표 기준)는 호환품마다 ±1 mm 다르다 — 실물을 재서 스페이서 두께를 정한다.' },
      { nav: '⑤ 후드', title: '⑤ 후드 걸기', lead: '원형 혼을 후드에 먼저 붙이고, 타워 사이로 넣어 서보 축과 왼쪽 피벗에 건다.',
        cam: { az: 32, el: 24, dist: 520, at: [0, -55, 50] },
        parts: [['부품', '규격', '수량'], ['후드', '출력 (ㄷ자: 앞벽 + 옆벽 2 + 지붕)', '1'], ['원형 혼 Ø21 + M2×8', '서보 동봉', '1 + 4'], ['피벗 볼트 + 너트', 'M3×25', '1']],
        body: ['혼을 후드 오른쪽 팔의 포켓(Ø21.5 × 2.5)에 M2 ×4 로 붙인다.',
          '서보에 전원을 넣어 <b>75°</b>(= 후드 OPEN 60°) 로 보낸 상태에서, 후드가 그림처럼 60° 열린 자세가 되는 스플라인 위치에 혼을 끼운다.',
          '반대쪽(높은 타워)은 M3×25 를 타워 밖에서 후드 팔 구멍까지 넣고 너트를 건다. 꽉 조이지 않는다.'],
        dir: ["<b>후드</b> — 지붕이 위, 앞벽이 관중 쪽, <b>원형 혼이 붙은 팔이 낮은 타워(MG996R) 쪽</b>. 위·앞에서 비스듬히 내려 두 팔을 타워 안쪽에 넣는다.", "혼을 서보 스플라인에 옆으로(타워 쪽으로) 눌러 끼운다. 팔을 살짝 벌려야 스플라인 끝을 넘는다.", "<b>피벗 볼트</b> — 높은 타워 바깥에서 안쪽으로. 너트는 후드 팔 안쪽에서 건다."],
        check: '후드를 손으로 0°~120° 움직였을 때 타워·컵에 닿지 않고 걸림 없이 돈다.' },
      { nav: '⑥ 리프터', title: '⑥ 리프터 → 슬롯', lead: '리프터 크로스바(폭 77)를 두 타워 사이에 넣어 비스듬한 슬롯에 맞춘다.', ghost: ['hood'],
        cam: { az: -112, el: 26, dist: 400, at: [10, -40, 5] },
        parts: [['부품', '규격', '수량'], ['리프터', '출력', '1'], ['슬롯 볼트', 'M3×20', '1 (낮은 타워 쪽)'], ['실리콘 패드', '0.5 mm, 16×3', '1']],
        body: ['갈고리(선반)가 컵 뒤쪽 노치 아래로 들어가게 리프터를 넣고, 크로스바 끝 구멍을 슬롯 맨 아래에 맞춘다.',
          '낮은 타워 쪽 슬롯에 볼트를 밖에서 끼운다. 볼트 몸통만 슬롯(폭 3.4)을 지난다. 높은 타워 쪽 볼트는 ⑦에서 링크와 함께 끼운다.',
          '선반 윗면 홈에 실리콘 패드를 붙인다 (마찰 0.62 이상이 필요하다).'],
        dir: ["<b>리프터</b> — 갈고리(선반)가 <b>앞(컵 쪽)·위</b>를 향하고 크로스바가 뒤·아래. <b>컵 바닥에 수직으로(곧게 위에서)</b> 두 타워 사이로 내려 크로스바 양 끝을 슬롯 안쪽에 맞춘다. 앞뒤로 기울여 넣으면 갈고리가 컵 판에 걸린다.", "<b>슬롯 볼트</b> — 낮은 타워 바깥에서 안쪽으로 슬롯을 지나 크로스바 끝 구멍에.", "<b>패드</b> — 선반 윗면(큐브가 닿는 면)에 붙인다."],
        check: '리프터를 손으로 슬롯 끝까지(66 mm) 올렸다 놓으면 걸리지 않고 내려온다. 최하 위치에서 선반이 컵 판에 닿지 않는다(틈 1 mm).',
        warn: '<b>확인 필요</b> — 크로스바는 4×4 mm 이고 끝 구멍이 Ø3.2 (벽 0.4 mm, 깊이 6 mm)라 M3 가 물리지 않는다. 볼트를 순간접착제로 고정하거나 CAD 에서 바 단면·구멍을 고치는 결정이 필요하다.' },
      { nav: '⑦ 리프터 서보', title: '⑦ SG90 · 크랭크 · 링크', lead: '높은 타워(높이 95) 바깥 위쪽 포켓에 리프터 서보를 달고 크랭크–링크로 리프터와 잇는다.', ghost: ['hood'],
        cam: { az: 42, el: 16, dist: 380, at: [-58, -70, 50] },
        parts: [['부품', '규격', '수량'], ['SG90 + M2×8', '키트', '1 + 2'], ['크랭크 (팔 33)', '출력', '1'], ['링크 (핀 간 70)', '출력', '1'], ['슬롯 볼트', 'M3×20', '1'], ['링크 핀 나사', 'M3×12', '1']],
        body: ['SG90 을 포켓(23.3 × 12.8)에 바깥에서 넣고 M2 ×2 로 고정한다. 출력축이 타워 쪽을 보고, 몸통의 긴 쪽이 뒤로 간다(축이 앞쪽 끝).',
          '서보를 <b>0°</b> 로 보낸 뒤, 크랭크가 슬롯 아래쪽을 가리키는(리프터 최하 = 사점) 방향으로 축에 끼운다.',
          '링크 한쪽을 크랭크 끝에 M3×12 로, 다른 쪽을 높은 타워 쪽 슬롯 볼트(M3×20)에 건다. 핀은 크랭크를 위(180°)로 돌려 타워 위로 나온 상태에서 끼우면 손이 들어간다.'],
        dir: ["<b>SG90</b> — 높은 타워 <b>바깥에서 안쪽으로</b> 수평으로 민다. 출력축(흰 스플라인)이 타워 쪽을 보고 앞쪽 끝에 온다. 몸통 긴 쪽과 케이블은 <b>뒤</b>.", "<b>M2 ×2</b> — 귀 바깥에서 타워 쪽으로.", "<b>크랭크</b> — 보스(둥근 턱)가 서보 쪽. 타워와 서보 판 사이 틈에 위에서 넣고, 스플라인에 <b>서보 쪽으로</b> 눌러 끼운다. 팔은 슬롯 아래쪽을 가리킨다.", "<b>링크</b> — 타워와 서보 판 사이 틈에 <b>위에서 곧게</b> 내려 넣는다 (뒤에서 밀면 타워에 걸린다). 크랭크보다 타워 쪽 면에 놓는다. 위쪽 구멍이 크랭크 핀, 아래쪽 구멍이 슬롯 볼트.", "<b>슬롯 볼트 · 핀 나사</b> — 높은 타워 바깥(서보 판 쪽)에서 안쪽으로."],
        check: '서보 0° 에서 리프터가 최하, 180° 에서 최상(66 mm). 크랭크·링크가 타워와 서보 판 사이에서 걸리지 않는다.',
        warn: '<b>확인 필요</b> — 링크와 타워 바깥면 사이는 0.5 mm 다. 링크 핀은 타워 쪽으로 머리·너트가 나오면 안 되므로 머리를 서보 판 쪽(틈 6.5 mm)에 두고 끝이 링크 면에서 멈춰야 한다.' },
      { nav: '⑧ 발 · 보드 놓기', title: '⑧ 고무발과 전자부 배치', lead: '고무발 4개를 붙이고, 브레드보드와 UNO 를 로봇 오른쪽(관중이 볼 때) 책상에 놓는다. 선은 다음 단계부터 꽂는다.',
        cam: { az: -70, el: 34, dist: 760, at: [110, 20, P.table_zw_mm + 20], world: true },
        parts: [['부품', '규격', '수량'], ['고무발', 'Ø10 접착식', '4'], ['브레드보드', '키트 170홀 (47 × 35)', '1'], ['UNO R4 WiFi + USB-C 케이블', '키트', '1']],
        body: ['베이스 바닥 홈(Ø10 × 1) 4곳에 고무발을 붙인다. 책상에 놓으면 컵 바닥이 뒤로 20° 기운다.',
          '브레드보드를 로봇 오른쪽에 가로로 놓는다. 뒷면 양면테이프는 자리가 정해진 뒤에 붙인다.',
          'UNO 를 브레드보드 뒤에 놓고 USB-C 를 꽂는다. 펌웨어를 먼저 올려 두면 배선하면서 바로 확인할 수 있다.'],
        dir: ['<b>고무발</b> — 베이스 바닥 홈에 아래에서 위로 붙인다.',
          '<b>브레드보드</b> — 1번 열이 왼쪽(로봇 쪽), <b>a 행이 뒤(UNO 쪽)</b>, j 행이 관중 쪽.',
          '<b>UNO R4 WiFi</b> — USB-C 단자가 왼쪽(로봇 쪽). 디지털 핀 줄(D0~D13)이 뒤, 전원·아날로그 줄(5V·GND·A0~A5)이 브레드보드 쪽.',
          '<b>USB-C</b> — 보드 왼쪽 옆면에 수평으로 민다.'],
        check: '후드를 LOAD(120°)까지 젖혀도 브레드보드·UNO 에 닿지 않는 자리다 (겹침 점검 참고).' }
    ];
    // 배선 8단계: 꽂는 것·선 목록은 electronics.js / wiring_data.js 에서 온다
    const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱';
    const WIRE_CHECK = [null,
      '전원 없이 d8과 d9가 이어졌는지 확인한다. a7(UNO 5V)과 a8(GND) 사이에 단락이 없어야 한다.',
      'A4988의 VMOT 핀이 e1에 있다. MS2 점퍼가 c7에 꽂혀 있고 MS1·MS3에는 선이 없다.',
      '커패시터의 흰 띠는 c2 쪽이다. 12 V 잭의 +는 a1, −는 a2에 연결한다.',
      '모터 선만 따로 쟀을 때 a3–a4에 갈 두 선과 a5–a6에 갈 두 선이 각각 같은 코일이다.',
      'a11과 j13 사이가 버튼을 놓으면 열리고, 누르면 통전된다.',
      '부저의 + 표시 다리가 e17, − 다리가 f17이다.',
      '서보 +5 V 분기와 UNO 5V 사이에 통전이 없고, 서보 GND 분기와 UNO GND는 통전된다.',
      'LCD 백팩의 GND·VCC·SDA·SCL 글씨 순서와 선(검정·빨강·초록·파랑)이 맞다.'];
    const WIRE_WARN = { 3: '<b>12 V +는 a1에만 연결한다.</b> 모든 배선을 마친 뒤에 전원을 넣는다.',
      4: '<b>전원이 들어온 채로 모터 선을 빼지 않는다.</b> A4988이 바로 망가진다.', 7: '<b>서보 +5 V와 UNO 5V는 분리한다.</b> GND는 공통이다.' };
    for (let w = 1; w <= 8; w++) {
      const ps = E.parts.filter((p) => p.step === w), ws = E.wires.filter((o) => o.w.step === w).map((o) => o.w);
      const types = ws.map((x) => x.type), dir = ps.filter((p) => p.note).map((p) => `<b>${p.name}</b> — ${p.note}`);
      if (types.some((t) => /^수-수/.test(t))) dir.push('<b>수-수 점퍼</b> — 핀을 구멍·헤더에 <b>위에서 수직으로</b> 끝까지 누른다 (금속 핀 약 6 mm 가 모두 들어간다). 비스듬히 밀면 핀이 휜다.');
      if (types.includes('단선')) dir.push('<b>단선</b> — 피복을 벗긴 끝을 잭 나사 단자나 레버형 분기 단자에 고정한다. 브레드보드 쪽은 단심선이나 핀을 수직으로 꽂는다.');
      if (types.includes('수-단선')) dir.push('<b>수-단선</b> — 수 핀을 서보 커넥터 또는 b8에 꽂고, 피복을 벗긴 끝은 분기 단자에 고정한다.');
      if (types.includes('모터 선')) dir.push('<b>모터 선</b> — 끝의 핀을 a3~a6 구멍에 위에서 수직으로. 핀이 없으면 수-수 점퍼를 이어 쓴다.');
      if (ws.some((w) => w.a.startsWith('srv') || w.b.startsWith('srv'))) dir.push('<b>서보 3핀 커넥터</b> — 점퍼 핀을 커넥터 구멍에 <b>수평으로</b> 끼운다. 갈색 = GND, 빨강 = V+, 주황 = 신호. 커넥터는 책상에 눕혀 둔다.');
      if (types.includes('암-수')) dir.push('<b>암-수 점퍼</b> — 암(구멍) 쪽을 LCD 백팩의 4핀에 <b>옆에서 수평으로</b> 끼운다. 수(핀) 쪽은 브레드보드·UNO에 수직으로.');
      const rows = [['꽂는 것', '자리', '수량']];
      for (const p of ps) rows.push([p.name, (W.legs.filter((l) => ({ a4988: 'drvCup', cap: 'cap', button: 'btnStart' }[p.key] === l.pin.split(':')[0]) || (p.key === 'buzzer' && /^(resistor|bz1)/.test(l.pin))).map((l) => l.hole).join(' ')) || '책상 위', '1']);
      rows.push(['점퍼선', [...new Set(types.map((t) => t.split(' / ')[0]))].join(' · '), String(ws.length)]);
      STEPS.push({ nav: `${CIRC[WIRE0 + w - 1]} ${E.STEPS[w][0]}`, title: `${CIRC[WIRE0 + w - 1]} 배선 ${w}/8 — ${E.STEPS[w][0]}`, lead: E.STEPS[w][1], wiring: w,
        parts: rows, body: ['화살표가 가리키는 구멍에 선을 하나씩 꽂는다. 아래 선 목록의 줄을 누르면 그 선만 밝게 보인다.', '앞 단계에서 꽂은 선은 흐리게 나온다. ▶ 다시 보기로 꽂는 순서를 되풀이해 본다.'],
        dir, wires: ws, check: WIRE_CHECK[w], warn: WIRE_WARN[w] });
    }
    STEPS.push({ nav: `${CIRC[LAST - 1]} 동작 확인`, title: `${CIRC[LAST - 1]} 큐브 장착과 동작 확인`, lead: '후드를 LOAD(120°)로 젖히고 큐브를 위에서 넣는다. 아래 버튼으로 세 가지 기본 동작을 미리 본다.',
      cam: { az: -62, el: 20, dist: 560, at: [0, -25, 25] }, demo: true,
      parts: [['조정 명령 (시리얼 115200)', '맞추는 것', ''], ['<code>L</code> 두 번', '후드 LOAD → 큐브 넣기 → OPEN', ''], ['<code>J ±n</code>', '컵 영점 (전원을 켤 때마다)', ''], ['<code>H 15 75 135</code>', '후드 CLOSE/OPEN/LOAD 서보 각', ''], ['<code>K 180</code>', '리프터 최상 각', ''], ['<code>O</code>', '층 회전 오버슈트 · 여유', '']],
      body: ['큐브는 <b>풀린 상태로, 흰색 아래 · 초록 앞</b>(관중 쪽)으로 넣는다. 기둥 모따기가 자리를 잡아 준다.',
        '후드 CLOSE: 벽이 위 두 층만 감싼다 (벽 아래끝 21 mm, 아래 층 19 mm). 이 상태에서 컵이 돌면 아래 층만 돈다.',
        '후드 OPEN + 컵 회전 = 큐브 전체 회전(SPIN). 후드 90° + 리프터 = 뒤집기(FLIP).',
        '풀이까지 이어서 보려면 <a href="index.html">동작 시뮬레이터</a>를 연다.'],
      dir: ['<b>큐브</b> — 위에서 아래로 컵에 넣는다. 흰색이 아래(컵 바닥), 초록이 앞(관중 쪽), 노랑이 위.'],
      check: '<code>M R U R\' U\'</code> 를 6번 반복해 원래 상태로 돌아오면 층 정렬과 뒤집기를 믿을 수 있다.' });
    if (STEPS.length !== LAST + 1) throw new Error('단계 수가 맞지 않습니다: ' + STEPS.length);

    // ---------- 끼우는 방향 화살표 ----------
    // 부품이 들어오는 쪽(출발점 쪽)에 놓고 도착 방향을 가리킨다. 가려지지 않게 항상 위에 그린다.
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, depthTest: false, transparent: true, opacity: .95 });
    const arrows = [];
    function arrow(parent, tip, dir, len, scale, step, it) {
      const g = new THREE.Group(), d = dir.clone().normalize(), head = 7 * scale;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * scale, 1.1 * scale, len - head, 10), arrowMat); shaft.position.y = -(len + head) / 2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3 * scale, head, 14), arrowMat); cone.position.y = -head / 2;
      for (const m of [shaft, cone]) { m.renderOrder = 20; m.userData.skip = true; g.add(m); }
      g.quaternion.setFromUnitVectors(V([0, 1, 0]), d); g.position.copy(tip); g.visible = false; parent.add(g);
      arrows.push({ g, base: tip.clone(), dir: d, step, it, amp: 2.2 * scale }); return g;
    }
    for (const it of items) {
      if (it.kind === 'wire') {
        for (const e of [it.wire.A, it.wire.B]) {
          if (e.dev === 'motorCable') continue;                       // 케이블 쪽 끝은 꽂는 자리가 아니다
          arrow(scene, e.pos.clone().addScaledVector(e.dir, e.housing ? 11.6 : 2.6), e.dir.clone().negate(), 11, .5, it.phases[0].step, it);
        }
        continue;
      }
      for (const ph of it.phases) {
        const move = ph.to.clone().sub(ph.from), dist = move.length(); if (dist < 1) continue;
        const d = move.normalize(), at = V(it.arrowAt || (it.label && it.label.at) || [0, 0, 0]).add(ph.to);
        const small = it.kind === 'fastener' || ((it.kind === 'elec' || it.kind === 'flex') && ph.step > WIRE0);
        arrow(it.g.parent, at.addScaledVector(d, -(it.arrowGap === undefined ? 7 : it.arrowGap)), d, small ? 15 : clamp(dist * .5, 20, 44), small ? .6 : 1, ph.step, it);
      }
    }

    // ---------- 상태·표시 ----------
    let step = 0, T = 0, playing = true, ghostBase = false, showLabels = true, showArrows = true, selWire = 0, clock = 0;
    const DUR = 2600, labelsEl = $('labels');
    function style(it, s) {
      if (it.style === s) return; it.style = s;
      const wire = it.kind === 'wire';
      it.mats.forEach((m, i) => {
        const glow = s === 'hl';
        if (wire) { if (i === 0) { m.emissive.copy(glow ? m.color : new THREE.Color(0)); m.emissiveIntensity = glow ? .6 : 0; } }
        else { m.emissive.setHex(glow ? 0x0f6b55 : 0); m.emissiveIntensity = glow ? (it.kind === 'elec' || it.kind === 'flex' || it.kind === 'kit' ? .22 : .55) : 0; }   // 무늬·색이 중요한 것은 약하게
        const op = s === 'ghost' ? .22 : s === 'past' ? .3 : s === 'dim' ? .1 : 1;
        m.transparent = op < 1; m.opacity = op; m.depthWrite = op === 1; m.needsUpdate = true;
      });
    }
    const tmp = new THREE.Vector3();
    function applyStep() {
      const cur = STEPS[step], ghosts = new Set(cur.ghost || []); if (ghostBase) ghosts.add('base');
      for (const it of items) {
        let pos = null, active = false;
        if (step === 0) { if (it.overview) pos = tmp.copy(it.explode).multiplyScalar(ease(T)); }
        else for (const ph of it.phases) {
          if (ph.step < step) pos = tmp.copy(ph.to);
          else if (ph.step === step) { const t = ease(clamp((T - ph.delay * .7) / (1 - ph.delay * .7) * 1.15)); pos = tmp.copy(ph.from).lerp(ph.to, t); active = true; break; }
          else break;
        }
        it.g.visible = !!pos; it.active = active; if (pos) it.g.position.copy(pos);
        let s = ghosts.has(it.key) ? 'ghost' : active && it.hl ? 'hl' : 'normal';
        if (it.kind === 'wire' && cur.wiring) s = selWire ? (it.wire.w.n === selWire ? 'hl' : 'dim') : active ? 'hl' : 'past';
        style(it, s);
      }
      for (const a of arrows) {
        a.g.visible = showArrows && step > 0 && a.step === step && (!selWire || !a.it.wire || a.it.wire.w.n === selWire);
        if (a.g.visible) a.g.position.copy(a.base).addScaledVector(a.dir, a.amp * Math.sin(clock / 240));
      }
      if (step === LAST && !demoTouched) setHood(mix(P.hood_load_deg, P.hood_open_deg, ease(clamp((T - .8) / .2))));
    }
    // 이름표
    for (const it of items) if (it.label) { const el = document.createElement('div'); el.className = 'tag'; el.textContent = it.label.text; labelsEl.appendChild(el); it.tag = el; it.anchor = V(it.label.at); }
    function updateLabels() {
      const w = stage.clientWidth, h = stage.clientHeight;
      for (const it of items) {
        if (!it.tag) continue;
        // 전체 보기는 큰 부품 이름만, 단계 화면은 이번 단계에서 움직이는 것만
        const on = showLabels && it.g.visible && (step === 0 ? T > .6 && it.kind !== 'fastener' : it.active);
        if (!on) { it.tag.style.display = 'none'; continue; }
        tmp.copy(it.anchor); it.g.localToWorld(tmp); tmp.project(camera);
        if (tmp.z > 1) { it.tag.style.display = 'none'; continue; }
        it.tag.style.display = ''; it.tag.className = 'tag' + (it.active ? ' new' : '');
        it.tag.style.left = ((tmp.x * .5 + .5) * w).toFixed(1) + 'px'; it.tag.style.top = ((-tmp.y * .5 + .5) * h).toFixed(1) + 'px';
      }
    }

    // ---------- 카메라 ----------
    const cam = { az: -58, el: 20, dist: 760, target: new THREE.Vector3() }; let camTween = null;
    // 배선 단계는 이번에 꽂는 선·부품이 모두 들어오게 잡는다 (관중 자리에서 내려다본다)
    for (const s of STEPS) if (s.wiring) {
      const bb = new THREE.Box3();
      for (const it of items) if (it.phases[0].step === WIRE0 + s.wiring) { if (it.wire) { bb.expandByPoint(it.wire.A.pos); bb.expandByPoint(it.wire.B.pos); } else if (it.arrowAt) bb.expandByPoint(V(it.arrowAt)); }
      const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
      s.cam = { az: -90, el: 54, dist: clamp(Math.max(size.x, size.y * 1.5) * 1.9 + 190, 270, 640), at: [c.x, c.y + 6, c.z], world: true };
    }
    function camGoal(c) { scene.updateMatrixWorld(true); return { az: c.az, el: c.el, dist: c.dist, target: c.world ? V(c.at) : robot.localToWorld(V(c.at)) }; }
    function flyTo(c, ms = 700) { const g = camGoal(c); let daz = ((g.az - cam.az + 540) % 360) - 180; camTween = { ms: 0, dur: ms, from: { az: cam.az, el: cam.el, dist: cam.dist, target: cam.target.clone() }, to: { az: cam.az + daz, el: g.el, dist: g.dist, target: g.target } }; }
    function placeCamera() {
      // 세로로 긴 화면(휴대폰)은 가로 시야가 좁으므로 그만큼 뒤로 물러난다
      const a = deg(cam.az), e = deg(cam.el), d = cam.dist * clamp(1.1 / camera.aspect, 1, 2.4);
      camera.position.set(cam.target.x + d * Math.cos(e) * Math.cos(a), cam.target.y + d * Math.cos(e) * Math.sin(a), cam.target.z + d * Math.sin(e));
      camera.lookAt(cam.target);
    }
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; camTween = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { const k = cam.dist / 900, a = deg(cam.az); cam.target.x += (Math.sin(a) * dx) * k; cam.target.y += (-Math.cos(a) * dx) * k; cam.target.z += dy * k; }
      else { cam.az -= dx * .35; cam.el = clamp(cam.el + dy * .3, -35, 89); }
    });
    canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); camTween = null; cam.dist = clamp(cam.dist * Math.exp(e.deltaY * .001), 70, 2200); }, { passive: false });

    // ---------- 패널 ----------
    const nav = $('stepNav'), content = $('content');
    STEPS.forEach((s, i) => { const b = document.createElement('button'); b.textContent = s.nav; b.setAttribute('role', 'tab'); if (s.wiring === 1 || i === 1) b.classList.add('group'); b.addEventListener('click', () => go(i)); nav.appendChild(b); });
    function renderPanel() {
      const s = STEPS[step];
      const rows = s.parts.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('');
      const wireRows = (s.wires || []).map((w) => `<tr class="wire${w.n === selWire ? ' sel' : ''}" tabindex="0" data-n="${w.n}"><td class="n">${w.n}</td><td><span class="sw" style="background:${W.colors[w.color].hex}"></span>${w.la} → ${w.lb}</td><td class="t">${w.type.split(' / ')[0]}</td></tr>`).join('');
      content.innerHTML = `<h2>${s.title}</h2><p class="lead">${s.lead}</p>` +
        (s.dir && s.dir.length ? `<h3>끼우는 방향 <span class="arrowkey">주황 화살표</span></h3><ul class="dir">${s.dir.map((t) => `<li>${t}</li>`).join('')}</ul>` : '') +
        `<h3>${s.demo ? '명령' : '부품'}</h3><table>${rows}</table>` +
        (wireRows ? `<h3>선 목록 · ${s.wires.length}개 (누르면 그 선만 보인다)</h3><table class="wires">${wireRows}</table>` : '') +
        (s.demo ? '<h3>동작 미리 보기</h3><div class="demo"><button data-demo="close">후드 CLOSE 0°</button><button data-demo="open">OPEN 60°</button><button data-demo="load">LOAD 120°</button></div><div class="demo"><button data-demo="spin" class="primary">SPIN · 큐브 전체 회전</button><button data-demo="flip" class="primary">FLIP · 뒤집기</button></div>' : '') +
        `<h3>순서</h3><ol>${s.body.map((t) => `<li>${t}</li>`).join('')}</ol>` + (s.check ? `<div class="ok"><b>확인</b> — ${s.check}</div>` : '') + (s.warn ? `<div class="warn">${s.warn}</div>` : '');
      content.scrollTop = 0;
      [...nav.children].forEach((b, i) => { if (i === step) { b.setAttribute('aria-current', 'step'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else b.removeAttribute('aria-current'); });
      $('stepCount').textContent = `${step + 1} / ${STEPS.length}`; $('btnPrev').disabled = step === 0; $('btnNext').disabled = step === STEPS.length - 1;
    }
    function selectWire(n) {
      selWire = selWire === n ? 0 : n; T = 1; playing = false;
      for (const tr of content.querySelectorAll('tr.wire')) tr.classList.toggle('sel', +tr.dataset.n === selWire);
      const it = byKey['wire' + selWire];
      if (it) flyTo({ az: cam.az, el: Math.max(cam.el, 34), dist: clamp(it.wire.length * 2.2 + 150, 190, 520), at: it.wire.mid.toArray(), world: true });
    }
    content.addEventListener('click', (e) => {
      const tr = e.target.closest && e.target.closest('tr.wire'); if (tr) { selectWire(+tr.dataset.n); return; }
      const k = e.target && e.target.dataset && e.target.dataset.demo; if (!k || demo) return; T = 1; playing = false; demoTouched = true;
      if (k === 'close') hoodTo(0); else if (k === 'open') hoodTo(P.hood_open_deg); else if (k === 'load') hoodTo(P.hood_load_deg); else if (k === 'spin') doSpin(); else if (k === 'flip') doFlip();
    });
    content.addEventListener('keydown', (e) => { const tr = e.target.closest && e.target.closest('tr.wire'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectWire(+tr.dataset.n); } });
    function go(i, opts = {}) {
      step = clamp(i, 0, STEPS.length - 1); T = opts.t || 0; playing = opts.t === undefined; selWire = 0; resetKin(); renderPanel(); flyTo(STEPS[step].cam, opts.instant ? 1 : 700);
      if (window.OverlapV5 && window.OverlapV5.clearMarks) window.OverlapV5.clearMarks();
      try { history.replaceState(null, '', location.search + '#' + step); } catch (_) { /* file:// */ }
    }
    $('btnPrev').addEventListener('click', () => go(step - 1)); $('btnNext').addEventListener('click', () => go(step + 1));
    $('btnReplay').addEventListener('click', () => { resetKin(); selWire = 0; renderPanel(); T = 0; playing = true; });
    $('scrub').addEventListener('input', (e) => { playing = false; resetKin(); T = e.target.value / 1000; });
    $('chkGhost').addEventListener('change', (e) => { ghostBase = e.target.checked; });
    $('chkLabels').addEventListener('change', (e) => { showLabels = e.target.checked; });
    $('chkArrows').addEventListener('change', (e) => { showArrows = e.target.checked; });
    $('btnView').addEventListener('click', () => flyTo(STEPS[step].cam));
    addEventListener('keydown', (e) => { if (/INPUT|BUTTON|A|TR/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') go(step + 1); if (e.key === 'ArrowLeft') go(step - 1); if (e.key === ' ') { e.preventDefault(); $('btnReplay').click(); } if (e.key === 'Escape' && selWire) selectWire(selWire); });

    // ---------- 루프 ----------
    function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    new ResizeObserver(resize).observe(stage); resize();
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(100, now - last); last = now;
      advance(dt); requestAnimationFrame(frame);
    }
    function advance(dt) {
      clock += dt;
      if (playing) { T = Math.min(1, T + dt / DUR); if (T >= 1) playing = false; $('scrub').value = Math.round(T * 1000); }
      if (camTween) { camTween.ms += dt; const t = ease(camTween.ms / camTween.dur), a = camTween.from, b = camTween.to;
        cam.az = mix(a.az, b.az, t); cam.el = mix(a.el, b.el, t); cam.dist = mix(a.dist, b.dist, t); cam.target.copy(a.target).lerp(b.target, t); if (camTween.ms >= camTween.dur) camTween = null; }
      if (demo) { demo.ms += dt; const d = demo; d.fn(clamp(d.ms / d.dur)); if (d.ms >= d.dur) { demo = null; if (d.done) d.done(); } }
      applyStep(); placeCamera(); renderer.render(scene, camera); updateLabels();
    }
    const start = parseInt((location.hash || '').slice(1), 10);
    go(Number.isFinite(start) ? start : 0, { instant: true });
    requestAnimationFrame(frame);
    // 검사·캡처용 (콘솔·overlap.js 에서 사용)
    // tick(ms): 창이 숨겨져 requestAnimationFrame 이 멈춘 상태에서도 시간을 진행해 그린다.
    // pose(step, t, kin): 그 단계의 진행 t(0~1) 자세를 바로 만든다. kin = {hood, lift, cup(도)} 로 구동부를 움직인다.
    window.BuildManual = { go, items, byKey, kin, STEPS, LAST, WIRE0, E, P, THREE, scene, robot, camera, cam, renderer, flyTo,
      get step() { return step; }, set t(v) { playing = false; T = v; },
      tick(ms = 1000) { for (let k = 0; k < ms; k += 50) advance(50); }, flip: doFlip, spin: doSpin, hoodTo,
      pose(i, t = 1, k = {}) {
        step = clamp(i, 0, STEPS.length - 1); T = t; playing = false; selWire = 0; resetKin(); demoTouched = true;
        if (k.hood !== undefined) setHood(k.hood); if (k.lift !== undefined) setLifter(k.lift);
        if (k.cup !== undefined) { kin.cup = deg(k.cup); cupKin.rotation.z = kin.cup; if (k.cubeTurns !== false) cubeOri.quaternion.setFromAxisAngle(Z, kin.cup); }
        applyStep(); scene.updateMatrixWorld(true);
      },
      view(c) { camTween = null; const g = camGoal(c); cam.az = g.az; cam.el = g.el; cam.dist = g.dist; cam.target.copy(g.target); placeCamera(); renderer.render(scene, camera); updateLabels(); },
      render() { placeCamera(); renderer.render(scene, camera); updateLabels(); } };
    if (window.OverlapV5) window.OverlapV5.attach(window.BuildManual);
  } catch (e) { showError(e); }
})();
