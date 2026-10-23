// sim/app.js — 3D 시뮬레이터 (V2 기구: 출력 큐브 + 엣지 핀 구동 헤드 6개 + 후퇴 캐리지).
// 펌웨어(main.ino)와 같은 명령(S/V/M/R)·같은 시리얼 출력·같은 LCD 문구로 동작하고,
// 기구 쪽은 tools/build_robot_v2.py 의 좌표계·치수(models/robot_v2/parameters.json)를 그대로 쓴다.
//  - 회전: 면 f 의 헤드 스핀들(판·핀·허브·축·커플링)이 그 층의 엣지 4개를 핀으로 밀어 돌린다.
//  - 지지: 회전할 면과 반대 면 두 헤드만 결합(핀 삽입 3 mm), 직교하는 네 헤드는 24 mm 후퇴.
//  - 축 전환: 새 축의 두 헤드를 먼저 결합한 뒤 기존 두 헤드를 해제한다(큐브가 지지되지 않는 순간 없음).
//    현재 V2 시제품의 이송은 수동 M5 나사이므로 아래 "이송 시간"은 자동화 목표값이지 실측이 아니다.
(function () {
  'use strict';
  const C = CubeLib, S = CubeSolver;
  const MODELS = (typeof CubeModels !== 'undefined') ? CubeModels : { params: {}, parts: {} };
  // CAD 매개변수 (models/robot_v2/parameters.json). 값이 없으면 V2 기본값.
  const P = Object.assign({ cube_mm: 57, piece_mm: 18.8, pitch_mm: 19.1, retract_mm: 24, pin_mm: 3, socket_mm: 3.4,
    socket_depth_mm: 4.2, pin_engagement_mm: 3, plate_thickness_mm: 6 }, MODELS.params || {});
  const UNIT = P.pitch_mm;                 // 1 단위 = 조각 중심 간격 = 19.1 mm
  const mm = (x) => x / UNIT;
  const HALF = mm(P.cube_mm / 2);          // 큐브 중심 → 면 거리 (28.5 mm): 헤드 배치용
  const SURF = mm(P.piece_mm / 2);         // 큐비 중심 → 그 면 거리 (9.4 mm): 스티커·소켓은 큐비(피치 위치)의 자식이므로 이 값을 쓴다
  const SCRAMBLE_LEN = 20;
  // 보드 속도 추정 근거: Wokwi(Uno, 16 MHz AVR) 시드 1 측정 — CALC nodes=108161 ms=4733 (Codex 최적화 후, 최적화 전 15613)
  const AVR_NODES_PER_SEC = 108161 / 4.733;
  const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const AXIS_NAMES = ['U/D', 'R/L', 'F/B'];

  // ---------- 3D 장면 ----------
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1216);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(6, 9, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-7, -4, -6); scene.add(fill);

  // 면 순서 U R F D L B. 바깥 법선, 그 면을 정면에서 볼 때 스티커 격자의 오른쪽/아래 방향
  const N = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  const RIGHT = [[1, 0, 0], [0, 0, -1], [1, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  const DOWN = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
  // 헤드 모듈의 국소 X축 (build_robot_v2.py FACES 의 xDir 과 동일 → 레일 방향이 CAD 조립과 같다)
  const HEAD_X = [[0, 0, -1], [0, -1, 0], [-1, 0, 0], [0, 0, -1], [0, -1, 0], [-1, 0, 0]];
  const COLORS = [0xf2f2f2, 0xd62828, 0x1b9e3f, 0xf7d308, 0xf77f00, 0x0057b8];
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // ----- 출력 큐브: 조각 18.8 mm, 피치 19.1 mm (간극 0.3 mm). 엣지의 노출면 2곳에 Ø3.4 구동 소켓, 센터에 M3 포켓 -----
  const cubeGroup = new THREE.Group(); scene.add(cubeGroup);
  const cubies = {};  // "x,y,z" → Group
  const cubieGeo = new THREE.BoxGeometry(mm(P.piece_mm), mm(P.piece_mm), mm(P.piece_mm));
  const cubieMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(cubieGeo, cubieMat));
    g.userData.home = [x, y, z];
    cubeGroup.add(g); cubies[`${x},${y},${z}`] = g;
  }
  const stickerGeo = new THREE.PlaneGeometry(mm(15.5), mm(15.5));
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.9 });
  const pocketMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.8 });
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.6 });
  const socketGeo = new THREE.CircleGeometry(mm(P.socket_mm / 2), 20);
  const socketWallGeo = new THREE.CylinderGeometry(mm(P.socket_mm / 2), mm(P.socket_mm / 2), mm(P.socket_depth_mm), 20, 1, true);
  const pocketGeo = new THREE.CircleGeometry(mm(3.5), 24);
  const screwGeo = new THREE.CircleGeometry(mm(2.7), 20);
  const stickers = [];  // 54개, 큐비의 자식
  for (let f = 0; f < 6; f++) for (let k = 0; k < 9; k++) {
    const r = (k / 3) | 0, c = k % 3;
    const pos = v3(N[f]).add(v3(RIGHT[f]).multiplyScalar(c - 1)).add(v3(DOWN[f]).multiplyScalar(r - 1));
    const owner = cubies[`${pos.x},${pos.y},${pos.z}`];
    const n = v3(N[f]);
    const m = new THREE.Mesh(stickerGeo, new THREE.MeshStandardMaterial({ color: COLORS[f], roughness: 0.35 }));
    m.position.copy(n.clone().multiplyScalar(SURF + mm(0.05)));
    m.lookAt(n.clone().multiplyScalar(4));
    owner.add(m); stickers.push(m);
    const zeros = pos.toArray().filter((v) => v === 0).length;
    if (zeros === 1) {  // 엣지: 노출면 중앙에 구동 소켓 (Ø3.4, 깊이 4.2)
      const hole = new THREE.Mesh(socketGeo, socketMat);
      hole.position.copy(n.clone().multiplyScalar(SURF + mm(0.1))); hole.lookAt(n.clone().multiplyScalar(4)); owner.add(hole);
      const wall = new THREE.Mesh(socketWallGeo, new THREE.MeshStandardMaterial({ color: 0x1a1d22, side: THREE.BackSide }));
      wall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      wall.position.copy(n.clone().multiplyScalar(SURF - mm(P.socket_depth_mm / 2))); owner.add(wall);
    } else if (zeros === 2) {  // 센터: Ø7 포켓 + M3 나사 머리
      const pocket = new THREE.Mesh(pocketGeo, pocketMat);
      pocket.position.copy(n.clone().multiplyScalar(SURF + mm(0.1))); pocket.lookAt(n.clone().multiplyScalar(4)); owner.add(pocket);
      const head = new THREE.Mesh(screwGeo, screwMat);
      head.position.copy(n.clone().multiplyScalar(SURF - mm(0.6))); head.lookAt(n.clone().multiplyScalar(4)); owner.add(head);
    }
  }
  function paint(cube) {
    const fc = cube.toFacelets();
    for (let i = 0; i < 54; i++) stickers[i].material.color.setHex(COLORS[fc[i]]);
  }

  // ----- STL (mm, base64) → BufferGeometry (단위: 피치). XY 중심·바닥 z=0 으로 저장된 출력 파일이므로 조립 오프셋을 더해 놓는다 -----
  function stlGeometry(b64, offset) {
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
        pos[i] = mm(dv.getFloat32(o, true) + offset[0]); pos[i + 1] = mm(dv.getFloat32(o + 4, true) + offset[1]); pos[i + 2] = mm(dv.getFloat32(o + 8, true) + offset[2]); o += 12;
        nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
      }
      o += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  }
  // 조립 좌표에서의 [XY 중심, 바닥 z] (mm) — tools/build_robot_v2.py head_parts() 의 생성 위치. 국소 z=0 이 큐브 면, +z 가 큐브 바깥.
  const HEAD = {
    drive_plate:       { offset: [0, 0, 0.8],      group: 'spin',     color: 0x34659a },   // 패드 0.8~5, 판 5~11
    shaft_hub:         { offset: [0, 0, 11],       group: 'spin',     color: 0x7998b8 },   // 11~28
    bearing_front_cap: { offset: [0, 0, 33],       group: 'carriage', color: 0xaab3bd },   // 33~35
    bearing_housing:   { offset: [0, -7.5, 35],    group: 'carriage', color: 0xaab3bd },   // 35~52 (y −32~17)
    bearing_rear_cap:  { offset: [0, 0, 52],       group: 'carriage', color: 0xaab3bd },   // 52~54
    carriage:          { offset: [0, -12.5, 32],   group: 'carriage', color: 0x7d8898 },   // 32~152 (y −51~26)
    rail_support:      { offset: [0, -44.5, 0],    group: 'frame',    color: 0x4a525f },   // 0~190 (y −57~−32)
  };
  const GEO = {};
  for (const k of Object.keys(HEAD)) if (MODELS.parts && MODELS.parts[k]) GEO[k] = stlGeometry(MODELS.parts[k].b64, HEAD[k].offset);
  const MAT = {};
  for (const k of Object.keys(HEAD)) MAT[k] = new THREE.MeshStandardMaterial({ color: HEAD[k].color, roughness: 0.6, metalness: 0.05 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xd65c47, roughness: 0.9 });
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7, metalness: 0.3 });
  const alumMat = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.45, metalness: 0.5 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.7 });
  // 국소 z 축 방향 원기둥 (지름 d, z0~z1 mm, 중심 x,y mm)
  function cylZ(d, z0, z1, mat, x = 0, y = 0, seg = 24) {
    const g = new THREE.CylinderGeometry(mm(d / 2), mm(d / 2), mm(z1 - z0), seg); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(mm(x), mm(y), mm((z0 + z1) / 2)); return m;
  }
  function boxAt(sx, sy, sz, cx, cy, cz, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mm(sx), mm(sy), mm(sz)), mat); m.position.set(mm(cx), mm(cy), mm(cz)); return m;
  }
  const pitch = P.pitch_mm;
  const PIN_XY = [[pitch, 0], [-pitch, 0], [0, pitch], [0, -pitch]];   // 엣지 소켓 위치 = 구동판 핀 위치
  const heads = [];   // 면별 { face, carriage, spin, retract(mm) }
  for (let f = 0; f < 6; f++) {
    const n = v3(N[f]), x = v3(HEAD_X[f]), y = n.clone().cross(x);   // CAD 와 같은 오른손 좌표계 (x, y, n)
    const face = new THREE.Group();
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    face.position.copy(n.clone().multiplyScalar(HALF));
    scene.add(face);
    // 프레임 고정부: 레일 지지판, MGN12 레일(12×8×180), M5 이송 나사
    const frame = new THREE.Group(); face.add(frame);
    if (GEO.rail_support) frame.add(new THREE.Mesh(GEO.rail_support, MAT.rail_support));
    frame.add(boxAt(12, 8, 180, 0, -47, 95, railMat));
    frame.add(cylZ(5, 135, 218, steelMat, 22, -44, 12));
    // 이송부(캐리지): 베어링 하우징·캡·캐리지·MGN12H 블록·추력 베어링·NEMA17. 국소 +z 로 retract 만큼 물러난다
    const carriage = new THREE.Group(); face.add(carriage);
    for (const k of ['bearing_housing', 'bearing_front_cap', 'bearing_rear_cap', 'carriage']) if (GEO[k]) carriage.add(new THREE.Mesh(GEO[k], MAT[k]));
    carriage.add(boxAt(27, 4.9, 45.4, 0, -40.45, 84, alumMat));                 // MGN12H 블록 윗판 (y −42.9~−38)
    for (const bx of [-9.85, 9.85]) carriage.add(boxAt(7.3, 6.1, 45.4, bx, -45.95, 84, alumMat));   // 블록 다리 2개 (레일 홈 12.4 폭 양옆)
    carriage.add(cylZ(16, 28, 33, steelMat));                                   // F8-16M 추력 베어링
    const motor = new THREE.Group(); carriage.add(motor);
    motor.add(boxAt(42.3, 42.3, 40, 0, 0, 124, motorMat));                      // NEMA17 몸통 104~144
    motor.add(cylZ(22, 102, 104, alumMat));                                     // 센터링 보스
    motor.add(boxAt(10, 10, 1, 0, 0, 144.6, new THREE.MeshStandardMaterial({ color: COLORS[f] })));  // 뒷면 면 색 표시
    // 회전부(스핀들): 구동판 + 핀 4 + 패드 4 + 허브 + 8 mm 축 + 5→8 커플링 + 모터 축. 면과 함께 돈다
    const spin = new THREE.Group(); carriage.add(spin);
    if (GEO.drive_plate) spin.add(new THREE.Mesh(GEO.drive_plate, MAT.drive_plate));
    if (GEO.shaft_hub) spin.add(new THREE.Mesh(GEO.shaft_hub, MAT.shaft_hub));
    for (const [px, py] of PIN_XY) spin.add(cylZ(P.pin_mm, -P.pin_engagement_mm, 13, steelMat, px, py, 12));   // Ø3×16 핀: −3(소켓 안)~13
    for (const sx of [-pitch, pitch]) for (const sy of [-pitch, pitch]) spin.add(boxAt(8, 8, 0.8, sx, sy, 0.4, padMat));  // 모서리 패드
    spin.add(cylZ(8, 16, 83, steelMat));                                        // 8 mm 축
    spin.add(cylZ(19, 70, 95, alumMat));                                        // 5→8 커플링
    spin.add(cylZ(5, 84, 104, steelMat, 0, 0, 12));                             // 모터 축
    heads.push({ face, frame, carriage, motor, spin, retract: 0, angle: 0 });
  }
  function setRetract(f, d) { heads[f].retract = d; heads[f].carriage.position.z = mm(d); }

  // ---------- 카메라 조작 ----------
  const VIEW_ALL = { theta: 0.7, phi: 1.05, dist: 46 }, VIEW_CUBE = { theta: 0.7, phi: 1.0, dist: 13 };
  let theta = VIEW_ALL.theta, phi = VIEW_ALL.phi, dist = VIEW_ALL.dist;
  function updateCamera() {
    camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(0, 0, 0);
  }
  function setView(v) { theta = v.theta; phi = v.phi; dist = v.dist; updateCamera(); }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = 'grab'; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    theta -= (e.clientX - drag.x) * 0.008; phi = Math.min(2.9, Math.max(0.25, phi - (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY }; updateCamera();
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.min(90, Math.max(4, dist * (e.deltaY > 0 ? 1.08 : 0.92))); updateCamera(); }, { passive: false });
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ---------- 동작 큐: 회전(move) 과 헤드 이송(feed) ----------
  const cube = new C.Cube();
  const pivot = new THREE.Group(); scene.add(pivot);
  const queue = [];       // 대기 중인 회전 {m, label}
  let current = null;     // 진행 중 동작: {type:'move', ...} | {type:'feed', ...}
  let paused = false;
  let allMoves = [], moveIdx = 0, queueLabel = '', onQueueDone = null, execStart = 0;
  let gripAxis = 2;       // 결합된 축 0=U/D 1=R/L 2=F/B. CAD 조립(robot_assembly.step)과 같이 F/B 결합에서 시작
  let regrips = 0;        // 이번 수열에서의 축 전환 횟수
  const speedEl = document.getElementById('speed'), feedEl = document.getElementById('feed');
  for (let f = 0; f < 6; f++) setRetract(f, f % 3 === gripAxis ? 0 : P.retract_mm);

  function startFeed(faces, from, to, then) {
    current = { type: 'feed', faces, from, to, then, start: performance.now(), dur: +feedEl.value };
    renderHeads(faces);
  }
  function startMove(item) {
    const f = (item.m / 3) | 0, k = item.m % 3;
    const turns = k === 2 ? -1 : k + 1;   // U=+1(시계 90°), U2=+2, U'=-1(반시계 90°, 모터도 반대로 50스텝)
    const n = v3(N[f]);
    const members = [];
    for (const g of Object.values(cubies)) {
      const h = g.userData.home;
      if (h[0] * n.x + h[1] * n.y + h[2] * n.z === 1) members.push(g);
    }
    pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld();
    for (const o of members) pivot.attach(o);
    current = { type: 'move', ...item, f, start: performance.now(), dur: Math.abs(turns) * +speedEl.value, members, axis: n, angle: -turns * Math.PI / 2 };
    renderQueue(); renderHeads();
  }
  // 다음 동작 선택: 다음 회전의 축이 결합 축과 다르면 [새 축 결합 → 기존 축 해제] 를 먼저 끼워 넣는다
  function startNext() {
    const item = queue[0];
    const axis = ((item.m / 3) | 0) % 3;
    if (axis !== gripAxis) {
      const incoming = [axis, axis + 3], outgoing = [gripAxis, gripAxis + 3];
      if (heads[axis].retract > 0) return startFeed(incoming, P.retract_mm, 0, null);
      return startFeed(outgoing, 0, P.retract_mm, () => { gripAxis = axis; regrips++; });
    }
    queue.shift(); startMove(item);
  }
  function finishMove() {
    pivot.setRotationFromAxisAngle(current.axis, current.angle);
    pivot.updateMatrixWorld();
    for (const o of current.members) {
      cubeGroup.attach(o); o.position.set(...o.userData.home); o.rotation.set(0, 0, 0);
    }
    const h = heads[current.f]; h.angle += current.angle; h.spin.rotation.z = h.angle;   // 누적 각도 유지 (허브 세트스크류 보스가 90° 대칭이 아니라 되돌리면 튄다)
    cube.move(current.m); paint(cube);
    moveIdx++;
    if (moveIdx % 4 === 0 || moveIdx === allMoves.length) lcd(queueLabel, `${moveIdx}/${allMoves.length}`);
    current = null;
    renderQueue(); renderHeads();
    if (!queue.length && onQueueDone) { const cb = onQueueDone; onQueueDone = null; cb(); }
  }
  function finishFeed() {
    for (const f of current.faces) setRetract(f, current.to);
    const then = current.then; current = null;
    if (then) then();
    renderHeads();
  }
  function enqueue(moves, label, done) {
    allMoves = moves.slice(); moveIdx = 0; queueLabel = label; onQueueDone = done; execStart = performance.now(); regrips = 0;
    for (const m of moves) queue.push({ m, label });
    lcd(label, `0/${moves.length}`); renderQueue(); renderHeads();
    setBusy(true);
  }
  function animate(now) {
    requestAnimationFrame(animate);
    if (!current && queue.length && !paused) startNext();
    if (current && !paused) {  // 일시정지 중에는 start 를 건드리지 않는다 (재개 시 버튼 핸들러가 보정)
      const t = current.dur > 0 ? Math.min(1, (now - current.start) / current.dur) : 1;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (current.type === 'move') {
        pivot.setRotationFromAxisAngle(current.axis, current.angle * ease);
        heads[current.f].spin.rotation.z = heads[current.f].angle + current.angle * ease;   // 헤드 국소 z = 면 법선 → 층과 같은 각도
        if (t >= 1) finishMove();
      } else {
        const d = current.from + (current.to - current.from) * ease;
        for (const f of current.faces) heads[f].carriage.position.z = mm(d);
        if (t >= 1) finishFeed();
      }
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
  // 헤드 상태 칩 6개 + 요약 문장. moving = 지금 이송 중인 면
  function renderHeads(moving = []) {
    const chips = document.getElementById('heads');
    chips.innerHTML = FACE_NAMES.map((name, f) => {
      const turning = current && current.type === 'move' && current.f === f;
      const cls = turning ? 'turn' : moving.includes(f) ? 'feed' : heads[f].retract === 0 ? 'in' : 'out';
      return `<span class="chip ${cls}" title="${name}: ${heads[f].retract === 0 ? '핀 삽입 3 mm' : `후퇴 ${heads[f].retract} mm`}">${name}<small>${turning ? '회전' : moving.includes(f) ? '이송' : heads[f].retract === 0 ? '결합' : `−${heads[f].retract}`}</small></span>`;
    }).join('');
    let text;
    if (current && current.type === 'feed') text = `축 전환: ${AXIS_NAMES[current.faces[0] % 3]} ${current.to === 0 ? '결합 중 (핀 삽입)' : '해제 중 (24 mm 후퇴)'}`;
    else if (current && current.type === 'move') text = `${FACE_NAMES[current.f]} 회전 — ${AXIS_NAMES[gripAxis]} 결합, 나머지 네 헤드 후퇴`;
    else text = `${AXIS_NAMES[gripAxis]} 결합 대기`;
    document.getElementById('headText').textContent = `${text} · 축 전환 ${regrips}회`;
  }
  function setBusy(b) { for (const id of ['btnScramble', 'btnSolve', 'btnMoves', 'btnReset']) document.getElementById(id).disabled = b; }
  const busy = () => !!current || queue.length > 0;
  // 수열의 축 전환 횟수(결합 축 기준, 시작 축 from)
  function countRegrips(moves, from) {
    let axis = from, n = 0;
    for (const m of moves) { const a = ((m / 3) | 0) % 3; if (a !== axis) { axis = a; n++; } }
    return n;
  }

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
    const nRegrip = countRegrips(r.moves, gripAxis);
    const quarterTurns = r.moves.reduce((s, m) => s + (m % 3 === 1 ? 2 : 1), 0);
    document.getElementById('stMoves').textContent = r.moves.length;
    document.getElementById('stNodes').textContent = r.nodes.toLocaleString();
    document.getElementById('stTime').textContent = calcMs.toFixed(1);
    document.getElementById('stRegrip').textContent = nRegrip;
    document.getElementById('estNote').textContent = `Uno 예상 = 노드 ÷ ${Math.round(AVR_NODES_PER_SEC).toLocaleString()} 노드/초 (Wokwi 시드 1 실측). 전체 ${(r.nodes / AVR_NODES_PER_SEC).toFixed(1)} s. UNO R4(48 MHz, 32bit)는 이보다 수 배 빠를 것으로 예상(실측 전). `
      + `기구 실행 예상 = 90° ${quarterTurns}회 × ${speedEl.value} ms + 축 전환 ${nRegrip}회 × 2 × ${feedEl.value} ms ≈ ${((quarterTurns * +speedEl.value + nRegrip * 2 * +feedEl.value) / 1000).toFixed(1)} s (이송은 자동화 목표값, 현재 시제품은 수동 M5 이송).`;
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
  document.getElementById('btnView').onclick = () => setView(VIEW_ALL);
  document.getElementById('btnViewCube').onclick = () => setView(VIEW_CUBE);
  speedEl.oninput = () => { document.getElementById('speedVal').textContent = speedEl.value; };
  feedEl.oninput = () => { document.getElementById('feedVal').textContent = feedEl.value; };
  const chkFrame = document.getElementById('chkFrame'), chkMotor = document.getElementById('chkMotor');
  function applyVisibility() {
    for (const h of heads) {
      h.frame.visible = chkFrame.checked;
      for (const o of h.carriage.children) if (o !== h.spin && o !== h.motor) o.visible = chkFrame.checked;   // 하우징·캡·캐리지·블록·추력베어링
      h.motor.visible = chkMotor.checked;
    }
  }
  chkFrame.onchange = chkMotor.onchange = applyVisibility;

  // 시작
  paint(cube); resize(); updateCamera(); applyVisibility(); renderHeads();
  log('READY cube-robot v1 (S [seed] | V | M <moves> | P | R | Q 0|1)');
  requestAnimationFrame(animate);
  window.CubeSim = { cube, doScramble, doSolve, doMoves, heads: () => ({ gripAxis, regrips, retract: heads.map((h) => h.retract) }), params: P };  // 콘솔/테스트용
})();
