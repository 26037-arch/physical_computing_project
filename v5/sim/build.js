// V5 3D 제작 설명서 — 출력 STL(models.js)과 구매품 단순 외형으로 조립 순서를 단계별로 보여 준다.
// 좌표·치수는 models/robot_v5/parameters.json(= CubeModels.params), 조립 순서는 docs/BUILD_V5.md 3절.
// 단위 mm. 국소 홀더 좌표: 원점 = 컵 바닥판 윗면 중심, +y 관중 쪽, +z 바닥 법선 위 (docs/HARDWARE_V5.md 1절).
// 구매품·나사는 위치를 알려 주는 단순 도형이다 (실제 혼·나사 머리 모양과 다를 수 있다).
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
    function item(key, parent, phases, opt = {}) {
      const g = new THREE.Group(); parent.add(g);
      const it = { key, g, mats: [], style: '', phases: phases.map((p) => ({ step: p.step, from: V(p.from || [0, 0, 0]), to: V(p.to || [0, 0, 0]), delay: p.delay || 0 })),
        explode: V(opt.explode || [0, 0, 0]), overview: opt.overview !== false, hl: opt.hl !== false, label: opt.label || null, tag: null };
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
      cyl(it, d / 2, len, s.clone().addScaledVector(n, len / 2).toArray(), dir, mat, 14);
      cyl(it, headD / 2, headH, s.clone().addScaledVector(n, -headH / 2).toArray(), dir, mat, 18);
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
    const motor = item('motor', robot, [{ step: 1, from: [0, 0, -85] }], { explode: [0, 0, -70], label: { text: 'NEMA17 스텝모터', at: [0, 22, -45] } });
    { const m = material(motor, COLORS.motor, .6, .45), s = material(motor, COLORS.steel, .8, .35);
      box(motor, [P.motor_mm, P.motor_mm, P.motor_len_mm], [0, 0, P.motor_face_z_mm - P.motor_len_mm / 2], m);
      cyl(motor, 11, 2, [0, 0, P.motor_face_z_mm + 1], [0, 0, 1], s);
      cyl(motor, 2.5, 22, [0, 0, P.motor_face_z_mm + 11], [0, 0, 1], s); }
    const motorScrews = item('motorScrews', robot, [{ step: 1, from: [0, 0, 45], delay: .5 }], { explode: [0, 0, 28], label: { text: 'M3×8 ×4', at: [15.5, 15.5, -17] } });
    { const s = material(motorScrews, COLORS.steel, .8, .35), top = P.motor_face_z_mm + P.motor_plate_t_mm;
      for (const x of [-15.5, 15.5]) for (const y of [-15.5, 15.5]) screw(motorScrews, s, [x, y, top], [0, 0, -1], 8); }

    // 2) 허브 → 홀더, 3) 홀더 → 축
    const holder = item('holder', cupKin, [{ step: 2, from: [0, 0, 100], to: [0, 0, 60] }, { step: 3, from: [0, 0, 60] }], { explode: [0, 0, 100], label: { text: '컵(홀더)', at: [30, 30, 16] } });
    add(holder, stlGeometry('cube_holder'), material(holder, COLORS.cup));
    const hub = item('hub', cupKin, [{ step: 2, from: [0, 0, 22], to: [0, 0, 60] }, { step: 3, from: [0, 0, 60] }], { explode: [0, 0, 62], label: { text: '허브', at: [0, 15, -12] } });
    add(hub, stlGeometry('hub'), material(hub, COLORS.cup));
    const hubScrews = item('hubScrews', cupKin, [{ step: 2, from: [0, 0, 5], to: [0, 0, 60], delay: .45 }, { step: 3, from: [0, 0, 60] }], { explode: [0, 0, 40], label: { text: 'M3 ×2', at: [11, 0, -10] } });
    { const s = material(hubScrews, COLORS.steel, .8, .35), under = -P.plate_t_mm - P.hub_flange_t_mm;
      for (const x of [-11, 11]) screw(hubScrews, s, [x, 0, under], [0, 0, 1], 6); }
    const setScrew = item('setScrew', cupKin, [{ step: 3, from: [30, 0, 0], delay: .6 }], { explode: [45, 0, 62], label: { text: '멈춤나사 M3×6', at: [9, 0, -11] } });
    cyl(setScrew, 1.5, 6, [6, 0, -11], [1, 0, 0], material(setScrew, COLORS.steel, .8, .35), 14);

    // 4) 후드 서보
    const mg = item('mg996r', robot, [{ step: 4, from: [55, 0, 0] }], { explode: [70, 0, 0], label: { text: 'MG996R (후드 서보)', at: [62, -80, 52] } });
    { const m = material(mg, COLORS.servo, .1, .5), s = material(mg, COLORS.steel, .8, .35);
      box(mg, [38, 40.5, 20.5], [61.5, hinge[1] + 10, hinge[2]], m);
      box(mg, [2.5, 55, 20], [46.75, hinge[1] + 10, hinge[2]], m);
      cyl(mg, 3, 4, [41, hinge[1], hinge[2]], [1, 0, 0], s); }
    const mgScrews = item('mgScrews', robot, [{ step: 4, from: [40, 0, 0], delay: .5 }], { explode: [105, 0, 0], label: { text: 'M3 ×4', at: [50, hinge[1] + 34.75, hinge[2] + 5] } });
    { const s = material(mgScrews, COLORS.steel, .8, .35);
      for (const y of [hinge[1] + 10 - 24.75, hinge[1] + 10 + 24.75]) for (const z of [hinge[2] - 5, hinge[2] + 5]) screw(mgScrews, s, [48, y, z], [-1, 0, 0], 8); }

    // 5) 후드 (원형 혼 포함) + 왼쪽 피벗
    const hood = item('hood', hoodKin, [{ step: 5, from: [0, 25, 85] }], { explode: [0, 10, 120], label: { text: '후드 + 원형 혼', at: [0, 95, 20] } });
    { add(hood, stlGeometry('hood', hinge), material(hood, COLORS.hood));
      const s = material(hood, COLORS.steel, .8, .35), k = material(hood, COLORS.rubber, .1, .7);
      cyl(hood, 10.5, 2.5, [37.75, 0, 0], [1, 0, 0], k);
      for (const a of [0, 90, 180, 270]) cyl(hood, 1, 6, [36, 7 * Math.cos(deg(a)), 7 * Math.sin(deg(a))], [1, 0, 0], s, 10); }
    const pivot = item('pivot', robot, [{ step: 5, from: [-40, 0, 0], delay: .6 }], { explode: [-75, 0, 0], label: { text: '피벗 M3×25 + 너트', at: [-50, hinge[1], hinge[2] + 6] } });
    { const s = material(pivot, COLORS.steel, .8, .35);
      screw(pivot, s, [-45.5, hinge[1], hinge[2]], [1, 0, 0], 23);
      cyl(pivot, 3.1, 2.4, [-31.8, hinge[1], hinge[2]], [1, 0, 0], s, 6); }

    // 6) 리프터 + 오른쪽 슬롯 볼트 + 패드
    const lifter = item('lifter', liftKin, [{ step: 6, from: [0, 14, 60] }], { explode: [0, 95, 25], label: { text: '리프터', at: [0, slot0[0] + 6, slot0[1] + 8] } });
    { add(lifter, stlGeometry('lifter'), material(lifter, COLORS.lift));
      box(lifter, [P.hook_w_mm - 1, P.shelf_len_mm - 1.2, .6], [0, q0[0] - (P.shelf_len_mm + 1) / 2, q0[1] + .1], material(lifter, COLORS.rubber, .05, .9)); }
    const boltR = item('boltR', liftKin, [{ step: 6, from: [35, 0, 0], delay: .55 }], { explode: [70, 95, 25], label: { text: '슬롯 볼트 M3×20', at: [50, slot0[0], slot0[1]] } });
    screw(boltR, material(boltR, COLORS.steel, .8, .35), [45.5, slot0[0], slot0[1]], [-1, 0, 0], 13);

    // 7) 리프터 서보 + 크랭크 + 링크 + 왼쪽 슬롯 볼트
    const sy = crankAxis[1], sz = crankAxis[2], mount = P.sg90_mount_outer_x_mm;
    const sg = item('sg90', robot, [{ step: 7, from: [-45, 0, 0] }], { explode: [-70, 0, 0], label: { text: 'SG90 (리프터 서보)', at: [mount - 14, sy, sz + 10] } });
    { const m = material(sg, COLORS.servoS, .1, .5), s = material(sg, COLORS.steel, .8, .35);
      box(sg, [22.7, 22.5, 12.2], [mount - 11.35, sy, sz], m);
      box(sg, [2, 32.5, 12.2], [mount - 4, sy, sz], m);
      cyl(sg, 2.4, 6, [mount + 3, sy, sz], [1, 0, 0], s, 14); }
    const sgScrews = item('sgScrews', robot, [{ step: 7, from: [-30, 0, 0], delay: .3 }], { explode: [-105, 0, 0], label: { text: 'M2 ×2', at: [mount - 8, sy + 14, sz] } });
    { const s = material(sgScrews, COLORS.steel, .8, .35); for (const y of [sy - 14, sy + 14]) screw(sgScrews, s, [mount - 5, y, sz], [1, 0, 0], 8, 2, 3.8, 1.4); }
    crankKin.position.set(crankX, sy, sz);
    const crank = item('crank', crankKin, [{ step: 7, from: [0, -32, 30], delay: .45 }], { explode: [-20, -55, 40], label: { text: '크랭크', at: [0, 8, -14] } });
    { add(crank, stlGeometry('crank', [crankX, sy, sz]), material(crank, COLORS.lift));
      const pinY = crankR * liftDir[0] * -1, pinZ = crankR * liftDir[1] * -1;   // 0° = 크랭크가 슬롯 아래쪽을 향한다
      screw(crank, material(crank, COLORS.steel, .8, .35), [-2, pinY, pinZ], [1, 0, 0], 9); }
    linkKin.position.set(linkX, slot0[0], slot0[1]);
    const link = item('link', linkKin, [{ step: 7, from: [0, -30, 34], delay: .6 }], { explode: [0, -85, 5], label: { text: '링크', at: [0, -14, 32] } });
    add(link, stlGeometry('link', [linkX, slot0[0], slot0[1]]), material(link, COLORS.steel, .35, .5));
    const boltL = item('boltL', liftKin, [{ step: 7, from: [-35, 0, 0], delay: .8 }], { explode: [-70, 95, 25], label: { text: '슬롯 볼트 M3×20', at: [-52, slot0[0], slot0[1]] } });
    screw(boltL, material(boltL, COLORS.steel, .8, .35), [-50, slot0[0], slot0[1]], [1, 0, 0], 17.5);

    // 8) 고무발 + 전자부 (전자부는 월드 좌표, 책상 위)
    const feet = item('feet', robot, [{ step: 8, from: [0, -10, -28] }], { explode: [0, -10, -30], label: { text: '고무발 ×4', at: [20, 18, tableZ(18) + 2] } });
    { const m = material(feet, COLORS.rubber, .05, .9), n = [0, Math.sin(TILT), Math.cos(TILT)];
      for (const [x, y] of [[-20, 18], [20, 18], [-43, -87], [43, -87]]) cyl(feet, 5, 1, [x, y + n[1] * .5, tableZ(y) + n[2] * .5], n, m); }
    const TZ = P.table_zw_mm;
    const elec = item('electronics', scene, [{ step: 8, from: [90, 0, 0], delay: .35 }], { overview: false, label: { text: 'UNO · 브레드보드 · LCD (배선 안내 참고)', at: [150, 10, TZ + 30] } });
    { const bb = material(elec, COLORS.bb, 0, .8), pcb = material(elec, COLORS.pcb, .1, .6), k = material(elec, COLORS.rubber, .1, .6), lcd = material(elec, COLORS.lcd, .1, .5), red = material(elec, 0xc23b3b, .1, .6), s = material(elec, COLORS.steel, .7, .4);
      box(elec, [55, 165, 9], [120, 25, TZ + 4.5], bb);                    // 풀사이즈 브레드보드
      box(elec, [1.2, 150, .4], [98, 25, TZ + 9.2], red); box(elec, [1.2, 150, .4], [142, 25, TZ + 9.2], red);
      box(elec, [15.5, 20.5, 2], [120, 78, TZ + 14], red); box(elec, [9, 9, 5], [120, 78, TZ + 17.5], s);   // A4988 + 방열판
      box(elec, [53.4, 68.6, 2], [190, 40, TZ + 5], pcb);                  // UNO
      box(elec, [9, 12, 7], [176, 70, TZ + 9.5], s); box(elec, [9, 14, 11], [205, 68, TZ + 11.5], k);
      box(elec, [2.6, 48, 8.5], [165.5, 34, TZ + 10], k); box(elec, [2.6, 44, 8.5], [214.5, 30, TZ + 10], k);
      const lcdG = box(elec, [80, 4, 36], [150, -78, TZ + 22], pcb); lcdG.rotation.x = deg(-15);
      const scr = box(elec, [64, 1.5, 16], [150, -80.6, TZ + 22.6], lcd); scr.rotation.x = deg(-15); }
    // 케이블(모터·서보 → 브레드보드): 국소 시작점을 월드로 바꿔 책상 위로 늘어뜨린다
    const cables = item('cables', scene, [{ step: 8, delay: .7 }], { overview: false, hl: true });
    scene.updateMatrixWorld(true);
    function cable(fromLocal, toWorld, color, r = 1.6) {
      const a = robot.localToWorld(V(fromLocal)), b = V(toWorld), mid = a.clone().lerp(b, .5); mid.z = TZ + 4;
      const a2 = a.clone().lerp(mid, .45); a2.z = Math.max(TZ + 6, a.z - 30);
      const curve = new THREE.CatmullRomCurve3([a, a2, mid, b]);
      add(cables, new THREE.TubeGeometry(curve, 40, r, 8), material(cables, color, .1, .6));
    }
    cable([0, -24, -60], [105, 78, TZ + 10], 0x4a5560, 2.2);
    cable([80, -70, 40], [100, 0, TZ + 10], 0xb5651d);
    cable([mount - 22, sy, sz], [100, -20, TZ + 10], 0xb5651d);

    // 9) 큐브 (흰색 아래 · 초록 앞)
    const cube = item('cube', cubeOri, [{ step: 9, from: [0, 0, 120] }], { overview: false, hl: false, label: { text: '3×3 큐브 — 흰색 아래 · 초록 앞', at: [0, 0, 40] } });
    { const body = material(cube, 0x1b1f23, .05, .5), pitch = P.layer_mm, cg = new THREE.BoxGeometry(pitch - .5, pitch - .5, pitch - .5), sg2 = new THREE.PlaneGeometry(pitch - 3.4, pitch - 3.4);
      const faces = [[[0, 0, 1], 0xffd742], [[0, 0, -1], 0xf6f4e9], [[0, 1, 0], 0x35b76f], [[0, -1, 0], 0x3483d7], [[1, 0, 0], 0xde413f], [[-1, 0, 0], 0xff893e]];
      const fm = faces.map((f) => material(cube, f[1], 0, .45));
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue; add(cube, cg, body, [x * pitch, y * pitch, z * pitch]);
        faces.forEach((f, i) => { const n = f[0]; if (n[0] * x + n[1] * y + n[2] * z !== 1) return;
          const s = add(cube, sg2, fm[i], [x * pitch + n[0] * (pitch / 2 - .2), y * pitch + n[1] * (pitch / 2 - .2), z * pitch + n[2] * (pitch / 2 - .2)]);
          s.quaternion.setFromUnitVectors(Z, V(n)); });
      } }

    $('modelInfo').textContent = 'Rev ' + (P.revision || '?') + ' · STL 7종 · 단위 mm';

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
          '윗판 위에서 M3×8 ×4 (간격 31 mm)를 모터 앞면 탭에 조인다.', '케이블은 뒤 데크(타워 쪽)로 뺀다.'],
        check: '축이 구멍 가운데에 있고, 손으로 돌렸을 때 윗판에 닿지 않는다.' },
      { nav: '② 허브', title: '② 허브 → 컵 밑면', lead: '허브 플랜지(Ø30)를 컵 바닥판 밑면 가운데에 붙인다. 그림은 컵을 들어 올린 상태다.', ghost: ['base', 'motor', 'motorScrews'],
        cam: { az: -55, el: -14, dist: 260, at: [0, 0, 50] },
        parts: [['부품', '규격', '수량'], ['허브', '출력', '1'], ['나사', 'M3 (길이는 아래 주의)', '2']],
        body: ['허브의 D 구멍이 아래를 향하게 하고 플랜지 구멍 2개(중심에서 ±11 mm)를 판 구멍에 맞춘다. 노치 방향과는 무관하다.',
          '플랜지 아래에서 나사 2개를 조인다.'],
        check: '판 윗면(큐브가 앉는 면)을 손끝으로 쓸었을 때 나사 끝이 걸리지 않는다.',
        warn: '<b>확인 필요</b> — 판과 플랜지 구멍이 둘 다 Ø3.2 관통이라 나사가 플라스틱에 물리지 않는다. 플랜지 3 + 판 4 = 7 mm 이므로 M3×8 은 큐브 자리로 1 mm 튀어나온다. 판 구멍에 히트셋 인서트를 넣고 M3×6 을 쓰거나, CAD 에서 구멍을 직접 체결용(Ø2.8)으로 고쳐 다시 출력해야 한다.' },
      { nav: '③ 컵', title: '③ 컵 → 모터 축', lead: '허브를 축 D컷에 맞춰 끝까지 끼우고 멈춤나사로 고정한다.', ghost: ['base'],
        cam: { az: -50, el: 14, dist: 330, at: [0, 0, -5] },
        parts: [['부품', '규격', '수량'], ['멈춤나사', 'M3×6 무두', '1']],
        body: ['허브 D 구멍의 평면을 축 D컷 평면에 맞추고 끝까지 누른다. 판 아랫면이 모터 앞면 위 21 mm 에 온다.',
          '허브 옆 구멍으로 M3×6 멈춤나사를 D 평면에 조인다 (윗판과 플랜지 사이 13 mm 틈으로 육각 렌치를 넣는다).',
          '<b>노치 하나가 정확히 뒤(타워 쪽)</b>를 향하게 손으로 돌려 둔다. 전원을 켠 자리가 0° 가 된다.'],
        check: '컵을 손으로 돌리면 축과 함께 돌고, 위아래로 흔들리지 않는다.' },
      { nav: '④ 후드 서보', title: '④ MG996R → 낮은 타워', lead: '뒤에서 봤을 때 오른쪽, 낮은 타워(높이 65)의 바깥 포켓에 후드 서보를 넣는다.',
        cam: { az: 138, el: 18, dist: 400, at: [52, -82, 38] },
        parts: [['부품', '규격', '수량'], ['MG996R', '180° 서보', '1'], ['나사', 'M3 (길이는 아래 주의)', '4']],
        body: ['서보 출력축이 타워의 큰 구멍(Ø24 카운터보어) 가운데, 곧 후드 힌지에 오도록 몸체를 포켓(깊이 3 mm)에 넣는다.',
          '귀 4곳(49.5 × 10 mm 간격)을 바깥에서 나사로 고정한다.', '혼은 아직 끼우지 않는다. 전원을 넣어 75° 로 간 뒤 ⑤에서 맞춘다.'],
        check: '출력축이 힌지 구멍과 같은 축 위에 있다.',
        warn: '<b>확인 필요</b> — 글 설명서의 "M3×16 + 너트"는 그대로 쓸 수 없다. 타워 안쪽면과 후드 팔 사이가 0.5 mm 뿐이고, 앞쪽 구멍 2개는 후드 팔이 지나가는 자리라 안쪽으로 나온 나사 끝·너트가 팔에 걸린다. 나사 끝이 타워 안쪽면(두께 6 mm)을 넘지 않아야 한다. 구멍이 Ø3.2 라 나사가 물리지 않으므로, 실제 서보 귀가 타워 바깥면에 닿는지 재 보고 길이를 정한 뒤 구멍을 Ø2.8(셀프탭)로 고쳐 다시 뽑거나 히트셋 인서트를 쓴다. CAD 의 서보는 귀가 없는 단순 상자라 이 간섭을 검사하지 못했다.' },
      { nav: '⑤ 후드', title: '⑤ 후드 걸기', lead: '원형 혼을 후드에 먼저 붙이고, 타워 사이로 넣어 서보 축과 왼쪽 피벗에 건다.',
        cam: { az: 32, el: 24, dist: 520, at: [0, -55, 50] },
        parts: [['부품', '규격', '수량'], ['후드', '출력 (ㄷ자: 앞벽 + 옆벽 2 + 지붕)', '1'], ['원형 혼 Ø21 + M2×8', '서보 동봉', '1 + 4'], ['피벗 볼트 + 너트', 'M3×25', '1']],
        body: ['혼을 후드 오른쪽 팔의 포켓(Ø21.5 × 2.5)에 M2 ×4 로 붙인다.',
          '서보에 전원을 넣어 <b>75°</b>(= 후드 OPEN 60°) 로 보낸 상태에서, 후드가 그림처럼 60° 열린 자세가 되는 스플라인 위치에 혼을 끼운다.',
          '반대쪽(높은 타워)은 M3×25 를 타워 밖에서 후드 팔 구멍까지 넣고 너트를 건다. 꽉 조이지 않는다.'],
        check: '후드를 손으로 0°~120° 움직였을 때 타워·컵에 닿지 않고 걸림 없이 돈다.' },
      { nav: '⑥ 리프터', title: '⑥ 리프터 → 슬롯', lead: '리프터 크로스바(폭 77)를 두 타워 사이에 넣어 비스듬한 슬롯에 맞춘다.', ghost: ['hood'],
        cam: { az: -112, el: 26, dist: 400, at: [10, -40, 5] },
        parts: [['부품', '규격', '수량'], ['리프터', '출력', '1'], ['슬롯 볼트', 'M3×20', '1 (낮은 타워 쪽)'], ['실리콘 패드', '0.5 mm, 16×3', '1']],
        body: ['갈고리(선반)가 컵 뒤쪽 노치 아래로 들어가게 리프터를 넣고, 크로스바 끝 구멍을 슬롯 맨 아래에 맞춘다.',
          '낮은 타워 쪽 슬롯에 볼트를 밖에서 끼운다. 볼트 몸통만 슬롯(폭 3.4)을 지난다. 높은 타워 쪽 볼트는 ⑦에서 링크와 함께 끼운다.',
          '선반 윗면 홈에 실리콘 패드를 붙인다 (마찰 0.62 이상이 필요하다).'],
        check: '리프터를 손으로 슬롯 끝까지(66 mm) 올렸다 놓으면 걸리지 않고 내려온다. 최하 위치에서 선반이 컵 판에 닿지 않는다(틈 1 mm).',
        warn: '<b>확인 필요</b> — 크로스바는 4×4 mm 이고 끝 구멍이 Ø3.2 (벽 0.4 mm, 깊이 6 mm)라 M3 가 물리지 않는다. 볼트를 순간접착제로 고정하거나 CAD 에서 바 단면·구멍을 고치는 결정이 필요하다.' },
      { nav: '⑦ 리프터 서보', title: '⑦ SG90 · 크랭크 · 링크', lead: '높은 타워(높이 95) 바깥 위쪽 포켓에 리프터 서보를 달고 크랭크–링크로 리프터와 잇는다.', ghost: ['hood'],
        cam: { az: 42, el: 16, dist: 380, at: [-58, -70, 50] },
        parts: [['부품', '규격', '수량'], ['SG90 + M2×8', '키트', '1 + 2'], ['크랭크 (팔 33)', '출력', '1'], ['링크 (핀 간 70)', '출력', '1'], ['슬롯 볼트', 'M3×20', '1'], ['링크 핀 나사', 'M3×12', '1']],
        body: ['SG90 을 포켓(22.5 × 12.2)에 넣고 M2 ×2 로 고정한다. 출력축이 타워 쪽을 본다.',
          '서보를 <b>0°</b> 로 보낸 뒤, 크랭크가 슬롯 아래쪽을 가리키는(리프터 최하 = 사점) 방향으로 축에 끼운다.',
          '링크 한쪽을 크랭크 끝에 M3×12 로, 다른 쪽을 높은 타워 쪽 슬롯 볼트(M3×20)에 건다. 핀은 크랭크를 위(180°)로 돌려 타워 위로 나온 상태에서 끼우면 손이 들어간다.'],
        check: '서보 0° 에서 리프터가 최하, 180° 에서 최상(66 mm). 크랭크·링크가 타워와 서보 판 사이에서 걸리지 않는다.',
        warn: '<b>확인 필요</b> — 링크와 타워 바깥면 사이는 0.5 mm 다. 링크 핀은 타워 쪽으로 머리·너트가 나오면 안 되므로 머리를 서보 판 쪽(틈 6.5 mm)에 두고 끝이 링크 면에서 멈춰야 한다.' },
      { nav: '⑧ 발 · 전자부', title: '⑧ 고무발과 전자부 배치', lead: '고무발 4개를 붙이고, UNO·브레드보드·LCD 를 베이스 옆에 놓아 케이블을 잇는다.',
        cam: { az: -58, el: 32, dist: 860, at: [-70, -20, -55] },
        parts: [['부품', '규격', '수량'], ['고무발', 'Ø10 접착식', '4'], ['UNO R4 WiFi + 풀사이즈 브레드보드 + LCD1602', '키트', '1식'], ['A4988 + 100 µF', '구매', '1']],
        body: ['베이스 바닥 홈(Ø10 × 1) 4곳에 고무발을 붙인다. 책상에 놓으면 컵 바닥이 뒤로 20° 기운다.',
          '모터 4선은 A4988 로, 서보 2개의 신호선은 D8(후드)·D9(리프터)로 간다. 구멍 하나하나의 위치는 <a href="../../docs/WIRING_V5_R4.html">배선 안내</a> 4절 그림을 따른다.',
          '전원은 세 갈래다: 보드 USB, 모터 12 V(A4988 VMOT), 서보 5 V 어댑터. 모든 (−) 는 UNO GND 와 묶는다.'],
        check: '12 V 가 꽂힌 레일에 5 V 부품이 없다. 위 + 레일과 아래 + 레일 사이 저항이 무한대다.' },
      { nav: '⑨ 동작 확인', title: '⑨ 큐브 장착과 동작 확인', lead: '후드를 LOAD(120°)로 젖히고 큐브를 위에서 넣는다. 아래 버튼으로 세 가지 기본 동작을 미리 본다.',
        cam: { az: -62, el: 20, dist: 560, at: [0, -25, 25] }, demo: true,
        parts: [['조정 명령 (시리얼 115200)', '맞추는 것', ''], ['<code>L</code> 두 번', '후드 LOAD → 큐브 넣기 → OPEN', ''], ['<code>H 15 75 135</code>', '후드 CLOSE/OPEN/LOAD 서보 각', ''], ['<code>K 180</code>', '리프터 최상 각', ''], ['<code>O</code>', '층 회전 오버슈트', '']],
        body: ['큐브는 <b>풀린 상태로, 흰색 아래 · 초록 앞</b>(관중 쪽)으로 넣는다. 기둥 모따기가 자리를 잡아 준다.',
          '후드 CLOSE: 벽이 위 두 층만 감싼다 (벽 아래끝 21 mm, 아래 층 19 mm). 이 상태에서 컵이 돌면 아래 층만 돈다.',
          '후드 OPEN + 컵 회전 = 큐브 전체 회전(SPIN). 후드 90° + 리프터 = 뒤집기(FLIP).',
          '풀이까지 이어서 보려면 <a href="index.html">동작 시뮬레이터</a>를 연다.'],
        check: '<code>M R U R\' U\'</code> 를 6번 반복해 원래 상태로 돌아오면 층 정렬과 뒤집기를 믿을 수 있다.' }
    ];

    // ---------- 상태·표시 ----------
    let step = 0, T = 0, playing = true, ghostBase = false, showLabels = true;
    const DUR = 2600, labelsEl = $('labels');
    function style(it, s) {
      if (it.style === s) return; it.style = s;
      for (const m of it.mats) {
        m.emissive.setHex(s === 'hl' ? 0x0f6b55 : 0); m.emissiveIntensity = s === 'hl' ? .55 : 0;
        const g = s === 'ghost'; m.transparent = g; m.opacity = g ? .22 : 1; m.depthWrite = !g; m.needsUpdate = true;
      }
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
        style(it, ghosts.has(it.key) ? 'ghost' : active && it.hl ? 'hl' : 'normal');
      }
      if (step === 9 && !demoTouched) setHood(mix(P.hood_load_deg, P.hood_open_deg, ease(clamp((T - .8) / .2))));
    }
    // 이름표
    for (const it of items) if (it.label) { const el = document.createElement('div'); el.className = 'tag'; el.textContent = it.label.text; labelsEl.appendChild(el); it.tag = el; it.anchor = V(it.label.at); }
    function updateLabels() {
      const w = stage.clientWidth, h = stage.clientHeight;
      for (const it of items) {
        if (!it.tag) continue;
        // 전체 보기는 큰 부품 이름만, 단계 화면은 이번 단계에서 움직이는 것만
        const on = showLabels && it.g.visible && (step === 0 ? T > .6 && !/Screws|bolt|setScrew|pivot|feet/.test(it.key) : it.active);
        if (!on) { it.tag.style.display = 'none'; continue; }
        tmp.copy(it.anchor); it.g.localToWorld(tmp); tmp.project(camera);
        if (tmp.z > 1) { it.tag.style.display = 'none'; continue; }
        it.tag.style.display = ''; it.tag.className = 'tag' + (it.active ? ' new' : '');
        it.tag.style.left = ((tmp.x * .5 + .5) * w).toFixed(1) + 'px'; it.tag.style.top = ((-tmp.y * .5 + .5) * h).toFixed(1) + 'px';
      }
    }

    // ---------- 카메라 ----------
    const cam = { az: -58, el: 20, dist: 760, target: new THREE.Vector3() }; let camTween = null;
    function camGoal(c) { scene.updateMatrixWorld(true); return { az: c.az, el: c.el, dist: c.dist, target: robot.localToWorld(V(c.at)) }; }
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
      else { cam.az -= dx * .35; cam.el = clamp(cam.el + dy * .3, -35, 88); }
    });
    canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); camTween = null; cam.dist = clamp(cam.dist * Math.exp(e.deltaY * .001), 120, 2200); }, { passive: false });

    // ---------- 패널 ----------
    const nav = $('stepNav'), content = $('content');
    STEPS.forEach((s, i) => { const b = document.createElement('button'); b.textContent = s.nav; b.setAttribute('role', 'tab'); b.addEventListener('click', () => go(i)); nav.appendChild(b); });
    function renderPanel() {
      const s = STEPS[step];
      const rows = s.parts.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('');
      content.innerHTML = `<h2>${s.title}</h2><p class="lead">${s.lead}</p><h3>${step === 9 ? '명령' : '부품'}</h3><table>${rows}</table>` +
        (s.demo ? '<h3>동작 미리 보기</h3><div class="demo"><button data-demo="close">후드 CLOSE 0°</button><button data-demo="open">OPEN 60°</button><button data-demo="load">LOAD 120°</button></div><div class="demo"><button data-demo="spin" class="primary">SPIN · 큐브 전체 회전</button><button data-demo="flip" class="primary">FLIP · 뒤집기</button></div>' : '') +
        `<h3>순서</h3><ol>${s.body.map((t) => `<li>${t}</li>`).join('')}</ol>` + (s.check ? `<div class="ok"><b>확인</b> — ${s.check}</div>` : '') + (s.warn ? `<div class="warn">${s.warn}</div>` : '');
      content.scrollTop = 0;
      [...nav.children].forEach((b, i) => { if (i === step) { b.setAttribute('aria-current', 'step'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else b.removeAttribute('aria-current'); });
      $('stepCount').textContent = `${step + 1} / ${STEPS.length}`; $('btnPrev').disabled = step === 0; $('btnNext').disabled = step === STEPS.length - 1;
    }
    content.addEventListener('click', (e) => {
      const k = e.target && e.target.dataset && e.target.dataset.demo; if (!k || demo) return; T = 1; playing = false; demoTouched = true;
      if (k === 'close') hoodTo(0); else if (k === 'open') hoodTo(P.hood_open_deg); else if (k === 'load') hoodTo(P.hood_load_deg); else if (k === 'spin') doSpin(); else if (k === 'flip') doFlip();
    });
    function go(i, opts = {}) {
      step = clamp(i, 0, STEPS.length - 1); T = opts.t || 0; playing = opts.t === undefined; resetKin(); renderPanel(); flyTo(STEPS[step].cam, opts.instant ? 1 : 700);
      try { history.replaceState(null, '', '#' + step); } catch (_) { /* file:// */ }
    }
    $('btnPrev').addEventListener('click', () => go(step - 1)); $('btnNext').addEventListener('click', () => go(step + 1));
    $('btnReplay').addEventListener('click', () => { resetKin(); T = 0; playing = true; });
    $('scrub').addEventListener('input', (e) => { playing = false; resetKin(); T = e.target.value / 1000; });
    $('chkGhost').addEventListener('change', (e) => { ghostBase = e.target.checked; });
    $('chkLabels').addEventListener('change', (e) => { showLabels = e.target.checked; });
    $('btnView').addEventListener('click', () => flyTo(STEPS[step].cam));
    addEventListener('keydown', (e) => { if (/INPUT|BUTTON|A/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') go(step + 1); if (e.key === 'ArrowLeft') go(step - 1); if (e.key === ' ') { e.preventDefault(); $('btnReplay').click(); } });

    // ---------- 루프 ----------
    function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    new ResizeObserver(resize).observe(stage); resize();
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(100, now - last); last = now;
      advance(dt); requestAnimationFrame(frame);
    }
    function advance(dt) {
      if (playing) { T = Math.min(1, T + dt / DUR); if (T >= 1) playing = false; $('scrub').value = Math.round(T * 1000); }
      if (camTween) { camTween.ms += dt; const t = ease(camTween.ms / camTween.dur), a = camTween.from, b = camTween.to;
        cam.az = mix(a.az, b.az, t); cam.el = mix(a.el, b.el, t); cam.dist = mix(a.dist, b.dist, t); cam.target.copy(a.target).lerp(b.target, t); if (camTween.ms >= camTween.dur) camTween = null; }
      if (demo) { demo.ms += dt; const d = demo; d.fn(clamp(d.ms / d.dur)); if (d.ms >= d.dur) { demo = null; if (d.done) d.done(); } }
      applyStep(); placeCamera(); renderer.render(scene, camera); updateLabels();
    }
    const start = parseInt((location.hash || '').slice(1), 10);
    go(Number.isFinite(start) ? start : 0, { instant: true });
    requestAnimationFrame(frame);
    // 검사·캡처용 (콘솔에서 사용)
    // tick(ms): 창이 숨겨져 requestAnimationFrame 이 멈춘 상태에서도 시간을 진행해 그린다.
    window.BuildManual = { go, items, kin, STEPS, get step() { return step; }, set t(v) { playing = false; T = v; }, renderer,
      tick(ms = 1000) { for (let k = 0; k < ms; k += 50) advance(50); }, flip: doFlip, spin: doSpin, hoodTo };
  } catch (e) { showError(e); }
})();
