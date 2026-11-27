// 장면마다 정보가 가장 많은 순간 1~2장을 stills/ 에 PNG 로 저장. 브라우저 콘솔 오류가 있으면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import { BROWSER, CHROMIUM, ROOT, logCollector, makeBundle, readTimeline } from './common.mjs';

const tl = readTimeline();
const by = Object.fromEntries(tl.scenes.map((s) => [s.id, s]));
const L = (id, i) => by[id].lines[i];
const end = (id) => by[id].durationInFrames - 1;

// 장면 안 프레임 (장면 로컬)
const PICKS = [
  ['title', 'main', Math.round(by.title.durationInFrames * 0.6)],
  ['cfop', 'scramble', 50],
  ['cfop', 'f2l', Math.round(by.cfop.durationInFrames * 0.48)],
  ['cfop', 'merge', null], // 아래에서 R'+R2 합치는 순간으로 계산
  ['ida', 'brute', L('ida', 1).from - 12],
  ['ida', 'tree-bound6', L('ida', 1).from + Math.round((L('ida', 2).from - L('ida', 1).from) * 0.42)],
  ['ida', 'tree-goal', L('ida', 2).from - 10],
  ['ida', 'compare', end('ida') - 6],
  ['cup', 'main', Math.round(by.cup.durationInFrames * 0.5)],
  ['hood', 'main', Math.round(by.hood.durationInFrames * 0.6)],
  ['lifter', 'main', 34],
  ['outro', 'main', end('outro') - 10],
];

// cfop 합치는 순간: Cfop.jsx 와 같은 타임라인 공식
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'algo_seed1.json'), 'utf8'));
  const nscr = d.stickerSteps.filter((s) => s.phase === 'scramble').length;
  const nsol = d.stickerSteps.length - 1 - nscr;
  const solveStart = 6 + nscr * 4 + 10;
  const spf = (by.cfop.durationInFrames - 26 - solveStart) / nsol;
  const firstPll = d.stickerSteps.findIndex((s) => s.phase === 'PLL') - 1 - nscr; // 0-based 풀이 수 번호
  PICKS.find((p) => p[1] === 'merge')[2] = Math.round(solveStart + (firstPll + 0.5) * spf);
}

const only = process.argv[2] || null;
const serveUrl = await makeBundle();
const outDir = path.join(ROOT, 'stills');
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
for (const [id, tag, frame] of PICKS) {
  if (only && id !== only) continue;
  const composition = await selectComposition({ serveUrl, id, browserExecutable: BROWSER, chromiumOptions: CHROMIUM, onBrowserLog: logCollector(errors), logLevel: 'error' });
  const f = Math.max(0, Math.min(composition.durationInFrames - 1, frame));
  const output = path.join(outDir, `${id}_${tag}.png`);
  await renderStill({ serveUrl, composition, frame: f, output, imageFormat: 'png', browserExecutable: BROWSER, chromiumOptions: CHROMIUM, onBrowserLog: logCollector(errors), overwrite: true, logLevel: 'error' });
  console.log(`${path.relative(ROOT, output)}  frame ${f}/${composition.durationInFrames}`);
}
if (errors.length) {
  console.error(`browser console errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
  process.exit(1);
}
console.log('console errors: 0');
