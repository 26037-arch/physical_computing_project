// tools/embed_models.js — Fusion 에서 내보낸 models/*.stl 을 base64 로 sim/models.js 에 넣는다.
//   node tools/embed_models.js
// 시뮬레이터(sim/index.html)를 file:// 로 열어도 STL 을 fetch 없이 바로 쓸 수 있게 하기 위함.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'models');
const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.stl')) : [];
const entries = {};
for (const f of names) {
  const buf = fs.readFileSync(path.join(dir, f));
  const tri = buf.readUInt32LE(80);
  entries[f.replace(/\.stl$/i, '')] = { triangles: tri, bytes: buf.length, b64: buf.toString('base64') };
}
const js = `// 자동 생성 파일 — 수정하지 말 것. 생성: node tools/embed_models.js (${new Date().toISOString().slice(0, 10)})
// Fusion 360 스크립트 fusion/scripts/cube_robot_parts.py 가 내보낸 바이너리 STL (단위 mm) 을 base64 로 담는다.
(function (global) {
  const M = ${JSON.stringify(entries)};
  global.CubeModels = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(path.join(root, 'sim/models.js'), js);
console.log('embedded:', Object.entries(entries).map(([k, v]) => `${k} (${v.triangles} tri, ${v.bytes} B)`).join(', ') || '(none)');
