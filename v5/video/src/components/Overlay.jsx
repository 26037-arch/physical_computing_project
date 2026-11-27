import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BG, DIM, FG, MONO, SANS } from '../theme.js';

// 자막 burn-in: narration.md 대본 문구 그대로, 최대 2줄
export const Subtitles = ({ lines }) => {
  const frame = useCurrentFrame();
  const cur = lines.find((l) => frame >= l.from && frame < l.from + l.durationInFrames);
  if (!cur) return null;
  const local = frame - cur.from;
  const opacity = interpolate(local, [0, 4, cur.durationInFrames - 4, cur.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 160, right: 160, bottom: 46, height: 118, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{
        fontFamily: SANS, fontSize: 40, lineHeight: '54px', color: FG, textAlign: 'center', fontWeight: 500,
        maxHeight: 108, overflow: 'hidden', opacity, wordBreak: 'keep-all',
        background: 'rgba(11,12,15,0.82)', padding: '2px 18px', borderRadius: 4,
      }}>
        {cur.text}
      </div>
    </div>
  );
};

export const SceneLabel = ({ index, name }) => (
  <div style={{ position: 'absolute', left: 64, top: 44, fontFamily: MONO, fontSize: 22, color: DIM, letterSpacing: 1 }}>
    v5h <span style={{ color: '#55585f' }}>/</span> {String(index).padStart(2, '0')} {name}
  </div>
);

export const Frame = ({ children, scene, index, name }) => (
  <AbsoluteFill style={{ background: BG, color: FG }}>
    {children}
    <SceneLabel index={index} name={name} />
    <Subtitles lines={scene.lines} />
  </AbsoluteFill>
);
