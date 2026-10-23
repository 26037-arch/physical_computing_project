// sim/app.js — 3D 시뮬레이터 (V4 기구: 도넛 큐브 + 측면 2핀 헤드 4개 + 아래 D 헤드(중공축·벨트) + 잠금 막대, 서보 크랭크 이송, 뒤집기).
// 펌웨어(main.ino)와 같은 명령(S/V/M/L/E/F/R)·같은 시리얼 출력 줄·같은 LCD 문구로 동작하고,
// 기구 절차는 sim/mechanism.js(= firmware/main/mechanism.cpp)가 정한다. 치수·좌표는 docs/HARDWARE_V4.md 2절
// (= tools/build_robot_v4.py, models/robot_v4/parameters.json) 을 그대로 쓴다.
//  - 회전: 물리 면 p 의 헤드 스핀들(판·핀 2·허브·축)이 엣지 2개를 핀으로 밀어 그 층을 돌린다 (측면: 적도 엣지, D: DF/DB).
//  - 지지: 회전할 면의 쌍(F/B 또는 R/L)만 결합(핀 삽입 3 mm). 다른 쌍과 D 헤드는 24 mm 후퇴. D 회전은 D 헤드 결합.
//  - 잠금 막대: 아래에서 중공 D 축을 지나 큐브 중심 센터 판 소켓까지 올라와 코어를 잡는다(V3 중앙축 대신). 뒤집기 때만 30 mm 내려간다.
//  - 뒤집기: 위(U)에는 헤드가 없다. 논리 면이 위에 오면 R/L 만 결합한 채 두 헤드가 같은 방향으로 180° 돌아 큐브를 뒤집는다.
//  - 장착: 위가 열려 있다. D 헤드가 결합 위치로 올라오면 큐브를 손으로 핀 위에 올려놓고(흰색 아래) LOAD → 막대·F/B 가 잡는다.
(function () {
  'use strict';
  const C = CubeLib, S = CubeSolver, MECH = CubeMechanism;
  const MODELS = (typeof CubeModels !== 'undefined') ? CubeModels : { params: {}, parts: {} };
  // CAD 매개변수 (models/robot_v4/parameters.json). 값이 없으면 docs/HARDWARE_V4.md 의 기본값.
  const P = Object.assign({ cube_mm: 57, piece_mm: 18.8, pitch_mm: 19.1, retract_mm: 24, pin_mm: 3, socket_mm: 3.4,
    socket_depth_mm: 4.2, pin_engagement_mm: 3, plate_thickness_mm: 6, recess_depth_mm: 8, lock_bar_mm: 8, lock_socket_mm: 8.4,
    lock_stroke_mm: 30, lock_crank_r_mm: 15, crank_r_mm: 12, link_mm: 36, servo_axis: [22, -44, 195], hollow_id_mm: 12, hollow_od_mm: 17,
    motor_offset_mm: 60 }, MODELS.params || {});
  const UNIT = P.pitch_mm;                 // 1 단위 = 조각 중심 간격 = 19.1 mm
  const mm = (x) => x / UNIT;
  const HALF = mm(P.cube_mm / 2);          // 큐브 중심 → 면 거리 (28.5 mm): 헤드 배치용
  const SURF = mm(P.piece_mm / 2);         // 큐비 중심 → 그 면 거리 (9.4 mm)
  const SCRAMBLE_LEN = 20;
  // 보드 속도 추정 근거: Wokwi(Uno, 16 MHz AVR) 시드 1 측정 — CALC nodes=108161 ms=4733
  const AVR_NODES_PER_SEC = 108161 / 4.733;
  const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const SIDE = [2, 1, 5, 4];               // 물리 측면 헤드 F R B L (표시 순서)
  const DF = 3;                            // 아래 D 헤드 = 물리 D

  // ---------- 3D 장면 ----------
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1216);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.85));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8); keyLight.position.set(6, 9, 7); scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-7, -4, -6); scene.add(fill);

  // 면 순서 U R F D L B. 바깥 법선, 그 면을 정면에서 볼 때 스티커 격자의 오른쪽/아래 방향
  const N = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  const RIGHT = [[1, 0, 0], [0, 0, -1], [1, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  const DOWN = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
  // 헤드 모듈의 국소 X축 (HARDWARE_V4.md 2.1 FACES_V4 xDir): 측면은 모두 월드 +y(위), D 는 +x (핀 → DF/DB, 레일 → −z)
  const HEAD_X = [null, [0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0]];
  const COLORS = [0xf2f2f2, 0xd62828, 0x1b9e3f, 0xf7d308, 0xf77f00, 0x0057b8];
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // ----- 도넛 큐브: 조각 18.8 mm, 피치 19.1 mm. 엣지 노출면 2곳에 Ø3.4 소켓, U/D 센터는 8 mm 파인 판(사각 소켓 8.4) -----
  const cubeGroup = new THREE.Group(); scene.add(cubeGroup);
  const cubies = {};  // "x,y,z" → Group (논리 위치)
  const cubieGeo = new THREE.BoxGeometry(mm(P.piece_mm), mm(P.piece_mm), mm(P.piece_mm));
  const recessGeo = new THREE.BoxGeometry(mm(P.piece_mm), mm(P.piece_mm - P.recess_depth_mm), mm(P.piece_mm));
  const cubieMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const recessed = !x && !z;                              // U/D 센터: 바깥쪽 8 mm 가 비어 소켓 칸(도넛 구멍)이 된다
    const body = new THREE.Mesh(recessed ? recessGeo : cubieGeo, cubieMat);
    if (recessed) body.position.y = -y * mm(P.recess_depth_mm / 2);
    g.add(body);
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
  const lockSocketGeo = new THREE.PlaneGeometry(mm(P.lock_socket_mm), mm(P.lock_socket_mm));
  const stickers = [];  // 54개, 큐비의 자식
  for (let f = 0; f < 6; f++) for (let k = 0; k < 9; k++) {
    const r = (k / 3) | 0, c = k % 3;
    const pos = v3(N[f]).add(v3(RIGHT[f]).multiplyScalar(c - 1)).add(v3(DOWN[f]).multiplyScalar(r - 1));
    const owner = cubies[`${pos.x},${pos.y},${pos.z}`];
    const n = v3(N[f]);
    const zeros = pos.toArray().filter((v) => v === 0).length;
    const recessed = zeros === 2 && (f === 0 || f === 3);
    const depth = recessed ? mm(P.recess_depth_mm) : 0;
    const m = new THREE.Mesh(stickerGeo, new THREE.MeshStandardMaterial({ color: COLORS[f], roughness: 0.35 }));
    m.position.copy(n.clone().multiplyScalar(SURF - depth + mm(0.05)));
    m.lookAt(n.clone().multiplyScalar(4));
    owner.add(m); stickers.push(m);
    if (zeros === 1) {  // 엣지: 노출면 중앙에 구동 소켓 (Ø3.4, 깊이 4.2)
      const hole = new THREE.Mesh(socketGeo, socketMat);
      hole.position.copy(n.clone().multiplyScalar(SURF + mm(0.1))); hole.lookAt(n.clone().multiplyScalar(4)); owner.add(hole);
      const wall = new THREE.Mesh(socketWallGeo, new THREE.MeshStandardMaterial({ color: 0x1a1d22, side: THREE.BackSide }));
      wall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      wall.position.copy(n.clone().multiplyScalar(SURF - mm(P.socket_depth_mm / 2))); owner.add(wall);
    } else if (recessed) {  // U/D 센터 판: 잠금 막대용 사각 소켓 8.4
      const sq = new THREE.Mesh(lockSocketGeo, socketMat);
      sq.position.copy(n.clone().multiplyScalar(SURF - depth + mm(0.1))); sq.lookAt(n.clone().multiplyScalar(4)); owner.add(sq);
    } else if (zeros === 2) {  // 측면 센터: Ø7 포켓 + M3 나사 머리
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
  // 조립 좌표에서의 [XY 중심, 바닥 z] (mm). parameters.json 의 print_offsets 가 있으면 그것을, 없으면 V2 head_parts() 값을 쓴다.
  const HEAD = {
    drive_plate_2pin:  { offset: [0, 0, 0.8],      color: 0x34659a },
    shaft_hub:         { offset: [0, 0, 11],       color: 0x7998b8 },
    bearing_front_cap: { offset: [0, 0, 33],       color: 0xaab3bd },
    bearing_housing:   { offset: [0, -7.5, 35],    color: 0xaab3bd },
    bearing_rear_cap:  { offset: [0, 0, 52],       color: 0xaab3bd },
    carriage:          { offset: [0, -12.5, 32],   color: 0x7d8898 },
    rail_support:      { offset: [0, -44.5, 0],    color: 0x4a525f },
    servo_mount:       { offset: [22, -44, 175],   color: 0x4a525f },
  };
  const OFF = P.print_offsets || {};
  const GEO = {};
  for (const k of Object.keys(HEAD)) if (MODELS.parts && MODELS.parts[k]) GEO[k] = stlGeometry(MODELS.parts[k].b64, OFF[k] || HEAD[k].offset);
  const MAT = {};
  for (const k of Object.keys(HEAD)) MAT[k] = new THREE.MeshStandardMaterial({ color: HEAD[k].color, roughness: 0.6, metalness: 0.05 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xd65c47, roughness: 0.9 });
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7, metalness: 0.3 });
  const servoMat = new THREE.MeshStandardMaterial({ color: 0x2f3a4a, roughness: 0.7 });
  const alumMat = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.45, metalness: 0.5 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.7 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const lockMat = new THREE.MeshStandardMaterial({ color: 0xc34a35, roughness: 0.4, metalness: 0.5 });
  // 국소 z 축 방향 원기둥 (지름 d, z0~z1 mm, 중심 x,y mm)
  function cylZ(d, z0, z1, mat, x = 0, y = 0, seg = 24) {
    const g = new THREE.CylinderGeometry(mm(d / 2), mm(d / 2), mm(z1 - z0), seg); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(mm(x), mm(y), mm((z0 + z1) / 2)); return m;
  }
  // 국소 x 축 방향 원기둥 (풀리·서보 축)
  function cylX(d, x0, x1, mat, y, z, seg = 24) {
    const g = new THREE.CylinderGeometry(mm(d / 2), mm(d / 2), mm(x1 - x0), seg); g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(mm((x0 + x1) / 2), mm(y), mm(z)); return m;
  }
  function boxAt(sx, sy, sz, cx, cy, cz, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mm(sx), mm(sy), mm(sz)), mat); m.position.set(mm(cx), mm(cy), mm(cz)); return m;
  }
  // parameters.json 의 구매품 외형({size, center})이 있으면 그 자리에, 없으면 기본 자리에 상자를 그린다
  const PUR = P.purchased || {};
  function envelope(name, size, center, mat) {
    const e = PUR[name]; const s = e ? e.size : size, c = e ? e.center : center;
    return boxAt(s[0], s[1], s[2], c[0], c[1], c[2], mat);
  }
  const pitch = P.pitch_mm;
  const PIN_XY = (P.pin_positions || [[0, pitch], [0, -pitch]]);   // 엣지 소켓 위치 = 구동판 핀 위치 (국소)
  const SA = P.servo_axis, LK = P.link_mm;
  // 서보 크랭크: 축(국소 x 방향, axis 위치) → 크랭크 r → 링크 LK → 캐리지 러그(x=axis.x, y=axis.y, z=lugZ+d).
  // θ=0 (크랭크가 −z, 큐브 쪽) 결합 d=0, θ=π 후퇴 d=2r. 캐리지 그룹을 국소 z 로 d 만큼 옮긴다.
  function makeCrank(parent, axis, r, lugZ, carriageGroup) {
    parent.add(envelope('servo_MG996R', [42.9, 19.7, 40.7], [axis[0] - 25.5, axis[1], axis[2] + 10.3], servoMat));
    parent.add(cylX(6, axis[0] - 4, axis[0] + 2, alumMat, axis[1], axis[2]));          // 서보 출력축
    const crank = new THREE.Group(); crank.position.set(mm(axis[0]), mm(axis[1]), mm(axis[2])); parent.add(crank);
    crank.add(boxAt(4, 6, r + 4, 0, 0, -r / 2, alumMat));                                 // 크랭크 암
    const link = boxAt(4, 4, LK, 0, 0, 0, steelMat); parent.add(link);
    const obj = { theta: 0, shift: 0, crank, link };
    obj.set = (theta) => {
      obj.theta = theta; crank.rotation.x = theta;
      const yp = r * Math.sin(theta), zp = axis[2] - r * Math.cos(theta);
      const d = zp - Math.sqrt(LK * LK - yp * yp) - lugZ;
      obj.shift = d; carriageGroup.position.z = mm(d);
      const pin = new THREE.Vector3(mm(axis[0]), mm(axis[1] + yp), mm(zp));
      const lug = new THREE.Vector3(mm(axis[0]), mm(axis[1]), mm(lugZ + d));
      link.position.copy(pin.clone().add(lug).multiplyScalar(0.5));
      link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lug.clone().sub(pin).normalize());
    };
    return obj;
  }
  const heads = {};   // 물리 면 → { p, face, frame, carriage, motor, spin, angle, crank }
  function buildHead(p) {
    const n = v3(N[p]), x = v3(HEAD_X[p]), y = n.clone().cross(x);   // CAD 와 같은 오른손 좌표계 (x, y, n)
    const hollow = p === DF;                                           // D: 중공축 + 비킨 모터 + 벨트 (잠금 막대 통과)
    const face = new THREE.Group();
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    face.position.copy(n.clone().multiplyScalar(HALF));
    scene.add(face);
    // 프레임 고정부: 레일 지지판, MGN12 레일(12×8×180), 서보 마운트, 결합 스위치
    const frame = new THREE.Group(); face.add(frame);
    if (GEO.rail_support) frame.add(new THREE.Mesh(GEO.rail_support, MAT.rail_support));
    else frame.add(boxAt(60, 6, 190, 0, -54, 95, MAT.rail_support));
    frame.add(boxAt(12, 8, 180, 0, -47, 95, railMat));
    if (GEO.servo_mount) frame.add(new THREE.Mesh(GEO.servo_mount, MAT.servo_mount));
    frame.add(envelope('engage_switch', [12.8, 6.5, 5.8], [-10, -48, 150], servoMat));
    // 이송부(캐리지): 하우징·캡·캐리지·MGN12H 블록·추력 베어링·모터. 크랭크가 국소 +z 로 밀어낸다
    const carriage = new THREE.Group(); face.add(carriage);
    for (const k of ['bearing_housing', 'bearing_front_cap', 'bearing_rear_cap', 'carriage']) if (!hollow && GEO[k]) carriage.add(new THREE.Mesh(GEO[k], MAT[k]));
    if (hollow || !GEO.carriage) { carriage.add(boxAt(60, 6, 120, 0, -35, 92, MAT.carriage)); carriage.add(boxAt(hollow ? 116 : 60, 58, 6, hollow ? 28 : 0, -3, 101, MAT.carriage)); carriage.add(boxAt(12, 19, 10, 22, -41.5, 147, MAT.carriage)); }
    if (hollow || !GEO.bearing_housing) { carriage.add(boxAt(34, 34, hollow ? 19 : 17, 0, 0, hollow ? 44.5 : 43.5, MAT.bearing_housing)); carriage.add(boxAt(60, 6, 17, 0, -29, 43.5, MAT.bearing_housing)); }
    carriage.add(boxAt(27, 4.9, 45.4, 0, -40.45, 84, alumMat));                 // MGN12H 블록 윗판
    for (const bx of [-9.85, 9.85]) carriage.add(boxAt(7.3, 6.1, 45.4, bx, -45.95, 84, alumMat));
    const motor = new THREE.Group(); carriage.add(motor);
    const mx = hollow ? P.motor_offset_mm : 0;
    motor.add(boxAt(42.3, 42.3, 40, mx, 0, 124, motorMat));                     // NEMA17 몸통 104~144 (D 는 x +60 으로 비킴)
    motor.add(cylZ(22, 102, 104, alumMat, mx, 0));
    motor.add(boxAt(10, 10, 1, mx, 0, 144.6, new THREE.MeshStandardMaterial({ color: COLORS[p] })));
    if (hollow) {
      motor.add(cylZ(5, 84, 104, steelMat, mx, 0, 12));                         // 비킨 모터 축
      motor.add(cylZ(28, 76, 84, alumMat, mx, 0)); motor.add(cylZ(20, 84, 94, alumMat, mx, 0));   // 40T 구동 풀리
      motor.add(boxAt(mx, 2, 6, mx / 2, 13.5, 80, beltMat)); motor.add(boxAt(mx, 2, 6, mx / 2, -13.5, 80, beltMat));   // 벨트 2가닥
    }
    // 회전부(스핀들): 구동판 + 핀 2 + 패드 4 + 허브 + 축(측면: Ø8 + 커플링, D: 중공 OD17/ID12 + 40T 종동 풀리)
    const spin = new THREE.Group(); carriage.add(spin);
    if (GEO.drive_plate_2pin) spin.add(new THREE.Mesh(GEO.drive_plate_2pin, MAT.drive_plate_2pin));
    else { spin.add(boxAt(50, 50, 6, 0, 0, 8, MAT.drive_plate_2pin)); }
    for (const [px, py] of PIN_XY) spin.add(cylZ(P.pin_mm, -P.pin_engagement_mm, 13, steelMat, px, py, 12));   // Ø3×16 핀 2개
    for (const sx of [-pitch, pitch]) for (const sy of [-pitch, pitch]) spin.add(boxAt(8, 8, 0.8, sx, sy, 0.4, padMat));
    if (GEO.shaft_hub) spin.add(new THREE.Mesh(GEO.shaft_hub, MAT.shaft_hub));
    else { spin.add(boxAt(32, 32, 5, 0, 0, 13.5, MAT.shaft_hub)); spin.add(cylZ(24, 16, 28, MAT.shaft_hub)); }
    if (hollow) {
      spin.add(cylZ(P.hollow_od_mm, 16, 98, steelMat));                         // 중공 회전축 (안 Ø12 로 막대 통과)
      spin.add(cylZ(28, 76, 84, alumMat)); spin.add(cylZ(20, 84, 94, alumMat)); // 40T 종동 풀리
    } else {
      spin.add(cylZ(8, 16, 83, steelMat));                                      // 8 mm 축
      spin.add(cylZ(19, 70, 95, alumMat));                                      // 5→8 커플링
      spin.add(cylZ(5, 84, 104, steelMat, 0, 0, 12));                           // 모터 축
    }
    const h = { p, face, frame, carriage, motor, spin, angle: 0 };
    h.crank = makeCrank(frame, SA, P.crank_r_mm, 147, carriage);
    heads[p] = h;
    return h;
  }
  for (const p of SIDE) buildHead(p);
  buildHead(DF);
  // ----- 잠금 막대 유닛: D 모듈 아래, y 축. 막대 8×8 이 중공축을 지나 센터 판 소켓(끝 y −17.5)까지. 뒤집기 때 30 mm 내려간다 -----
  const lock = (() => {
    const n = v3(N[DF]), x = v3([1, 0, 0]), y = n.clone().cross(x);
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    g.position.copy(n.clone().multiplyScalar(HALF));
    scene.add(g);
    const frame = new THREE.Group(); g.add(frame);
    frame.add(boxAt(30, 30, 30, 0, 0, 175, MAT.rail_support));                   // 출력 가이드 블록 (사각 구멍 8.3)
    frame.add(boxAt(8, 30, 60, 0, -22, 240, MAT.rail_support));                  // 서보 받침
    const carriage = new THREE.Group(); g.add(carriage);
    carriage.add(boxAt(P.lock_bar_mm, P.lock_bar_mm, 230, 0, 0, 104, lockMat));  // 막대: 국소 z −11(소켓 바닥) ~ 219
    carriage.add(boxAt(24, 24, 20, 0, 0, 214, MAT.carriage));                    // 막대 캐리지
    carriage.add(boxAt(12, 19, 10, 22, 0, 204, MAT.carriage));                   // 링크 러그
    const crank = makeCrank(frame, [22, 0, 255], P.lock_crank_r_mm, 204, carriage);
    return { group: g, frame, carriage, crank };
  })();
  // 유닛 번호(mechanism.js) → 크랭크 목록
  const UNIT_CRANKS = [[heads[2].crank, heads[5].crank], [heads[1].crank, heads[4].crank], [heads[DF].crank], [lock.crank]];
  const UNIT_LABEL = ['F/B', 'R/L', 'D', 'LOCK'];

  // ---------- 카메라 조작 ----------
  const VIEW_ALL = { theta: 0.7, phi: 1.05, dist: 46 }, VIEW_CUBE = { theta: 0.7, phi: 1.0, dist: 13 };
  let theta = VIEW_ALL.theta, phi = VIEW_ALL.phi, dist = VIEW_ALL.dist;
  function updateCamera() {
    camera.position.set(dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(0, 0.5, 0);
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

  // ---------- 동작 큐: 수열 → 기구 절차(mechanism.js) → 애니메이션 ----------
  const cube = new C.Cube();
  const mech = new MECH.Mechanism();
  const pivot = new THREE.Group(); scene.add(pivot);
  const queue = [];       // 대기 중인 논리 수 {m}
  let actions = [];       // 지금 수의 남은 기구 동작
  let current = null;     // 진행 중 애니메이션
  let paused = false;
  let allMoves = [], moveIdx = 0, queueLabel = '', onQueueDone = null, execStart = 0;
  const speedEl = document.getElementById('speed'), feedEl = document.getElementById('feed');
  // 시작 상태 = 펌웨어의 장착 완료 상태: 큐브 장착(흰색 아래, orient 1), D·막대·F/B 결합, R/L 후퇴
  mech.load(); mech.load(); mech.resetCounters();
  for (let u = 0; u < 4; u++) for (const c of UNIT_CRANKS[u]) c.set(mech.engaged[u] ? 0 : Math.PI);
  cubeGroup.rotation.x = Math.PI;        // orient 1: 논리 U(흰색)가 아래

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function startAction(a) {
    if (a.line) log(a.line);
    if (a.type === 'engage' || a.type === 'retract') {
      const cranks = UNIT_CRANKS[a.unit];
      current = { type: 'crank', unit: a.unit, cranks, from: cranks[0].theta, to: a.type === 'engage' ? 0 : Math.PI, start: performance.now(), dur: +feedEl.value };
    } else if (a.type === 'flip') {
      current = { type: 'flip', from: cubeGroup.rotation.x, start: performance.now(), dur: 2 * +speedEl.value + 200, r0: heads[1].angle, l0: heads[4].angle };
    } else if (a.type === 'turn') {
      startMove(a);
    } else current = { type: 'noop', start: performance.now(), dur: 0 };
    renderHeads();
  }
  function startMove(a) {
    const f = (a.m / 3) | 0, k = a.m % 3, p = a.face;
    const turns = k === 2 ? -1 : k + 1;   // U=+1(시계 90°), U2=+2, U'=-1(반시계 90°)
    const nLogical = v3(N[f]);
    const members = [];
    for (const g of Object.values(cubies)) {
      const h = g.userData.home;
      if (h[0] * nLogical.x + h[1] * nLogical.y + h[2] * nLogical.z === 1) members.push(g);
    }
    pivot.rotation.set(0, 0, 0); pivot.updateMatrixWorld();
    for (const o of members) pivot.attach(o);
    const axis = nLogical.clone().applyQuaternion(cubeGroup.quaternion);   // 뒤집힌 큐브면 물리 면 법선이 된다
    current = { type: 'move', m: a.m, f, p, start: performance.now(), dur: Math.abs(turns) * +speedEl.value, members, axis, angle: -turns * Math.PI / 2 };
    renderQueue();
  }
  function startNext() {
    if (!actions.length) { const item = queue.shift(); actions = mech.plan(item.m); }
    startAction(actions.shift());
  }
  function finishCurrent() {
    const c = current;
    if (c.type === 'move') {
      pivot.setRotationFromAxisAngle(c.axis, c.angle); pivot.updateMatrixWorld();
      for (const o of c.members) { cubeGroup.attach(o); o.position.set(...o.userData.home); o.rotation.set(0, 0, 0); }
      const h = heads[c.p]; h.angle += c.angle; h.spin.rotation.z = h.angle;
      cube.move(c.m); paint(cube);
      moveIdx++;
      if (moveIdx % 4 === 0 || moveIdx === allMoves.length) lcd(queueLabel, `${moveIdx}/${allMoves.length}`);
    } else if (c.type === 'crank') { for (const k of c.cranks) k.set(c.to); }
    else if (c.type === 'flip') { cubeGroup.rotation.x = c.from + Math.PI; heads[1].angle = c.r0 + Math.PI; heads[4].angle = c.l0 - Math.PI; heads[1].spin.rotation.z = heads[1].angle; heads[4].spin.rotation.z = heads[4].angle; }
    current = null;
    renderQueue(); renderHeads();
    if (!queue.length && !actions.length && onQueueDone) { const cb = onQueueDone; onQueueDone = null; cb(); }
  }
  function enqueue(moves, label, done) {
    allMoves = moves.slice(); moveIdx = 0; queueLabel = label; onQueueDone = done; execStart = performance.now(); mech.resetCounters();
    for (const m of moves) queue.push({ m });
    lcd(label, `0/${moves.length}`); renderQueue(); renderHeads();
    setBusy(true);
  }
  // 수열 없이 기구 동작만 (장착/배출/뒤집기)
  function enqueueActions(list, label, done) {
    actions = list.slice(); onQueueDone = done; allMoves = []; moveIdx = 0; queueLabel = label;
    lcd(label, ''); renderQueue(); setBusy(true);
  }
  function animate(now) {
    requestAnimationFrame(animate);
    if (!current && (queue.length || actions.length) && !paused) startNext();
    if (current && !paused) {
      const t = current.dur > 0 ? Math.min(1, (now - current.start) / current.dur) : 1;
      const e = ease(t), c = current;
      if (c.type === 'move') {
        pivot.setRotationFromAxisAngle(c.axis, c.angle * e);
        heads[c.p].spin.rotation.z = heads[c.p].angle + c.angle * e;
      } else if (c.type === 'crank') {
        for (const k of c.cranks) k.set(c.from + (c.to - c.from) * e);
      } else if (c.type === 'flip') {
        cubeGroup.rotation.x = c.from + Math.PI * e;
        heads[1].spin.rotation.z = c.r0 + Math.PI * e; heads[4].spin.rotation.z = c.l0 - Math.PI * e;
      }
      if (t >= 1) finishCurrent();
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
  // 상태 칩: F R B L D LOCK + orient, 요약 문장
  function renderHeads() {
    const chips = document.getElementById('heads');
    const feedUnit = current && current.type === 'crank' ? current.unit : -1;
    const items = [];
    for (const p of [...SIDE, DF]) {
      const u = p === DF ? 2 : (p === 2 || p === 5) ? 0 : 1;
      const turning = current && current.type === 'move' && current.p === p;
      const flipping = current && current.type === 'flip' && (p === 1 || p === 4);
      const inPos = heads[p].crank.theta < 0.01;
      const cls = turning || flipping ? 'turn' : feedUnit === u ? 'feed' : inPos ? 'in' : 'out';
      const txt = turning ? '회전' : flipping ? '뒤집기' : feedUnit === u ? '이송' : inPos ? '결합' : `−${P.retract_mm}`;
      items.push(`<span class="chip ${cls}" title="${FACE_NAMES[p]}: 핀 2개 (${p === DF ? 'DF/DB' : '적도 엣지'})">${FACE_NAMES[p]}<small>${txt}</small></span>`);
    }
    const lin = lock.crank.theta < 0.01;
    items.push(`<span class="chip ${feedUnit === 3 ? 'feed' : lin ? 'in' : 'out'}" title="잠금 막대 8 mm: 코어 고정, 뒤집기 때만 내림">LOCK<small>${feedUnit === 3 ? '이송' : lin ? '고정' : `−${P.lock_stroke_mm}`}</small></span>`);
    items.push(`<span class="chip ${mech.orient ? 'in' : 'out'}" title="orient: 논리 U(흰색)가 아래면 1">${mech.orient ? '흰색↓' : '흰색↑'}<small>orient ${mech.orient}</small></span>`);
    chips.innerHTML = items.join('');
    let text;
    if (current && current.type === 'crank') text = `${UNIT_LABEL[current.unit]} ${current.to === 0 ? (current.unit === 3 ? '올리는 중 (막대 → 센터 판 소켓)' : '결합 중 (서보 크랭크, 핀 삽입 3 mm)') : (current.unit === 3 ? '내리는 중 (30 mm, 뒤집기 공간)' : '해제 중 (24 mm 후퇴)')}`;
    else if (current && current.type === 'flip') text = 'R/L 만 결합한 채 두 헤드가 같은 방향으로 180° → 큐브 뒤집기';
    else if (current && current.type === 'move') text = `${FACE_NAMES[current.f]} 수 → 물리 ${FACE_NAMES[current.p]} 헤드 회전 (막대가 코어 고정)`;
    else text = mech.loaded ? '장착됨 · 대기' : mech.engaged[MECH.D] ? 'D 헤드 결합 — 큐브를 핀 위에 올려놓고 LOAD' : '대기';
    document.getElementById('headText').textContent = `${text} · 뒤집기 ${mech.flips}회 · 결합 ${mech.regrips}회`;
  }
  function setBusy(b) { for (const id of ['btnScramble', 'btnSolve', 'btnMoves', 'btnReset', 'btnLoad', 'btnFlip']) document.getElementById(id).disabled = b; }
  const busy = () => !!current || queue.length > 0 || actions.length > 0;
  function finishLog(prefix) { log(`${prefix} flips=${mech.flips} regrips=${mech.regrips}`); }
  // 수열의 기구 비용 미리 계산 (상태를 바꾸지 않도록 복제본으로)
  function planStats(moves) {
    const m2 = new MECH.Mechanism(); Object.assign(m2, { engaged: mech.engaged.slice(), orient: mech.orient, loaded: mech.loaded });
    m2.planSeq(moves); return { flips: m2.flips, regrips: m2.regrips };
  }

  function doScramble(seed) {
    if (!mech.loaded) { log('ERR not loaded'); return; }
    const seq = C.scramble(seed, SCRAMBLE_LEN);
    log(`SCRAMBLE seed=${seed} (${SCRAMBLE_LEN}): ${C.seqToString(seq)}`);
    enqueue(seq, 'SCRAMBLING', () => {
      finishLog(`SCRAMBLED exec=${Math.round(performance.now() - execStart)}ms`);
      lcd('SCRAMBLED 20mv', `seed ${seed}`); setBusy(false);
    });
  }
  function doSolve() {
    if (!mech.loaded) { log('ERR not loaded'); return; }
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
    const st = planStats(r.moves);
    const quarterTurns = r.moves.reduce((s, m) => s + (m % 3 === 1 ? 2 : 1), 0);
    document.getElementById('stMoves').textContent = r.moves.length;
    document.getElementById('stNodes').textContent = r.nodes.toLocaleString();
    document.getElementById('stTime').textContent = calcMs.toFixed(1);
    document.getElementById('stRegrip').textContent = `${st.regrips} / ${st.flips}`;
    const flipMs = 2 * +speedEl.value + 200;
    const mechMs = quarterTurns * +speedEl.value + st.regrips * 2 * +feedEl.value + st.flips * flipMs;   // 결합 1회 ≈ 결합 + 나중 해제 = 이송 2번
    document.getElementById('estNote').textContent = `Uno 예상 = 노드 ÷ ${Math.round(AVR_NODES_PER_SEC).toLocaleString()} 노드/초 (Wokwi 시드 1 실측). 전체 ${(r.nodes / AVR_NODES_PER_SEC).toFixed(1)} s. UNO R4(48 MHz, 32bit)는 이보다 수 배 빠를 것으로 예상(실측 전). `
      + `기구 실행 예상 = 90° ${quarterTurns}회 × ${speedEl.value} ms + 결합/해제 ${st.regrips}회 × 2 × ${feedEl.value} ms + 뒤집기 ${st.flips}회 × ${flipMs} ms ≈ ${(mechMs / 1000).toFixed(1)} s (이송은 서보 크랭크의 목표값, 실측 아님).`;
    enqueue(r.moves, 'EXECUTING', () => {
      const ok = cube.isSolved();
      finishLog(`SOLVED ok=${ok ? 1 : 0} moves=${r.moves.length}`);
      log(`calc=${Math.round(calcMs)}ms exec=${Math.round(performance.now() - execStart)}ms`);
      lcd(ok ? 'SOLVED!' : 'MISMATCH', `${r.moves.length}mv`); setBusy(false);
    });
  }
  function doMoves(str) {
    if (!mech.loaded) { log('ERR not loaded'); return; }
    let seq;
    try { seq = C.parseMoves(str); } catch (e) { log('ERR bad moves'); return; }
    if (!seq.length) return;
    enqueue(seq, 'MOVING', () => { finishLog(`MOVED ${seq.length}`); lcd('CUBE ROBOT V4', cube.isSolved() ? 'solved' : 'scrambled'); setBusy(false); });
  }
  // LOAD 버튼: 장착됨 → 배출(막대·F/B·R/L 해제, D 핀이 받침, 손으로 꺼냄) / D 결합 상태 → 막대·F/B 결합 / 그 외 → D 결합
  function doLoad() {
    const wasLoaded = mech.loaded;
    const list = mech.load();
    enqueueActions(list, wasLoaded ? 'EJECTING' : 'LOADING', () => {
      if (wasLoaded) lcd('REMOVE CUBE', 'LOAD: next cube');
      else if (mech.loaded) { lcd('CUBE LOADED', 'SCRAMBLE / SOLVE'); }
      else lcd('PLACE CUBE: PINS', 'WHITE DOWN > LOAD');
      setBusy(false); renderHeads();
    });
  }
  function doFlip() {
    if (!mech.loaded) { log('ERR not loaded'); return; }
    enqueueActions(mech.manualFlip(), 'FLIPPING', () => { lcd('FLIPPED', mech.orient ? 'white down' : 'white up'); setBusy(false); });
  }

  document.getElementById('btnScramble').onclick = () => { if (!busy()) doScramble(parseInt(document.getElementById('seed').value, 10) || 0); };
  document.getElementById('btnSolve').onclick = () => { if (!busy()) doSolve(); };
  document.getElementById('btnMoves').onclick = () => { if (!busy()) doMoves(document.getElementById('moves').value); };
  document.getElementById('btnLoad').onclick = () => { if (!busy()) doLoad(); };
  document.getElementById('btnFlip').onclick = () => { if (!busy()) doFlip(); };
  document.getElementById('moves').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !busy()) doMoves(e.target.value); });
  document.getElementById('btnReset').onclick = () => { if (busy()) return; cube.reset(); paint(cube); log('RESET'); lcd('CUBE ROBOT V4', 'reset'); allMoves = []; renderQueue(); };
  document.getElementById('btnPause').onclick = (e) => {
    paused = !paused; e.target.textContent = paused ? '계속' : '일시정지';
    if (current) {
      if (paused) current.elapsed = performance.now() - current.start;
      else current.start = performance.now() - (current.elapsed || 0);
    }
    if (paused) lcd('PAUSED', `${moveIdx}/${allMoves.length}`); else if (allMoves.length) lcd(queueLabel, `${moveIdx}/${allMoves.length}`);
  };
  document.getElementById('btnView').onclick = () => setView(VIEW_ALL);
  document.getElementById('btnViewCube').onclick = () => setView(VIEW_CUBE);
  speedEl.oninput = () => { document.getElementById('speedVal').textContent = speedEl.value; };
  feedEl.oninput = () => { document.getElementById('feedVal').textContent = feedEl.value; };
  const chkFrame = document.getElementById('chkFrame'), chkMotor = document.getElementById('chkMotor');
  function applyVisibility() {
    for (const h of Object.values(heads)) {
      h.frame.visible = chkFrame.checked;
      for (const o of h.carriage.children) if (o !== h.spin && o !== h.motor) o.visible = chkFrame.checked;
      h.motor.visible = chkMotor.checked;
    }
    lock.frame.visible = chkFrame.checked;
  }
  chkFrame.onchange = chkMotor.onchange = applyVisibility;

  // 시작
  paint(cube); resize(); updateCamera(); applyVisibility(); renderHeads();
  log('READY cube-robot v4 (S [seed] | V | M <moves> | L | E | F | P | R | Q 0|1)');
  log('LOADED orient=1');
  requestAnimationFrame(animate);
  window.CubeSim = { cube, mech, doScramble, doSolve, doMoves, doLoad, doFlip, heads: () => ({ orient: mech.orient, flips: mech.flips, regrips: mech.regrips, shift: [...SIDE, DF].map((p) => [FACE_NAMES[p], +heads[p].crank.shift.toFixed(2)]), lock: +lock.crank.shift.toFixed(2) }), params: P };  // 콘솔/테스트용
})();
