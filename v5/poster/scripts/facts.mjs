// facts.mjs — 포스터에 쓰는 숫자·문구를 근거 파일에서 직접 읽는다 (지어낸 값 없음).
// 근거 파일이 바뀌어 정규식이 안 맞으면 바로 예외를 던져 빌드·검사가 멈춘다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const POSTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(POSTER, '..', '..');
const rd = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

export const SRC = {
  ino: 'v5/firmware/main/main.ino',
  mechH: 'v5/firmware/main/mechanism.h',
  mechCpp: 'v5/firmware/main/mechanism.cpp',
  motorsH: 'v5/firmware/main/motors.h',
  solverCpp: 'v5/firmware/main/solver.cpp',
  algo: 'v5/video/data/algo_seed1.json',
  hw: 'docs/HARDWARE_V5.md',
  v5h: 'docs/V5H_DESIGN.md',
  report: 'docs/REPORT_V5.md',
};

function grab(key, re, group = 1) {
  const txt = rd(SRC[key]);
  const m = txt.match(re);
  if (!m) throw new Error(`facts: ${SRC[key]} 에서 ${re} 를 찾지 못함`);
  return m[group];
}
// 문서 안에 그 문구가 그대로 있는지 (문서 근거 숫자)
function phrase(key, s) {
  if (!rd(SRC[key]).includes(s)) throw new Error(`facts: ${SRC[key]} 에 "${s}" 가 없음`);
  return s;
}
const comma = (n) => Number(n).toLocaleString('en-US');

export function loadFacts() {
  const algo = JSON.parse(rd(SRC.algo));
  const ino = rd(SRC.ino);

  // ---- main.ino ----
  const longMs = +grab('ino', /LONG_PRESS_MS\s*=\s*(\d+)/);
  const scrambleLen = +grab('ino', /SCRAMBLE_LEN\s*=\s*(\d+)/);
  const baud = grab('ino', /Serial\.begin\((\d+)\)/);
  const btnPin = grab('ino', /BTN_PIN\s*=\s*(A\d)/);
  // handleLine 의 case 글자 (명령 목록)
  const cmdCases = [...ino.matchAll(/case '([A-Z])':/g)].map((m) => m[1]);

  // ---- motors.h / mechanism.h ----
  const microstep = +grab('motorsH', /MICROSTEP\s*=\s*(\d+);/);
  const quarter = 50 * microstep;
  if (!new RegExp(`STEPS_PER_QUARTER\\s*=\\s*50 \\* MICROSTEP`).test(rd(SRC.motorsH))) throw new Error('facts: STEPS_PER_QUARTER 식이 바뀜');
  const stepDeg = 90 / quarter;
  const overMul = +grab('mechH', /overshootSteps\s*=\s*(\d+) \* MICROSTEP/);
  const over = overMul * microstep;
  const playExpr = grab('mechH', /playSteps\s*=\s*\((\d+) \* MICROSTEP \+ 2\) \/ 4/);
  const play = Math.floor((+playExpr * microstep + 2) / 4);
  const hood = grab('mechH', /hoodDeg\[3\]\s*=\s*\{(\d+),\s*(\d+),\s*(\d+)\}/, 0).match(/\{(\d+),\s*(\d+),\s*(\d+)\}/).slice(1).map(Number);
  const cupPlay = grab('mechH', /컵 안에서 ±([\d.]+)°/);
  const hoodPlay = grab('mechH', /후드 안에서 ±([\d.]+)°/);

  // ---- mechanism.cpp 재배향 표 ----
  const body = grab('mechCpp', /REORIENT\[6\]\[3\] = \{([\s\S]*?)\n\};/);
  const reorient = [...body.matchAll(/\{(\d+),\s*(\d+),\s*(\d+)\},\s*\/\/\s*([URFDLB]):/g)]
    .map((m) => ({ pos: m[4], ops: [m[1], m[2], m[3]].map(Number).filter((x) => x) }));
  if (reorient.length !== 6) throw new Error('facts: REORIENT 6줄을 읽지 못함');

  // ---- solver.cpp 발췌 (그대로) ----
  const solverLines = rd(SRC.solverCpp).split('\n');
  const li = solverLines.findIndex((l) => l.includes('for (uint8_t bound = h; bound <= maxBound; bound++)'));
  if (li < 0) throw new Error('facts: solver.cpp 의 bound 루프를 찾지 못함');
  const solverExcerpt = { line: li + 1, text: solverLines.slice(li, li + 2).map((l) => l.replace(/^  /, '')) };

  // ---- algo_seed1.json ----
  const ida = algo.cross.ida;
  const crossStage = algo.stages.find((s) => s.name === 'CROSS');
  const stages = algo.stages.map((s) => ({ name: s.name, moves: s.moves.length, nodes: s.nodes }));
  const iCross = algo.stickerSteps.map((s) => s.phase).lastIndexOf('CROSS');
  const iScr = algo.stickerSteps.map((s) => s.phase).lastIndexOf('scramble');

  const F = {};
  const put = (k, v, src) => { F[k] = { v: String(v), src }; };
  put('moves', algo.totals.moves, SRC.algo + ' totals.moves');
  put('crossNodes', comma(algo.totals.crossNodes), SRC.algo + ' totals.crossNodes');
  put('totalNodes', comma(algo.totals.nodes), SRC.algo + ' totals.nodes');
  put('seed', algo.seed, SRC.algo + ' seed');
  put('rootH', ida.heuristic.rootH, SRC.algo + ' cross.ida.heuristic.rootH');
  put('pairs', ida.heuristic.pairs.length, SRC.algo + ' heuristic.pairs');
  ida.bounds.forEach((b, i) => {
    put(`bound${i}`, b.bound, SRC.algo + ` bounds[${i}].bound`);
    put(`visited${i}`, comma(b.visited), SRC.algo + ` bounds[${i}].visited`);
    put(`pruned${i}`, comma(b.pruned), SRC.algo + ` bounds[${i}].pruned`);
  });
  put('crossSeq', crossStage.moves.join(' '), SRC.algo + ' stages[CROSS].moves');
  put('crossLen', crossStage.moves.length, SRC.algo + ' stages[CROSS]');
  put('scrambleSeq', algo.scramble.join(' '), SRC.algo + ' scramble');
  stages.forEach((s, i) => { put(`stShort${i}`, s.name.replace(/^F2L /, '').replace(/ .*$/, ''), SRC.algo + ` stages[${i}].name (줄임)`); put(`stName${i}`, s.name, SRC.algo + ` stages[${i}].name`); put(`stMoves${i}`, s.moves, SRC.algo + ` stages[${i}].moves`); put(`stNodes${i}`, comma(s.nodes), SRC.algo + ` stages[${i}].nodes`); });
  put('scrambleLen', scrambleLen, SRC.ino + ' SCRAMBLE_LEN');
  put('longS', (longMs / 1000).toFixed(1), SRC.ino + ' LONG_PRESS_MS');
  put('baud', baud, SRC.ino + ' Serial.begin');
  put('btnPin', btnPin, SRC.ino + ' BTN_PIN');
  put('quarter', quarter, SRC.motorsH + ' STEPS_PER_QUARTER');
  put('stepDeg', stepDeg.toFixed(2), SRC.motorsH + ' 90/STEPS_PER_QUARTER');
  put('micro', `1/${microstep}`, SRC.motorsH + ' MICROSTEP');
  put('over', over, SRC.mechH + ' overshootSteps');
  put('overDeg', (over * stepDeg).toFixed(1), SRC.mechH + ' overshootSteps×0.45');
  put('play', play, SRC.mechH + ' playSteps');
  put('playDeg', (play * stepDeg).toFixed(2), SRC.mechH + ' playSteps×0.45');
  put('back', over + play, SRC.mechH + ' over+play (cupMove ②)');
  put('spinBack', 2 * play, SRC.mechH + ' play+play (SPIN ②)');
  put('turnFwd', quarter + over, SRC.mechH + ' steps+over (cupMove ①)');
  put('turnLow', quarter - play, SRC.mechH + ' steps-play');
  put('hoodClose', hood[0], SRC.mechH + ' hoodDeg[0]');
  put('hoodOpen', hood[1], SRC.mechH + ' hoodDeg[1]');
  put('hoodLoad', hood[2], SRC.mechH + ' hoodDeg[2]');
  put('cupPlay', cupPlay, SRC.mechH + ' 컵 여유');
  put('hoodPlay', hoodPlay, SRC.mechH + ' 후드 여유');
  put('needDeg', (+cupPlay + +hoodPlay).toFixed(2), SRC.mechH + ' θc+θh');
  // 문서 근거 (문구 그대로 존재해야 함)
  put('actuators', phrase('hw', '구동기 3개').match(/\d+/)[0], SRC.hw + ' 0절 "구동기 3개"');
  put('sensors', phrase('hw', '센서 0').match(/\d+/)[0], SRC.hw + ' 0절 "센서 0"');
  put('tilt', grab('ino', /(\d+)° 기울어진 컵/), SRC.ino + ' 머리말 "20° 기울어진 컵"');
  put('flips1', phrase('hw', '뒤집기 60 · 스핀 39').match(/뒤집기 (\d+)/)[1], SRC.hw + ' 5절');
  put('spins1', '39', SRC.hw + ' 5절 "스핀 39"');
  put('minutes1', phrase('hw', '약 3.2 분').match(/[\d.]+/)[0], SRC.hw + ' 5절 "약 3.2 분"');
  put('flipAvg', phrase('hw', '30 시드 평균 뒤집기 57.1회').match(/57\.1/)[0], SRC.hw + ' 5절');
  put('seeds30', '30', SRC.hw + ' 5절 "30 시드"');
  put('poses', phrase('hw', '24자세 DP').match(/\d+/)[0], SRC.hw + ' 5절 "24자세 DP"');
  put('flipS', phrase('hw', '합계 약 1.87 s').match(/[\d.]+/)[0], SRC.hw + ' 3.2절');
  put('fomaxT', phrase('v5h', '3 mm 포맥스 조각 33종 72장').match(/(\d+) mm/)[1], SRC.v5h + ' 한 문장');
  put('fomaxKinds', '33', SRC.v5h + ' "33종"');
  put('fomaxPieces', '72', SRC.v5h + ' "72장"');
  put('cubeMm', grab('ino', /시중 (\d+) mm 큐브/), SRC.ino + ' 머리말 "시중 57 mm 큐브"');
  put('vmot', phrase('hw', 'VMOT 12 V').match(/\d+/)[0], SRC.hw + ' 4절 "VMOT 12 V"');
  put('servoV', phrase('hw', '서보 전원 5 V').match(/\d+/)[0], SRC.hw + ' 4절 "서보 전원 5 V"');

  put('avg30s', phrase('hw', '30 시드 평균 194 s').match(/(\d+) s/)[1], SRC.hw + ' 5절 "30 시드 평균 194 s"');
  put('scrMin', phrase('hw', '섞기 20수 약 1.2 분').match(/약 ([\d.]+) 분/)[1], SRC.hw + ' 5절 "섞기 20수 약 1.2 분"');
  put('jogMax', grab('ino', /constrain\(strtol\(arg, nullptr, 10\), -(\d+)L, \d+L\)/), SRC.ino + ' J 제한');
  put('repeat10', phrase('hw', '4b 의 10회 반복 시험').match(/(\d+)회/)[1], SRC.hw + ' 3.5절 "10회 반복 시험"');
  put('oll57', phrase('report', '57공식').match(/\d+/)[0], SRC.report + ' 5.2절');
  put('pll21', phrase('report', '21공식').match(/\d+/)[0], SRC.report + ' 5.2절');
  put('crossEdges', ida.heuristic.description.match(/크로스 엣지 (\d+)개/)[1], SRC.algo + ' heuristic.description');
  put('crossEdgeNames', ida.heuristic.description.match(/\(([A-Z ]+)\)/)[1], SRC.algo + ' heuristic.description');
  const OPN = { 1: 'y', 2: 'y2', 3: "y'", 9: 'FLIP' };
  for (const r of reorient) put('re' + r.pos, r.ops.length ? r.ops.map((o) => OPN[o]).join(' → ') : '없음', SRC.mechCpp + ' REORIENT ' + r.pos);
  put('stageSum', stages.reduce((a, s) => a + s.moves, 0), SRC.algo + ' Σ stages.moves');
  // 단계 경계의 같은 면 연속은 solver.cpp 마지막 simplifySeq 가 합친다 (예: PLL 첫 R2 + OLL 끝 R')
  if (!rd(SRC.solverCpp).includes('outLen = simplifySeq(out, outLen);')) throw new Error('facts: solver.cpp 의 마지막 simplifySeq 가 없음');
  put('merged', +F.stageSum.v - algo.totals.moves, SRC.solverCpp + ' simplifySeq(out) = Σstages − totals');
  if (+F.merged.v < 0) throw new Error('facts: 단계 합 < 총 수');

  // LCD 화면 (main.ino 문구를 그대로 — 위치로 찾는다). %u/%lu 는 '#'
  const two = (re, what) => { const m = ino.match(re); if (!m) throw new Error('facts: main.ino LCD 문구 못 찾음: ' + what); return [m[1], m[2]]; };
  const fmtOf = (re, what) => { const m = ino.match(re); if (!m) throw new Error('facts: main.ino snprintf 못 찾음: ' + what); return m[1].replace(/%l?u/g, '#'); };
  const lcd = {
    idle: two(/lcd\.backlight\(\);\s*lcdShow\(F\("([^"]*)"\), "([^"]*)"\)/, 'setup'),
    place: two(/waitingForCube\(\)\) lcdShow\(F\("([^"]*)"\), "([^"]*)"\)/, 'doLoad 대기'),
    loaded: two(/cube\.reset\(\); lcdShow\(F\("([^"]*)"\), "([^"]*)"\)/, 'doLoad 장착'),
    remove: two(/if \(wasLoaded\) lcdShow\(F\("([^"]*)"\), "([^"]*)"\)/, 'doLoad 배출'),
    scrambled: [ino.match(/lcdShow\(F\("(SCRAMBLED[^"]*)"\), row1\)/)[1], fmtOf(/snprintf\(row1, sizeof\(row1\), "(seed[^"]*)"/, 'seed')],
    solved: [ino.match(/solved \? F\("([^"]*)"\)/)[1], fmtOf(/snprintf\(row1, sizeof\(row1\), "(%umv[^"]*)"/, 'solved')],
  };
  if (!/cube\.reset\(\); lcdShow\(F\("CUBE LOADED"/.test(ino)) throw new Error('facts: 장착 때 cube.reset() 이 없다 — 포스터의 "장착 = 다 맞춘 상태로 다시 셈" 문구 재검토');

  return {
    lcd, F, algo, ino, cmdCases, reorient, solverExcerpt,
    stickersScrambled: algo.stickerSteps[iScr].stickers,
    stickersCross: algo.stickerSteps[iCross].stickers,
    trace: ida.trace, bounds: ida.bounds, rootH: ida.heuristic.rootH,
    crossMoves: crossStage.moves, stages, over, play, quarter,
  };
}

// main.ino 의 문자열 리터럴 전부 (LCD 문구 검사용) — F("..") 와 ".." 모두
export function inoLiterals(ino) {
  return [...ino.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}
