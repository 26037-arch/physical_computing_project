// V4 binary STL + parameters; generated output is the only sim/ file written.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'models/robot_v4');
const limit = 6 * 1000 * 1000;
function bundle(headOnly = false) {
  const params = JSON.parse(fs.readFileSync(path.join(dir, 'parameters.json'), 'utf8'));
  const files = fs.readdirSync(path.join(dir, 'print')).filter(f => /\.stl$/i.test(f)).sort();
  if (!files.length) throw new Error('Build V4 first: no print/*.stl');
  const parts = {};
  for (const file of files) {
    const name = file.replace(/\.stl$/i, '');
    if (headOnly && !/^(drive_plate_2pin|drive_plate_strip|shaft_hub.*|bearing_.*|carriage.*|rail_support|servo_mount|center_recessed)$/.test(name)) continue;
    const buf = fs.readFileSync(path.join(dir, 'print', file));
    if (buf.length < 84) throw new Error(`${file}: truncated STL`);
    const triangles = buf.readUInt32LE(80);
    if (buf.length !== 84 + triangles * 50) throw new Error(`${file}: binary STL size mismatch`);
    if (!params.print_offsets[name]) throw new Error(`${name}: missing print offset`);
    parts[name] = { triangles, bytes: buf.length, b64: buf.toString('base64') };
  }
  const js = `// 자동 생성 — node tools/embed_models_v4.js; V4 mm, XY 중심/바닥 z=0\n(function (global) {\n  const M = { params: ${JSON.stringify(params)}, parts: ${JSON.stringify(parts)} };\n  global.CubeModels = M;\n  if (typeof module !== 'undefined' && module.exports) module.exports = M;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n`;
  return { js, parts };
}
let result = bundle();
if (Buffer.byteLength(result.js) > limit) {
  console.log('Over 6 MB: rebuild STL at 0.1 mm / 0.3 rad, then recheck.');
  const local = path.join(root, process.platform === 'win32' ? '.venv-cad/Scripts/python.exe' : '.venv-cad/bin/python');
  const python = process.env.CAD_PYTHON || (fs.existsSync(local) ? local : 'python3');
  for (const args of [['tools/build_robot_v4.py', '--stl-tolerance', '0.1', '--stl-angular', '0.3'], ['tools/check_robot_v4.py']]) {
    const run = spawnSync(python, args, { cwd: root, stdio: 'inherit' });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`${args[0]} failed: ${run.status}`);
  }
  result = bundle();
  if (Buffer.byteLength(result.js) > limit) result = bundle(true);
}
if (Buffer.byteLength(result.js) > limit) throw new Error('Head-only bundle exceeds 6 MB');
fs.writeFileSync(path.join(root, 'sim/models.js'), result.js, 'utf8');
console.log(`V4 embedded ${Object.keys(result.parts).length} parts; sim/models.js: ${Buffer.byteLength(result.js)} bytes`);
