// build.mjs — 포스터 HTML 조립 → 헤드리스 Chrome 으로 B4(257×364 mm) PDF 1쪽 + 미리보기 PNG.
//   npm run build            (v5/poster 에서)
//   CHROME=<경로> 로 브라우저를 바꿀 수 있다. 네트워크 리소스는 쓰지 않는다(글꼴은 node_modules·로컬 설치).
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { loadFacts, POSTER, REPO } from './facts.mjs';
import { esc, reorientNet, cupMoveFig, idaCompact, btnIcon } from './figs.mjs';
import { FACE, PAPER, INK, MUTED, LCD } from './theme.mjs';

export const OUT_PDF = path.join(REPO, 'submission', '1반_6팀_1103김재혁_1105나준우_포스터.pdf');
export const OUT_HTML = path.join(POSTER, 'dist', 'poster.html');
export const OUT_PNG = path.join(POSTER, 'preview.png');
export const REPO_URL = 'github.com/26037-arch/physical_computing_project';

export function findChrome() {
  const c = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const hit = c.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome/Edge 를 찾지 못했다 — CHROME 환경변수로 경로를 준다');
  return hit;
}

const D = loadFacts();
const F = D.F;
const f = (k, cls = '') => { if (!F[k]) throw new Error('없는 fact: ' + k); return `<span data-fact="${k}"${cls ? ` class="${cls}"` : ''}>${esc(F[k].v)}</span>`; };
const ok = (s, why) => `<span data-ok="${esc(why)}">${esc(s)}</span>`;
const cmd = (letter, s) => `<code class="cmd" data-cmd="${letter}">${esc(s)}</code>`;
const lcdTxt = (s) => `<code class="lcdtxt" data-lcdtxt="${esc(s)}">${esc(s)}</code>`;

// 16×2 LCD — '#' 는 실행 때마다 바뀌는 숫자 자리 (main.ino 의 %u/%lu)
function lcd(r0, r1) {
  const row = (s, i) => {
    const t = s.slice(0, 16).padEnd(16, ' ');
    return `<div class="lrow" data-lcd${i}="${esc(s)}">${[...t].map((ch) => `<span class="${ch === '#' ? 'lc v' : 'lc'}">${ch === '#' ? '▮' : esc(ch)}</span>`).join('')}</div>`;
  };
  return `<div class="lcd" data-lcd>${row(r0, 0)}${row(r1, 1)}</div>`;
}

const C = FACE;
const tag = (face, title, sub = '') => `<div class="sec-head"><span class="tag" style="background:${C[face].tag};color:${C[face].tagInk};${C[face].border ? `box-shadow:inset 0 0 0 0.35mm ${C[face].border};` : ''}">${title}</span>${sub ? `<span class="sec-sub">${sub}</span>` : ''}</div>`;

// ---- 사진/렌더 캡션 (월요일에 실물 사진으로 바꾸면 img/product.txt 한 줄만 고친다) ----
const capFile = path.join(POSTER, 'img', 'product.txt');
const productCaption = existsSync(capFile) ? readFileSync(capFile, 'utf8').trim() : '';

// ---- 그림 ----
const G = C.green.accent, R = C.red.accent, O = C.orange.accent, B = C.blue.accent;
const qrSvg = await QRCode.toString('https://' + REPO_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: INK, light: '#ffffff' } });

const POSNAME = { U: '위', R: '오른쪽', F: '앞', D: '아래', L: '왼쪽', B: '뒤' };
const reorderCards = ['D', 'F', 'U', 'R', 'B', 'L'].map((p) => `
  <div class="rcard">${reorientNet(p, R)}<b>${POSNAME[p]}</b><span class="mono rops" data-fact="re${p}">${esc(F['re' + p].v)}</span></div>`).join('');

const head = (face, num, title) => `<h2 class="sec"><i style="background:${C[face].tag};${C[face].border ? `box-shadow:inset 0 0 0 0.3mm ${C[face].border};` : ''}"></i>${num ? `<span class="secn" style="color:${C[face].accent}">${num}</span>` : ''}${title}</h2>`;

const step = (n, kind, title, text, scr) => `
  <div class="step"><span class="sn">${ok(String(n), '단계 번호')}</span>
    <span class="bt">${btnIcon(kind, G)}<b>${kind === 'long' ? '길게' : '짧게'}</b></span>
    <div class="st"><b class="stt">${title}</b><span>${text}</span></div>${lcd(...scr)}</div>`;

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>큐브 풀이 로봇 — 포스터</title>
<style>
@font-face{font-family:'JBM';font-weight:400;src:url('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2') format('woff2')}
@font-face{font-family:'JBM';font-weight:700;src:url('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2') format('woff2')}
@page{size:257mm 364mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:257mm;height:364mm;background:${PAPER}}
body{font-family:'Noto Sans CJK KR','Noto Sans KR','Malgun Gothic',sans-serif;color:${INK};font-size:10.5pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact;word-break:keep-all}
.page{width:257mm;height:364mm;padding:12mm 12mm 8mm;display:flex;flex-direction:column;gap:8mm;overflow:hidden}
.mono,code{font-family:'JBM','Noto Sans CJK KR',monospace;font-variant-ligatures:none;font-feature-settings:'liga' 0,'calt' 0}
b{font-weight:700}
svg text{font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif}
svg text.mono{font-family:'JBM',monospace}
/* 머리 */
.top{display:flex;justify-content:space-between;font-size:9.5pt;color:${MUTED};padding-bottom:2mm;border-bottom:0.4mm solid ${INK}}
.top b{color:${INK}}
.hero{display:grid;grid-template-columns:1fr auto;align-items:end;gap:8mm;margin-top:4mm}
.title{display:flex;align-items:center;gap:5mm}
.title h1{font-size:54pt;line-height:1;font-weight:900;letter-spacing:-0.02em}
.faces{display:grid;grid-template-columns:repeat(3,4.6mm);gap:0.7mm}
.faces i{display:block;width:4.6mm;height:4.6mm;border-radius:0.7mm;border:0.25mm solid ${INK}}
.lead{font-size:14pt;font-weight:500;line-height:1.4;margin-top:3mm}
.lead b{font-weight:800}
.stats{display:flex;gap:6mm;text-align:right}
.stat .big{font-family:'JBM',monospace;font-size:24pt;font-weight:700;line-height:1}
.stat .big small{font-family:'Noto Sans CJK KR',sans-serif;font-size:11pt;margin-left:0.6mm}
.stat .cap{font-size:9pt;color:${MUTED};margin-top:1mm}
/* 섹션 제목 */
h2.sec{display:flex;align-items:center;gap:2mm;font-size:17pt;font-weight:800;line-height:1.2;margin-bottom:4mm;height:8mm}
h2.sec i{display:block;width:4.2mm;height:4.2mm;border-radius:0.8mm;flex:none}
.secn{font-family:'JBM',monospace;font-size:15pt}
/* 주인공 행 */
.main{display:grid;grid-template-columns:108mm 1fr;gap:8mm}
.product{width:108mm;height:68mm;border-radius:2mm;overflow:hidden;background:#eef2f4}
.product img{width:100%;height:100%;object-fit:cover;display:block}
.cap2{font-size:9pt;color:${MUTED};margin-top:1.6mm}
.kv{display:grid;grid-template-columns:20mm 1fr;gap:1.6mm 0;font-size:10.5pt;line-height:1.45;align-items:baseline}
.main > div > .kv{margin-top:4mm}
.kv .k{font-weight:700}
.warnic{vertical-align:-0.4mm}
.fix{margin-top:4mm;border-top:0.3mm solid #cfd5d9;padding-top:4mm}
.fix .fh{display:block;font-size:10.5pt;margin-bottom:1.6mm}
.fix .kv{font-size:10pt}
.steps{display:flex;flex-direction:column;margin-top:4mm;border-top:0.3mm solid #cfd5d9}
.step{display:grid;grid-template-columns:8mm 12mm 1fr auto;gap:0 3mm;align-items:center;padding:4mm 0;border-bottom:0.3mm solid #cfd5d9}
.step .lcd{justify-self:end}
.sn{font-family:'JBM',monospace;font-weight:800;font-size:24pt;color:${G};line-height:1}
.bt{display:flex;flex-direction:column;align-items:center;gap:0.8mm;font-size:9.5pt;line-height:1.1;text-align:center}
.bt svg{width:10mm;height:10mm}
.st{display:flex;flex-direction:column;gap:0.8mm;font-size:11pt;line-height:1.38}
.st .stt{font-size:13pt}
.lcd{background:${LCD.frame};padding:1.2mm 1.4mm;border-radius:1mm;display:inline-block}
.lrow{display:grid;grid-template-columns:repeat(16,3.1mm);background:${LCD.bg}}
.lrow+.lrow{border-top:0.15mm solid #c9d69c}
.lc{font-family:'JBM',monospace;font-size:10pt;font-weight:700;color:${LCD.ink};text-align:center;line-height:4.8mm;white-space:pre;border-right:0.1mm solid #cbd8a0}
.lc.v{color:#7c8a5a;font-size:8pt}
.lcdtxt{white-space:nowrap;font-family:'JBM',monospace;font-size:9.5pt;background:${LCD.bg};color:${LCD.ink};padding:0 0.8mm;font-weight:700;border-radius:0.4mm}
.again{margin-top:4mm;padding-left:26mm;font-size:10.5pt;line-height:1.5}
.hint{font-size:10.5pt;line-height:1.45}
/* 카드 3장 */
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7mm}
.card{display:flex;flex-direction:column}
.card .txt{font-size:11pt;line-height:1.45;margin-top:4mm}
.card .fig{display:flex;justify-content:center;align-items:center;flex:1;min-height:0}
.parts{display:grid;grid-template-columns:5mm 1fr;gap:1mm 0;font-size:10.5pt;line-height:1.4;margin-bottom:4mm}
.parts b{color:${R}}
.rgrid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,auto);gap:3mm 2mm}
.rcard{display:flex;flex-direction:column;align-items:center;gap:0.6mm;font-size:10pt;line-height:1.25;text-align:center}
.rnet{width:12mm;height:9mm;flex:none}
.rops{font-size:8.5pt;color:${R};font-weight:700;white-space:nowrap}
.cupfig{width:76mm;height:45.4mm}
.idafig2{width:76mm;height:48.6mm}
/* 아래 */
.foot{display:grid;grid-template-columns:28mm 1fr;gap:6mm;align-items:center;margin-top:auto;border-top:0.4mm solid ${INK};padding-top:4mm}
.foot svg{width:28mm;height:28mm}
.url{font-family:'JBM',monospace;font-size:11pt;font-weight:700}
.foot .more{font-size:11pt;margin-top:1mm}
.foot .refs{font-size:8.5pt;color:${MUTED};margin-top:2mm;line-height:1.4}
</style></head>
<body><div class="page">

<header>
  <div class="top"><span><b>컴퓨터과학 ${ok('2', '과목명')}</b> · 피지컬 컴퓨팅 수행평가</span><span data-ok="반·팀·학번 (제출 파일 이름)"><b>1반 6팀</b> · 1103 김재혁 · 1105 나준우</span></div>
  <div class="hero">
    <div>
      <div class="title"><div class="faces">${['white', 'red', 'green', 'yellow', 'orange', 'blue'].map((k) => `<i style="background:${C[k].tag}"></i>`).join('')}</div><h1>큐브 풀이 로봇</h1></div>
      <p class="lead">아두이노가 큐브를 <b>직접 섞고</b>, 보드 안에서 <b>CFOP</b> 로 풀이를 계산해,<br><b data-ok="구동기 3 = 스텝모터 1 + 서보 2 (HARDWARE_V5 0절)">스텝모터 1개와 서보 2개</b>로 맞춘다</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="big">${f('moves')}<small>수</small></div><div class="cap">풀이 (시드 ${f('seed')})</div></div>
      <div class="stat"><div class="big">${f('sensors')}<small>개</small></div><div class="cap">센서</div></div>
      <div class="stat"><div class="big">${f('fomaxT')}<small>mm</small></div><div class="cap">포맥스 수작업</div></div>
    </div>
  </div>
</header>

<section class="main">
  <div>
    ${head('white', '', '최종 산출물')}
    <div class="product"><img src="../img/product.png" alt="최종 산출물"></div>
    <div class="cap2">${esc(productCaption)}</div>
    <div class="kv">
      <b class="k">준비</b><span>${f('vmot')} V 어댑터(모터) · USB(보드) · ${f('servoV')} V 어댑터(서보) · <b style="white-space:nowrap">다 맞춘 큐브</b></span>
      <b class="k">전원</b><span>${lcdTxt(D.lcd.idle[0])} — 컵의 홈이 정확히 뒤를 향하는지 본다.</span>
    </div>
    <div class="fix">
      <b class="fh">안 될 때</b>
      <div class="kv">
        <span class="k">${lcdTxt('ABORTED')}</span><span>장착 전이다 → 길게 눌러 큐브부터 넣는다.</span>
        <span class="k">멈추기·걸림</span><span>버튼이 안 먹는다 → UNO <b>RESET</b> → 길게 → 손으로 맞춰 넣고 길게.</span>
        <span class="k"><svg class="warnic" viewBox="0 0 10 9" width="3.6mm" height="3.2mm"><path d="M5 0.6 L9.5 8.4 H0.5 Z" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/><path d="M5 3.4 V5.8" stroke="${INK}" stroke-width="0.9"/><circle cx="5" cy="7.1" r="0.5" fill="${INK}"/></svg> 전원</span><span><b>${f('vmot')} V 만 끄면 서보(${f('servoV')} V)는 계속 움직인다.</b></span>
      </div>
    </div>
  </div>
  <div>
    ${head('green', '', '사용 방법')}
    <div class="hint">버튼 하나 — <b>짧게</b> = 섞기·풀기 · <b>길게(${f('longS')} s)</b> = 넣기·꺼내기</div>
    <div class="steps">
      ${step(1, 'long', '큐브 넣기', '<b>다 맞춘</b> 큐브를 흰색 아래 · 초록 앞으로', D.lcd.place)}
      ${step(2, 'long', '장착', '보드가 다 맞춘 상태로 다시 센다', D.lcd.loaded)}
      ${step(3, 'short', '섞기', `로봇이 무작위 ${f('scrambleLen')}수를 직접 돌리며 기록`, D.lcd.scrambled)}
      ${step(4, 'short', '풀기', `계산 후 실행<br>보통 약&nbsp;${f('avg30s')}&nbsp;s(계산값)`, D.lcd.solved)}
    </div>
    <div class="again">${lcdTxt(D.lcd.solved[0])} 에서 <b>짧게</b> = 다시 섞기 · <b>길게</b> = 꺼내기 ${lcdTxt(D.lcd.remove[0])}</div>
  </div>
</section>

<section class="cards">
  <div class="card">
    ${head('red', '①', '기구')}
    <div class="parts"><b>A</b><span>컵 스텝모터 — 아래 층 · 큐브 전체 회전</span><b>B</b><span>후드 서보 — 위 두 층 붙잡기</span><b>C</b><span>리프터 서보 — 앞으로 넘기기</span></div>
    <div class="rgrid">${reorderCards}</div>
    <div class="txt">층은 아래에서만 돈다 → 돌릴 면을 먼저 아래로 (<b>y</b> 스핀 · <b>FLIP</b> 뒤집기).</div>
  </div>
  <div class="card" style="--c:${O}">
    ${head('orange', '②', '회전 오차 보정')}
    <div class="fig">${cupMoveFig(F, O)}</div>
    <div class="txt">센서 없이 매번 <b>더 돌고 → 되돌리고 → 밀어</b> 가운데로. 합은 항상 ${f('quarter')} 스텝이라 오차가 쌓이지 않는다.</div>
  </div>
  <div class="card">
    ${head('blue', '③', 'CFOP · IDA*')}
    <div class="fig">${idaCompact(D, F, B)}</div>
    <div class="txt">크로스를 IDA* 로 찾고(한도를 <b>${ok('1', 'bound++')}씩 올려</b> 다시) F2L·OLL·PLL 로 마무리 — 보드 안에서.</div>
  </div>
</section>

<footer class="foot">
  ${qrSvg}
  <div>
    <div class="url" data-ok="저장소 주소">${esc(REPO_URL)}</div>
    <div class="more">코드 · 회로 · 3D 모델 · 시리얼 명령 · 자세한 설명은 QR → 레포</div>
    <div class="refs">참고: Tilted Twister · CUBOTino (기울어진 홀더·리프터 원리) · ${ok('Korf (1985)', '인용 연도')} IDA* · Lynch &amp; Park, <i>Modern Robotics</i> · Slocum ${ok('§3', '인용 절')}</div>
  </div>
</footer>

</div>
<script>
// 배치 검사: 내용이 쪽 아래 여백 안에 들어오는지, 오른쪽으로 넘치는 요소가 없는지 → body[data-layout] (check.mjs 가 읽는다)
addEventListener('load', async () => {
  await document.fonts.ready;
  const mm = 96 / 25.4, page = document.querySelector('.page').getBoundingClientRect(), bad = [];
  const bottom = page.top + (364 - 6.5) * mm, right = page.left + (257 - 8.5) * mm;
  const name = (el) => el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className : '');
  for (const el of document.querySelectorAll('.page *')) {
    const r = el.getBoundingClientRect();
    if (!r.height || !r.width) continue;
    if (r.bottom > bottom + 0.5) bad.push('아래 넘침 ' + name(el) + ' ' + ((r.bottom - page.top) / mm).toFixed(1) + 'mm');
    if (r.right > right + 0.5) bad.push('오른쪽 넘침 ' + name(el) + ' ' + ((r.right - page.left) / mm).toFixed(1) + 'mm');
  }
  // 글자 크기: 모든 글자 ≥ 7 pt, 본문(.lead .st .part .cf ul.pts) ≥ 9 pt. SVG 는 화면 배율(getScreenCTM)까지 곱한다
  let minPt = 99, minWhere = '';
  const walker = document.createTreeWalker(document.querySelector('.page'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; let pt;
    if (el instanceof SVGElement) { const t = el.closest('text'); if (!t) continue; pt = parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM().a * 0.75; }
    else pt = parseFloat(getComputedStyle(el).fontSize) * 0.75;
    if (pt < minPt) { minPt = pt; minWhere = n.nodeValue.trim().slice(0, 20); }
    if (pt < 6.95) bad.push('7 pt 미만 ' + pt.toFixed(2) + 'pt "' + n.nodeValue.trim().slice(0, 20) + '"');
    if (el.closest('.lead,.st,.kv,.fix,.again,.hint,.card .txt,.parts,.more') && !el.closest('code,.lcd') && pt < 9.95) bad.push('본문 10 pt 미만 ' + pt.toFixed(2) + 'pt "' + n.nodeValue.trim().slice(0, 20) + '"');
  }
  document.body.dataset.minPt = minPt.toFixed(2) + ' ' + minWhere;
  const mono = [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'JBM' && f.status === 'loaded');
  if (!mono) bad.push('JetBrains Mono 로드 안 됨');
  document.body.dataset.layout = bad.length ? JSON.stringify([...new Set(bad)].slice(0, 20)) : 'ok';
  const last = Math.max(...[...document.querySelectorAll('.page > *')].map((e) => e.getBoundingClientRect().bottom));
  document.body.dataset.bottomMm = ((last - page.top) / mm).toFixed(1);
});
</script>
</body></html>`;


// ---- 쓰기 + Chrome ----
mkdirSync(path.dirname(OUT_HTML), { recursive: true });
mkdirSync(path.dirname(OUT_PDF), { recursive: true });
writeFileSync(OUT_HTML, html);
const chrome = findChrome();
const url = pathToFileURL(OUT_HTML).href;
const common = ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  '--allow-file-access-from-files', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--virtual-time-budget=8000', '--run-all-compositor-stages-before-draw'];
const tmpPdf = OUT_PDF + '.tmp.pdf';
execFileSync(chrome, [...common, '--no-pdf-header-footer', `--print-to-pdf=${tmpPdf}`, url], { stdio: 'pipe' });
// Chrome 은 쪽 크기를 1.2 pt 단위로 올림한다(257 mm → 729.12 pt). 내용은 257×364 mm 안에 있으므로
// MediaBox 를 정확한 B4(728.504 × 1031.811 pt)로 맞춘다 — 왼쪽 위 기준, 오른쪽·아래 여분 0.6 pt 이하만 잘린다.
{
  const MM = 72 / 25.4, W = 257 * MM, H = 364 * MM;
  const doc = await PDFDocument.load(readFileSync(tmpPdf));
  if (doc.getPageCount() !== 1) throw new Error('PDF 가 ' + doc.getPageCount() + '쪽 — 1쪽이어야 한다');
  const pg = doc.getPage(0); const { height: h0 } = pg.getSize();
  pg.setMediaBox(0, h0 - H, W, H); pg.setCropBox(0, h0 - H, W, H);
  doc.setTitle('큐브 풀이 로봇'); doc.setAuthor('1반 6팀 · 1103 김재혁 · 1105 나준우'); doc.setSubject('컴퓨터과학 2 피지컬 컴퓨팅 · 최종 산출물 포스터 (B4)');
  doc.setCreator('v5/poster/scripts/build.mjs'); doc.setProducer('Chrome headless + pdf-lib');
  writeFileSync(OUT_PDF, await doc.save());
  rmSync(tmpPdf);
}
// 미리보기: 257×364 mm @96 dpi ≈ 972×1376 px, 2배 배율
execFileSync(chrome, [...common, '--force-device-scale-factor=2', '--window-size=972,1376', `--screenshot=${OUT_PNG}`, url], { stdio: 'pipe' });
console.log('HTML ', path.relative(REPO, OUT_HTML));
console.log('PDF  ', path.relative(REPO, OUT_PDF));
console.log('PNG  ', path.relative(REPO, OUT_PNG));
