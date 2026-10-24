// Rev B V5 seven-part binary STL + parameters bundle.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'models/robot_v5');
const limit = 6 * 1000 * 1000;
const names = ['base', 'crank', 'cube_holder', 'hood', 'hub', 'lifter', 'link'];

function bundle() {
  const params = JSON.parse(fs.readFileSync(path.join(dir, 'parameters.json'), 'utf8'));
  const files = fs.readdirSync(path.join(dir, 'print')).filter(f => /\.stl$/i.test(f)).sort();
  if (JSON.stringify(files.map(f => f.replace(/\.stl$/i, ''))) !== JSON.stringify(names)) {
    throw new Error('Expected exactly seven Rev B V5 print STLs; run tools/build_robot_v5.py first');
  }
  if (!params.print_offsets || JSON.stringify(Object.keys(params.print_offsets).sort()) !== JSON.stringify(names)) {
    throw new Error('Rev B parameters.print_offsets must describe exactly the seven exported parts');
  }
  const parts = {};
  for (const file of files) {
    const name = file.replace(/\.stl$/i, '');
    const buf = fs.readFileSync(path.join(dir, 'print', file));
    if (buf.length < 84) throw new Error(`${file}: truncated binary STL`);
    const triangles = buf.readUInt32LE(80);
    if (buf.length !== 84 + triangles * 50) throw new Error(`${file}: binary STL size mismatch`);
    if (!Array.isArray(params.print_offsets[name]) || params.print_offsets[name].length !== 3 ||
        !params.print_offsets[name].every(Number.isFinite)) {
      throw new Error(`${name}: missing print offset`);
    }
    parts[name] = { triangles, bytes: buf.length, b64: buf.toString('base64') };
  }
  const js = `// 자동 생성 — node tools/embed_models_v5.js; V5 Rev B, 7 parts, mm, XY 중심/바닥 z=0\n(function (global) {\n  const M = { params: ${JSON.stringify(params)}, parts: ${JSON.stringify(parts)} };\n  global.CubeModels = M;\n  if (typeof module !== 'undefined' && module.exports) module.exports = M;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n`;
  return { js, parts };
}

let result = bundle();
if (Buffer.byteLength(result.js) > limit) {
  const python = path.join(root, '.venv-cad/Scripts/python.exe');
  const run = spawnSync(python, ['tools/build_robot_v5.py', '--stl-tolerance', '0.1', '--stl-angular', '0.3'],
                        { cwd: root, stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`V5 STL rebuild failed: ${run.status}`);
  result = bundle();
}
if (Buffer.byteLength(result.js) > limit) throw new Error('All seven V5 STLs still exceed 6 MB');
fs.writeFileSync(path.join(root, 'v5/sim/models.js'), result.js, 'utf8');
const embedded = require(path.join(root, 'v5/sim/models.js'));
const sourceParams = JSON.parse(fs.readFileSync(path.join(dir, 'parameters.json'), 'utf8'));
if (JSON.stringify(embedded.params) !== JSON.stringify(sourceParams)) throw new Error('Embedded parameters differ from source');
for (const name of names) {
  const original = fs.readFileSync(path.join(dir, 'print', name + '.stl'));
  if (!Buffer.from(embedded.parts[name].b64, 'base64').equals(original)) {
    throw new Error(`${name}: embedded STL differs from source`);
  }
}
console.log(`V5 embedded ${Object.keys(result.parts).length} parts; v5/sim/models.js: ${Buffer.byteLength(result.js)} bytes`);
