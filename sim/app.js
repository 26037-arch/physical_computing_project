// sim/app.js — 3D 시뮬레이터: 큐브(26 큐비) + 6면 직결 모터·커플러·캡(Fusion STL) 을 그리고,
// 펌웨어(main.ino)와 같은 명령(S/V/M/R)·같은 시리얼 출력·같은 LCD 문구로 동작한다.
(function () {
  'use strict';
  const C = CubeLib, S = CubeSolver;
  const UNIT = 19;                 // 1 단위 = 큐비 한 칸 = 19 mm (57 mm 큐브)
  const SCRAMBLE_LEN = 20;
  // 보드 속도 추정 근거: Wokwi(Uno, 16 MHz AVR) 시드 1 측정 — CALC nodes=108161 ms=4733 (Codex 최적화 후, 최적화 전 15613)
  const AVR_NODES_PER_SEC = 108161 / 4.733;

  // ---------- 3D 장면 ----------
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1216);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(6, 9, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-7, -4, -6); scene.add(fill);

  // 면 순서 U R F D L B. 바깥 법선, 그 면을 정면에서 볼 때 스티커 격자의 오른쪽/아래 방향
  const N = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  const RIGHT = [[1, 0, 0], [0, 0, -1], [1, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  const DOWN = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
  const COLORS = [0xf2f2f2, 0xd62828, 0x1b9e3f, 0xf7d308, 0xf77f00, 0x0057b8];
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  const cubeGroup = new THREE.Group(); scene.add(cubeGroup);
  const cubies = {};  // "x,y,z" → Group
  const cubieGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  const cubieMat = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.6 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(cubieGeo, cubieMat));
    g.userData.home = [x, y, z];
    cubeGroup.add(g); cubies[`${x},${y},${z}`] = g;
  }
  const stickerGeo = new THREE.PlaneGeometry(0.84, 0.84);
  const stickers = [];  // 54개, 큐비의 자식
  for (let f = 0; f < 6; f++) for (let k = 0; k < 9; k++) {
    const r = (k / 3) | 0, c = k % 3;
    const pos = v3(N[f]).add(v3(RIGHT[f]).multiplyScalar(c - 1)).add(v3(DOWN[f]).multiplyScalar(r - 1));
    const owner = cubies[`${pos.x},${pos.y},${pos.z}`];
    const m = new THREE.Mesh(stickerGeo, new THREE.MeshStandardMaterial({ color: COLORS[f], roughness: 0.35 }));
    m.position.copy(v3(N[f]).multiplyScalar(0.501));
    m.lookAt(v3(N[f]).multiplyScalar(2));
    owner.add(m); stickers.push(m);
  }
  function paint(cube) {
    const fc = cube.toFacelets();
    for (let i = 0; i < 54; i++) stickers[i].material.color.setHex(COLORS[fc[i]]);
  }

  // Fusion STL (mm, base64) → BufferGeometry (단위: 큐비 칸)
  function stlGeometry(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dv = new DataView(u8.buffer);
    const tri = dv.getUint32(80, true);
    const pos = new Float32Array(tri * 9), nor = new Float32Array(tri * 9);
    let o = 84;
    for (let t = 0; t < tri; t++) {
      const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true); o += 12;
      for (let v = 0; v < 3; v++) {
        const i = t * 9 + v * 3;
        pos[i] = dv.getFloat32(o, true) / UNIT; pos[i + 1] = dv.getFloat32(o + 4, true) / UNIT; pos[i + 2] = dv.getFloat32(o + 8, true) / UNIT; o += 12;
        nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
      }
      o += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  }
  const models = (typeof CubeModels !== 'undefined') ? CubeModels : {};
  const GEO = {};
  for (const k of Object.keys(models)) GEO[k] = stlGeometry(models[k].b64);
  const plaMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.55, metalness: 0.05 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.5 });
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7, metalness: 0.3 });
  const motorGeo = new THREE.BoxGeometry(42.3 / UNIT, 42.3 / UNIT, 40 / UNIT);
  const shaftGeo = new THREE.CylinderGeometry(2.5 / UNIT, 2.5 / UNIT, 24 / UNIT, 16);

  // 부품 배치: 면 표면(1.5)에서 바깥 법선 방향 distMm 만큼. 부품의 +Z 축을 법선(또는 그 반대)에 맞춘다.
  const ZAXIS = new THREE.Vector3(0, 0, 1);
  function place(mesh, f, distMm, toward) {
    const n = v3(N[f]);
    mesh.quaternion.setFromUnitVectors(ZAXIS, toward ? n.clone().negate() : n);
    mesh.position.copy(n.multiplyScalar(1.5 + distMm / UNIT));
    return mesh;
  }
  const spin = [];  // 면과 함께 도는 부품(캡, 커플러, 축)
  for (let f = 0; f < 6; f++) {
    const sp = new THREE.Group(); scene.add(sp); spin.push(sp);
    // 축방향 조립 거리(docs/DESIGN_REVIEW.md): 캡 6 + 커플러 22 = 28 mm 에 커플러 모터측 끝, 모터 전면 28 mm
    if (GEO.center_cap) sp.add(place(new THREE.Mesh(GEO.center_cap, capMat), f, 0, false));            // 캡: 면 표면에 (핀은 큐브 안으로)
    if (GEO.center_coupler) sp.add(place(new THREE.Mesh(GEO.center_coupler, plaMat), f, 28, true));  // 커플러: 키 3.5 mm 가 캡 슬롯(4 mm)에
    sp.add(place(new THREE.Mesh(shaftGeo, motorMat), f, 28 + 6, false).rotateX(Math.PI / 2));          // 모터 축 (커플러 안, place 뒤에 축 정렬)
    const fixed = new THREE.Group(); scene.add(fixed);
    if (GEO.motor_mount) fixed.add(place(new THREE.Mesh(GEO.motor_mount, plaMat), f, 24, false));   // 브래킷 판 24~28 mm (모터 앞면)
    fixed.add(place(new THREE.Mesh(motorGeo, motorMat), f, 48, false));                                // NEMA17 몸통 28~68 mm
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(6 / UNIT, 6 / UNIT, 1 / UNIT), new THREE.MeshStandardMaterial({ color: COLORS[f] }));
    fixed.add(place(arrow, f, 68.6, false));                                                           // 모터 뒷면 색 표시
  }

  // ---------- 카메라 조작 ----------
  let theta = 0.7, phi = 1.05, dist = 14;
  function updateCamera() {
    camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(0, 0, 0);
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = 'grab'; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    theta -= (e.clientX - drag.x) * 0.008; phi = Math.min(2.9, Math.max(0.25, phi - (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY }; updateCamera();
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.min(30, Math.max(5, dist * (e.deltaY > 0 ? 1.08 : 0.92))); updateCamera(); }, { passive: false });
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ---------- 회전 애니메이션 큐 ----------
  const cube = new C.Cube();
  const pivot = new THREE.Group(); scene.add(pivot);
  const queue = [];       // {m, label}
  let current = null;     // {m, label, start, dur, members}
  let paused = false;
  let allMoves = [], moveIdx = 0, queueLabel = '', onQueueDone = null, execStart = 0;
  const speedEl = document.getElementById('speed');

  function startMove(item) {
    const f = (item.m / 3) | 0, k = item.m % 3;
    const turns = k === 2 ? -1 : k + 1;   // U=+1(시계 90°), U2=+2, U'=-1(반시계 90°, 모터도 반대로 50스텝)
    const n = v3(N[f]);
    const members = [];
    for (const g of Object.values(cubies)) {
      const h = g.userData.home;
      if (h[0] * n.x + h[1] * n.y + h[2] * n.z === 1) members.push(g);
    }
    members.push(spin[f]);
    pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld();
    for (const o of members) pivot.attach(o);
    current = { ...item, start: performance.now(), dur: Math.abs(turns) * +speedEl.value, members, axis: n, angle: -turns * Math.PI / 2 };
    renderQueue();
  }
  function finishMove() {
    pivot.setRotationFromAxisAngle(current.axis, current.angle);
    pivot.updateMatrixWorld();
    for (const o of current.members) {
      scene.attach(o);
      if (o.userData.home) { cubeGroup.attach(o); o.position.set(...o.userData.home); o.rotation.set(0, 0, 0); }
      else o.rotation.set(0, 0, 0);
    }
    cube.move(current.m); paint(cube);
    moveIdx++;
    if (moveIdx % 4 === 0 || moveIdx === allMoves.length) lcd(queueLabel, `${moveIdx}/${allMoves.length}`);
    current = null;
    renderQueue();
    if (!queue.length && onQueueDone) { const cb = onQueueDone; onQueueDone = null; cb(); }
  }
  function enqueue(moves, label, done) {
    allMoves = moves.slice(); moveIdx = 0; queueLabel = label; onQueueDone = done; execStart = performance.now();
    for (const m of moves) queue.push({ m, label });
    lcd(label, `0/${moves.length}`); renderQueue();
    setBusy(true);
  }
  function animate(now) {
    requestAnimationFrame(animate);
    if (!current && queue.length && !paused) startMove(queue.shift());
    if (current && !paused) {  // 일시정지 중에는 start 를 건드리지 않는다 (재개 시 버튼 핸들러가 보정)
      const t = Math.min(1, (now - current.start) / current.dur);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pivot.setRotationFromAxisAngle(current.axis, current.angle * ease);
      if (t >= 1) finishMove();
    }
    renderer.render(scene, camera);
  }

  // ---------- 패널 ----------
  const logEl = document.getElementById('log');
  function log(s) { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; }
  function lcd(a, b) {
    const pad = (s) => (s || '').toString().slice(0, 16).padEnd(16);
    document.getElementById('lcd').textContent = pad(a) + '\n' + pad(b);
  }
  function renderQueue() {
    const el = document.getElementById('queue');
    if (!allMoves.length) { el.textContent = ''; return; }
    el.innerHTML = allMoves.map((m, i) => `<span class="${i < moveIdx ? 'done' : i === moveIdx ? 'cur' : ''}">${C.moveName(m)}</span>`).join(' ');
  }
  function setBusy(b) { for (const id of ['btnScramble', 'btnSolve', 'btnMoves', 'btnReset']) document.getElementById(id).disabled = b; }
  const busy = () => !!current || queue.length > 0;

  function doScramble(seed) {
    const seq = C.scramble(seed, SCRAMBLE_LEN);
    log(`SCRAMBLE seed=${seed} (${SCRAMBLE_LEN}): ${C.seqToString(seq)}`);
    enqueue(seq, 'SCRAMBLING', () => {
      log(`SCRAMBLED exec=${Math.round(performance.now() - execStart)}ms`);
      lcd('SCRAMBLED 20mv', `seed ${seed}`); setBusy(false);
    });
  }
  function doSolve() {
    if (cube.isSolved()) { log('ALREADY SOLVED'); lcd('ALREADY SOLVED', ''); return; }
    log('SOLVING'); lcd('SOLVING...', 'cross');
    const solver = new S.Solver();
    const t0 = performance.now();
    let r;
    try { r = solver.solve(cube); } catch (e) { log('SOLVE FAILED ' + e.message); lcd('SOLVE FAILED', 'check cube'); return; }
    const calcMs = performance.now() - t0;
    const tb = document.querySelector('#stages tbody'); tb.innerHTML = '';
    for (const st of r.stages) {
      log(`${st.name} (${st.moves.length}): ${C.seqToString(st.moves)} | nodes=${st.nodes} ms=${st.ms.toFixed(1)}`);
      const est = st.nodes / AVR_NODES_PER_SEC;
      tb.insertAdjacentHTML('beforeend', `<tr><td>${st.name}</td><td class="num">${st.moves.length}</td><td class="mv">${C.seqToString(st.moves)}</td><td class="num">${st.nodes}</td><td class="num">${est < 0.05 ? '<0.1' : est.toFixed(1)} s</td></tr>`);
    }
    log(`TOTAL ${r.moves.length}: ${C.seqToString(r.moves)}`);
    log(`CALC nodes=${r.nodes} ms=${calcMs.toFixed(1)}`);
    document.getElementById('stMoves').textContent = r.moves.length;
    document.getElementById('stNodes').textContent = r.nodes.toLocaleString();
    document.getElementById('stTime').textContent = calcMs.toFixed(1);
    document.getElementById('estNote').textContent = `Uno 예상 = 노드 ÷ ${Math.round(AVR_NODES_PER_SEC).toLocaleString()} 노드/초 (Wokwi 시드 1 실측). 전체 ${(r.nodes / AVR_NODES_PER_SEC).toFixed(1)} s. UNO R4(48 MHz, 32bit)는 이보다 수 배 빠를 것으로 예상(실측 전).`;
    enqueue(r.moves, 'EXECUTING', () => {
      const ok = cube.isSolved();
      log(`SOLVED ok=${ok ? 1 : 0} moves=${r.moves.length} calc=${Math.round(calcMs)}ms exec=${Math.round(performance.now() - execStart)}ms`);
      lcd(ok ? 'SOLVED!' : 'MISMATCH', `${r.moves.length}mv`); setBusy(false);
    });
  }
  function doMoves(str) {
    let seq;
    try { seq = C.parseMoves(str); } catch (e) { log('ERR bad moves'); return; }
    if (!seq.length) return;
    enqueue(seq, 'MOVING', () => { log(`MOVED ${seq.length}`); lcd('CUBE ROBOT', cube.isSolved() ? 'solved' : 'scrambled'); setBusy(false); });
  }

  document.getElementById('btnScramble').onclick = () => { if (!busy()) doScramble(parseInt(document.getElementById('seed').value, 10) || 0); };
  document.getElementById('btnSolve').onclick = () => { if (!busy()) doSolve(); };
  document.getElementById('btnMoves').onclick = () => { if (!busy()) doMoves(document.getElementById('moves').value); };
  document.getElementById('moves').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !busy()) doMoves(e.target.value); });
  document.getElementById('btnReset').onclick = () => { if (busy()) return; cube.reset(); paint(cube); log('RESET'); lcd('CUBE ROBOT', 'reset'); allMoves = []; renderQueue(); };
  document.getElementById('btnPause').onclick = (e) => {
    paused = !paused; e.target.textContent = paused ? '계속' : '일시정지';
    if (current) {
      if (paused) current.elapsed = performance.now() - current.start;
      else current.start = performance.now() - (current.elapsed || 0);  // 숨김 탭 등으로 rAF 가 멈췄어도 이어서 진행
    }
    if (paused) lcd('PAUSED', `${moveIdx}/${allMoves.length}`); else if (allMoves.length) lcd(queueLabel, `${moveIdx}/${allMoves.length}`);
  };
  document.getElementById('btnView').onclick = () => { theta = 0.7; phi = 1.05; dist = 14; updateCamera(); };
  speedEl.oninput = () => { document.getElementById('speedVal').textContent = speedEl.value; };

  // 시작
  paint(cube); resize(); updateCamera();
  log('READY cube-robot v1 (S [seed] | V | M <moves> | P | R | Q 0|1)');
  requestAnimationFrame(animate);
  window.CubeSim = { cube, doScramble, doSolve, doMoves };  // 콘솔/테스트용
})();
