import { ThreeCanvas } from '@remotion/three';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Cube3D, Lights, LookAt } from '../components/Cube3D.jsx';
import { Frame } from '../components/Overlay.jsx';
import { deriveFacts } from '../lib/facts.js';
import { cfopSolveFrames } from '../lib/plan.js';
import { CORNER_NAMES, CROSS_EDGE_IDX, EDGE_NAMES, SLOT_NAMES, emphasis } from '../lib/stages.js';
import { DIM, FAINT, FG, LINE, MONO } from '../theme.js';

const F = deriveFacts(data);
const STEPS = data.stickerSteps; // 0 = 풀린 상태, 1..20 섞기, 21..74 풀이
const NSCR = F.scrambleCount;
const NSOL = F.solveMoves.length;

const ease = Easing.inOut(Easing.cubic);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// 풀이 단계 순서 (stickerSteps phase): CROSS, F2L FL, F2L BR, F2L BL, F2L FR, OLL, PLL
const PHASES = [...new Set(F.solveSteps.map((s) => s.phase))];
const firstIndexOf = (pred) => F.solveSteps.findIndex(pred);
// 단계별 "맞추는 조각" 설명 (풀이기 정의: lib/stages.js)
function targetText(phase) {
  if (phase === 'CROSS') return 'edges ' + CROSS_EDGE_IDX.map((i) => EDGE_NAMES[i]).join(' ');
  if (phase.startsWith('F2L')) { const s = SLOT_NAMES.indexOf(phase.slice(4)); return `corner ${CORNER_NAMES[4 + s]} + edge ${EDGE_NAMES[8 + s]}`; }
  if (phase === 'OLL') return 'top face orientation';
  if (phase === 'PLL') return 'top layer permutation';
  return '';
}

// 섞인 상태에서 시작해 풀이 수들을 압축 재생 (섞기 20수는 아래 줄에 수열로만 보인다)
export function cfopTimeline(frame, durationInFrames) {
  const { solveStart, spf } = cfopSolveFrames(durationInFrames, NSOL);
  const pos = frame < solveStart ? NSCR : Math.min(NSCR + NSOL, NSCR + (frame - solveStart) / spf);
  const k = Math.floor(pos);
  const frac = pos - k;
  if (k >= STEPS.length - 1) return { stickers: STEPS[STEPS.length - 1].stickers, move: null, t: 0, k: STEPS.length - 1, solveStart, spf };
  const t = frame < solveStart ? 0 : ease(Math.min(1, frac / 0.8));
  return { stickers: STEPS[k].stickers, move: STEPS[k + 1].move, t, k, solveStart, spf };
}

const StageBar = ({ solved, activeStage }) => {
  const total = F.stageBar.reduce((a, s) => a + s.moves, 0);
  const W = 1600;
  let x = 0;
  let before = 0;
  return (
    <div style={{ position: 'absolute', left: 160, top: 786, width: W, height: 90 }}>
      {F.stageBar.map((s) => {
        const w = (s.moves / total) * W;
        const done = Math.max(0, Math.min(s.moves, solved - before));
        const active = activeStage === s.key;
        const left = x;
        x += w;
        before += s.moves;
        let subX = 0;
        return (
          <div key={s.key} style={{ position: 'absolute', left, top: 0, width: w - 6, height: 90 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 30, border: `1px solid ${active ? FG : FAINT}`, boxSizing: 'border-box' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(done / s.moves) * 100}%`, background: active ? FG : '#5b5e65' }} />
              {s.sub.slice(0, -1).map((sub) => {
                subX += sub.moves;
                return <div key={sub.name} style={{ position: 'absolute', left: `${(subX / s.moves) * 100}%`, top: 0, bottom: 0, width: 1, background: '#0b0c0f' }} />;
              })}
            </div>
            <div style={{ position: 'absolute', left: 0, top: 40, fontFamily: MONO, fontSize: 24, color: active ? FG : DIM, whiteSpace: 'nowrap' }}>
              {s.label}{s.caseName ? <span style={{ color: active ? FG : '#6a6d74' }}> {s.caseName}</span> : null}
              <span style={{ color: '#6a6d74' }}> · {s.moves}</span>
            </div>
            {s.sub.length ? (
              <div style={{ position: 'absolute', left: 0, top: 70, width: '100%', fontFamily: MONO, fontSize: 16, color: '#55585f' }}>
                {(() => { let sx = 0; return s.sub.map((sub) => { const l = sx; sx += sub.moves; return <span key={sub.name} style={{ position: 'absolute', left: `${(l / s.moves) * 100}%` }}>{sub.name} {sub.moves}</span>; }); })()}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const Ticker = ({ j }) => {
  // j = 진행 중인(또는 막 끝난) 풀이 수 번호 0..NSOL-1, -1 = 아직 시작 전
  const CELL = 82;
  const center = 960;
  const cells = [];
  for (let i = 0; i < NSOL; i++) {
    const x = center + (i - Math.max(0, j)) * CELL;
    if (x < 120 || x > 1800) continue;
    const isCur = i === j;
    const past = i < j;
    const merged = F.mergeAt.includes(i);
    cells.push(
      <div key={i} style={{
        position: 'absolute', left: x - CELL / 2, top: 0, width: CELL, textAlign: 'center',
        fontFamily: MONO, fontSize: isCur ? 38 : 30, fontWeight: isCur ? 700 : 400,
        color: isCur ? FG : past ? '#6a6d74' : '#3f4249', lineHeight: '48px',
      }}>
        {F.solveMoves[i]}
        {merged ? <div style={{ position: 'absolute', left: -CELL / 2, width: CELL, top: 0, height: 48, borderRight: `1px dashed ${DIM}` }} /> : null}
      </div>,
    );
  }
  return <div style={{ position: 'absolute', left: 0, top: 706, width: 1920, height: 50 }}>{cells}</div>;
};

export const Cfop = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const tl = cfopTimeline(frame, durationInFrames);
  const inScramble = frame < tl.solveStart; // 섞인 상태로 잠깐 멈춤
  // 풀이 수 j (진행 중), solvedCount = 끝난 풀이 수 (stickerSteps 기준)
  const j = tl.k - NSCR; // 진행 중인 수 번호 (k 상태에서 k+1 수를 도는 중)
  const solvedCount = inScramble ? 0 : j;
  const shownJ = inScramble ? -1 : Math.min(j, NSOL - 1);
  const doneCount = solvedCount <= 0 ? 0 : F.counts[Math.min(solvedCount, NSOL) - 1];
  const activeStage = inScramble ? null : F.stageOf[Math.min(Math.max(j, 0), NSOL - 1)];
  const phaseName = inScramble ? 'scrambled' : tl.move ? STEPS[tl.k + 1].phase : 'solved';
  const mergeIdx = F.mergeAt[0];
  const showMerge = !inScramble && (j === mergeIdx - 1 || j === mergeIdx || j === mergeIdx + 1);
  const spin = -0.55 + frame * 0.0035;
  // 십자·F2L 동안은 큐브를 앞으로 숙여 아랫면(D, 십자)과 가운데 층이 보이게, OLL 부터 원래 자세(윗면이 보임)로
  const ollStart = tl.solveStart + firstIndexOf((st) => st.phase === 'OLL') * tl.spf;
  const tilt = -1.15 * (1 - ease(interpolate(frame, [ollStart - 14, ollStart + 8], [0, 1], CLAMP)));
  const scrN = NSCR;
  const fade = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  // 강조: 지금 단계 목표 조각 = 원색, 이미 맞춘 단계 = 은은하게, 나머지 = 어둡게
  const curPhase = inScramble || !tl.move ? null : STEPS[tl.k + 1].phase;
  const donePhases = curPhase ? PHASES.slice(0, PHASES.indexOf(curPhase)) : [];
  const levels = emphasis(tl.stickers, curPhase, donePhases);
  // 단계 전환 큰 라벨 (CROSS → F2L → OLL → PLL), F2L 안 슬롯 바뀜은 작은 라벨
  const jj = Math.min(Math.max(j, 0), NSOL - 1);
  const group = inScramble ? null : F.stageOf[jj];
  const gStart = group ? firstIndexOf((st, i) => F.stageOf[i] === group) : 0;
  const gFrame = frame - (tl.solveStart + gStart * tl.spf);
  const bigOp = group && tl.move ? interpolate(gFrame, [0, 4, 20, 28], [0, 1, 1, 0], CLAMP) : 0;
  const stageInfo = group ? F.stageBar.find((b) => b.key === group) : null;
  const slotPhase = curPhase && curPhase.startsWith('F2L') ? curPhase : null;
  const sStart = slotPhase ? firstIndexOf((st) => st.phase === slotPhase) : 0;
  const slotOp = slotPhase && sStart !== gStart ? interpolate(frame - (tl.solveStart + sStart * tl.spf), [0, 3, 14, 20], [0, 1, 1, 0], CLAMP) : 0;

  return (
    <Frame scene={scene} index={2} name="cfop">
      <div style={{ position: 'absolute', left: 560, top: 86, width: 800, height: 600, opacity: fade }}>
        <ThreeCanvas width={800} height={600} camera={{ position: [6.0, 4.8, 7.6], fov: 30 }}>
          <LookAt />
          <Lights />
          <Cube3D stickers={tl.stickers} levels={levels} move={tl.move} t={tl.t} rotation={[tilt, spin, 0]} />
        </ThreeCanvas>
      </div>

      {bigOp > 0 ? (
        <div style={{ position: 'absolute', left: 120, top: 120, fontFamily: MONO, opacity: bigOp }}>
          <span style={{ fontSize: 76, fontWeight: 700, color: FG }}>{group}</span>
          {stageInfo && stageInfo.caseName ? <span style={{ fontSize: 40, color: DIM }}> {stageInfo.caseName}</span> : null}
        </div>
      ) : null}
      {slotOp > 0 && bigOp <= 0 ? (
        <div style={{ position: 'absolute', left: 120, top: 140, fontFamily: MONO, fontSize: 44, color: FG, opacity: slotOp }}>
          F2L · {slotPhase.slice(4).toLowerCase()}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 120, top: 250, width: 420, fontFamily: MONO }}>
        <div style={{ fontSize: 22, color: DIM }}>phase</div>
        <div style={{ fontSize: 44, color: FG, marginTop: 6 }}>{phaseName.toLowerCase()}</div>
        <div style={{ fontSize: 20, color: '#8f9299', marginTop: 8, minHeight: 28 }}>{curPhase ? targetText(curPhase) : ''}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 30 }}>{inScramble ? 'scramble' : 'move'}</div>
        <div style={{ fontSize: 30, color: FG, marginTop: 6 }}>
          {inScramble ? `${scrN} / ${NSCR}` : (tl.move || '—')}
        </div>
      </div>

      <div style={{ position: 'absolute', right: 120, top: 250, width: 440, textAlign: 'right', fontFamily: MONO }}>
        <div style={{ fontSize: 22, color: DIM }}>moves</div>
        <div style={{ fontSize: 96, color: FG, lineHeight: '110px', fontWeight: 700 }}>
          {doneCount}<span style={{ color: '#55585f', fontWeight: 400 }}> / {F.totalMoves}</span>
        </div>
        <div style={{ fontSize: 20, color: showMerge ? FG : 'transparent', marginTop: 14 }}>
          {F.solveMoves[mergeIdx - 1]} + {F.solveMoves[mergeIdx]} → {F.mergedSolution.split(' ')[F.counts[mergeIdx] - 1]} · 1 move
        </div>
        <div style={{ fontSize: 18, color: showMerge ? DIM : 'transparent', marginTop: 6 }}>
          oll 끝 + pll 처음 합침
        </div>
      </div>

      {inScramble ? (
        <div style={{ position: 'absolute', left: 0, top: 712, width: 1920, textAlign: 'center', fontFamily: MONO, fontSize: 28, color: '#6a6d74' }}>
          {F.scramble.map((m, i) => <span key={i} style={{ color: i < scrN ? FG : '#3f4249', margin: '0 9px' }}>{m}</span>)}
        </div>
      ) : <Ticker j={shownJ} />}
      <div style={{ position: 'absolute', left: 959, top: 760, width: 2, height: 8, background: inScramble ? 'transparent' : FG }} />
      <div style={{ position: 'absolute', left: 160, top: 775, width: 1600, height: 1, background: LINE }} />

      <StageBar solved={inScramble ? 0 : solvedCount} activeStage={activeStage} />
    </Frame>
  );
};
