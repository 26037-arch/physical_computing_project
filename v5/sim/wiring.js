// V5 최종 모습 3D — 조립된 로봇(models.js) 옆에 UNO R4 WiFi·830홀 브레드보드·부품·점퍼선 35개를 실제 치수로 놓는다.
// 배선은 wiring_data.js(= tools/make_wiring_v5.js 의 WIRING 표에서 생성)만 읽는다. 여기서 선을 더하거나 고치지 않는다.
// 단위 mm. 월드: 관중은 −y, 책상 면 z = table_zw_mm. 로봇 좌표·자세는 build.js 와 같다 (국소를 z 로 180° 돌린 뒤 x 로 −20°).
// 부품 외형·케이블이 지나가는 길·전자부를 놓은 자리는 예시다. 정확한 것은 "어느 선이 어느 구멍/핀에 꽂히는가" 이다.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function showError(e) { const el = $('error'); el.hidden = false; el.textContent = (e && e.message) || String(e); }
  window.addEventListener('error', (e) => { if (!/ResizeObserver/.test(String(e.message))) showError(e.error || e.message); });
  try {
    if (!window.THREE) throw new Error('Three.js 를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.');
    const models = window.CubeModels || { params: {}, parts: {} }, W = window.WiringV5;
    const P = models.params;
    if (!P || !P.print_offsets) throw new Error('models.js 가 없습니다. node tools/embed_models_v5.js 를 먼저 실행하세요.');
    if (!W || !W.wires) throw new Error('wiring_data.js 가 없습니다. node tools/make_wiring_v5.js 를 먼저 실행하세요.');

    const deg = (n) => n * Math.PI / 180, clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
    const mix = (a, b, t) => a + (b - a) * t, ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const UP = V([0, 0, 1]);
    const H = P.cube_mm / 2, TILT = deg(P.tilt_deg), D = P.table_zw_mm;
    const hinge = [0, P.hinge_y_mm, P.hinge_z_mm];
    const tableZ = (y) => (D - y * Math.sin(TILT)) / Math.cos(TILT);
    const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
    const css = (hex) => new THREE.Color(hex).convertSRGBToLinear();

    // ---------- 장면 ----------
    const canvas = $('view'), stage = $('stage');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 5, 8000); camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7780, 1.0));
    for (const [p, power] of [[[160, -260, 380], 1.0], [[-260, 80, 180], .55], [[160, 300, 260], .5]]) {
      const l = new THREE.DirectionalLight(0xffffff, power); l.position.set(p[0], p[1], p[2]); scene.add(l);
    }
    const tilt = new THREE.Group(); tilt.rotation.x = -TILT; scene.add(tilt);
    const robot = new THREE.Group(); robot.rotation.z = Math.PI; tilt.add(robot);
    const deskMat = new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0 });
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(1100, 800), deskMat); desk.position.set(110, 10, D - .4); scene.add(desk);
    function applyTheme() { scene.background = new THREE.Color(dark() ? 0x142028 : 0xe6ecf0); deskMat.color.copy(css(dark() ? 0x2b363c : 0x93a3ab)); }
    applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    // ---------- 만들기 도구 ----------
    const COLORS = { cup: 0x54bfa2, hood: 0x6c98c4, lift: 0xe6ac55, base: 0x52676f, steel: 0xc3ccd2, motor: 0x8f9aa1, servo: 0x2a4563, servoS: 0x3f73a8, rubber: 0x23292e, pcb: 0x0e7c86, bb: 0xf3f1e7, red: 0xc23b3b, gold: 0xc9a23a };
    const robotMats = [];
    function mat(color, metalness = .05, roughness = .6, list) {
      const m = new THREE.MeshStandardMaterial({ color: css(color), metalness, roughness }); if (list) list.push(m); return m;
    }
    function mesh(parent, geometry, material, pos) { const o = new THREE.Mesh(geometry, material); if (pos) o.position.set(pos[0], pos[1], pos[2]); parent.add(o); return o; }
    const box = (parent, size, center, material) => mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, center);
    function cyl(parent, r, len, center, dir, material, seg = 24) {
      const o = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), material, center);
      o.quaternion.setFromUnitVectors(V([0, 1, 0]), V(dir).normalize()); return o;
    }
    function tube(parent, points, r, material, seg) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const o = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || Math.max(16, Math.round(curve.getLength() / 4)), r, 8), material); parent.add(o); return o;
    }
    function texture(w, h, pxPerMm, draw) {
      const c = document.createElement('canvas'); c.width = Math.round(w * pxPerMm); c.height = Math.round(h * pxPerMm);
      const g = c.getContext('2d'); g.scale(pxPerMm, pxPerMm); draw(g);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
    }
    // 윗면(+z)에만 그림을 입힌 상자. 그림의 위쪽이 +y(관중 반대쪽)다.
    function topBox(parent, size, center, sideMat, tex) {
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: .7, metalness: 0 });
      return mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), [sideMat, sideMat, sideMat, sideMat, top, sideMat], center);
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
    const labels = [];                       // {text, at: 월드 Vector3, el, group}
    function label(text, at, group) { labels.push({ text, at: at.isVector3 ? at : V(at), group: group || null }); }

    // ---------- 로봇 (완성 자세: 후드 OPEN 60°, 리프터 최하, 큐브 장착) ----------
    const rm = (c, me, ro) => mat(c, me, ro, robotMats);
    const steel = rm(COLORS.steel, .8, .35);
    mesh(robot, stlGeometry('base'), rm(COLORS.base));
    { const m = rm(COLORS.motor, .6, .45);
      box(robot, [P.motor_mm, P.motor_mm, P.motor_len_mm], [0, 0, P.motor_face_z_mm - P.motor_len_mm / 2], m);
      cyl(robot, 11, 2, [0, 0, P.motor_face_z_mm + 1], [0, 0, 1], steel); cyl(robot, 2.5, 22, [0, 0, P.motor_face_z_mm + 11], [0, 0, 1], steel);
      const top = P.motor_face_z_mm + P.motor_plate_t_mm;
      for (const x of [-15.5, 15.5]) for (const y of [-15.5, 15.5]) cyl(robot, 2.75, 2, [x, y, top + 1], [0, 0, 1], steel, 14); }
    { const c = rm(COLORS.cup); mesh(robot, stlGeometry('cube_holder'), c); mesh(robot, stlGeometry('hub'), c); }
    { const m = rm(COLORS.servo, .1, .5);                                   // MG996R (후드)
      box(robot, [38, 40.5, 20.5], [61.5, hinge[1] + 10, hinge[2]], m); box(robot, [2.5, 55, 20], [46.75, hinge[1] + 10, hinge[2]], m);
      cyl(robot, 3, 4, [41, hinge[1], hinge[2]], [1, 0, 0], steel); }
    { const hoodKin = new THREE.Group(); hoodKin.position.set(hinge[0], hinge[1], hinge[2]); hoodKin.rotation.x = deg(P.hood_open_deg); robot.add(hoodKin);
      mesh(hoodKin, stlGeometry('hood', hinge), rm(COLORS.hood)); cyl(hoodKin, 10.5, 2.5, [37.75, 0, 0], [1, 0, 0], rm(COLORS.rubber, .1, .7));
      cyl(robot, 1.5, 23, [-34, hinge[1], hinge[2]], [1, 0, 0], steel, 12); cyl(robot, 2.75, 2, [-46.5, hinge[1], hinge[2]], [1, 0, 0], steel, 14); }
    const q0 = P.lift_Q0, slot0 = P.lift_B0, sy = P.servo_axes.lift[1], sz = P.servo_axes.lift[2], mount = P.sg90_mount_outer_x_mm;
    { mesh(robot, stlGeometry('lifter'), rm(COLORS.lift));
      box(robot, [P.hook_w_mm - 1, P.shelf_len_mm - 1.2, .6], [0, q0[0] - (P.shelf_len_mm + 1) / 2, q0[1] + .1], rm(COLORS.rubber, .05, .9));
      cyl(robot, 1.5, 13, [39, slot0[0], slot0[1]], [1, 0, 0], steel, 12); cyl(robot, 1.5, 17.5, [-41.25, slot0[0], slot0[1]], [1, 0, 0], steel, 12);
      const m = rm(COLORS.servoS, .1, .5);                                  // SG90 (리프터)
      box(robot, [22.7, 22.5, 12.2], [mount - 11.35, sy, sz], m); box(robot, [2, 32.5, 12.2], [mount - 4, sy, sz], m); cyl(robot, 2.4, 6, [mount + 3, sy, sz], [1, 0, 0], steel, 14);
      mesh(robot, stlGeometry('crank'), rm(COLORS.lift)); mesh(robot, stlGeometry('link'), rm(COLORS.steel, .35, .5)); }
    { const m = rm(COLORS.rubber, .05, .9), n = [0, Math.sin(TILT), Math.cos(TILT)];
      for (const [x, y] of [[-20, 18], [20, 18], [-43, -87], [43, -87]]) cyl(robot, 5, 1, [x, y + n[1] * .5, tableZ(y) + n[2] * .5], n, m); }
    { const cube = new THREE.Group(); cube.position.set(0, 0, H); robot.add(cube);   // 흰색 아래 · 초록 앞(관중 쪽)
      const body = rm(0x1b1f23, .05, .5), pitch = P.layer_mm, cg = new THREE.BoxGeometry(pitch - .5, pitch - .5, pitch - .5), sg = new THREE.PlaneGeometry(pitch - 3.4, pitch - 3.4);
      const faces = [[[0, 0, 1], 0xffd742], [[0, 0, -1], 0xf6f4e9], [[0, 1, 0], 0x35b76f], [[0, -1, 0], 0x3483d7], [[1, 0, 0], 0xde413f], [[-1, 0, 0], 0xff893e]];
      const fm = faces.map((f) => rm(f[1], 0, .45));
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue; mesh(cube, cg, body, [x * pitch, y * pitch, z * pitch]);
        faces.forEach((f, i) => { const n = f[0]; if (n[0] * x + n[1] * y + n[2] * z !== 1) return;
          const s = mesh(cube, sg, fm[i], [x * pitch + n[0] * (pitch / 2 - .2), y * pitch + n[1] * (pitch / 2 - .2), z * pitch + n[2] * (pitch / 2 - .2)]);
          s.quaternion.setFromUnitVectors(UP, V(n)); });
      } }
    scene.updateMatrixWorld(true);
    const toWorld = (a) => robot.localToWorld(V(a));
    const onDesk = (x, y, h) => { const p = toWorld([x, y, tableZ(y)]); p.z = D + h; return p; };   // 로봇 국소 (x, y) 바로 아래 책상 위 h
    label('NEMA17 · 컵 모터', toWorld([0, 24, P.motor_face_z_mm - 20]));
    label('MG996R · 후드 서보 (D8)', toWorld([80, hinge[1] + 10, hinge[2] + 12]));
    label('SG90 · 리프터 서보 (D9)', toWorld([mount - 22, sy, sz + 8]));

    // ---------- 전자부 배치 (월드 좌표) ----------
    const K = 2.54 / W.pitchPx, G = W.grid;
    const BB = { x0: 115, w: 165.1, d: 54.6, h: 8.5, cy: -25 };
    BB.m = (BB.w - (G.cols - 1) * 2.54) / 2;
    const ZB = D + BB.h;                                               // 브레드보드 윗면
    const holeXY = (p) => [BB.x0 + BB.m + (p[0] - W.origin[0]) * K, BB.cy - (p[1] - W.origin[1]) * K];
    const UNO = { x: 150, y: 18, w: 68.58, d: 53.34, z: D + 4 };       // 기판 왼쪽 아래 모서리 (USB 가 왼쪽)
    const ZU = UNO.z + 1.6 + 8.5;                                      // 핀 헤더 윗면
    const MIL = .0254;
    const unoPins = {};
    W.headers[0].forEach((n, i) => { unoPins[n] = [UNO.x + (i < 10 ? 740 + 100 * i : 1800 + 100 * (i - 10)) * MIL, UNO.y + 2000 * MIL]; });
    W.headers[1].forEach((n, i) => { unoPins[n] = [UNO.x + (i < 8 ? 1100 + 100 * i : 2000 + 100 * (i - 8)) * MIL, UNO.y + 100 * MIL]; });

    const parts = [];                        // 단계 따라 숨기는 묶음 {g, step}
    function part(step) { const g = new THREE.Group(); scene.add(g); parts.push({ g, step }); return g; }
    const k = mat(COLORS.rubber, .1, .6), silver = mat(COLORS.steel, .8, .35), lead = mat(0xb9bec5, .7, .4);

    // 브레드보드 830홀
    { const g = part(0);
      const tex = texture(BB.w, BB.d, 10, (c) => {
        const X = (px) => BB.m + (px - W.origin[0]) * K, Y = (py) => BB.d / 2 + (py - W.origin[1]) * K;
        c.fillStyle = '#f3f1e7'; c.fillRect(0, 0, BB.w, BB.d);
        c.fillStyle = '#dcd8c8'; c.fillRect(0, BB.d / 2 - 1.5, BB.w, 3);
        c.fillStyle = '#2a2d31';
        const hole = (x, y) => c.fillRect(x - .55, y - .55, 1.1, 1.1);
        for (let n = 1; n <= G.cols; n++) for (const r in G.rowY) hole(X(W.origin[0] + (n - 1) * W.pitchPx), Y(G.rowY[r]));
        for (const r in G.railY) for (const px of G.railX) hole(X(px), Y(G.railY[r]));
        c.lineWidth = .45;
        for (const r in G.railY) {
          const minus = r[1] === '-', y = Y(G.railY[r]) + (minus ? -1.6 : 1.6); c.strokeStyle = minus ? '#2f6fd0' : '#d43a34';
          for (const [a, b] of [[0, 24], [25, 49]]) { c.beginPath(); c.moveTo(X(G.railX[a]) - 1.5, y); c.lineTo(X(G.railX[b]) + 1.5, y); c.stroke(); }
          c.fillStyle = c.strokeStyle; c.font = 'bold 2.4px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(minus ? '−' : '+', 1.6, Y(G.railY[r])); c.fillText(minus ? '−' : '+', BB.w - 1.6, Y(G.railY[r]));
        }
        c.fillStyle = '#6b6f76'; c.font = '1.7px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const n of [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]) for (const py of [G.rowY.a - 21, G.rowY.j + 21]) c.fillText(String(n), X(W.origin[0] + (n - 1) * W.pitchPx), Y(py));
        for (const r in G.rowY) for (const x of [1.7, BB.w - 1.7]) c.fillText(r, x, Y(G.rowY[r]));
      });
      topBox(g, [BB.w, BB.d, BB.h], [BB.x0 + BB.w / 2, BB.cy, D + BB.h / 2], mat(COLORS.bb, 0, .8), tex);
      label('브레드보드 830홀 (a 행이 UNO 쪽)', [BB.x0 + BB.w - 25, BB.cy - 20, ZB + 2]); }

    // UNO R4 WiFi (헤더 위치는 R3 와 같다: 100 mil 간격, D7–D8 사이만 160 mil)
    { const g = part(0);
      const tex = texture(UNO.w, UNO.d, 24, (c) => {
        c.fillStyle = '#0e7c86'; c.fillRect(0, 0, UNO.w, UNO.d);
        c.fillStyle = '#e9f6f5'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 1.25px sans-serif';
        for (const n in unoPins) {
          const x = unoPins[n][0] - UNO.x, top = unoPins[n][1] - UNO.y > UNO.d / 2;
          const t = n.replace(/GND\.\d/, 'GND'), text = /^\d+$/.test(t) ? 'D' + t : t;
          c.save(); c.translate(x, top ? 4.3 : UNO.d - 4.3); c.rotate(top ? Math.PI / 2 : -Math.PI / 2); c.fillText(text, 0, 0); c.restore();
        }
        c.textAlign = 'center'; c.font = 'bold 3.4px sans-serif'; c.fillText('UNO R4 WiFi', 31, 22);
        c.font = '1.7px sans-serif'; c.fillText('헤더 핀 배치는 R3 와 같다', 31, 26.5);
        c.fillStyle = '#0a3f45'; c.fillRect(37, 31, 16, 10.5); c.fillStyle = '#c94a3a';
        for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) c.fillRect(37.9 + i * 1.25, 31.7 + j * 1.2, .7, .7);
      });
      topBox(g, [UNO.w, UNO.d, 1.6], [UNO.x + UNO.w / 2, UNO.y + UNO.d / 2, UNO.z + .8], mat(COLORS.pcb, .1, .6), tex);
      const strip = (names) => { const a = unoPins[names[0]], b = unoPins[names[names.length - 1]];
        box(g, [b[0] - a[0] + 2.54, 2.5, 8.5], [(a[0] + b[0]) / 2, a[1], UNO.z + 1.6 + 4.25], k); };
      strip(W.headers[0].slice(0, 10)); strip(W.headers[0].slice(10)); strip(W.headers[1].slice(0, 8)); strip(W.headers[1].slice(8));
      box(g, [7.5, 9, 3.2], [UNO.x + 2.5, UNO.y + 36.5, UNO.z + 3.2], silver);                 // USB-C
      box(g, [13.5, 9, 10.5], [UNO.x + 5.5, UNO.y + 8, UNO.z + 6.85], k);                       // DC 잭 (쓰지 않는다)
      box(g, [18, 25.5, 3.1], [UNO.x + 56, UNO.y + 24, UNO.z + 3.15], silver);                  // ESP32-S3 모듈
      box(g, [7, 7, 1.2], [UNO.x + 27, UNO.y + 14, UNO.z + 2.2], k);                            // RA4M1
      cyl(g, 1.6, 1.6, [UNO.x + 5, UNO.y + 49, UNO.z + 2.6], [0, 0, 1], mat(0xd8d2c0, .1, .6)); // 리셋
      for (const [x, y] of [[14, 2.5], [66, 7.6], [66, 35.5], [15.2, 50.8]]) cyl(g, 3, 4, [UNO.x + x, UNO.y + y, D + 2], [0, 0, 1], k, 12);   // 받침
      label('UNO R4 WiFi', [UNO.x + 34, UNO.y + 30, ZU + 4]);
      tube(g, [V([UNO.x - 1, UNO.y + 36.5, UNO.z + 3.2]), V([UNO.x - 10, UNO.y + 37, UNO.z + 3]), V([UNO.x - 16, UNO.y + 52, D + 2.5]), V([UNO.x - 14, UNO.y + 120, D + 2.5]), V([UNO.x - 8, UNO.y + 200, D + 2.5])], 1.9, mat(0xdfe3e6, .1, .6));
      box(g, [10, 9.5, 5], [UNO.x - 5, UNO.y + 36.5, UNO.z + 3.2], mat(0xdfe3e6, .1, .6));
      label('USB-C (보드 전원 · 업로드)', [UNO.x - 14, UNO.y + 110, D + 8]); }

    // 브레드보드에 꽂는 부품 (다리 위치는 표의 leg 줄)
    const legXY = {}; let legStep = {};
    for (const l of W.legs) { legXY[l.pin] = holeXY(l.p); legStep[l.pin.split(':')[0]] = l.step; }
    const midOf = (...pins) => { let x = 0, y = 0; for (const p of pins) { x += legXY[p][0]; y += legXY[p][1]; } return [x / pins.length, y / pins.length]; };
    { const g = part(legStep.drvCup), drv = W.legs.filter((l) => l.pin.startsWith('drvCup:'));           // A4988
      const xs = drv.map((l) => legXY[l.pin][0]), ys = drv.map((l) => legXY[l.pin][1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0 + 2.54, d = y1 - y0 + 2.54;
      const tex = texture(w, d, 24, (c) => {
        c.fillStyle = '#b3262b'; c.fillRect(0, 0, w, d); c.fillStyle = '#fff'; c.font = 'bold 1.05px sans-serif'; c.textBaseline = 'middle';
        for (const l of drv) { const far = legXY[l.pin][1] > cy, x = legXY[l.pin][0] - x0 + 1.27, name = l.pin.split(':')[1].replace('GNDmot', 'GND').replace('ENABLE', 'EN').replace('RESET', 'RST').replace('SLEEP', 'SLP');
          c.fillStyle = '#e8d9a0'; c.beginPath(); c.arc(x, far ? 1.27 : d - 1.27, .7, 0, 7); c.fill(); c.fillStyle = '#fff';
          c.save(); c.translate(x, far ? 2.3 : d - 2.3); c.rotate(-Math.PI / 2); c.textAlign = far ? 'right' : 'left'; c.fillText(name, 0, 0); c.restore(); }
      });
      for (const y of [y0, y1]) box(g, [w, 2.5, 2.5], [cx, y, ZB + 1.25], k);
      topBox(g, [w, d, 1.6], [cx, cy, ZB + 3.3], mat(0xb3262b, .1, .6), tex);
      box(g, [7.5, 6.6, 1], [cx + 1, cy, ZB + 4.6], silver); for (let i = 0; i < 5; i++) box(g, [.8, 6.6, 4], [cx - 2.3 + i * 1.65, cy, ZB + 7.1], silver);   // 방열판
      cyl(g, 1.5, 1.4, [cx - 6.8, cy, ZB + 4.8], [0, 0, 1], mat(COLORS.gold, .7, .4), 16);                                                                       // Vref 전위차계
      label('A4988 (MS2 → 5 V = 1/4 스텝)', [cx, cy + 4, ZB + 12], g); }
    { const g = part(legStep.cap), c = midOf('cap:+', 'cap:-'), m = legXY['cap:-'];                        // 100 µF
      cyl(g, 3.15, 11, [c[0], c[1], ZB + 7], [0, 0, 1], mat(0x1d2a4a, .2, .5)); cyl(g, 3.2, .3, [c[0], c[1], ZB + 12.5], [0, 0, 1], silver);
      box(g, [1.4, 2.6, 10.4], [c[0] + (m[0] - c[0]) * 2.25, c[1], ZB + 7], mat(0xdfe3e6, 0, .7));        // − 쪽 흰 띠
      for (const p of ['cap:+', 'cap:-']) cyl(g, .3, 1.6, [legXY[p][0], legXY[p][1], ZB + .8], [0, 0, 1], lead, 8);
      label('100 µF (+ c5 · − c6)', [c[0], c[1], ZB + 15], g); }
    { const g = part(legStep.btnStart), c = midOf('btnStart:1.l', 'btnStart:2.l', 'btnStart:1.r', 'btnStart:2.r');   // 택트 스위치
      box(g, [6, 6, 3.6], [c[0], c[1], ZB + 1.8], k); box(g, [5.4, 5.4, .3], [c[0], c[1], ZB + 3.7], silver); cyl(g, 1.75, 1.6, [c[0], c[1], ZB + 4.6], [0, 0, 1], k);
      label('START 버튼 (A2)', [c[0], c[1], ZB + 7], g); }
    { const g = part(legStep.resistor), a = legXY['resistor:1'], b = legXY['resistor:2'], c = midOf('resistor:1', 'resistor:2'), z = ZB + 2.4;   // 100 Ω + 부저
      cyl(g, .3, b[0] - a[0], [c[0], c[1], z], [1, 0, 0], lead, 8); for (const p of [a, b]) cyl(g, .3, 2.4, [p[0], p[1], ZB + 1.2], [0, 0, 1], lead, 8);
      cyl(g, 1.15, 5.6, [c[0], c[1], z], [1, 0, 0], mat(0xd9c39a, 0, .7), 16);
      [0x7a4a22, 0x1c1c1c, 0x7a4a22, 0xc9a23a].forEach((col, i) => cyl(g, 1.2, .55, [c[0] - 1.9 + i * 1.15 + (i === 3 ? .5 : 0), c[1], z], [1, 0, 0], mat(col, .1, .6), 16));
      const bz = midOf('bz1:1', 'bz1:2');
      cyl(g, 6, 9.5, [bz[0], bz[1], ZB + 5.25], [0, 0, 1], k, 32); cyl(g, 1.1, .2, [bz[0], bz[1], ZB + 10.05], [0, 0, 1], mat(0x0a0c0e, 0, .9), 16);
      label('부저 + 100 Ω (A3)', [bz[0], bz[1], ZB + 13], g); }

    // LCD1602 + I2C 백팩 (뒤로 15° 기울여 세움, 화면이 관중 쪽)
    const lcd = new THREE.Group(); lcd.position.set(265, 60, D); lcd.rotation.x = deg(-15);
    { const g = part(8); g.add(lcd);
      box(g, [80, 26, 3], [265, 66, D + 1.5], k);                                                          // 받침
      box(lcd, [80, 1.6, 36], [0, 0, 24], mat(COLORS.pcb, .1, .6)); box(lcd, [71, 7, 24], [0, -4.3, 24], k);
      const tex = texture(64.5, 14.5, 8, (c) => { c.fillStyle = '#b9d94a'; c.fillRect(0, 0, 64.5, 14.5); c.fillStyle = '#26330f'; c.font = 'bold 4.6px Consolas, monospace'; c.textBaseline = 'middle';
        c.fillText('SOLVING...', 2.5, 4.2); c.fillText('cross', 2.5, 10.6); });
      const scr = mesh(lcd, new THREE.PlaneGeometry(64.5, 14.5), new THREE.MeshStandardMaterial({ map: tex, roughness: .4, emissive: css(0x5a6a20), emissiveIntensity: .35 }), [0, -7.85, 24]);
      scr.rotation.x = Math.PI / 2;
      box(lcd, [41, 4, 19], [-12, 2.8, 26], k); cyl(lcd, 3, 4.5, [-2, 5.5, 26], [0, 1, 0], mat(0x2f6fd0, .1, .5), 16);   // 백팩 + 콘트라스트 전위차계
      label('LCD1602 I2C (SDA A4 · SCL A5)', [265, 52, D + 52], g); }
    scene.updateMatrixWorld(true);

    // 12 V 잭 터미널 · 5 V 어댑터 터미널 (나사 단자에 단선을 물린다)
    function terminalBlock(g, x, y, text) {
      box(g, [13, 18, 11], [x, y - 12, D + 5.5], k); box(g, [11, 8, 9], [x, y - 1, D + 4.5], mat(0x2d8a4e, .1, .6));
      for (const dx of [-2.5, 2.5]) cyl(g, 1.5, .6, [x + dx, y - 1, D + 9.2], [0, 0, 1], silver, 12);
      tube(g, [V([x, y - 21, D + 5.5]), V([x, y - 40, D + 3.5]), V([x + (x > 150 ? 12 : -10), y - 100, D + 3]), V([x + (x > 150 ? 18 : -14), y - 150, D + 3])], 2.1, k);
      label(text, [x, y - 14, D + 14], g);
    }
    const JACK = [122, -66], ADP = [192, -66];
    terminalBlock(part(1), JACK[0], JACK[1], '12 V DC 잭 (모터 전용)');
    terminalBlock(part(7), ADP[0], ADP[1], '5 V 어댑터 (서보 전용)');

    // 서보 3핀 커넥터(갈·빨·주)와 케이블, 모터 4선 묶음 — 책상 위를 지나가는 길은 예시
    const HOODC = [104, 80], LIFTC = [118, 98], SPLIT = [128, 10];
    function servoLead(g, start, way, c) {
      const pts = [start, ...way, V([c[0], c[1] + 16, D + 2.4]), V([c[0], c[1] + 7, D + 2.4])];
      [0x6b3f1d, 0xc23b3b, 0xe8872a].forEach((col, i) => tube(g, pts.map((p) => p.clone().add(V([(i - 1) * 1.3, 0, 0]))), .62, mat(col, .1, .6)));
      box(g, [7.8, 14, 2.6], [c[0], c[1], D + 2.4], k);
    }
    { const g = part(7);
      servoLead(g, toWorld([80, hinge[1] + 10, hinge[2] - 6]), [onDesk(98, hinge[1] - 8, 2.4), onDesk(60, -128, 2.4), onDesk(-40, -132, 2.4), V([92, 122, D + 2.4]), V([102, 104, D + 2.4])], HOODC);
      servoLead(g, toWorld([mount - 22.7, sy, sz - 4]), [toWorld([mount - 30, sy - 4, sz - 40]), V([112, 124, D + 2.4]), V([117, 118, D + 2.4])], LIFTC); }
    { const g = part(4), sheath = mat(0x3b434a, .1, .7);
      tube(g, [toWorld([0, -21, P.motor_face_z_mm - 30]), onDesk(0, -60, 5), onDesk(0, -112, 2.6), V([62, 116, D + 2.6]), V([86, 70, D + 2.6]), V([104, 22, D + 2.6]), V([SPLIT[0] - 6, SPLIT[1] + 1, D + 2.6])], 2.3, sheath);
      label('모터 4선 → a7~a10', [96, 46, D + 8], g); }

    // ---------- 선 끝점: 위치 + 선이 빠져나오는 방향 ----------
    const TERM = {
      'motCup:A-': [-1.5, 0], 'motCup:A+': [-.5, 0], 'motCup:B+': [.5, 0], 'motCup:B-': [1.5, 0],
    };
    function endpoint(id, holePx) {
      if (holePx) { const p = holeXY(holePx); return { pos: V([p[0], p[1], ZB]), dir: UP.clone(), kind: 'hole' }; }
      const [dev, pin] = id.split(':');
      if (dev === 'uno') { const p = unoPins[pin]; if (!p) throw new Error('UNO 핀 없음: ' + id); return { pos: V([p[0], p[1], ZU]), dir: UP.clone(), kind: 'hole' }; }
      if (dev === 'motCup') return { pos: V([SPLIT[0] + TERM[id][0] * 1.6, SPLIT[1], D + 2.6]), dir: V([0, -.35, .94]).normalize(), kind: 'bare' };
      if (dev === 'srvHood' || dev === 'srvLift') { const c = dev === 'srvHood' ? HOODC : LIFTC, i = { GND: -1, 'V+': 0, PWM: 1 }[pin];
        return { pos: V([c[0] + i * 2.54, c[1] - 7, D + 2.4]), dir: V([0, -1, .12]).normalize(), kind: 'plug' }; }
      if (dev === 'lcd1') { const i = ['GND', 'VCC', 'SDA', 'SCL'].indexOf(pin);
        return { pos: lcd.localToWorld(V([-34, 3.5, 26 + (1.5 - i) * 2.54])), dir: V([-1, 0, 0]), kind: 'plug' }; }
      if (dev === 'jack' || dev === 'adapter') { const c = dev === 'jack' ? JACK : ADP;
        return { pos: V([c[0] + (pin === '+' ? -2.5 : 2.5), c[1] + 3, D + 5]), dir: V([0, .9, .45]).normalize(), kind: 'bare' }; }
      throw new Error('알 수 없는 끝점: ' + id);
    }

    // ---------- 점퍼선 ----------
    const wires = [], pickMeshes = [], housingGeo = new THREE.BoxGeometry(2.4, 10, 2.4);
    for (const w of W.wires) {
      const A = endpoint(w.a, w.pa), B = endpoint(w.b, w.pb);
      const plugged = /^(수-수|암-수)/.test(w.type) && !/짧게/.test(w.type);
      const g = new THREE.Group(); scene.add(g);
      const m = mat(W.colors[w.color].hex, .05, .5), hm = mat(0x24282d, .1, .6);
      const ends = [A, B].map((e) => {
        const has = plugged && e.kind !== 'bare', len = has ? 10 : 0;
        if (has) { const h = mesh(g, housingGeo, hm, e.pos.clone().addScaledVector(e.dir, 5.6).toArray()); h.quaternion.setFromUnitVectors(V([0, 1, 0]), e.dir); }
        return e.pos.clone().addScaledVector(e.dir, len + (has ? .6 : 0));
      });
      const dist = ends[0].distanceTo(ends[1]), rise = Math.min(7, 2 + dist * .3);
      const a1 = ends[0].clone().addScaledVector(A.dir, rise), b1 = ends[1].clone().addScaledVector(B.dir, rise);
      const lift = clamp(dist * .2, 1.5, 34) + (w.n % 5) * 1.6, side = ((w.n % 3) - 1) * Math.min(5, dist * .06);
      const across = b1.clone().sub(a1).cross(UP).normalize();
      const midPt = (t) => a1.clone().lerp(b1, t).addScaledVector(UP, lift * (1 - Math.pow(2 * t - 1, 2) * .35)).addScaledVector(across, side);
      const pts = dist < 6 ? [ends[0], a1, b1, ends[1]] : [ends[0], a1, midPt(.25), midPt(.5), midPt(.75), b1, ends[1]];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seg = Math.max(12, Math.round(curve.getLength() / 2.5));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, seg, w.type === '모터 선' ? .65 : .8, 8), m));
      const pick = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, seg >> 1), 3, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pick.userData.n = w.n; g.add(pick); pickMeshes.push(pick);
      wires.push({ w, g, mats: [m, hm], pick, mid: curve.getPoint(.5), length: curve.getLength(), state: '' });
    }
    $('modelInfo').textContent = 'Rev ' + (P.revision || '?') + ' · 선 ' + wires.length + '개 · 단위 mm';

    // ---------- 단계·선택 상태 ----------
    const CIRC = '①②③④⑤⑥⑦⑧⑨';
    const STEPS = [null,
      ['레일 연결', 'UNO 5V·GND 를 위 레일에, 위 − 와 아래 − 를 왼쪽 절반 끝(L25)에서 잇고, 12 V 잭을 아래 레일에 물린다. 아래 + 레일은 12 V 전용이다.'],
      ['A4988 + 로직 신호', 'VMOT 쪽이 a 행을 보게 e5~e12 / h5~h12 에 꽂는다. RESET–SLEEP 짧은 점퍼, MS2 → 위 + (1/4 스텝), VDD·GND, D6·D2·D7.'],
      ['커패시터 + VMOT', '100 µF 의 + 를 c5, − (흰 띠)를 c6 에. a5 → 아래 + 레일(12 V) 긴 점퍼 하나만 12 V 가 흐른다.'],
      ['NEMA17 모터 4선', '같은 코일 두 선이 a7·a8 또는 a9·a10 에 함께 오게 꽂는다.'],
      ['버튼', '택트 스위치를 가운데 홈에 걸치고 a15 → A2, j17 → 아래 − 레일.'],
      ['부저 + 100 Ω', 'A3 → 18열 → 저항 → 21열 → 부저 → 24열 → GND.'],
      ['서보 전원 열', '27열 = 어댑터 +5 V, 29열 = GND. 서보 빨강·갈색은 이 두 열에, 주황은 UNO D8(후드)·D9(리프터)에. UNO 5V 와 잇지 않는다.'],
      ['LCD1602 I2C', '암-수 점퍼 4개: GND·VCC 는 위 레일, SDA → A4, SCL → A5.']];
    let stepSel = 0, sel = 0, hover = 0, showWires = true, showLabels = true;
    function setState(o, s) {
      if (o.state === s) return; o.state = s; o.g.visible = s !== 'hidden';
      const op = s === 'dim' ? .1 : s === 'past' ? .32 : 1;
      for (const m of o.mats) { m.transparent = op < 1; m.opacity = op; m.depthWrite = op === 1; m.needsUpdate = true; }
      o.mats[0].emissive.copy(s === 'hl' ? o.mats[0].color : new THREE.Color(0)); o.mats[0].emissiveIntensity = s === 'hl' ? .6 : 0;
    }
    function refresh() {
      const focus = sel || hover;
      for (const o of wires) {
        let s = 'normal';
        if (!showWires || (stepSel && o.w.step > stepSel)) s = 'hidden';
        else if (focus) s = o.w.n === focus ? 'hl' : 'dim';
        else if (stepSel && o.w.step < stepSel) s = 'past';
        setState(o, s);
      }
      for (const p of parts) p.g.visible = !stepSel || p.step <= stepSel;
      for (const tr of document.querySelectorAll('tr.wire')) {
        const n = +tr.dataset.n, st = +tr.dataset.step;
        tr.classList.toggle('sel', n === sel); tr.classList.toggle('hover', n === hover && n !== sel); tr.classList.toggle('off', !!stepSel && st > stepSel);
      }
      const o = wires.find((x) => x.w.n === focus), info = $('hoverInfo');
      info.hidden = !o; if (o) info.innerHTML = `<span class="sw" style="background:${W.colors[o.w.color].hex}"></span>#${o.w.n} ${o.w.la} → ${o.w.lb} · ${o.w.type}`;
    }
    function select(n, fly) {
      sel = sel === n ? 0 : n;
      const picked = wires.find((x) => x.w.n === sel);        // 아직 안 꽂은 단계의 선을 고르면 그 단계까지 펼친다
      if (picked && stepSel && picked.w.step > stepSel) { stepSel = picked.w.step; [...nav.children].forEach((x, j) => x.setAttribute('aria-pressed', String(j === stepSel))); renderPanel(); }
      refresh();
      const o = wires.find((x) => x.w.n === sel);
      if (o) { const tr = document.querySelector(`tr.wire[data-n="${sel}"]`); if (tr && content.scrollHeight > content.clientHeight) {      // 목록 안에서만 굴린다 (문서 전체를 굴리지 않는다)
          const top = tr.getBoundingClientRect().top - content.getBoundingClientRect().top;
          if (top < 0 || top > content.clientHeight - 40) content.scrollTop += top - content.clientHeight / 2; }
        if (fly) flyTo({ az: cam.az, el: Math.max(cam.el, 32), dist: clamp(o.length * 2.2 + 150, 200, 520), target: o.mid }); }
    }

    // ---------- 패널 ----------
    const nav = $('stepNav'), content = $('content');
    ['전체', ...STEPS.slice(1).map((s, i) => CIRC[i] + ' ' + s[0])].forEach((t, i) => {
      const b = document.createElement('button'); b.textContent = t; b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => { stepSel = i; sel = 0; [...nav.children].forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); renderPanel(); refresh(); if (i) flyTo(CAMS.board); else flyTo(CAMS.all); });
      nav.appendChild(b);
    });
    function renderPanel() {
      const head = stepSel
        ? `<h2>${CIRC[stepSel - 1]} ${STEPS[stepSel][0]}</h2><p class="lead">${STEPS[stepSel][1]} 이 단계까지 꽂은 모습만 보이고, 앞 단계 선은 흐리게 나온다.</p>`
        : '<h2>완성된 배치</h2><p class="lead">단계 버튼을 누르면 그 단계까지 꽂은 모습을 본다. 아래 목록이나 3D 의 선을 누르면 그 선만 남는다.</p>';
      let rows = '';
      for (let s = 1; s < STEPS.length; s++) {
        const list = W.wires.filter((w) => w.step === s); if (!list.length) continue;
        rows += `<tr><td colspan="3"><h3>${CIRC[s - 1]} ${STEPS[s][0]} · 선 ${list.length}개</h3></td></tr>`;
        for (const w of list) rows += `<tr class="wire" tabindex="0" data-n="${w.n}" data-step="${w.step}"><td class="n">${w.n}</td><td><span class="sw" style="background:${W.colors[w.color].hex}"></span>${w.la} → ${w.lb}</td><td class="t">${w.type.split(' / ')[0]}</td></tr>`;
      }
      const used = [...new Set(W.wires.map((w) => w.color))];
      content.innerHTML = head +
        `<div class="warn"><b>아래 + 레일은 12 V</b> 다. 서보·LCD·A4988 VDD 는 여기에 꽂지 않는다. 서보 5 V(27열)는 UNO 5V 와 따로다.</div>` +
        `<table>${rows}</table>` +
        `<h3>선 색</h3><div class="legend">${used.map((c) => `<span><span class="sw" style="background:${W.colors[c].hex}"></span>${W.colors[c].label}</span>`).join('')}</div>` +
        `<div class="ok">선의 양 끝(구멍·핀)은 <a href="../../docs/WIRING_V5_R4.html">배선 안내</a> 4절의 평면도·선 목록과 같은 표(<code>tools/make_wiring_v5.js</code>)에서 나온다. 선이 휘는 모양, 케이블이 지나가는 길, 보드를 놓은 자리는 보기 좋게 잡은 예시다.</div>`;
      content.scrollTop = 0;
    }
    const rowOf = (e) => e.target.closest && e.target.closest('tr.wire');
    content.addEventListener('click', (e) => { const tr = rowOf(e); if (tr) select(+tr.dataset.n, true); });
    content.addEventListener('keydown', (e) => { const tr = rowOf(e); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.dataset.n, true); } });
    content.addEventListener('mouseover', (e) => { const tr = rowOf(e); const n = tr ? +tr.dataset.n : 0; if (n !== hover) { hover = n; refresh(); } });
    content.addEventListener('mouseleave', () => { if (hover) { hover = 0; refresh(); } });
    $('chkLabels').addEventListener('change', (e) => { showLabels = e.target.checked; });
    $('chkWires').addEventListener('change', (e) => { showWires = e.target.checked; refresh(); });
    $('chkGhost').addEventListener('change', (e) => { for (const m of robotMats) { m.transparent = e.target.checked; m.opacity = e.target.checked ? .22 : 1; m.depthWrite = !e.target.checked; m.needsUpdate = true; } });

    // ---------- 이름표 ----------
    const labelsEl = $('labels'), tmp = new THREE.Vector3();
    for (const l of labels) { l.el = document.createElement('div'); l.el.className = 'tag'; l.el.textContent = l.text; labelsEl.appendChild(l.el); }
    function updateLabels() {
      const w = stage.clientWidth, h = stage.clientHeight, placed = [];
      for (const l of labels) {                              // 먼저 만든 이름표가 우선. 겹치면 뒤의 것을 숨긴다 (확대하면 나타난다)
        tmp.copy(l.at).project(camera);
        const x = (tmp.x * .5 + .5) * w, y = (-tmp.y * .5 + .5) * h;
        if (!l.w) { l.el.style.display = ''; l.w = l.el.offsetWidth || 120; }
        const r = [x - l.w / 2 - 3, y - 40, x + l.w / 2 + 3, y - 12];
        if (!showLabels || (l.group && !l.group.visible) || tmp.z > 1 || placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) { l.el.style.display = 'none'; continue; }
        placed.push(r); l.el.style.display = ''; l.el.style.left = x.toFixed(1) + 'px'; l.el.style.top = y.toFixed(1) + 'px';
      }
    }

    // ---------- 카메라 (방위각 −90° = 관중 자리) ----------
    const CAMS = {
      all: { az: -76, el: 38, dist: 720, target: V([115, 5, D + 35]) },
      board: { az: -90, el: 56, dist: 400, target: V([196, 4, D + 8]) },
      top: { az: -90, el: 88, dist: 760, target: V([110, 20, D]) },
      robot: { az: -62, el: 22, dist: 560, target: V([0, 35, D + 75]) },
      back: { az: 62, el: 30, dist: 780, target: V([90, 30, D + 30]) },
    };
    const cam = { az: CAMS.all.az, el: CAMS.all.el, dist: CAMS.all.dist, target: CAMS.all.target.clone() }; let camTween = null;
    function flyTo(c, ms = 700) { const daz = ((c.az - cam.az + 540) % 360) - 180;
      camTween = { ms: 0, dur: ms, from: { az: cam.az, el: cam.el, dist: cam.dist, target: cam.target.clone() }, to: { az: cam.az + daz, el: c.el, dist: c.dist, target: c.target.clone() } }; }
    function placeCamera() {
      const a = deg(cam.az), e = deg(cam.el), d = cam.dist * clamp(1.25 / camera.aspect, 1, 2.6);   // 세로로 긴 화면은 그만큼 물러난다
      camera.position.set(cam.target.x + d * Math.cos(e) * Math.cos(a), cam.target.y + d * Math.cos(e) * Math.sin(a), cam.target.z + d * Math.sin(e));
      camera.lookAt(cam.target);
    }
    document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => flyTo(CAMS[b.dataset.cam])));
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function wireAt(e) {
      const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickMeshes.filter((p) => p.parent.visible), false)[0]; return hit ? hit.object.userData.n : 0;
    }
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.shiftKey || e.button === 2 }; camTween = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) { const n = wireAt(e); if (n !== hover) { hover = n; refresh(); } canvas.style.cursor = n ? 'pointer' : ''; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.pan) { const s = cam.dist / 900, a = deg(cam.az); cam.target.x += Math.sin(a) * dx * s; cam.target.y += -Math.cos(a) * dx * s; cam.target.z += dy * s; }
      else { cam.az -= dx * .35; cam.el = clamp(cam.el + dy * .3, -10, 89); }
    });
    canvas.addEventListener('pointerup', (e) => { const click = drag && drag.moved < 5 && !drag.pan; drag = null; if (click) { const n = wireAt(e); if (n) select(n, false); else if (sel) select(sel, false); } });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => { if (hover) { hover = 0; refresh(); } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); camTween = null; cam.dist = clamp(cam.dist * Math.exp(e.deltaY * .001), 70, 2400); }, { passive: false });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && sel) select(sel, false); });

    // ---------- 루프 ----------
    function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    new ResizeObserver(resize).observe(stage); resize();
    function advance(dt) {
      if (camTween) { camTween.ms += dt; const t = ease(camTween.ms / camTween.dur), a = camTween.from, b = camTween.to;
        cam.az = mix(a.az, b.az, t); cam.el = mix(a.el, b.el, t); cam.dist = mix(a.dist, b.dist, t); cam.target.copy(a.target).lerp(b.target, t); if (camTween.ms >= camTween.dur) camTween = null; }
      placeCamera(); renderer.render(scene, camera); updateLabels();
    }
    let last = performance.now();
    function frame(now) { const dt = Math.min(100, now - last); last = now; advance(dt); requestAnimationFrame(frame); }
    renderPanel(); refresh(); requestAnimationFrame(frame);
    // 검사·캡처용 (콘솔): WiringView.view('board'), WiringView.step(3), WiringView.select(12)
    window.WiringView = { wires, parts, cam, renderer,
      view(name) { Object.assign(cam, { az: CAMS[name].az, el: CAMS[name].el, dist: CAMS[name].dist }); cam.target.copy(CAMS[name].target); camTween = null; advance(0); },
      step(i) { nav.children[i].click(); camTween = null; advance(0); }, select(n) { select(n, false); advance(0); }, tick(ms = 1000) { for (let t = 0; t < ms; t += 50) advance(50); } };
    const q = new URLSearchParams(location.search);       // ?view=board&step=3&wire=12 (캡처·링크용)
    if (Number.isInteger(+q.get('step')) && +q.get('step') >= 1 && +q.get('step') < STEPS.length) nav.children[+q.get('step')].click();
    if (q.get('view') && CAMS[q.get('view')]) window.WiringView.view(q.get('view'));
    if (q.get('wire')) select(+q.get('wire'), false);
    if (q.get('cam')) { const c = q.get('cam').split(',').map(Number); if (c.length === 6 && c.every(Number.isFinite)) { camTween = null; cam.az = c[0]; cam.el = c[1]; cam.dist = c[2]; cam.target.set(c[3], c[4], c[5]); } }
  } catch (e) { showError(e); }
})();
