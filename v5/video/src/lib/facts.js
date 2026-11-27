// 화면에 나오는 모든 숫자·수열은 여기서 data/algo_seed1.json 으로부터 계산한다 (지어낸 값 없음).
// scripts/check.mjs 가 같은 함수를 불러 data·narration.md 와 대조한다.

const OPP = (f) => (f + 3) % 6; // 면 번호 U R F D L B = 0..5, 반대면 = +3

// 무작정 탐색 경우의 수: 18수(6면 × 3회전) 수열 중
//   (1) 같은 면을 연속으로 돌리지 않는다
//   (2) 반대면 쌍(U/D, R/L, F/B)은 한 순서만 허용한다
// 만 적용한 길이 1..maxDepth 수열 수.
// 공식: c_1(f) = 3,  c_n(g) = Σ_{f ≠ g, ¬(g = opp(f) ∧ g < f)} 3·c_{n-1}(f),  N_n = Σ_g c_n(g),  합 = Σ_{n=1}^{7} N_n
// → [18, 243, 3240, 43254, 577368, 7706988, 102876480], 합 111,207,591
export function bruteForceCounts(maxDepth = 7) {
  let c = [3, 3, 3, 3, 3, 3];
  const perDepth = [18];
  for (let n = 2; n <= maxDepth; n++) {
    const nc = [0, 0, 0, 0, 0, 0];
    for (let f = 0; f < 6; f++) for (let g = 0; g < 6; g++) {
      if (g === f) continue;
      if (g === OPP(f) && g < f) continue;
      nc[g] += 3 * c[f];
    }
    c = nc;
    perDepth.push(c.reduce((a, b) => a + b, 0));
  }
  return { perDepth, total: perDepth.reduce((a, b) => a + b, 0) };
}

// 같은 면 연속 수를 합친다 (v5/sim/cube.js simplifySeq 와 같은 규칙)
export function simplify(moves) {
  const amt = (m) => (m.length === 1 ? 1 : m[1] === '2' ? 2 : 3);
  const name = (f, t) => f + (t === 1 ? '' : t === 2 ? '2' : "'");
  const out = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0]) {
      out.pop();
      const t = (amt(last) + amt(m)) % 4;
      if (t !== 0) out.push(name(m[0], t));
    } else out.push(m);
  }
  return out;
}

export function deriveFacts(data) {
  const steps = data.stickerSteps;
  const scrambleSteps = steps.filter((s) => s.phase === 'scramble');
  const solveSteps = steps.filter((s) => s.move && s.phase !== 'scramble');
  const solveMoves = solveSteps.map((s) => s.move);
  const merged = simplify(solveMoves);

  // stickerSteps 기준 카운터: OLL 마지막 R' 과 PLL 첫 R2 는 한 수(R)로 합쳐지므로
  // 합쳐진 뒤쪽 수에서는 카운터가 늘지 않는다. counts[j] = j+1 번째 풀이 수까지의 TOTAL 기준 수.
  const counts = [];
  let acc = [];
  for (let j = 0; j < solveMoves.length; j++) {
    acc.push(solveMoves[j]);
    counts.push(simplify(acc).length);
  }
  // 합쳐지는 지점(카운터가 늘지 않는 수)
  const mergeAt = [];
  for (let j = 1; j < counts.length; j++) if (counts[j] <= counts[j - 1]) mergeAt.push(j);

  const stagesRaw = data.stages;
  const f2l = stagesRaw.filter((s) => s.name.startsWith('F2L'));
  const cross = stagesRaw.find((s) => s.name === 'CROSS');
  const oll = stagesRaw.find((s) => s.name.startsWith('OLL'));
  const pll = stagesRaw.find((s) => s.name.startsWith('PLL'));
  const stageBar = [
    { key: 'CROSS', label: 'CROSS', moves: cross.moves.length, sub: [] },
    { key: 'F2L', label: 'F2L', moves: f2l.reduce((a, s) => a + s.moves.length, 0), sub: f2l.map((s) => ({ name: s.name.replace('F2L ', '').toLowerCase(), moves: s.moves.length })) },
    { key: 'OLL', label: 'OLL', caseName: oll.case.replace('OLL ', ''), moves: oll.moves.length, sub: [] },
    { key: 'PLL', label: 'PLL', caseName: pll.case.replace('PLL ', ''), moves: pll.moves.length, sub: [] },
  ];
  // 풀이 수 j 가 속한 단계 (stickerSteps phase 이름에서)
  const stageOf = solveSteps.map((s) => (s.phase.startsWith('F2L') ? 'F2L' : s.phase));

  const ida = data.cross.ida;
  // trace 를 반복(bound)별로 나눈다. id 0 = 루트 (반복마다 한 줄)
  const iterations = [];
  for (const row of ida.trace) {
    if (row.id === 0) iterations.push({ bound: row.bound, rows: [] });
    iterations[iterations.length - 1].rows.push(row);
  }
  const brute = bruteForceCounts(7);

  return {
    scramble: data.scramble,
    scrambleCount: scrambleSteps.length,
    solveMoves,
    solveSteps,
    counts,
    mergeAt,
    totalMoves: data.totals.moves,
    mergedSolution: merged.join(' '),
    stageBar,
    stageOf,
    crossSolution: data.cross.ida.solution,
    crossNodes: data.cross.ida.nodes,
    totalNodes: data.totals.nodes,
    bounds: ida.bounds,
    rootH: ida.heuristic.rootH,
    iterations,
    brute,
    ollCase: oll.case,
    pllCase: pll.case,
  };
}

// 구동기 수: docs/HARDWARE_V5.md 1절 장치 표(NEMA17 1 · MG996R 1 · SG90 1). check.mjs 가 표에서 다시 센다.
export const ACTUATORS = { steppers: 1, servos: 2 };
export const REPO = 'github.com/26037-arch/physical_computing_project';

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
