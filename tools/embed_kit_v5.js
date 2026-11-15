// 구매품 참고 모델(장착 위치에 놓인 STL) → v5/sim/kit_models.js
//   .venv-cad/Scripts/python.exe tools/export_purchased_v5.py  →  node tools/embed_kit_v5.js
// 3D 제작 설명서(v5/sim/build.html)와 겹침 검사가 CAD 검사와 같은 모양·같은 자리를 쓰게 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'models/robot_v5/purchased');
const names = ['mg996r', 'nema17', 'sg90'];
const out = path.join(root, 'v5/sim/kit_models.js');

function bundle() {
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'purchased.json'), 'utf8'));
  const parts = {};
  for (const name of names) {
    const buf = fs.readFileSync(path.join(dir, name + '.stl'));
    const triangles = buf.length >= 84 ? buf.readUInt32LE(80) : -1;
    if (buf.length !== 84 + triangles * 50) throw new Error(`${name}.stl: binary STL size mismatch`);
    if (!info.parts[name]) throw new Error(`${name}: purchased.json 에 없음`);
    parts[name] = { triangles, bbox_min_mm: info.parts[name].bbox_min_mm, bbox_max_mm: info.parts[name].bbox_max_mm, b64: buf.toString('base64') };
  }
  return `// 자동 생성 (node tools/embed_kit_v5.js) — 수정 금지. 원본은 tools/build_robot_v5.py 의 purchased().\n` +
    `(function (global) {\n  const K = { parts: ${JSON.stringify(parts)} };\n  global.KitModels = K;\n  if (typeof module !== 'undefined' && module.exports) module.exports = K;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n`;
}

const js = bundle();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== js) { console.error('FAIL v5/sim/kit_models.js 가 최신이 아니다 (node tools/embed_kit_v5.js)'); process.exit(1); }
  console.log('PASS v5/sim/kit_models.js up to date');
} else {
  fs.writeFileSync(out, js, 'utf8');
  console.log(`V5 kit models embedded: ${names.join(', ')}; v5/sim/kit_models.js: ${Buffer.byteLength(js)} bytes`);
}
