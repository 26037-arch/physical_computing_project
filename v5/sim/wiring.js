// V5 최종 모습 3D — 조립된 로봇(models.js) 옆에 UNO R4 WiFi·170홀 미니 브레드보드·부품·배선을 실제 치수로 놓는다.
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

    // ---------- 전자부·점퍼선 (electronics.js: build.js 와 같은 장면) ----------
    if (!window.ElectronicsV5) throw new Error("electronics.js 를 불러오지 못했습니다.");
    const E = window.ElectronicsV5.build({ THREE, scene, robot, P, W, maxAniso: renderer.capabilities.getMaxAnisotropy(), label });
    const parts = E.parts, wires = E.wires, pickMeshes = E.pickMeshes;
    scene.updateMatrixWorld(true);
    $('modelInfo').textContent = 'Rev ' + (P.revision || '?') + ' · 선 ' + wires.length + '개 · 단위 mm';

    // ---------- 단계·선택 상태 ----------
    const CIRC = '①②③④⑤⑥⑦⑧⑨';
    const STEPS = E.STEPS;
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
        `<div class="warn"><b>12 V +는 a1 전용</b>이다. 서보 +5 V는 보드 밖 분기 단자를 쓴다. 세 전원의 GND는 공통이다.</div>` +
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
