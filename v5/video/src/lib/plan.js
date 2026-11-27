// 장면 시간표. IDA* 탐색 그래프 파트(05 줄 + 뒤 무음 연출). 440 프레임 기준 구간, 실제 길이에 비례해 늘이거나 줄인다.
// scenes/*.jsx 와 scripts/stills.mjs 가 같이 쓴다.
export const TREE_BASE = 440;
export const TREE_SEG = {
  i1: [0, 45], i1label: [45, 57], t12: [57, 72],
  i2wide: [72, 122], zoomIn: [122, 142], fan: [142, 222], zoomOut: [222, 240], i2post: [240, 272], i2label: [272, 284], t23: [284, 299],
  i3: [299, 344], goalFwd: [344, 386], goalUp: [386, 416], final: [416, TREE_BASE],
};
export function treeSegments(total) {
  const k = total / TREE_BASE;
  const out = {};
  for (const [name, [a, b]] of Object.entries(TREE_SEG)) out[name] = [a * k, name === 'final' ? total : b * k];
  return out;
}

// CFOP 장면: 섞인 상태에서 시작(START_HOLD) → 풀이 수 재생, 단계가 끝날 때마다 잠깐 멈춤(그 단계에서 완성한 부분 글로우)
//   CROSS 끝·F2L 마지막 슬롯 끝·OLL 끝 = PAUSE, F2L 중간 슬롯 끝 = PAUSE_SLOT, PLL 끝 = 장면 끝까지(최소 PAUSE_END)
export const CFOP_START_HOLD = 10;
export const CFOP_PAUSE = 11;
export const CFOP_PAUSE_SLOT = 6;
export const CFOP_PAUSE_END = 18;

// phases = 풀이 수마다 단계 이름 (stickerSteps phase). 반환: 수마다 시작 프레임, 멈춤 구간, 프레임 → 위치 함수
export function cfopSchedule(durationInFrames, phases) {
  const n = phases.length;
  const pauseAfter = phases.map((ph, j) => {
    if (j === n - 1) return 0; // PLL 끝은 장면 끝까지
    if (phases[j + 1] === ph) return 0;
    const isSlot = ph.startsWith('F2L') && phases[j + 1].startsWith('F2L');
    return isSlot ? CFOP_PAUSE_SLOT : CFOP_PAUSE;
  });
  const totalPause = pauseAfter.reduce((a, b) => a + b, 0);
  const spf = (durationInFrames - CFOP_START_HOLD - CFOP_PAUSE_END - totalPause) / n;
  const starts = [];
  const pauses = [];
  let f = CFOP_START_HOLD;
  for (let j = 0; j < n; j++) {
    starts.push(f);
    f += spf;
    if (pauseAfter[j]) { pauses.push({ after: j, phase: phases[j], from: f, len: pauseAfter[j] }); f += pauseAfter[j]; }
  }
  pauses.push({ after: n - 1, phase: phases[n - 1], from: f, len: durationInFrames - f });
  // 프레임 → { pos: 끝난 수 + 진행 비율, pause: 멈춤 구간 또는 null }
  const at = (frame) => {
    if (frame < CFOP_START_HOLD) return { pos: 0, pause: null, hold: true };
    for (const p of pauses) if (frame >= p.from && frame < p.from + p.len) return { pos: p.after + 1, pause: { ...p, age: frame - p.from } };
    for (let j = n - 1; j >= 0; j--) if (frame >= starts[j]) return { pos: Math.min(n, j + (frame - starts[j]) / spf), pause: null };
    return { pos: 0, pause: null };
  };
  return { solveStart: CFOP_START_HOLD, spf, starts, pauses, at };
}
