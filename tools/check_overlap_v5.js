// V5 겹침 점검 (명령줄) — 3D 제작 설명서(v5/sim/build.html)를 헤드리스 Chrome/Edge 로 열어 v5/sim/overlap.js 의 검사를 돌린다.
//   node tools/check_overlap_v5.js            결과를 models/robot_v5/overlap_checks.json 에 쓰고, 겹침이 있으면 종료코드 1
//   node tools/check_overlap_v5.js --shots    단계별 화면을 docs/images/v5_build3d/ 에 PNG 로 남긴다 (검사는 하지 않는다)
//   node tools/check_overlap_v5.js --eval "식" [--page wiring.html]   페이지에서 식을 계산해 출력한다 (디버그용)
// 브라우저: 환경 변수 CHROME_PATH, 없으면 Chrome → Edge 순으로 찾는다. 의존 패키지 없음 (Node 22+ 의 fetch·WebSocket 사용).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const list = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const hit = list.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Chrome/Edge 를 찾지 못했습니다. CHROME_PATH 환경 변수에 실행 파일 경로를 지정하세요.');
  return hit;
}

async function main() {
  const webPort = 8791 + Math.floor(Math.random() * 200), dbgPort = 9400 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-overlap-'));
  const server = spawn(process.execPath, [path.join(root, 'tools/serve.js'), String(webPort)], { stdio: 'ignore' });
  const browser = spawn(findBrowser(), ['--headless=new', '--remote-debugging-port=' + dbgPort, '--user-data-dir=' + profile, '--window-size=1500,940',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const stop = () => { try { browser.kill(); } catch (_) { /* 이미 끝남 */ } try { server.kill(); } catch (_) { /* 이미 끝남 */ }
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* 잠긴 파일은 둔다 */ } }, 300); };
  try {
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) {
      await sleep(250);
      try { const r = await fetch(`http://127.0.0.1:${dbgPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${webPort}/v5/sim/${value('--page') || 'build.html'}`), { method: 'PUT' }); ws = (await r.json()).webSocketDebuggerUrl; } catch (_) { /* 아직 안 떴다 */ }
    }
    if (!ws) throw new Error('브라우저 디버그 포트에 붙지 못했습니다.');
    const sock = new WebSocket(ws); await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error('WebSocket 연결 실패')); });
    let id = 0; const wait = new Map();
    sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; wait.set(n, res); sock.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async (expression) => {
      const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (m.error) throw new Error(m.error.message);
      if (m.result.exceptionDetails) throw new Error('페이지 오류: ' + (m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description || m.result.exceptionDetails.text));
      return m.result.result.value;
    };
    await send('Page.enable');
    let state = '';
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      state = await evaluate(`(() => { const e = document.getElementById('error'); return e && !e.hidden ? 'ERR ' + e.textContent : (window.BuildManual || window.WiringView) ? 'OK' : ''; })()`).catch(() => '');
      if (state) break;
    }
    if (state !== 'OK') throw new Error('설명서가 뜨지 않았습니다: ' + (state || '시간 초과 (Three.js CDN 연결 확인)'));

    if (value('--eval')) { console.log(JSON.stringify(await evaluate(value('--eval')), null, 2)); return 0; }
    if (flag('--shots')) {
      const dir = path.join(root, 'docs/images/v5_build3d'); fs.mkdirSync(dir, { recursive: true });
      const n = await evaluate('BuildManual.STEPS.length'), only = value('--step');
      for (let i = 0; i < n; i++) {
        if (only !== undefined && +only !== i) continue;
        await evaluate(`BuildManual.go(${i}, { t: ${value('--t') || 1}, instant: true }); BuildManual.tick(900); 1`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(dir, `step_${String(i).padStart(2, '0')}.png`); fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        console.log('saved', path.relative(root, file));
      }
      return 0;
    }

    const res = JSON.parse(await evaluate('JSON.stringify(OverlapV5.run())'));
    const out = path.join(root, 'models/robot_v5/overlap_checks.json');
    const slim = Object.assign({}, res, { tool: 'tools/check_overlap_v5.js → v5/sim/overlap.js (scene of v5/sim/build.html)', findings: res.findings.map((f) => { const g = Object.assign({}, f); delete g.pts; return g; }) });
    slim.checked = Object.assign({}, res.checked); delete slim.checked.ms;
    fs.writeFileSync(out, JSON.stringify(slim, null, 2) + '\n', 'utf8');
    const CTX = { final: '완성', hood: '후드', lift: '리프터', spin: '컵 회전', path: '조립 경로' }, CLS = { rigid: '부품↔부품', flex: '케이블↔부품', flexflex: '선↔선', desk: '책상 아래' };
    console.log(`물체 ${res.checked.bodies}개 · 자세 ${res.checked.poses}개 · 쌍 검사 ${res.checked.pair_tests}회 · ${(res.checked.ms / 1000).toFixed(1)} s`);
    for (const f of res.findings) {
      if (f.cls === 'flexflex' && !flag('--all')) continue;
      console.log(`${f.allowed ? 'ALLOW' : f.cls === 'flexflex' ? 'NOTE ' : 'FAIL '} [${CTX[f.ctx]}] ${CLS[f.cls]}  ${f.an} ↔ ${f.bn}  깊이 ${f.depth} mm · ${f.when}${f.poses > 1 ? ` (${f.poses}개 자세: ${f.first} ~ ${f.last})` : ''}${f.allowed ? ' — ' + f.allowed : ''}`);
    }
    const s = res.summary;
    console.log(`${s.rigid_final_or_motion ? 'FAIL' : 'PASS'} 완성 자세·구동 범위에서 부품끼리 겹침: ${s.rigid_final_or_motion}건`);
    console.log(`${s.rigid_assembly_path ? 'FAIL' : 'PASS'} 조립 경로에서 부품끼리 겹침: ${s.rigid_assembly_path}건`);
    console.log(`${s.cable_through_part ? 'FAIL' : 'PASS'} 케이블·점퍼선이 부품을 지나감: ${s.cable_through_part}건`);
    console.log(`NOTE 선끼리 겹쳐 그려진 곳: ${s.cable_cable}쌍 (--all 로 목록) · 의도된 끼워 맞춤 제외: ${s.allowed_fits}쌍`);
    console.log('wrote ' + path.relative(root, out));
    return res.ok ? 0 : 1;
  } finally { stop(); }
}
main().then((code) => { process.exitCode = code; }, (e) => { console.error('ERROR ' + e.message); process.exitCode = 2; });
