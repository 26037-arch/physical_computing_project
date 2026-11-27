import { ThreeCanvas } from '@remotion/three';
import { interpolate, useCurrentFrame } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Cube3D, Lights, LookAt } from '../components/Cube3D.jsx';
import { Frame } from '../components/Overlay.jsx';
import { DIM, FG, MONO, SANS } from '../theme.js';

export const Title = ({ scene }) => {
  const frame = useCurrentFrame();
  const spin = -0.6 + frame * 0.012;
  const appear = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <Frame scene={scene} index={1} name="title">
      <div style={{ position: 'absolute', right: 80, top: 90, width: 860, height: 780 }}>
        <ThreeCanvas width={860} height={780} camera={{ position: [6.2, 4.6, 7.4], fov: 30 }}>
          <LookAt />
          <Lights />
          <Cube3D stickers={data.stickersAfterScramble} rotation={[0, spin, 0]} />
        </ThreeCanvas>
      </div>
      <div style={{ position: 'absolute', left: 150, top: 330, opacity: appear }}>
        <div style={{ fontFamily: SANS, fontSize: 104, fontWeight: 700, color: FG, letterSpacing: -1 }}>
          큐브 풀이 로봇 <span style={{ fontFamily: MONO, fontWeight: 700 }}>V5H</span>
        </div>
        <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 32, color: DIM }}>
          1반 6팀 · 1103 김재혁 · 1105 나준우 · 컴퓨터과학2 피지컬컴퓨팅
        </div>
        <div style={{ marginTop: 44, fontFamily: MONO, fontSize: 21, color: '#62656c' }}>
          seed {data.seed} · scramble {data.scramble.join(' ')}
        </div>
      </div>
    </Frame>
  );
};
