import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
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
    V5H <span style={{ color: '#55585f' }}>/</span> {String(index).padStart(2, '0')} {name}
  </div>
);

// 장면 사이 트랜지션: 각 장면 파일 안에서 앞 6프레임은 배경색에서 떠오르고 끝 6프레임은 배경색으로 가라앉는다
// (이어 붙이면 12프레임 디졸브처럼 보인다. 완성 파일끼리 재인코딩하지 않음)
export const FADE_FRAMES = 6;
export const Frame = ({ children, scene, index, name }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(frame, [0, FADE_FRAMES], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: BG, color: FG }}>
      <AbsoluteFill style={{ opacity: o, transform: `translateY(${y}px)` }}>
        {children}
        <SceneLabel index={index} name={name} />
        <Subtitles lines={scene.lines} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
