// V5 전자부 3D 장면 — UNO R4 WiFi·830홀 브레드보드·소자·케이블·점퍼선 35개를 실제 치수(mm)로 만든다.
// wiring.js(최종 모습)와 build.js(단계별 제작 설명서)가 함께 쓰고, overlap.js 가 이 장면 그대로 겹침을 검사한다.
// 배선은 wiring_data.js(= tools/make_wiring_v5.js 의 WIRING 표에서 생성)만 읽는다. 여기서 선을 더하거나 고치지 않는다.
// 월드: 관중은 −y, 책상 면 z = table_zw_mm. 부품을 놓은 자리(BB·UNO·LCD·단자·커넥터)는 이 파일에서 고친다.
// 부품 외형·케이블이 지나가는 길·전자부를 놓은 자리는 예시다. 정확한 것은 "어느 선이 어느 구멍/핀에 꽂히는가" 이다.
(function (global) {
  'use strict';
  function build(ctx) {
    const THREE = ctx.THREE, scene = ctx.scene, robot = ctx.robot, P = ctx.P, W = ctx.W;
    const label = ctx.label || function () {};
    const deg = (n) => n * Math.PI / 180, clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const UP = V([0, 0, 1]);
    const TILT = deg(P.tilt_deg), D = P.table_zw_mm;
    const hinge = [0, P.hinge_y_mm, P.hinge_z_mm];
    const tableZ = (y) => (D - y * Math.sin(TILT)) / Math.cos(TILT);
    const css = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const COLORS = { steel: 0xc3ccd2, rubber: 0x23292e, pcb: 0x0e7c86, bb: 0xf3f1e7, gold: 0xc9a23a };

    // ---------- 만들기 도구 ----------
    const parts = [];                        // {key, name, g, step, mats, drop: 끼우는 방향(월드, 끝 → 시작), at: 화살표 자리}
    let cur = null, k, silver, lead;         // 지금 만드는 묶음과 그 묶음 전용 재질
    function mat(color, metalness = .05, roughness = .6) {
      const m = new THREE.MeshStandardMaterial({ color: css(color), metalness, roughness }); if (cur) cur.mats.push(m); return m;
    }
    function part(step, key, name, opt = {}) {
      const g = new THREE.Group(); scene.add(g);
      cur = { key, name, g, step, mats: [], drop: V(opt.drop || [0, 0, 34]), at: null, note: opt.note || '' }; parts.push(cur);
      k = mat(COLORS.rubber, .1, .6); silver = mat(COLORS.steel, .8, .35); lead = mat(0xb9bec5, .7, .4);
      return g;
    }
    function mesh(parent, geometry, material, pos) { const o = new THREE.Mesh(geometry, material); if (pos) o.position.set(pos[0], pos[1], pos[2]); parent.add(o); return o; }
    const box = (parent, size, center, material) => mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, center);
    function cyl(parent, r, len, center, dir, material, seg = 24) {
      const o = mesh(parent, new THREE.CylinderGeometry(r, r, len, seg), material, center);
      o.quaternion.setFromUnitVectors(V([0, 1, 0]), V(dir).normalize()); return o;
    }
    // 휘는 것(케이블·점퍼선): 겹침 검사는 이 곡선을 반지름 r 인 캡슐 줄로 본다
    function tube(parent, points, r, material, seg) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const o = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || Math.max(16, Math.round(curve.getLength() / 4)), r, 8), material);
      o.userData.cable = { curve, r }; parent.add(o); return o;
    }
    function texture(w, h, pxPerMm, draw) {
      const c = document.createElement('canvas'); c.width = Math.round(w * pxPerMm); c.height = Math.round(h * pxPerMm);
      const g = c.getContext('2d'); g.scale(pxPerMm, pxPerMm); draw(g);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = ctx.maxAniso || 1; return t;
    }
    // 윗면(+z)에만 그림을 입힌 상자. 그림의 위쪽이 +y(관중 반대쪽)다.
    function topBox(parent, size, center, sideMat, tex) {
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: .7, metalness: 0 }); if (cur) cur.mats.push(top);
      return mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), [sideMat, sideMat, sideMat, sideMat, top, sideMat], center);
    }
    scene.updateMatrixWorld(true);
    const toWorld = (a) => robot.localToWorld(V(a));
    const onDesk = (x, y, h) => { const p = toWorld([x, y, tableZ(y)]); p.z = D + h; return p; };   // 로봇 국소 (x, y) 바로 아래 책상 위 h

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

    // 브레드보드 830홀
    { const g = part(0, 'breadboard', '브레드보드 830홀', { note: 'a 행이 UNO 쪽(뒤), j 행이 관중 쪽. 1번 열이 왼쪽(로봇 쪽).' });
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
      cur.at = V([BB.x0 + BB.w / 2, BB.cy, ZB]);
      label('브레드보드 830홀 (a 행이 UNO 쪽)', [BB.x0 + BB.w - 25, BB.cy - 20, ZB + 2], g); }

    // UNO R4 WiFi (헤더 위치는 R3 와 같다: 100 mil 간격, D7–D8 사이만 160 mil)
    { const g = part(0, 'uno', 'UNO R4 WiFi', { note: 'USB-C 가 왼쪽(로봇 쪽), 디지털 핀 줄(D0~D13)이 뒤, 전원·아날로그 줄이 브레드보드 쪽.' });
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
      cur.at = V([UNO.x + UNO.w / 2, UNO.y + UNO.d / 2, ZU]);
      label('UNO R4 WiFi', [UNO.x + 34, UNO.y + 30, ZU + 4], g); }
    { const g = part(0, 'usb', 'USB-C 케이블', { drop: [-30, 0, 0], note: '보드 왼쪽 옆면의 USB-C 단자에 수평으로 민다. 보드 전원과 업로드에 쓴다.' });
      const white = mat(0xdfe3e6, .1, .6);
      tube(g, [V([UNO.x - 10, UNO.y + 36.5, UNO.z + 3.2]), V([UNO.x - 14, UNO.y + 40, UNO.z + 2.4]), V([UNO.x - 17, UNO.y + 54, D + 2.5]), V([UNO.x - 14, UNO.y + 120, D + 2.5]), V([UNO.x - 8, UNO.y + 200, D + 2.5])], 1.9, white);
      box(g, [8.6, 9.5, 5], [UNO.x - 5.7, UNO.y + 36.5, UNO.z + 3.2], white);
      cur.at = V([UNO.x - 2, UNO.y + 36.5, UNO.z + 3.2]);
      label('USB-C (보드 전원 · 업로드)', [UNO.x - 14, UNO.y + 110, D + 8], g); }

    // 브레드보드에 꽂는 부품 (다리 위치는 표의 leg 줄)
    const legXY = {}, legStep = {}, legHole = {};
    for (const l of W.legs) { legXY[l.pin] = holeXY(l.p); legStep[l.pin.split(':')[0]] = l.step; legHole[l.pin] = l.hole; }
    const midOf = (...pins) => { let x = 0, y = 0; for (const p of pins) { x += legXY[p][0]; y += legXY[p][1]; } return [x / pins.length, y / pins.length]; };
    { const g = part(legStep.drvCup, 'a4988', 'A4988 드라이버', { note: 'VMOT·GND 줄(전원·코일 쪽)이 e 행, ENABLE~DIR 줄이 h 행. VMOT 가 5번 열(왼쪽), 전위차계가 왼쪽.' });
      const drv = W.legs.filter((l) => l.pin.startsWith('drvCup:'));
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
      cur.at = V([cx, cy, ZB + 9]);
      label('A4988 (MS2 → 5 V = 1/4 스텝)', [cx, cy + 4, ZB + 12], g); }
    { const g = part(legStep.cap, 'cap', '100 µF 전해 커패시터', { note: '긴 다리(+)가 c5, 흰 띠 쪽 짧은 다리(−)가 c6. 거꾸로 꽂으면 터진다.' });
      const c = midOf('cap:+', 'cap:-'), m = legXY['cap:-'];
      cyl(g, 3.15, 11, [c[0], c[1], ZB + 7], [0, 0, 1], mat(0x1d2a4a, .2, .5)); cyl(g, 3.2, .3, [c[0], c[1], ZB + 12.65], [0, 0, 1], silver);
      box(g, [1.4, 2.6, 10.4], [c[0] + (m[0] - c[0]) * 2.25, c[1], ZB + 7], mat(0xdfe3e6, 0, .7)).userData.skip = true;   // − 쪽 흰 띠 (몸통에 인쇄된 표시)
      for (const p of ['cap:+', 'cap:-']) cyl(g, .3, 1.5, [legXY[p][0], legXY[p][1], ZB + .75], [0, 0, 1], lead, 8);
      cur.at = V([c[0], c[1], ZB + 13]);
      label('100 µF (+ c5 · − c6)', [c[0], c[1], ZB + 15], g); }
    { const g = part(legStep.btnStart, 'button', 'START 택트 스위치', { note: '다리 4개가 가운데 홈을 걸치게(e15·e17 / f15·f17) 꽂는다. 90° 돌려 꽂으면 늘 눌린 것이 된다.' });
      const c = midOf('btnStart:1.l', 'btnStart:2.l', 'btnStart:1.r', 'btnStart:2.r');
      box(g, [6, 6, 3.6], [c[0], c[1], ZB + 1.8], k); box(g, [5.4, 5.4, .3], [c[0], c[1], ZB + 3.75], silver); cyl(g, 1.75, 1.6, [c[0], c[1], ZB + 4.7], [0, 0, 1], k);
      cur.at = V([c[0], c[1], ZB + 6]);
      label('START 버튼 (A2)', [c[0], c[1], ZB + 7], g); }
    { const g = part(legStep.resistor, 'buzzer', '부저 + 100 Ω', { note: '저항은 방향이 없다(i18–i21). 부저는 + 표시 다리가 f21, 다른 다리가 f24.' });
      const a = legXY['resistor:1'], b = legXY['resistor:2'], c = midOf('resistor:1', 'resistor:2'), z = ZB + 2.4;
      cyl(g, .3, b[0] - a[0], [c[0], c[1], z], [1, 0, 0], lead, 8); for (const p of [a, b]) cyl(g, .3, 2.4, [p[0], p[1], ZB + 1.2], [0, 0, 1], lead, 8);
      cyl(g, 1.15, 5.6, [c[0], c[1], z], [1, 0, 0], mat(0xd9c39a, 0, .7), 16);
      [0x7a4a22, 0x1c1c1c, 0x7a4a22, 0xc9a23a].forEach((col, i) => { cyl(g, 1.2, .55, [c[0] - 1.9 + i * 1.15 + (i === 3 ? .5 : 0), c[1], z], [1, 0, 0], mat(col, .1, .6), 16).userData.skip = true; });
      const bz = midOf('bz1:1', 'bz1:2');
      cyl(g, 6, 9.5, [bz[0], bz[1], ZB + 5.25], [0, 0, 1], k, 32); cyl(g, 1.1, .2, [bz[0], bz[1], ZB + 10.1], [0, 0, 1], mat(0x0a0c0e, 0, .9), 16).userData.skip = true;
      cur.at = V([bz[0], bz[1], ZB + 10]);
      label('부저 + 100 Ω (A3)', [bz[0], bz[1], ZB + 13], g); }

    // LCD1602 + I2C 백팩 (뒤로 15° 기울여 세움, 화면이 관중 쪽)
    const lcd = new THREE.Group(); lcd.position.set(265, 60, D); lcd.rotation.x = deg(-15);
    { const g = part(8, 'lcd', 'LCD1602 + I2C 백팩', { drop: [0, 0, 0], note: '화면이 관중 쪽. 뒤 백팩의 4핀(위에서 GND·VCC·SDA·SCL)이 왼쪽으로 나와 있다.' }); g.add(lcd);
      box(g, [80, 26, 3], [265, 66, D + 1.5], k);                                                          // 받침
      box(lcd, [80, 1.6, 36], [0, 0, 24], mat(COLORS.pcb, .1, .6)); box(lcd, [71, 7, 24], [0, -4.3, 24], k);
      const tex = texture(64.5, 14.5, 8, (c) => { c.fillStyle = '#b9d94a'; c.fillRect(0, 0, 64.5, 14.5); c.fillStyle = '#26330f'; c.font = 'bold 4.6px Consolas, monospace'; c.textBaseline = 'middle';
        c.fillText('SOLVING...', 2.5, 4.2); c.fillText('cross', 2.5, 10.6); });
      const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: .4, emissive: css(0x5a6a20), emissiveIntensity: .35 });
      const scr = mesh(lcd, new THREE.PlaneGeometry(64.5, 14.5), sm, [0, -7.85, 24]); scr.rotation.x = Math.PI / 2; scr.userData.skip = true;
      box(lcd, [41, 4, 19], [-12, 2.8, 26], k); cyl(lcd, 3, 4.5, [-2, 7.05, 26], [0, 1, 0], mat(0x2f6fd0, .1, .5), 16);   // 백팩 + 콘트라스트 전위차계
      box(lcd, [2.5, 2.5, 10.2], [-33.8, 3.5, 26], k);                                                     // I2C 4핀 헤더
      cur.at = V([265, 52, D + 50]);
      label('LCD1602 I2C (SDA A4 · SCL A5)', [265, 52, D + 52], g); }
    scene.updateMatrixWorld(true);

    // 12 V 잭 터미널 · 5 V 어댑터 터미널 (나사 단자에 단선을 물린다)
    function terminalBlock(g, x, y, text) {
      box(g, [13, 18, 11], [x, y - 12, D + 5.5], k); box(g, [11, 8, 9], [x, y - 1, D + 4.5], mat(0x2d8a4e, .1, .6));
      for (const dx of [-2.5, 2.5]) cyl(g, 1.5, .6, [x + dx, y - 1, D + 9.3], [0, 0, 1], silver, 12);
      tube(g, [V([x, y - 21, D + 5.5]), V([x, y - 40, D + 3.5]), V([x + (x > 150 ? 12 : -10), y - 100, D + 3]), V([x + (x > 150 ? 18 : -14), y - 150, D + 3])], 2.1, k);
      cur.at = V([x, y - 6, D + 11]);
      label(text, [x, y - 14, D + 14], g);
    }
    const JACK = [122, -66], ADP = [192, -66];
    terminalBlock(part(1, 'jack', '12 V DC 잭 터미널', { drop: [0, -28, 0], note: '+ 단자가 왼쪽, − 단자가 오른쪽. 어댑터를 꽂기 전에 단선을 나사로 물린다.' }), JACK[0], JACK[1], '12 V DC 잭 (모터 전용)');
    terminalBlock(part(7, 'adapter', '5 V 어댑터 터미널', { drop: [0, -28, 0], note: '+ 단자가 왼쪽, − 단자가 오른쪽. 서보 전용이며 UNO 5V 와 잇지 않는다.' }), ADP[0], ADP[1], '5 V 어댑터 (서보 전용)');

    // 서보 3핀 커넥터(갈·빨·주)와 케이블, 모터 4선 묶음 — 책상 위를 지나가는 길은 예시
    // 케이블이 나오는 자리는 키트 참고 모델(tools/build_kit_parts_v5.py)의 cable 위치다.
    const HOODC = [104, 80], LIFTC = [118, 98], SPLIT = [128, 10];
    const sy = P.servo_axes.lift[1], sz = P.servo_axes.lift[2];
    function servoLead(g, pts, c) {
      const all = [...pts, V([c[0], c[1] + 16, D + 2.4]), V([c[0], c[1] + 7.2, D + 2.4])];
      [0x6b3f1d, 0xc23b3b, 0xe8872a].forEach((col, i) => tube(g, all.map((p) => p.clone().add(V([(i - 1) * 1.3, 0, 0]))), .62, mat(col, .1, .6)));
      box(g, [7.8, 14, 2.6], [c[0], c[1], D + 2.4], k);
    }
    { const g = part(7, 'hoodLead', 'MG996R 케이블 (갈·빨·주)', { drop: [0, 0, 0], note: '서보 몸통 앞쪽 끝에서 나온다. 타워 바깥을 돌아 책상으로 내려 3핀 커넥터를 브레드보드 뒤에 둔다.' });
      const s = [75.2, hinge[1] + 31.4, hinge[2]];
      servoLead(g, [toWorld(s), toWorld([s[0] + 5, s[1] + 14, s[2] - 4]), onDesk(98, -42, 30), onDesk(103, -60, 9), onDesk(104, -76, 3), onDesk(99, -100, 3), onDesk(70, -128, 3), onDesk(-40, -132, 3), V([92, 122, D + 2.6]), V([102, 104, D + 2.4])], HOODC);
      cur.at = V([HOODC[0], HOODC[1], D + 4]); }
    { const g = part(7, 'liftLead', 'SG90 케이블 (갈·빨·주)', { drop: [0, 0, 0], note: '서보 몸통 뒤쪽 끝에서 나온다. 높은 타워 뒤로 내려 3핀 커넥터를 브레드보드 뒤에 둔다.' });
      const s = [P.sg90_mount_outer_x_mm - 17.8, sy - 17.25, sz];
      servoLead(g, [toWorld(s), toWorld([s[0], s[1] - 10, s[2] - 6]), toWorld([s[0] - 4, s[1] - 14, s[2] - 50]), V([112, 124, D + 2.4]), V([117, 118, D + 2.4])], LIFTC);
      cur.at = V([LIFTC[0], LIFTC[1], D + 4]); }
    { const g = part(4, 'motorCable', 'NEMA17 4선 케이블', { drop: [0, 0, 0], note: '모터 뒤 커넥터에서 나와 모터 상자 뒷벽의 창을 지나 뒤 데크 위로 가고, 데크 끝에서 책상으로 내려온다 (데크 밑으로는 지나갈 틈이 없다).' });
      // 창을 나온 뒤 뒤 데크(두께 3.7 mm) 위를 지나 데크 끝에서 책상으로 내려온다
      const z = P.motor_face_z_mm - P.motor_len_mm + 4.75, a = toWorld([0, -26.6, z]), zd = D + 6.6;
      tube(g, [a, V([0, a.y + 7, a.z - 2.5]), V([0, a.y + 18, zd]), V([0, 55, zd]), V([0, 80, zd]), V([3, 97, D + 3.2]), V([30, 112, D + 3]), V([62, 116, D + 3]), V([86, 70, D + 3]), V([104, 22, D + 3]), V([SPLIT[0] - 6, SPLIT[1] + 1, D + 2.6])], 2.3, mat(0x3b434a, .1, .7));
      cur.at = V([SPLIT[0], SPLIT[1], D + 4]);
      label('모터 4선 → a7~a10', [96, 46, D + 8], g); }
    cur = null;

    // ---------- 선 끝점: 위치 + 선이 빠져나오는 방향(= 꽂는 방향의 반대) ----------
    const TERM = { 'motCup:A-': [-1.5, 0], 'motCup:A+': [-.5, 0], 'motCup:B+': [.5, 0], 'motCup:B-': [1.5, 0] };
    function endpoint(id, holePx) {
      if (holePx) { const p = holeXY(holePx); return { pos: V([p[0], p[1], ZB]), dir: UP.clone(), kind: 'hole', dev: 'breadboard' }; }
      const [dev, pin] = id.split(':');
      if (dev === 'uno') { const p = unoPins[pin]; if (!p) throw new Error('UNO 핀 없음: ' + id); return { pos: V([p[0], p[1], ZU]), dir: UP.clone(), kind: 'hole', dev: 'uno' }; }
      if (dev === 'motCup') return { pos: V([SPLIT[0] + TERM[id][0] * 1.6, SPLIT[1], D + 2.6]), dir: V([0, -.35, .94]).normalize(), kind: 'bare', dev: 'motorCable' };
      if (dev === 'srvHood' || dev === 'srvLift') { const c = dev === 'srvHood' ? HOODC : LIFTC, i = { GND: -1, 'V+': 0, PWM: 1 }[pin];
        return { pos: V([c[0] + i * 2.54, c[1] - 7, D + 2.4]), dir: V([0, -1, .12]).normalize(), kind: 'plug', dev: dev === 'srvHood' ? 'hoodLead' : 'liftLead' }; }
      if (dev === 'lcd1') { const i = ['GND', 'VCC', 'SDA', 'SCL'].indexOf(pin);
        return { pos: lcd.localToWorld(V([-35.05, 3.5, 26 + (1.5 - i) * 2.54])), dir: V([-1, 0, 0]), kind: 'plug', dev: 'lcd' }; }
      if (dev === 'jack' || dev === 'adapter') { const c = dev === 'jack' ? JACK : ADP;
        return { pos: V([c[0] + (pin === '+' ? -2.5 : 2.5), c[1] + 3, D + 5]), dir: V([0, .9, .45]).normalize(), kind: 'bare', dev }; }
      throw new Error('알 수 없는 끝점: ' + id);
    }

    // ---------- 점퍼선 ----------
    const wires = [], pickMeshes = [], housingGeo = new THREE.BoxGeometry(2.4, 10, 2.4);
    for (const w of W.wires) {
      const A = endpoint(w.a, w.pa), B = endpoint(w.b, w.pb);
      const plugged = /^(수-수|암-수)/.test(w.type) && !/짧게/.test(w.type);
      const g = new THREE.Group(); scene.add(g);
      const m = new THREE.MeshStandardMaterial({ color: css(W.colors[w.color].hex), metalness: .05, roughness: .5 });
      const hm = new THREE.MeshStandardMaterial({ color: css(0x24282d), metalness: .1, roughness: .6 });
      const ends = [A, B].map((e) => {
        const has = plugged && e.kind !== 'bare', len = has ? 10 : 0; e.housing = has;
        if (has) { const h = mesh(g, housingGeo, hm, e.pos.clone().addScaledVector(e.dir, 5.6).toArray()); h.quaternion.setFromUnitVectors(V([0, 1, 0]), e.dir); }
        return e.pos.clone().addScaledVector(e.dir, len + (has ? .6 : 0));
      });
      // 하우징 없는 선(모터 선·단선)은 옆 구멍의 하우징(높이 10.6) 위까지 곧게 올라간 뒤 휜다
      const dist = ends[0].distanceTo(ends[1]), rise = Math.min(7, 2 + dist * .3), up = (e) => (!e.housing && e.kind === 'hole' ? 12.5 : rise);
      const a1 = ends[0].clone().addScaledVector(A.dir, up(A)), b1 = ends[1].clone().addScaledVector(B.dir, up(B));
      const lift = clamp(dist * .2, 1.5, 34) + (w.n % 5) * 1.6, side = ((w.n % 3) - 1) * Math.min(5, dist * .06);
      const across = b1.clone().sub(a1).cross(UP).normalize();
      const midPt = (t) => a1.clone().lerp(b1, t).addScaledVector(UP, lift * (1 - Math.pow(2 * t - 1, 2) * .35)).addScaledVector(across, side);
      const pts = dist < 6 ? [ends[0], a1, b1, ends[1]] : [ends[0], a1, midPt(.25), midPt(.5), midPt(.75), b1, ends[1]];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seg = Math.max(12, Math.round(curve.getLength() / 2.5));
      const r = w.type === '모터 선' ? .65 : .8;
      const tm = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8), m); tm.userData.cable = { curve, r }; g.add(tm);
      const pick = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, seg >> 1), 3, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pick.userData.n = w.n; pick.userData.skip = true; g.add(pick); pickMeshes.push(pick);
      wires.push({ w, g, mats: [m, hm], pick, mid: curve.getPoint(.5), length: curve.getLength(), state: '', A, B, curve, r });
    }

    // 꽂는 순서 설명 (배선 단계 1~8). 선의 양 끝은 표에서 오고, 여기는 사람이 읽는 요약만 둔다.
    const STEPS = [null,
      ['레일 연결', 'UNO 5V·GND 를 위 레일에, 위 − 와 아래 − 를 왼쪽 절반 끝(L25)에서 잇고, 12 V 잭을 아래 레일에 물린다. 아래 + 레일은 12 V 전용이다.'],
      ['A4988 + 로직 신호', 'VMOT 쪽이 a 행을 보게 e5~e12 / h5~h12 에 꽂는다. RESET–SLEEP 짧은 점퍼, MS2 → 위 + (1/4 스텝), VDD·GND, D6·D2·D7.'],
      ['커패시터 + VMOT', '100 µF 의 + 를 c5, − (흰 띠)를 c6 에. a5 → 아래 + 레일(12 V) 긴 점퍼 하나만 12 V 가 흐른다.'],
      ['NEMA17 모터 4선', '같은 코일 두 선이 a7·a8 또는 a9·a10 에 함께 오게 꽂는다.'],
      ['버튼', '택트 스위치를 가운데 홈에 걸치고 a15 → A2, j17 → 아래 − 레일.'],
      ['부저 + 100 Ω', 'A3 → 18열 → 저항 → 21열 → 부저 → 24열 → GND.'],
      ['서보 전원 열', '27열 = 어댑터 +5 V, 29열 = GND. 서보 빨강·갈색은 이 두 열에, 주황은 UNO D8(후드)·D9(리프터)에. UNO 5V 와 잇지 않는다.'],
      ['LCD1602 I2C', '암-수 점퍼 4개: GND·VCC 는 위 레일, SDA → A4, SCL → A5.']];

    return { parts, wires, pickMeshes, STEPS, layout: { BB, UNO, ZB, ZU, D, JACK, ADP, HOODC, LIFTC, SPLIT }, legHole, toWorld, onDesk };
  }
  global.ElectronicsV5 = { build };
})(typeof globalThis !== 'undefined' ? globalThis : this);
