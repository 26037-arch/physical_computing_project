import { interpolate, useCurrentFrame } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Frame } from '../components/Overlay.jsx';
import { ACTUATORS, REPO, deriveFacts, fmt } from '../lib/facts.js';
import { DIM, FG, MONO } from '../theme.js';

const F = deriveFacts(data);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

export const Outro = ({ scene }) => {
  const frame = useCurrentFrame();
  const items = [
    { big: String(F.totalMoves), small: 'moves' },
    { big: fmt(F.crossNodes), small: 'cross nodes' },
    { big: `${ACTUATORS.steppers} + ${ACTUATORS.servos}`, small: `${ACTUATORS.steppers} stepper + ${ACTUATORS.servos} servos` },
  ];
  return (
    <Frame scene={scene} index={7} name="summary">
      <div style={{ position: 'absolute', left: 120, right: 120, top: 280, display: 'flex', justifyContent: 'space-around' }}>
        {items.map((it, i) => {
          const o = interpolate(frame, [4 + i * 7, 14 + i * 7], [0, 1], CLAMP);
          return (
            <div key={i} style={{ textAlign: 'center', fontFamily: MONO, opacity: o, width: 520 }}>
              <div style={{ fontSize: 132, fontWeight: 700, color: FG, lineHeight: '170px' }}>{it.big}</div>
              <div style={{ fontSize: 32, color: DIM, marginTop: 10 }}>{it.small}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 680, textAlign: 'center', fontFamily: MONO, fontSize: 32, color: FG, opacity: interpolate(frame, [24, 34], [0, 1], CLAMP) }}>
        {REPO}
      </div>
    </Frame>
  );
};
