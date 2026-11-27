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
import { esc, cubeNet, reorientNet, cupMoveFig, idaFig, stageBar, btnIcon } from './figs.mjs';
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
  <div class="rcard">${reorientNet(p, R)}<div><b>${POSNAME[p]}</b><br><span class="mono rops" data-fact="re${p}">${esc(F['re' + p].v)}</span></div></div>`).join('');

const stageCols = D.stages.map((s, i) => `<td class="mono">${f('stName' + i)}</td>`).join('');
const stageNodes = D.stages.map((s, i) => `<td class="num">${f('stNodes' + i)}</td>`).join('');

const serialRows = [
  ['S', 'S [seed]', '20수 섞기 (같은 seed = 같은 섞기)'],
  ['V', 'V', '풀기 + 단계별 수·노드 출력'],
  ['M', "M R U R'", '임의 수열 실행'],
  ['L', 'L / E', '장착 한 단계(= 길게) / 배출'],
  ['F', 'F · Y k', '시연용 뒤집기 / 스핀 y^k'],
  ['P', 'P', '스티커 54칸 + 기구 상태 출력'],
  ['R', 'R', '내부 모델을 풀린 상태로 리셋'],
  ['Q', 'Q 0|1', '1 = 모터·서보 없이 절차만 출력'],
  ['J', 'J ±n', '컵 영점 미세 회전'],
  ['O', 'O · H · K', '조정: 오버슈트·여유 / 후드 / 리프터'],
];
// 설명 속 숫자 표기 (20수, 54칸, 1 =)
const serialDesc = (s) => s.replace('20수', `${f('scrambleLen')}수`).replace('54칸', `${ok('54', '정의: 3×3×6 스티커')}칸`).replace('1 = ', `${ok('1', 'Q 인자 값')} = `);

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>큐브 풀이 로봇 — 포스터</title>
<style>
@font-face{font-family:'JBM';font-weight:400;src:url('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2') format('woff2')}
@font-face{font-family:'JBM';font-weight:700;src:url('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2') format('woff2')}
@page{size:257mm 364mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:257mm;height:364mm;background:${PAPER}}
body{font-family:'Noto Sans CJK KR','Noto Sans KR','Malgun Gothic',sans-serif;color:${INK};font-size:9pt;line-height:1.38;-webkit-print-color-adjust:exact;print-color-adjust:exact;word-break:keep-all}
.page{width:257mm;height:364mm;padding:8mm 9mm 7mm;display:flex;flex-direction:column;gap:2.6mm;overflow:hidden}
.mono,code,.num{font-family:'JBM','Noto Sans CJK KR',monospace}
code{font-size:8.6pt}
.mono,code,pre,.num,.lc,.lcdtxt,svg text.mono{font-variant-ligatures:none;font-feature-settings:'liga' 0,'calt' 0}
b{font-weight:700}
.muted{color:${MUTED}}
svg text{font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif}
svg text.mono{font-family:'JBM',monospace}
/* 머리 */
.top{display:flex;justify-content:space-between;font-size:9pt;color:${MUTED};border-bottom:0.5mm solid ${INK};padding-bottom:1.4mm}
.top b{color:${INK}}
.title{display:flex;align-items:flex-end;gap:6mm;margin-top:1mm}
.title h1{font-size:40pt;line-height:1;font-weight:900;letter-spacing:-0.02em}
.faces{display:grid;grid-template-columns:repeat(3,5.2mm);gap:0.8mm;margin-bottom:1.6mm}
.faces i{display:block;width:5.2mm;height:5.2mm;border-radius:0.8mm;border:0.25mm solid ${INK}}
.lead{font-size:12.5pt;font-weight:500;line-height:1.3;margin-top:1.2mm}
.lead b{font-weight:800}
.stats{display:grid;grid-template-columns:repeat(5,1fr);border-top:0.35mm solid ${INK};border-bottom:0.35mm solid ${INK};margin-top:1.8mm}
.stat{padding:1.2mm 2.4mm 1.1mm;border-left:0.25mm solid #c9ced3}
.stat:first-child{border-left:0}
.stat .big{font-family:'JBM',monospace;font-size:22pt;font-weight:700;line-height:1.05;letter-spacing:-0.02em}
.stat .big small{font-family:'Noto Sans CJK KR',sans-serif;font-size:11pt;font-weight:700;margin-left:0.8mm}
.stat .cap{font-size:8pt;color:${MUTED};line-height:1.3}
/* 섹션 머리 */
.sec-head{display:flex;align-items:baseline;gap:2.4mm;margin-bottom:1.8mm}
.tag{display:inline-block;font-size:13pt;font-weight:800;padding:0.5mm 2.6mm 0.7mm;line-height:1.25}
.sec-sub{font-size:9pt;color:${MUTED}}
h3{font-size:10pt;font-weight:800;margin:1.6mm 0 0.8mm}
/* 2행 */
.row2{display:grid;grid-template-columns:97mm 1fr;gap:6mm}
.product{width:97mm;height:55mm;border:0.3mm solid ${INK};overflow:hidden;background:#eef2f4}
.product img{width:100%;height:100%;object-fit:cover;display:block}
.cap2{font-size:8pt;color:${MUTED};margin-top:0.8mm}
.parts{margin-top:1.8mm}
.part{display:grid;grid-template-columns:6mm 1fr;gap:1.6mm;margin-bottom:1.1mm;align-items:start;line-height:1.32}
.pid{width:5.6mm;height:5.6mm;border-radius:50%;background:${R};color:#fff;font-weight:800;font-size:10pt;display:flex;align-items:center;justify-content:center}
.part .h{font-weight:800;font-size:10pt}
.part .h code{font-weight:400;color:${MUTED};margin-left:1.2mm}
/* 사용 방법 */
.use .prep{display:flex;flex-wrap:wrap;gap:0.6mm 3mm;font-size:9pt;border:0.3mm solid ${G};padding:1.3mm 2mm;margin-bottom:1.6mm}
.use .prep b{color:${G}}
.steps{display:flex;flex-direction:column;gap:1mm}
.step{display:grid;grid-template-columns:7mm 10mm 1fr 41mm;gap:1.6mm;align-items:center;border-top:0.25mm solid #cfd5d9;padding-top:1mm}
.step:first-child{border-top:0;padding-top:0}
.sn{font-family:'JBM',monospace;font-weight:800;font-size:17pt;color:${G};line-height:1}
.sn.z{font-size:11pt;color:${MUTED}}
.bt{display:flex;flex-direction:column;align-items:center;font-size:8pt;font-weight:800;line-height:1.1;text-align:center}
.bt svg{width:7mm;height:7mm}
.bt.l{color:${G}}
.st{font-size:9pt;line-height:1.32}
.st b{font-size:9.6pt}
.lcd{background:${LCD.frame};padding:1.2mm 1.3mm;border-radius:1mm;display:inline-block}
.lrow{display:grid;grid-template-columns:repeat(16,2.33mm);background:${LCD.bg};}
.lrow+.lrow{border-top:0.15mm solid #c9d69c}
.lc{font-family:'JBM',monospace;font-size:7.6pt;font-weight:700;color:${LCD.ink};text-align:center;line-height:3.5mm;white-space:pre;border-right:0.1mm solid #cbd8a0}
.lc.v{color:#7c8a5a;font-size:7pt}
.lcdtxt{font-family:'JBM',monospace;font-size:8pt;background:${LCD.bg};color:${LCD.ink};padding:0 0.8mm;font-weight:700;border-radius:0.4mm}
.fail{margin-top:1.8mm;border-top:0.35mm solid ${INK};padding-top:1.2mm}
.fail table{width:100%;border-collapse:collapse;font-size:8.4pt;line-height:1.3}
.fail td{padding:0.55mm 1mm;vertical-align:top;border-bottom:0.2mm solid #dde2e5}
.fail td:first-child{width:36mm}
/* 3행 */
.row3{display:grid;grid-template-columns:104mm 1fr;gap:6mm}
.rgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.4mm 2mm;margin-top:1mm}
.rcard{display:flex;gap:1.8mm;align-items:center;font-size:9pt;line-height:1.25}
.rnet{width:13.6mm;height:10.2mm;flex:none}
.rops{font-size:8.2pt;color:${R};font-weight:700}
.note{font-size:8.4pt;color:${MUTED};margin-top:1.4mm;line-height:1.35}
.note b{color:${INK}}
.cupwrap{display:grid;grid-template-columns:62mm 1fr;gap:3mm;align-items:start}
.cupfig{width:62mm;height:37mm}
ul.pts{list-style:none;font-size:9pt}
ul.pts li{padding-left:3mm;position:relative;margin-bottom:0.9mm;line-height:1.36}
ul.pts li:before{content:'';position:absolute;left:0;top:1.9mm;width:1.4mm;height:1.4mm;background:var(--c)}
/* 4행 */
.row4{display:grid;grid-template-columns:93mm 1fr;gap:6mm}
.st3 table{border-collapse:collapse;width:100%;font-size:8.6pt}
.st3 td{padding:0.35mm 1mm;border-bottom:0.2mm solid #dde2e5}
.st3 th{font-size:8pt;color:${MUTED};font-weight:500;text-align:left;padding:0 1mm;border-bottom:0.3mm solid ${INK}}
.st3 .num{text-align:right}
.st3 table.hz td{font-size:7.6pt;padding:0.4mm 0.6mm;text-align:center;white-space:nowrap}
.st3 table.hz th{font-size:8pt;padding:0.4mm 0.8mm 0.4mm 0;border-bottom:0.2mm solid #dde2e5;white-space:nowrap}
.st3 th.num{text-align:right}
.cf{display:grid;grid-template-columns:15mm 1fr;gap:0.6mm 2mm;font-size:9pt;line-height:1.33;margin-bottom:1.6mm}
.cf b{color:${B}}
.nets{display:flex;align-items:center;justify-content:space-around;gap:2mm;margin-top:0.2mm;font-size:8pt;color:${MUTED}}
.net{width:23.4mm;height:21.55mm}
.idafig{width:140mm;height:50mm}
pre.code{font-family:'JBM',monospace;font-size:8pt;background:#f1f3f5;border-left:0.8mm solid ${B};padding:1mm 2mm;margin-top:0.6mm;line-height:1.35;white-space:pre}
.stagebar{width:93mm;height:9.5mm;margin-top:1.4mm}
/* 아래 */
.foot{display:grid;grid-template-columns:1fr 82mm;gap:6mm;margin-top:auto;border-top:0.5mm solid ${INK};padding-top:2mm}
.ser table{border-collapse:collapse;width:100%;font-size:8.3pt;line-height:1.28}
.ser td{padding:0.35mm 1.2mm;border-bottom:0.2mm solid #e3e6e8;vertical-align:top}
.ser td:first-child{white-space:nowrap;width:16mm}
.ser .two{display:grid;grid-template-columns:1fr 1fr;gap:0 3mm}
.ref{display:grid;grid-template-columns:22mm 1fr;gap:2.4mm;align-items:start}
.ref svg{width:22mm;height:22mm}
.ref .url{font-family:'JBM',monospace;font-size:7.4pt;font-weight:700;word-break:break-all}
.ref ol{font-size:7.4pt;color:${MUTED};padding-left:3.2mm;margin-top:0.5mm;line-height:1.28}
.cmd{font-weight:700}
</style></head>
<body><div class="page">

<header>
  <div class="top"><span><b>컴퓨터과학 ${ok('2', '과목명')}</b> · 피지컬 컴퓨팅 수행평가 · 최종 산출물 포스터</span><span data-ok="반·팀·학번 (제출 파일 이름)"><b>1반 6팀</b> · 1103 김재혁 · 1105 나준우</span></div>
  <div class="title">
    <div class="faces">${['white', 'red', 'green', 'yellow', 'orange', 'blue'].map((k) => `<i style="background:${C[k].tag}" title="${C[k].name}"></i>`).join('')}</div>
    <h1>큐브 풀이 로봇</h1>
  </div>
  <p class="lead">아두이노가 큐브를 <b>직접 섞고</b>, 보드 안에서 <b>CFOP</b> 로 풀이를 계산해, <b data-ok="구동기 3 = 스텝모터 1 + 서보 2 (HARDWARE_V5 0절)">스텝모터 1개와 서보 2개</b>로 맞춘다</p>
  <div class="stats">
    <div class="stat"><div class="big">${f('moves')}<small>수</small></div><div class="cap">풀이 길이 (시드 ${f('seed')}, 크로스·F2L·OLL·PLL 합)</div></div>
    <div class="stat"><div class="big">${f('crossNodes')}</div><div class="cap">크로스 IDA* 탐색 노드 (시드 ${f('seed')})</div></div>
    <div class="stat"><div class="big">${f('actuators')}<small>개</small></div><div class="cap">구동기 — 스텝모터 ${ok('1', 'NEMA17 1개')} · 서보 ${ok('2', 'MG996R·SG90')}</div></div>
    <div class="stat"><div class="big">${f('sensors')}<small>개</small></div><div class="cap">센서 — 직접 섞으며 기록해 상태를 안다</div></div>
    <div class="stat"><div class="big">${f('fomaxT')}<small>mm</small></div><div class="cap">포맥스 수작업 ${f('fomaxKinds')}종 ${f('fomaxPieces')}장</div></div>
  </div>
</header>

<section class="row2">
  <div>
    ${tag('white', '최종 산출물')}
    <div class="product"><img src="../img/product.png" alt="최종 산출물"></div>
    <div class="cap2">${esc(productCaption)}</div>
    <div class="parts">
      ${tag('red', '핵심 기능 ① 기구', `아래 한 축으로 ${ok('6', '정의: 큐브 6면')}면을 모두 돌린다`)}
      <div class="part"><span class="pid">A</span><div><div class="h">컵 스텝모터<code>NEMA17 + A4988</code></div>후드가 닫히면 <b>아래 층만</b>, 열리면 <b>큐브 전체</b>를 돌린다. ${f('quarter')} 스텝 = ${ok('90°', '정의: 한 수')} (${f('micro')} 마이크로스텝)</div></div>
      <div class="part"><span class="pid">B</span><div><div class="h">후드 서보<code>MG996R</code></div>닫아서 위 두 층을 잡는다. CLOSE ${f('hoodClose')}° · OPEN ${f('hoodOpen')}° · LOAD ${f('hoodLoad')}°</div></div>
      <div class="part"><span class="pid">C</span><div><div class="h">리프터 서보<code>SG90</code></div>큐브 뒤쪽 아래 모서리를 끌어올려 <b>앞으로 넘긴다</b>(FLIP, 약 ${f('flipS')} s). 컵이 ${f('tilt')}° 기울어 큐브가 스스로 자리 잡는다.</div></div>
    </div>
  </div>

  <div class="use">
    ${tag('green', '사용 방법', `버튼 하나(${f('btnPin')}) — <b>짧게</b> = 섞기/풀기 · <b>길게 ${f('longS')} s</b> = 넣기/꺼내기`)}
    <div class="prep"><b>준비</b><span>① ${f('vmot')} V 어댑터 → 모터 드라이버</span><span>② USB → UNO R4 WiFi</span><span>③ ${f('servoV')} V USB 어댑터 → 서보</span><span>④ <b>다 맞춘</b> ${f('cubeMm')} mm 큐브</span></div>
    <div class="steps">
      <div class="step"><span class="sn z">ON</span><span class="bt muted">전원</span>
        <div class="st"><b>전원을 켠다.</b> 컵의 홈(노치)이 정확히 뒤를 향하는지 확인 — 어긋나면 시리얼 ${cmd('J', 'J ±n')}.</div>${lcd('CUBE ROBOT V5', 'hold=LOAD tap=GO')}</div>
      <div class="step"><span class="sn">${ok('1', '단계 번호')}</span><span class="bt l">${btnIcon('long', G)}길게</span>
        <div class="st"><b>후드가 뒤로 젖혀진다.</b> 다 맞춘 큐브를 <b>흰색 아래 · 초록 앞</b>으로 컵에 위에서 내려놓는다.</div>${lcd('PLACE CUBE SOLVED', 'WHITE DOWN GRN FRONT')}</div>
      <div class="step"><span class="sn">${ok('2', '단계 번호')}</span><span class="bt l">${btnIcon('long', G)}길게</span>
        <div class="st"><b>장착.</b> 후드가 돌아와 큐브를 덮고 삑 소리가 난다.</div>${lcd('CUBE LOADED', 'SCRAMBLE / SOLVE')}</div>
      <div class="step"><span class="sn">${ok('3', '단계 번호')}</span><span class="bt">${btnIcon('short', G)}짧게</span>
        <div class="st"><b>섞기.</b> 로봇이 무작위 ${f('scrambleLen')}수를 직접 돌리며 수열을 기록한다 (${lcdTxt('SCRAMBLING')} 진행 수 표시).</div>${lcd('SCRAMBLED 20mv', 'seed #')}</div>
      <div class="step"><span class="sn">${ok('4', '단계 번호')}</span><span class="bt">${btnIcon('short', G)}짧게</span>
        <div class="st"><b>풀기.</b> ${lcdTxt('SOLVING...')} 계산 → ${lcdTxt('EXECUTING')} 실행 → 완료 음. 시드 ${f('seed')} 예상 약 ${f('minutes1')}분(실측 전).</div>${lcd('SOLVED!', '#mv #.#s')}</div>
      <div class="step"><span class="sn z">끝</span><span class="bt l">${btnIcon('long', G)}길게</span>
        <div class="st"><b>꺼내기.</b> 후드가 젖혀지면 꺼낸다. 다음 큐브는 넣고 길게 = ${ok('2', '단계 번호')}단계. 꺼내지 않고 짧게 = 다시 섞기.</div>${lcd('REMOVE CUBE', 'LOAD: next cube')}</div>
    </div>
    <div class="fail">
      <table>
        <tr><td>${lcdTxt('ABORTED')}</td><td>넣기 전에 짧게 눌렀다 → 길게 눌러 ${ok('1', '단계 번호')}·${ok('2', '단계 번호')}단계부터.</td></tr>
        <tr><td>${lcdTxt('ALREADY SOLVED')}</td><td>풀린 상태에서 풀기 명령(${cmd('V', 'V')}) → 짧게 눌러 섞기부터.</td></tr>
        <tr><td>${lcdTxt('SOLVE FAILED')}</td><td>내부 상태가 잘못됐다 → 큐브를 손으로 맞추고 시리얼 ${cmd('R', 'R')}(모델 리셋).</td></tr>
        <tr><td>층이 걸림 · 실물 ≠ 화면</td><td>센서가 없어 로봇은 모른다 → ${f('vmot')} V 전원을 끄고, 손으로 맞춘 뒤 ${cmd('R', 'R')} → 다시 장착.</td></tr>
      </table>
    </div>
  </div>
</section>

<section class="row3">
  <div>
    ${tag('red', `${ok('6', '정의: 큐브 6면')}면 재배향`, '층 회전은 아래에서만 — 돌릴 면을 먼저 아래로')}
    <div class="rgrid">${reorderCards}</div>
    <div class="note">칸 = 돌릴 면이 지금 있는 자리(굵은 칸 = 아래). <b>y</b> = 후드를 열고 큐브 전체를 위에서 봐서 시계 ${ok('90°', '정의: y = 90°')}, <b>FLIP</b> = 리프터로 앞으로 넘기기. 흰색을 아래로 넣으므로 CFOP 의 U 수는 컵만 돈다.
    시드 ${f('seed')}: 뒤집기 ${f('flips1')} · 스핀 ${f('spins1')}. ${f('seeds30')}개 시드 평균 뒤집기 ${f('flipAvg')}회 — ${f('poses')}자세 전수 탐색(DP) 최적값과 같아 고정 표로 충분하다.</div>
  </div>
  <div style="--c:${O}">
    ${tag('orange', '핵심 기능 ② 회전 오차 보정', '센서 없이 매번 기하로 원위치')}
    <div class="cupwrap">${cupMoveFig(F, O)}
      <ul class="pts">
        <li>큐브는 컵 안에서 ±${f('cupPlay')}°, 위 두 층은 후드 안에서 ±${f('hoodPlay')}° 논다 → 그냥 ${ok('90°', '정의: 한 수')} 돌리면 덜 돌거나 비스듬히 남는다.</li>
        <li>① ${f('over')} 스텝(${f('overDeg')}°) 더 돌려 여유 합 ${f('needDeg')}° 를 넘기고, ② 되돌려 후드 가운데로, ③ ${f('play')} 스텝(${f('playDeg')}°) 다시 밀어 컵 가운데로.</li>
        <li>스텝 합은 항상 ${f('quarter')} → 컵 위치 오차가 쌓이지 않는다. 스핀·뒤집기 뒤에도 +${f('play')} −${f('spinBack')} +${f('play')} 왕복.</li>
        <li class="muted" style="font-size:8.4pt">${ok('1', '정의: 한 스텝')} 스텝 = ${f('stepDeg')}°. 계산값 — 실물에서 ${cmd('O', 'O')} 명령 ${f('repeat10')}회 반복 시험으로 확정(실측 전).</li>
      </ul>
    </div>
  </div>
</section>

<section class="row4">
  <div class="st3">
    ${tag('blue', '핵심 기능 ③ CFOP 풀이기', '보드 안에서 계산')}
    <div class="cf">
      <b>Cross</b><span>바닥 십자 엣지 ${f('crossEdges')}개(<span class="mono" data-fact="crossEdgeNames">${esc(F.crossEdgeNames.v)}</span>)를 IDA* 로. 하한 h = 엣지 쌍 ${f('pairs')}개 거리표의 최댓값.</span>
      <b>F2L</b><span>코너·엣지 한 쌍씩 IDA*. 이미 맞춘 슬롯은 깨지 않는다.</span>
      <b>OLL·PLL</b><span>마지막 층의 방향·위치를 키로 공식 표 조회 (OLL ${f('oll57')} · PLL ${f('pll21')}).</span>
    </div>
    <table class="hz"><tr><th>단계</th>${stageCols}</tr><tr><th>노드</th>${stageNodes}</tr></table>
    ${stageBar(D, F, B)}
    <div class="nets">${cubeNet(D.stickersScrambled, 1.95, '섞은 직후')}<span style="text-align:center">크로스 ${f('crossLen')}수 →<br>아래(D) 면 십자</span>${cubeNet(D.stickersCross, 1.95, '크로스 완성')}</div>
  </div>
  <div>
    <div class="sec-head" style="margin-top:1.2mm"><span class="sec-sub"><b style="color:${B}">IDA* 실제 추적</b> · 시드 ${f('seed')} 크로스 <span class="mono" data-fact="crossSeq">${esc(F.crossSeq.v)}</span> · f = g(쓴 수) + h(남은 수 하한) &gt; 한도면 잘라낸다</span></div>
    ${idaFig(D, F, B)}
    <pre class="code"><span class="muted">// v5/firmware/main/solver.cpp ${ok(String(D.solverExcerpt.line), '파일 줄 번호')}행 — 해가 없으면 한도를 ${ok('1', 'bound++')} 올려 처음부터</span>
<span data-excerpt="0">${esc(D.solverExcerpt.text[0])}</span>
<span data-excerpt="1">${esc(D.solverExcerpt.text[1])}</span></pre>
  </div>
</section>

<footer class="foot">
  <div class="ser">
    ${tag('yellow', '고급 — 시리얼 명령', `USB 시리얼 ${f('baud')} baud, 한 줄씩 입력 (대소문자 무관)`)}
    <div class="two">${[serialRows.slice(0, 5), serialRows.slice(5)].map((rows) => `<table>${rows.map(([l, s, d]) => `<tr><td>${cmd(l, s)}</td><td>${serialDesc(esc(d))}</td></tr>`).join('')}</table>`).join('')}</div>
  </div>
  <div class="ref">
    ${qrSvg}
    <div><div class="url" data-ok="저장소 주소">${esc(REPO_URL)}</div>
      <div class="note" style="margin-top:0.2mm">코드·회로·3D 모델·시뮬레이터 전부 (<span class="mono">${ok('v5/', '폴더 이름')}</span>)</div>
      <ol>
        <li>Tilted Twister · CUBOTino — 기울어진 홀더·리프터 원리 참고</li>
        <li>${ok('Korf (1985)', '인용 연도')}, Depth-first iterative-deepening (IDA*)</li>
        <li>Lynch &amp; Park, <i>Modern Robotics</i> · Slocum ${ok('§3', '인용 절')}</li>
      </ol>
    </div>
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
    if (el.closest('.lead,.st,.part,.cf,ul.pts') && !el.closest('code,.lcd,.muted,.h code') && pt < 8.95) bad.push('본문 9 pt 미만 ' + pt.toFixed(2) + 'pt "' + n.nodeValue.trim().slice(0, 20) + '"');
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
