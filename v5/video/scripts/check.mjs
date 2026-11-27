// 데이터 일관성 검사: 화면에 쓰는 숫자·수열이 data/algo_seed1.json · narration.md · docs/HARDWARE_V5.md 와
// 맞는지, 3D 층 회전 방향이 stickerSteps 를 그대로 재현하는지 확인한다. 하나라도 틀리면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { applyMove } from '../src/lib/cube.js';
import { ACTUATORS, bruteForceCounts, deriveFacts } from '../src/lib/facts.js';
import { CONFIG, buildTimeline, parseNarration } from './timing.mjs';
import { CFOP_PAUSE_END, TREE_BASE, TREE_SEG, cfopSchedule } from '../src/lib/plan.js';
import { Quaternion } from 'three';
import { facingScore, phaseViews, quatAt } from '../src/lib/cfopView.js';
import { createRequire } from 'node:module';
import { CORNER_NAMES, CROSS_EDGE_IDX, EDGE_NAMES, SLOT_NAMES, stageSolved } from '../src/lib/stages.js';
import { REPO, ROOT } from './common.mjs';

const fails = [];
let passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else fails.push(msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'algo_seed1.json'), 'utf8'));
const narrationMd = fs.readFileSync(path.join(ROOT, 'narration.md'), 'utf8');
const lines = Object.fromEntries(parseNarration(narrationMd).map((l) => [l.id, l]));
const F = deriveFacts(data);

// 1. 3D 기하가 stickerSteps 의 모든 전이를 재현 (층 회전 애니메이션 방향 검증)
{
  const steps = data.stickerSteps;
  let bad = 0;
  for (let i = 1; i < steps.length; i++) if (applyMove(steps[i - 1].stickers, steps[i].move) !== steps[i].stickers) bad++;
  eq(bad, 0, 'stickerSteps 전이 중 3D 기하와 다른 수');
  eq(steps[0].stickers, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', '첫 상태 = 풀린 상태');
  eq(steps[steps.length - 1].stickers, steps[0].stickers, '마지막 상태 = 풀린 상태');
  eq(steps[F.scrambleCount].stickers, data.stickersAfterScramble, '섞은 직후 상태');
  eq(F.scrambleCount, data.scramble.length, '섞기 수');
  eq(steps.filter((s) => s.phase === 'scramble').map((s) => s.move), data.scramble, '섞기 수열');
}

// 2. CFOP 단계·카운터
{
  eq(F.stageBar.map((s) => s.moves), [7, 21, 10, 16], '단계 막대 수 (CROSS F2L OLL PLL)');
  eq(F.stageBar[1].sub.map((s) => s.moves), data.f2l.map((s) => s.moves.length), 'F2L 슬롯별 수');
  eq(F.stageBar.reduce((a, s) => a + s.moves, 0), F.solveMoves.length, '단계 합 = stickerSteps 풀이 수');
  eq(F.solveMoves.length, 54, 'stickerSteps 풀이 수 (합치기 전)');
  eq(F.counts[F.counts.length - 1], data.totals.moves, '카운터 끝 = TOTAL');
  eq(data.totals.moves, 53, 'TOTAL');
  eq(F.mergedSolution, data.totals.solution, '합친 풀이 = totals.solution');
  eq(F.mergeAt, [38], '합쳐지는 풀이 수 번호');
  eq([data.stickerSteps[F.scrambleCount + 38].phase, data.stickerSteps[F.scrambleCount + 39].phase], ['OLL', 'PLL'], '합쳐지는 두 수 = OLL 끝 + PLL 처음');
  eq([F.solveMoves[37], F.solveMoves[38]], ["R'", 'R2'], '합쳐지는 두 수');
  eq(F.stageBar[2].caseName, '35', 'OLL 케이스');
  eq(F.stageBar[3].caseName, 'Ga', 'PLL 케이스');
  eq(F.stageBar.map((s) => s.key), ['CROSS', 'F2L', 'OLL', 'PLL'], '단계 이름');
  const stageMoves = data.stages.flatMap((s) => s.moves);
  eq(stageMoves, F.solveMoves, 'stages 수열 = stickerSteps 풀이 수열');
}

// 2b. CFOP 단계별 강조 조각 정의 = 풀이기 정의, 각 단계 끝에서 그 조각이 실제로 맞춰짐
{
  const require = createRequire(import.meta.url);
  const cubeLib = require(path.join(REPO, 'v5', 'sim', 'cube.js'));
  eq(CORNER_NAMES, cubeLib.CORNER_NAMES, 'CORNER_NAMES = v5/sim/cube.js');
  eq(EDGE_NAMES, cubeLib.EDGE_NAMES, 'EDGE_NAMES = v5/sim/cube.js');
  const solverSrc = fs.readFileSync(path.join(REPO, 'v5', 'sim', 'solver.js'), 'utf8');
  const sn = /SLOT_NAMES\s*=\s*\[([^\]]*)\]/.exec(solverSrc);
  eq(sn ? sn[1].split(',').map((x) => x.trim().replace(/'/g, '')) : null, SLOT_NAMES, 'SLOT_NAMES = solver.js');
  const ce = /const es = \[([\d,\s]+)\]\.map\(\(e\) => this\.edgeState\(c, e\)\)/.exec(solverSrc);
  eq(ce ? ce[1].split(',').map((x) => Number(x)) : null, CROSS_EDGE_IDX, '크로스 엣지 = solver.js');
  ok(/cornerState\(c, 4 \+ s\), es = this\.edgeState\(c, 8 \+ s\)/.test(solverSrc), 'solver.js F2L 슬롯 s = 코너 4+s · 엣지 8+s 가 아님');
  const st = data.stickerSteps;
  for (let i = 1; i < st.length; i++) {
    const ph = st[i].phase;
    if (ph === 'scramble') continue;
    if (st[i + 1] && st[i + 1].phase === ph) continue;
    ok(stageSolved(ph, st[i].stickers), `단계 ${ph} 끝에서 강조 조각이 맞춰지지 않음`);
  }
  eq(data.f2l.map((f) => f.slot), F.solveSteps.filter((s, i, a) => s.phase.startsWith('F2L') && (i === 0 || a[i - 1].phase !== s.phase)).map((s) => s.phase.slice(4)), 'F2L 슬롯 순서 = data f2l slot');
}

// 2c. CFOP 자세: 단계마다 목표 스티커가 카메라를 향하는 정도가 고정 자세(회전 없음)보다 나쁘지 않고 일정 이상
//     + 단계 대표 프레임(단계 가운데 수)에서 실제 보간된 자세로 다시 계산
//     + 재생 속도·멈춤
{
  const views = phaseViews(data.stickerSteps);
  const ident = new Quaternion();
  for (const v of views) {
    const auto = facingScore(v.phase, v.states, v.q);
    const fixed = facingScore(v.phase, v.states, ident);
    ok(auto >= fixed - 0.02, `${v.phase} 자세 점수 ${auto.toFixed(3)} < 고정 자세 ${fixed.toFixed(3)}`);
    ok(auto >= 0.33, `${v.phase} 자세 점수 ${auto.toFixed(3)} < 0.33`);
    const mj = v.first + Math.floor(v.ks.length / 2);
    const qm = quatAt(views, mj + 0.5, 0, 2.5);
    const rep = facingScore(v.phase, [data.stickerSteps[v.ks[Math.floor(v.ks.length / 2)] - 1].stickers], qm);
    ok(rep >= 0.2, `${v.phase} 대표 프레임 점수 ${rep.toFixed(3)} < 0.2`);
  }
  const tl0 = buildTimeline();
  const cf = tl0.scenes.find((sc) => sc.id === 'cfop');
  const sched = cfopSchedule(cf.durationInFrames, F.solveSteps.map((x) => x.phase));
  ok(sched.spf >= 3, `CFOP 한 수 ${sched.spf.toFixed(2)} 프레임 < 3 (너무 빠름)`);
  eq(sched.pauses.length, 7, 'CFOP 단계 끝 멈춤 수 (CROSS, F2L 4, OLL, PLL)');
  ok(sched.pauses[sched.pauses.length - 1].len >= CFOP_PAUSE_END - 1e-6, 'PLL 끝 멈춤이 짧음');
  ok(sched.pauses.every((x) => x.len >= 6), '멈춤이 6프레임보다 짧음');
}

// 3. IDA*
{
  const ida = data.cross.ida;
  eq(ida.bounds.map((b) => b.bound), [5, 6, 7], 'bound 반복');
  eq(ida.bounds.map((b) => b.goalFound), [false, false, true], 'goal 은 마지막 반복');
  const sumVisited = ida.bounds.reduce((a, b) => a + b.visited, 0);
  eq(sumVisited, 5797, '반복별 visited 합');
  eq(F.crossNodes, 5797, 'cross.ida.nodes');
  eq(data.stages[0].nodes, 5797, 'stages CROSS nodes');
  eq(data.totals.crossNodes, 5797, 'totals.crossNodes');
  eq(F.iterations.map((it) => it.rows.length - 1), ida.bounds.map((b) => b.visited), 'trace 반복별 행 수(루트 제외) = visited');
  eq(F.iterations.map((it) => it.rows.filter((r) => r.event === 'prune').length), ida.bounds.map((b) => b.pruned), 'trace 반복별 prune 수 = pruned');
  for (const it of F.iterations) {
    for (const r of it.rows) {
      if (r.id === 0) continue;
      if (r.event === 'prune') ok(r.f > r.bound, `prune 행 f>bound (id ${r.id})`);
      else ok(r.f <= r.bound, `expand/goal 행 f<=bound (id ${r.id})`);
      ok(r.f === r.g + r.h, `f=g+h (id ${r.id})`);
    }
  }
  const last = F.iterations[F.iterations.length - 1].rows;
  const byId = new Map(last.map((r) => [r.id, r]));
  const goal = last.find((r) => r.event === 'goal');
  const pathMoves = [];
  for (let r = goal; r && r.id !== 0; r = byId.get(r.parent)) pathMoves.unshift(r.move);
  eq(pathMoves, ida.solution, 'trace goal 경로 = 크로스 해');
  eq(ida.solution, data.stages[0].moves, '크로스 해 = stages CROSS');
  eq(ida.solution.join(' '), "U F U D R' L F2", '크로스 7수');
  eq(ida.heuristic.rootH, 5, '루트 h');
}

// 4. 무작정 탐색 수 (공식은 src/lib/facts.js 주석)
{
  const b = bruteForceCounts(7);
  eq(b.perDepth, [18, 243, 3240, 43254, 577368, 7706988, 102876480], '깊이별 수열 수');
  eq(b.total, 111207591, '1~7수 합');
  ok(narrationMd.includes('111,207,591'), 'narration.md 숫자 근거에 111,207,591');
  // 독립 검산: 실제로 수열을 세는 완전 탐색 (깊이 5 까지)
  const OPP = (f) => (f + 3) % 6;
  const count = (depth, last) => {
    if (depth === 0) return 1;
    let n = 0;
    for (let f = 0; f < 6; f++) {
      if (f === last) continue;
      if (last >= 0 && f === OPP(last) && f < last) continue;
      n += 3 * count(depth - 1, f);
    }
    return n;
  };
  for (let d = 1; d <= 5; d++) eq(count(d, -1), b.perDepth[d - 1], `깊이 ${d} 완전 탐색 검산`);
}

// 5. 대본(narration.md)의 숫자 ↔ 데이터
{
  eq(Object.keys(lines).length, 10, '대본 10줄');
  const L = (id) => lines[id].text;
  const has = (id, word, value, expected, what) => {
    ok(L(id).includes(word), `줄 ${id} 에 "${word}" 없음`);
    eq(value, expected, `줄 ${id} "${word}" (${what})`);
  };
  has('02', '네 단계', F.stageBar.length, 4, '단계 수');
  has('03', '쉰세 수', data.totals.moves, 53, 'TOTAL');
  has('04', '일곱 수 안', 7, data.cross.ida.solution.length, '무작정 탐색 깊이 = 크로스 길이');
  has('04', '1억 1천만', Math.round(bruteForceCounts(7).total / 1e7), 11, '1억 1천만 ≈ 111,207,591');
  has('06', '오천칠백구십칠', data.cross.ida.nodes, 5797, '크로스 노드');
  has('07', '스텝모터 하나', ACTUATORS.steppers, 1, '층을 돌리는 스테퍼 수');
  has('08', '서보 후드', 'MG996R', 'MG996R', '후드 = 서보');
  has('09', '서보 리프터', 'SG90', 'SG90', '리프터 = 서보');
  eq(['08', '09'].filter((id) => L(id).includes('서보')).length, ACTUATORS.servos, '대본의 서보 줄 수 = 서보 수');
  // 10: "장착 뒤 짧게 두 번" = 장착(LOADED) 상태에서 짧게 = START, 풀린 상태면 섞기 → 다음 짧게 = 풀기
  {
    ok(L('10').includes('장착 뒤 짧게 두 번'), '줄 10 에 "장착 뒤 짧게 두 번" 없음');
    const ino = fs.readFileSync(path.join(REPO, 'v5', 'firmware', 'main', 'main.ino'), 'utf8');
    ok(/짧게\s*=\s*START/.test(ino), 'main.ino: 짧게 = START 설명 없음');
    ok(/case BTN_START:\s*if \(cube\.isSolved\(\)\) doScramble\(.*?\); else doSolve\(\);/.test(ino), 'main.ino: START = 풀린 상태면 섞기, 아니면 풀기 가 아님');
  }
  ok(narrationMd.includes('189 + 4,341 + 1,267'), 'narration.md 숫자 근거의 반복별 노드');
  eq(data.cross.ida.bounds.map((b) => b.visited), [189, 4341, 1267], '반복별 노드');
}

// 6. 구동기 수 ↔ docs/HARDWARE_V5.md 장치 표
{
  const hw = fs.readFileSync(path.join(REPO, 'docs', 'HARDWARE_V5.md'), 'utf8');
  const qty = (re) => { const m = re.exec(hw); return m ? Number(m[1]) : null; };
  const nema = qty(/^\|\s*NEMA17[^|]*\|\s*(\d+)\s*\|/m);
  const mg = qty(/^\|\s*MG996R[^|]*\|\s*(\d+)\s*\|/m);
  const sg = qty(/^\|\s*SG90[^|]*\|\s*(\d+)\s*\|/m);
  eq(nema, ACTUATORS.steppers, '스테퍼 수 (HARDWARE_V5 표)');
  eq(mg + sg, ACTUATORS.servos, '서보 수 (HARDWARE_V5 표)');
}

// 7. 자막 = 대본, 타이밍 ≤ 60 s
{
  const tl = buildTimeline();
  const subs = tl.scenes.flatMap((s) => s.lines.map((l) => [l.id, l.text]));
  eq(subs.map((x) => x[0]), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'], '자막 줄 순서');
  for (const [id, text] of subs) eq(text, lines[id].text, `자막 ${id} = 대본`);
  ok(tl.totalSec <= CONFIG.maxSec, `총 길이 ${tl.totalSec.toFixed(2)} s > ${CONFIG.maxSec} s`);
  // 무음 연출 구간(timeline.config.json holdAfterSec)은 대본에 있는 줄 뒤에만, 자막은 그 구간에 나오지 않는다
  for (const [id, sec] of Object.entries(CONFIG.holdAfterSec || {})) {
    ok(lines[id] != null, `holdAfterSec 의 줄 ${id} 가 대본에 없음`);
    ok(sec >= 0 && sec <= 10, `holdAfterSec ${id} = ${sec} s (0~10)`);
  }
  const l05 = tl.scenes.find((s) => s.id === 'ida').lines.find((l) => l.id === '05');
  eq(l05.holdFrames, Math.round((CONFIG.holdAfterSec['05'] || 0) * tl.fps), '05 뒤 무음 연출 프레임');
  // 시간표 구간이 빈틈 없이 이어지는지
  const segs = Object.values(TREE_SEG);
  for (let i = 1; i < segs.length; i++) eq(segs[i][0], segs[i - 1][1], `IDA* 그래프 시간표 구간 ${i} 연속`);
  eq(segs[segs.length - 1][1], TREE_BASE, 'IDA* 그래프 시간표 끝');
  for (const s of tl.scenes) for (const l of s.lines) ok(l.from + l.durationInFrames <= s.durationInFrames, `장면 ${s.id} 줄 ${l.id} 이 장면 밖`);
}

// 8. 장면 코드에 숫자·수열을 손으로 적지 않았는지 (데이터에서 와야 함)
{
  const dir = path.join(ROOT, 'src', 'scenes');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
    for (const lit of ['5797', '5,797', '111207591', '111,207,591', "U F U D R' L F2", '189', '4341', '1267']) {
      ok(!src.includes(lit), `${f} 에 데이터 값 ${lit} 가 직접 적혀 있음`);
    }
  }
}

if (fails.length) {
  console.error(`check: ${fails.length} fail / ${passes} pass`);
  for (const f of fails.slice(0, 40)) console.error('  FAIL ' + f);
  process.exit(1);
}
console.log(`check: all ${passes} pass (stickerSteps ${data.stickerSteps.length - 1} 전이, TOTAL ${data.totals.moves}, cross ${F.crossNodes} nodes, brute ${F.brute.total})`);
