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

// CFOP 장면: 섞인 상태에서 시작(START_HOLD 프레임) → 풀이 수들을 장면 끝 END_HOLD 전까지 고르게 압축 재생
export const CFOP_START_HOLD = 10;
export const CFOP_END_HOLD = 18;
export function cfopSolveFrames(durationInFrames, nSolve) {
  const solveStart = CFOP_START_HOLD;
  const spf = (durationInFrames - CFOP_END_HOLD - solveStart) / nSolve;
  return { solveStart, spf };
}
