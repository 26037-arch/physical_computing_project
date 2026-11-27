// check.mjs — 포스터가 근거 파일과 맞는지 검사한다. 실패가 하나라도 있으면 종료코드 1.
//   npm run check   (먼저 npm run build)
// 1) 숫자: 포스터 글자 속 숫자는 모두 data-fact(근거 값과 글자 그대로 같음) 이거나 data-ok(이유 명시) 안에 있어야 한다
// 2) LCD: 16×2 상자의 두 줄은 main.ino 의 같은 lcdShow/fail 호출의 두 문자열(16칸에서 잘린 그대로), %u 자리는 ▮
// 3) 명령: 표·본문의 시리얼 명령 글자는 main.ino handleLine 의 case 글자
// 4) IDA* 그림 값 = algo_seed1.json trace, solver.cpp 발췌 = 원문 줄
// 5) 오프라인: HTML 의 src/href/url() 에 외부 주소 없음, PDF 에 URI·외부 동작 없음
// 6) PDF 1쪽, 728.5 × 1031.8 pt (B4), 배치(넘침·7 pt 미만·본문 9 pt 미만·글꼴) — 브라우저에서 잰 결과
// 7) 색 대비: 섹션 이름표·강조 글자 4.5:1 이상
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'node-html-parser';
import { PDFDocument } from 'pdf-lib';
import { loadFacts, inoLiterals, REPO, SRC } from './facts.mjs';
import { FACE, PAPER, INK, MUTED, LCD, contrast } from './theme.mjs';

const OUT_PDF = path.join(REPO, 'submission', '1반_6팀_1103김재혁_1105나준우_포스터.pdf');
const OUT_HTML = path.join(REPO, 'v5', 'poster', 'dist', 'poster.html');
const OUT_PNG = path.join(REPO, 'v5', 'poster', 'preview.png');
const fails = []; let passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else fails.push(msg); };
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

for (const p of [OUT_PDF, OUT_HTML, OUT_PNG]) if (!existsSync(p)) { console.error('없음:', p, '— 먼저 npm run build'); process.exit(1); }
const D = loadFacts();
const F = D.F;
const htmlText = readFileSync(OUT_HTML, 'utf8');
const root = parse(htmlText, { comment: false, blockTextElements: { script: true, style: true } });
const page = root.querySelector('.page');
const txt = (el) => decode(el.textContent);

// ---- 1) 숫자 ----
let nFact = 0;
for (const el of page.querySelectorAll('[data-fact]')) {
  const k = el.getAttribute('data-fact');
  nFact++;
  ok(F[k], `data-fact="${k}" 가 facts 에 없다`);
  if (F[k]) ok(txt(el).trim() === F[k].v, `숫자 불일치 ${k}: 포스터 "${txt(el).trim()}" ≠ 근거 "${F[k].v}" (${F[k].src})`);
}
// 부품·형식 이름 (숫자가 들어 있지만 수치가 아닌 고유 이름)
const NAMES = /V5H|NEMA17|MG996R|SG90|A4988|UNO R4 WiFi|R4|F2L|CUBOTino|v5\/sim\/wiring\.html|v5\/|\b3D\b|y\^k|\b[URFDLBy]2\b|OLL|PLL/g;
const unmarked = [];
function walk(node) {
  if (node.nodeType === 3) {
    const s = decode(node.rawText).replace(NAMES, '');
    if (/\d/.test(s)) unmarked.push(s.trim().slice(0, 50));
    return;
  }
  if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
  if (node.nodeType === 1) {
    const a = node.attributes || {};
    if (['data-fact', 'data-ok', 'data-lcd', 'data-lcdtxt', 'data-cmd', 'data-excerpt', 'data-trace', 'data-trace-count'].some((k) => k in a)) return;
  }
  for (const c of node.childNodes) walk(c);
}
walk(page);
ok(unmarked.length === 0, '근거 표시 없는 숫자: ' + JSON.stringify(unmarked));
const okReasons = page.querySelectorAll('[data-ok]').map((e) => e.getAttribute('data-ok'));
ok(okReasons.every((r) => r && r.trim()), 'data-ok 에 이유가 비어 있다');

// ---- 2) LCD ----
const ino = D.ino;
const lits = inoLiterals(ino);
// lcdShow/fail 호출마다 (row0 후보들, row1 후보들)
const calls = [];
const lines = ino.split('\n');
let lastFmt = null; const execLabels = [];
for (const m of ino.matchAll(/execute\([^;]*F\("([^"]*)"\)\)/g)) execLabels.push(m[1]);
for (const line of lines) {
  const sn = line.match(/snprintf\(row1,[^"]*"([^"]*)"/); if (sn) lastFmt = sn[1];
  const c0 = line.search(/\b(?:lcdShow|fail)\(/);
  if (c0 < 0 || /template|void /.test(line)) continue;
  // 괄호 짝을 세어 호출 인자만 잘라낸다 (같은 줄의 beep() 등 제외)
  let i = line.indexOf('(', c0) + 1, depth = 1, inStr = false; const st = i;
  for (; i < line.length && depth; i++) { const ch = line[i]; if (ch === '"' && line[i - 1] !== '\\') inStr = !inStr; else if (!inStr) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0; }
  const c = [null, line.slice(st, i - 1)];
  const args = c[1];
  const lastComma = args.lastIndexOf(',');
  const a0 = args.slice(0, lastComma), a1 = args.slice(lastComma + 1).trim();
  let r0 = [...a0.matchAll(/F\("([^"]*)"\)/g)].map((m) => m[1]);
  if (a0.trim() === 'label') r0 = execLabels;
  if (a0.trim() === 'name') r0 = ['CROSS', 'F2L', 'OLL', 'PLL'];
  let r1 = [];
  if (/^"/.test(a1)) r1 = [a1.match(/"([^"]*)"/)[1]];
  else if (a1 === 'row1' && lastFmt) r1 = [lastFmt];
  else r1 = [...a1.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  calls.push({ r0, r1, line });
}
const cut = (s) => s.slice(0, 16);
const fmtShow = (s) => cut(s.replace(/%l?u/g, '#'));
const lcdBoxes = page.querySelectorAll('[data-lcd]');
ok(lcdBoxes.length >= 6, `LCD 상자가 ${lcdBoxes.length}개 — 사용 단계마다 하나씩 있어야 한다`);
for (const box of lcdBoxes) {
  const rows = box.querySelectorAll('.lrow');
  const want = rows.map((r, i) => decode(r.getAttribute('data-lcd' + i)));
  const shown = rows.map((r) => txt(r).replace(/▮/g, '#').replace(/\s+$/, ''));
  rows.forEach((r, i) => ok(shown[i] === cut(want[i]).replace(/\s+$/, ''), `LCD 칸 글자 "${shown[i]}" ≠ 지정 "${want[i]}"`));
  const hit = calls.some((c) => c.r0.some((a) => fmtShow(a) === cut(want[0])) && c.r1.some((b) => fmtShow(b) === cut(want[1])));
  ok(hit, `LCD "${want[0]}" / "${want[1]}" 쌍이 main.ino 의 lcdShow/fail 호출에 없다`);
  rows.forEach((r) => ok([...txt(r)].length === 16, 'LCD 한 줄이 16칸이 아니다'));
}
for (const el of page.querySelectorAll('[data-lcdtxt]')) {
  const s = decode(el.getAttribute('data-lcdtxt'));
  ok(txt(el) === s && lits.some((l) => cut(l) === s || l === s), `LCD 문구 "${s}" 가 main.ino 문자열에 없다`);
}

// ---- 3) 명령 ----
for (const el of page.querySelectorAll('[data-cmd]')) {
  const L = el.getAttribute('data-cmd');
  ok(D.cmdCases.includes(L), `명령 ${L} 이 main.ino handleLine 에 없다`);
  const groups = txt(el).split(/ \/ | · /).map((g) => g.trim()[0]);
  for (const g of groups) ok(D.cmdCases.includes(g), `명령 "${txt(el)}" 의 ${g} 가 main.ino handleLine 에 없다`);
  ok(txt(el).trim()[0] === L, `명령 글자 ${L} 와 표시 "${txt(el)}" 가 다르다`);
}
// 버튼 시간·핀
ok(new RegExp(`LONG_PRESS_MS = ${Math.round(+F.longS.v * 1000)}`).test(ino), '길게 누르기 시간이 main.ino 와 다르다');

// ---- 4) IDA*·발췌 ----
for (const el of page.querySelectorAll('[data-trace]')) {
  const id = +el.getAttribute('data-trace'), b = +el.getAttribute('data-trace-bound'), kind = el.getAttribute('data-trace-kind');
  const n = D.trace.find((t) => t.id === id && t.bound === b);
  ok(n, `trace id ${id} bound ${b} 없음`);
  if (n) ok(txt(el).replace('✕', '') === String(n[kind]), `trace ${id}: 그림 ${txt(el)} ≠ ${kind}=${n[kind]}`);
}
{
  const b0 = D.bounds[0].bound;
  const kids = D.trace.filter((t) => t.bound === b0 && t.parent === 0 && t.depth === 1);
  const want = { kids: kids.length, expand: kids.filter((k) => k.event !== 'prune').length, prune: kids.filter((k) => k.event === 'prune').length };
  for (const el of page.querySelectorAll('[data-trace-count]')) ok(+txt(el) === want[el.getAttribute('data-trace-count')], `trace 개수 ${el.getAttribute('data-trace-count')} 불일치`);
}
const solverSrc = readFileSync(path.join(REPO, SRC.solverCpp), 'utf8').split('\n');
for (const el of page.querySelectorAll('[data-excerpt]')) {
  const i = +el.getAttribute('data-excerpt');
  ok(solverSrc[D.solverExcerpt.line - 1 + i].trim() === txt(el).trim(), `solver.cpp 발췌 ${i}번 줄이 원문과 다르다`);
}

// ---- 5) 오프라인 ----
const resAttrs = [...htmlText.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
const cssUrls = [...htmlText.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]);
const ext = [...resAttrs, ...cssUrls].filter((u) => /^(https?:)?\/\//i.test(u));
ok(ext.length === 0, '외부 리소스: ' + ext.join(', '));
ok(!/@import/.test(htmlText), 'CSS @import 가 있다');
const pdfBytes = readFileSync(OUT_PDF);
const pdfRaw = pdfBytes.toString('latin1');
ok(!/\/URI\b|\/Launch\b|\/GoToR\b|\/JavaScript\b/.test(pdfRaw), 'PDF 에 URI·외부 동작이 있다');

// ---- 6) PDF·배치 ----
const doc = await PDFDocument.load(pdfBytes);
ok(doc.getPageCount() === 1, `PDF 쪽 수 ${doc.getPageCount()} ≠ 1`);
const { width, height } = doc.getPage(0).getSize();
ok(Math.abs(width - 728.5) < 0.5 && Math.abs(height - 1031.8) < 0.5, `PDF 크기 ${width.toFixed(2)} × ${height.toFixed(2)} pt ≠ 728.5 × 1031.8`);
const chrome = findChrome();
if (!chrome) { console.error('Chrome/Edge 없음 — CHROME 환경변수'); process.exit(1); }
function findChrome() {
  return [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find((p) => existsSync(p));
}
const prof = mkdtempSync(path.join(os.tmpdir(), 'poster-check-'));
let dom = '';
try {
  dom = execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', `--user-data-dir=${prof}`,
    '--virtual-time-budget=8000', '--window-size=972,1376', '--dump-dom', pathToFileURL(OUT_HTML).href], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} finally { rmSync(prof, { recursive: true, force: true }); }
const body = parse(dom).querySelector('body');
const layout = body && body.getAttribute('data-layout');
ok(layout === 'ok', '배치 검사: ' + (layout ? decode(layout) : '결과 없음(스크립트 미실행)'));
const minPt = body && body.getAttribute('data-min-pt');

// ---- 7) 색 대비 ----
for (const [k, c] of Object.entries(FACE)) {
  ok(contrast(c.tag, c.tagInk) >= 4.5, `이름표 대비 ${k} ${contrast(c.tag, c.tagInk).toFixed(2)} < 4.5`);
  ok(contrast(c.accent, PAPER) >= 4.5, `강조 글자 대비 ${k} ${contrast(c.accent, PAPER).toFixed(2)} < 4.5`);
}
ok(contrast(INK, PAPER) >= 4.5 && contrast(MUTED, PAPER) >= 4.5, '본문·회색 글자 대비 < 4.5');
ok(contrast(LCD.ink, LCD.bg) >= 4.5, 'LCD 글자 대비 < 4.5');

console.log(`facts ${nFact}개 대조, LCD 상자 ${lcdBoxes.length}개, 명령 ${page.querySelectorAll('[data-cmd]').length}개, data-ok ${okReasons.length}개, 최소 글자 ${minPt}`);
console.log(`PDF ${doc.getPageCount()}쪽 ${width.toFixed(2)} × ${height.toFixed(2)} pt`);
if (fails.length) { console.error(`\n실패 ${fails.length}건 (통과 ${passes}):`); for (const f of fails) console.error(' ✗', f); process.exit(1); }
console.log(`모두 통과 (${passes}건)`);
