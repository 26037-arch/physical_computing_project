// 장면마다 정보가 가장 많은 순간 1~2장을 stills/ 에 PNG 로 저장. 브라우저 콘솔 오류가 있으면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import { cfopSolveFrames, treeSegments } from '../src/lib/plan.js';
import { BROWSER, CHROMIUM, ROOT, logCollector, makeBundle, readTimeline } from './common.mjs';

const tl = readTimeline();
const by = Object.fromEntries(tl.scenes.map((s) => [s.id, s]));
const L = (id, i) => by[id].lines[i];
const end = (id) => by[id].durationInFrames - 1;

// 장면 안 프레임 (장면 로컬)
const PICKS = [
  ['title', 'main', Math.round(by.title.durationInFrames * 0.6)],
  ['cfop', 'start', 5],
  ['cfop', 'cross', null],
  ['cfop', 'f2l', null],
  ['cfop', 'oll', null],
  ['cfop', 'pll', null],
  ['cfop', 'merge', null], // 아래에서 R'+R2 합치는 순간으로 계산
  ['ida', 'brute', L('ida', 1).from - 12],
  ['ida', 'shrink-mid', L('ida', 2).from + 30],
  ['ida', 'compare', end('ida') - 6],
  ['cup', 'main', Math.round(by.cup.durationInFrames * 0.5)],
  ['hood', 'main', Math.round(by.hood.durationInFrames * 0.6)],
  ['lifter', 'main', 34],
  ['outro', 'main', end('outro') - 10],
];

// cfop 합치는 순간 / IDA* 그래프 구간: 장면 코드와 같은 시간표(src/lib/plan.js)
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'algo_seed1.json'), 'utf8'));
  const nscr = d.stickerSteps.filter((s) => s.phase === 'scramble').length;
  const nsol = d.stickerSteps.length - 1 - nscr;
  const { solveStart, spf } = cfopSolveFrames(by.cfop.durationInFrames, nsol);
  const firstPll = d.stickerSteps.findIndex((s) => s.phase === 'PLL') - 1 - nscr; // 0-based 풀이 수 번호
  PICKS.find((p) => p[1] === 'merge')[2] = Math.round(solveStart + (firstPll + 0.5) * spf);
  // 단계마다 그 단계 가운데 수에서 1장 (F2L 은 두 번째 슬롯)
  const solve = d.stickerSteps.slice(1 + nscr);
  const mid = (pred) => { const ix = solve.map((s, i) => [s, i]).filter(([s]) => pred(s.phase)).map(([, i]) => i); return ix[Math.floor(ix.length / 2)]; };
  const pick = (tag, pred) => { PICKS.find((p) => p[0] === 'cfop' && p[1] === tag)[2] = Math.round(solveStart + (mid(pred) + 0.4) * spf); };
  pick('cross', (ph) => ph === 'CROSS');
  pick('f2l', (ph) => ph === 'F2L BR');
  pick('oll', (ph) => ph === 'OLL');
  pick('pll', (ph) => ph === 'PLL');
  const b0 = L('ida', 1).from;
  const S = treeSegments(L('ida', 2).from - b0);
  const at = (seg, f) => Math.round(b0 + S[seg][0] + (S[seg][1] - S[seg][0]) * f);
  PICKS.push(
    ['ida', 'tree1-bound5', at('i1', 0.6)],
    ['ida', 'tree2-transition', at('t12', 0.55)],
    ['ida', 'tree3-zoom', at('zoomIn', 0.7)],
    ['ida', 'tree4-fan', at('fan', 0.85)],
    ['ida', 'tree5-bound6', at('i2post', 0.5)],
    ['ida', 'tree6-goal-h', at('goalFwd', 0.95)],
    ['ida', 'tree7-goal-up', at('goalUp', 0.5)],
    ['ida', 'tree8-final', at('final', 0.3)],
  );
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
