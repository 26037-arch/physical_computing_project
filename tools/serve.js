// tools/serve.js — 시뮬레이터 미리보기용 최소 정적 서버 (의존성 없음)
//   node tools/serve.js [port=8765]   →  http://localhost:8765/sim/
// 개발용: POST /__screenshot?name=<파일>.png 에 PNG 바이트를 보내면 docs/images/<파일> 로 저장한다
// (시뮬레이터 화면을 보고서 이미지로 남길 때 브라우저 콘솔에서 canvas.toBlob → fetch 로 사용, 20 MB 상한).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const port = parseInt(process.argv[2] || '8765', 10);
const MAX_SHOT = 20 * 1024 * 1024;   // 스크린샷 업로드 상한
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.stl': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
http.createServer((req, res) => {
  const [rawUrl, query = ''] = req.url.split('?');
  let url = decodeURIComponent(rawUrl);
  if (req.method === 'POST' && url === '/__screenshot') {
    const name = new URLSearchParams(query).get('name') || '';
    // 단어 문자만, 64자 이내, Windows 예약 장치 이름(CON, NUL, COM1 …) 제외
    if (!/^[\w-]{1,64}\.png$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)\./i.test(name)) { res.writeHead(400); res.end('name must be <word>.png'); return; }
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_SHOT) { res.writeHead(413); res.end('too large'); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const out = path.join(root, 'docs', 'images', name);
      try { fs.writeFileSync(out, Buffer.concat(chunks)); }
      catch (e) { res.writeHead(500); res.end('write failed: ' + e.message); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`saved ${path.relative(root, out)} (${size} B)`);
      console.log('screenshot →', out);
    });
    return;
  }
  if (url === '/') url = '/sim/';
  if (url.endsWith('/')) url += 'index.html';
  const file = path.resolve(root, '.' + url);
  const rel = path.relative(root, file);   // 저장소 밖(상위·형제 폴더 "..._backup"·다른 드라이브)이면 거절
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/sim/`));
