// Default: regenerate V3 assembly-coordinate meshes. --v2 is legacy only.
// node tools/embed_models.js [--python path/to/python.exe]
if (!process.argv.includes('--v2')) {
  const args=process.argv.slice(2), i=args.indexOf('--python');
  if(i>=0 && !args[i+1])throw new Error('--python requires an executable path');
  const python=i>=0?args[i+1]:(process.env.CADQUERY_PYTHON||'python');
  const result=require('node:child_process').spawnSync(python,[require('node:path').join(__dirname,'export_sim_v3.py')],{stdio:'inherit'});
  if(result.error)console.error('Install tools/requirements-robot-v3.txt in the CAD Python and pass --python. '+result.error.message);
  process.exit(result.status===null?1:result.status);
}
// Legacy V2 export below; do not use it with the V3 app.
// tools/embed_models.js — V2 헤드 출력 부품 STL(models/robot_v2/head/*.stl)과 CAD 매개변수
// (models/robot_v2/parameters.json)를 base64/JSON 으로 sim/models.js 에 넣는다.
//   node tools/embed_models.js
// 시뮬레이터(sim/index.html)를 file:// 로 열어도 STL 을 fetch 없이 바로 쓸 수 있게 하기 위함.
// STL 은 tools/build_robot_v2.py 가 출력용으로 XY 중심·바닥 z=0 으로 옮겨 놓은 것이므로,
// 조립 좌표(큐브 면 기준 z 오프셋)는 sim/app.js 의 HEAD 표가 다시 더한다.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'models', 'robot_v2', 'head');
const paramsFile = path.join(root, 'models', 'robot_v2', 'parameters.json');
const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.stl')).sort() : [];
const parts = {};
for (const f of names) {
  const buf = fs.readFileSync(path.join(dir, f));
  const tri = buf.readUInt32LE(80);
  if (buf.length !== 84 + tri * 50) throw new Error(`${f}: not a binary STL (size mismatch)`);
  parts[f.replace(/\.stl$/i, '')] = { triangles: tri, bytes: buf.length, b64: buf.toString('base64') };
}
const params = fs.existsSync(paramsFile) ? JSON.parse(fs.readFileSync(paramsFile, 'utf8')) : {};
const js = `// 자동 생성 파일 — 수정하지 말 것. 생성: node tools/embed_models.js (${new Date().toISOString().slice(0, 10)})
// tools/build_robot_v2.py 가 내보낸 V2 헤드 부품 바이너리 STL(단위 mm, XY 중심·바닥 z=0) 과
// models/robot_v2/parameters.json (큐브 57 mm, 피치 19.1 mm, 후퇴 24 mm 등) 을 담는다.
(function (global) {
  const M = { params: ${JSON.stringify(params)}, parts: ${JSON.stringify(parts)} };
  global.CubeModels = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(path.join(root, 'sim/models.js'), js);
console.log('params:', Object.keys(params).length ? `cube ${params.cube_mm} mm, pitch ${params.pitch_mm} mm, retract ${params.retract_mm} mm` : '(none)');
console.log('embedded:', Object.entries(parts).map(([k, v]) => `${k} (${v.triangles} tri, ${v.bytes} B)`).join(', ') || '(none)');
