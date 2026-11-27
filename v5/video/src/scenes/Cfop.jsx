import { ThreeCanvas } from '@remotion/three';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Cube3D, Lights, LookAt } from '../components/Cube3D.jsx';
import { Frame } from '../components/Overlay.jsx';
import { deriveFacts } from '../lib/facts.js';
import { DIM, FAINT, FG, LINE, MONO } from '../theme.js';

const F = deriveFacts(data);
const STEPS = data.stickerSteps; // 0 = 풀린 상태, 1..20 섞기, 21..74 풀이
const NSCR = F.scrambleCount;
const NSOL = F.solveMoves.length;

const SCR_START = 6;
const SCR_SPF = 4; // 섞기: 수당 4 프레임 (빠르게)
const HOLD = 10;
const END_HOLD = 26;
const ease = Easing.inOut(Easing.cubic);

export function cfopTimeline(frame, durationInFrames) {
  const solveStart = SCR_START + NSCR * SCR_SPF + HOLD;
  const spf = (durationInFrames - END_HOLD - solveStart) / NSOL;
  let pos;
  if (frame < SCR_START) pos = 0;
  else if (frame < SCR_START + NSCR * SCR_SPF) pos = (frame - SCR_START) / SCR_SPF;
  else if (frame < solveStart) pos = NSCR;
  else pos = Math.min(NSCR + NSOL, NSCR + (frame - solveStart) / spf);
  const k = Math.floor(pos);
  const frac = pos - k;
  if (k >= STEPS.length - 1) return { stickers: STEPS[STEPS.length - 1].stickers, move: null, t: 0, k: STEPS.length - 1, solveStart, spf };
  return { stickers: STEPS[k].stickers, move: STEPS[k + 1].move, t: ease(Math.min(1, frac / 0.78)), k, solveStart, spf };
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
  const inScramble = tl.k < NSCR;
  // 풀이 수 j (진행 중), solvedCount = 끝난 풀이 수 (stickerSteps 기준)
  const j = tl.k - NSCR; // 진행 중인 수 번호 (k 상태에서 k+1 수를 도는 중)
  const solvedCount = inScramble ? 0 : j;
  const shownJ = inScramble ? -1 : Math.min(j, NSOL - 1);
  const doneCount = solvedCount <= 0 ? 0 : F.counts[Math.min(solvedCount, NSOL) - 1];
  const activeStage = inScramble ? null : F.stageOf[Math.min(Math.max(j, 0), NSOL - 1)];
  const phaseName = inScramble ? 'scramble' : tl.move ? STEPS[tl.k + 1].phase : 'solved';
  const mergeIdx = F.mergeAt[0];
  const showMerge = !inScramble && (j === mergeIdx - 1 || j === mergeIdx || j === mergeIdx + 1);
  const spin = -0.55 + frame * 0.0035;
  const scrN = inScramble ? Math.min(NSCR, tl.k + (tl.move ? 1 : 0)) : NSCR;
  const fade = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <Frame scene={scene} index={2} name="cfop">
      <div style={{ position: 'absolute', left: 560, top: 86, width: 800, height: 600, opacity: fade }}>
        <ThreeCanvas width={800} height={600} camera={{ position: [6.0, 4.8, 7.6], fov: 30 }}>
          <LookAt />
          <Lights />
          <Cube3D stickers={tl.stickers} move={tl.move} t={tl.t} rotation={[0, spin, 0]} />
        </ThreeCanvas>
      </div>

      <div style={{ position: 'absolute', left: 120, top: 250, width: 420, fontFamily: MONO }}>
        <div style={{ fontSize: 22, color: DIM }}>phase</div>
        <div style={{ fontSize: 44, color: FG, marginTop: 6 }}>{phaseName.toLowerCase()}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 40 }}>{inScramble ? 'scramble' : 'move'}</div>
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
