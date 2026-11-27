// CFOP 단계별 "맞추는 조각" — 풀이기 정의 그대로 (지어낸 정의 없음).
//   v5/sim/cube.js  CORNER_NAMES / EDGE_NAMES (조각 번호)
//   v5/sim/solver.js 크로스 = 엣지 [4, 5, 6, 7] (DR DF DL DB), F2L 슬롯 s = 코너 4+s · 엣지 8+s, SLOT_NAMES = FR FL BL BR
//   OLL = 윗면 방향 (U 색 스티커가 윗면으로), PLL = 윗층 조각 (코너 0..3 · 엣지 0..3)
// scripts/check.mjs 가 위 정의가 solver.js·cube.js 와 같은지, 각 단계 끝에서 그 조각이 실제로 맞춰졌는지 검사한다.
import { FACELETS, FACES } from './cube.js';

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];
export const SLOT_NAMES = ['FR', 'FL', 'BL', 'BR'];
export const CROSS_EDGE_IDX = [4, 5, 6, 7];

const key = (s) => s.split('').sort().join('');
export const CROSS_PIECES = CROSS_EDGE_IDX.map((i) => key(EDGE_NAMES[i]));
export const slotPieces = (slot) => {
  const s = SLOT_NAMES.indexOf(slot.toUpperCase());
  return [key(CORNER_NAMES[4 + s]), key(EDGE_NAMES[8 + s])];
};
export const U_LAYER_PIECES = [...CORNER_NAMES.slice(0, 4), ...EDGE_NAMES.slice(0, 4)].map(key);

// 칸 i 가 붙은 큐비에 지금 있는 조각 = 그 큐비 스티커 글자들의 집합
const CUBIE_OF = FACELETS.map((f) => FACELETS.map((g, j) => (g.p[0] === f.p[0] && g.p[1] === f.p[1] && g.p[2] === f.p[2] ? j : -1)).filter((j) => j >= 0));
export const pieceAt = (stickers, i) => key(CUBIE_OF[i].map((j) => stickers[j]).join(''));

// 단계 이름(stickerSteps phase) → 그 단계의 목표 판정 (스티커 단위)
export function isTarget(phase, stickers, i) {
  if (phase === 'CROSS') return CROSS_PIECES.includes(pieceAt(stickers, i));
  if (phase.startsWith('F2L')) return slotPieces(phase.slice(4)).includes(pieceAt(stickers, i));
  if (phase === 'OLL') return stickers[i] === 'U';
  if (phase === 'PLL') return U_LAYER_PIECES.includes(pieceAt(stickers, i));
  return false;
}

// 0 = 어둡게, 1 = 이미 맞춘 단계(은은하게), 2 = 지금 단계 목표. phase null = 전부 2.
export function emphasis(stickers, phase, donePhases) {
  const out = new Array(54).fill(2);
  if (!phase) return out;
  for (let i = 0; i < 54; i++) {
    if (isTarget(phase, stickers, i)) out[i] = 2;
    else if (donePhases.some((d) => d !== 'OLL' && isTarget(d, stickers, i))) out[i] = 1;
    else out[i] = 0;
  }
  return out;
}

// 단계 끝 멈춤 동안 글로우할 스티커: 그 단계에서 완성한 부분
//   CROSS = 십자 엣지, F2L 슬롯 = 그 슬롯 쌍, F2L 마지막 슬롯(다음이 OLL) = 아래 두 층 전체(U 색 없는 조각, 가운데 칸 포함),
//   OLL = 윗면, PLL = 큐브 전체
export function glowMask(phase, nextPhase, stickers) {
  const lastSlot = phase.startsWith('F2L') && nextPhase === 'OLL';
  return Array.from({ length: 54 }, (_, i) => {
    if (phase === 'PLL') return true;
    if (phase === 'OLL') return FACELETS[i].face === 'U';
    if (lastSlot) return !pieceAt(stickers, i).includes('U');
    return isTarget(phase, stickers, i);
  });
}

// 단계 목표가 맞춰졌는지 (검사용): 목표 스티커가 제 면에 있는가
export function stageSolved(phase, stickers) {
  for (let i = 0; i < 54; i++) {
    if (!isTarget(phase, stickers, i)) continue;
    if (phase === 'OLL') { if (FACELETS[i].face !== 'U') return false; continue; }
    if (stickers[i] !== FACES[Math.floor(i / 9)]) return false;
  }
  return true;
}
