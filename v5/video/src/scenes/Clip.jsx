// 실물 3클립 장면. public/clips/<name>.mp4 가 있으면 clips.json 구간을 재생,
// 없으면 같은 3D 큐브로 동작을 보여 주는 대체 화면(simulation).
import { ThreeCanvas } from '@remotion/three';
import { Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Cube3D, Lights, LookAt } from '../components/Cube3D.jsx';
import { Frame } from '../components/Overlay.jsx';
import timeline from '../generated/timeline.json';
import { DIM, FG, MONO, SANS } from '../theme.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ease = Easing.inOut(Easing.cubic);

const INFO = {
  cup: { n: '①', title: '컵 회전', part: 'NEMA17', index: 4 },
  hood: { n: '②', title: '후드', part: 'MG996R', index: 5 },
  lifter: { n: '③', title: '리프터', part: 'SG90', index: 6 },
};

// 클립 영역
const BOX = { left: 160, top: 150, width: 1600, height: 740 };

const RealClip = ({ clip, sceneFrames, fps }) => {
  const rot = ((clip.rotate || 0) + 360) % 360;
  const srcW = clip.width;
  const srcH = clip.height;
  // 메타데이터 회전(-90 = 세로 촬영)은 디코더가 이미 적용한다고 보고, 표시 크기만 바꾼다
  const metaSwap = Math.abs(clip.rotation || 0) % 180 === 90;
  const dispW0 = metaSwap ? srcH : srcW;
  const dispH0 = metaSwap ? srcW : srcH;
  const swap = rot % 180 === 90;
  const outW = swap ? dispH0 : dispW0;
  const outH = swap ? dispW0 : dispH0;
  const [cx0, cx1] = clip.cropX || [0, 1];
  const visW = outW * (cx1 - cx0);
  const s = Math.min(BOX.width / visW, BOX.height / outH);
  const vw = visW * s;
  const vh = outH * s;
  const start = clip.startSec || 0;
  const end = clip.endSec == null ? clip.durationSec : Math.min(clip.endSec, clip.durationSec);
  const segSec = Math.max(0.1, end - start);
  const rate = Math.min(2, Math.max(0.5, segSec / (sceneFrames / fps)));
  return (
    <div style={{ position: 'absolute', left: BOX.left + (BOX.width - vw) / 2, top: BOX.top + (BOX.height - vh) / 2, width: vw, height: vh, overflow: 'hidden', background: '#000' }}>
      <div style={{ position: 'absolute', left: -cx0 * outW * s, top: 0, width: outW * s, height: outH * s }}>
        <OffthreadVideo
          src={staticFile(clip.file)}
          muted
          trimBefore={Math.round(start * fps)}
          trimAfter={Math.round(end * fps)}
          playbackRate={rate}
          style={{
            position: 'absolute',
            width: dispW0 * s, height: dispH0 * s,
            left: (outW * s - dispW0 * s) / 2, top: (outH * s - dispH0 * s) / 2,
            transform: `rotate(${rot}deg)`,
          }}
        />
      </div>
      {Math.abs(rate - 1) > 0.05 ? (
        <div style={{ position: 'absolute', right: 12, bottom: 10, fontFamily: MONO, fontSize: 20, color: FG, background: 'rgba(11,12,15,0.8)', padding: '2px 8px' }}>{rate.toFixed(2)}×</div>
      ) : null}
    </div>
  );
};

// 후드: 위 두 층을 덮는 반투명 ㄷ자(윗판 + 좌우 벽)
const Hood = ({ drop }) => (
  <group position={[0, 0.5 + drop, 0]}>
    <mesh position={[0, 1.12, 0]}>
      <boxGeometry args={[3.5, 0.12, 3.3]} />
      <meshLambertMaterial color="#9fb4d8" transparent opacity={0.35} depthWrite={false} />
    </mesh>
    {[-1, 1].map((sx) => (
      <mesh key={sx} position={[sx * 1.69, 0.08, 0]}>
        <boxGeometry args={[0.12, 2.2, 3.3]} />
        <meshLambertMaterial color="#9fb4d8" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    ))}
  </group>
);

const SimClip = ({ name, frame }) => {
  let cube;
  let caption = '';
  if (name === 'cup') {
    // 아랫층(D)만 90°씩 두 번
    const a1 = ease(interpolate(frame, [12, 42], [0, 1], CLAMP));
    const a2 = ease(interpolate(frame, [70, 100], [0, 1], CLAMP));
    // D 시계 방향 = 아래 법선 (0,-1,0) 둘레 -90°
    cube = <Cube3D stickers={SOLVED} layer={{ axis: [0, -1, 0], angle: -(a1 + a2) * (Math.PI / 2) }} rotation={[0, -0.5, 0]} />;
    caption = `bottom layer ${Math.round(((a1 + a2) * 90))}°`;
  } else if (name === 'hood') {
    const drop = interpolate(frame, [6, 34], [2.4, 0], { ...CLAMP, easing: Easing.out(Easing.cubic) });
    const turn = ease(interpolate(frame, [50, 84], [0, 1], CLAMP));
    cube = (
      <group rotation={[0, -0.5, 0]}>
        <Cube3D stickers={SOLVED} layer={{ axis: [0, -1, 0], angle: -turn * (Math.PI / 2) }} />
        <Hood drop={drop} />
      </group>
    );
    caption = drop > 0.01 ? 'hood down' : turn > 0 ? 'top two layers held · bottom turns' : 'top two layers held';
  } else {
    const k = ease(interpolate(frame, [16, 56], [0, 1], CLAMP));
    // x' : +90° (오른손) about +x  → 앞면이 아래로
    cube = <group rotation={[0, -0.5, 0]}><Cube3D stickers={SOLVED} rotation={[k * (Math.PI / 2), 0, 0]} /></group>;
    caption = k < 1 ? "x' · flip" : "x' · next face down";
  }
  return (
    <div style={{ position: 'absolute', ...BOX }}>
      <div style={{ position: 'absolute', inset: 0, border: '1px solid #22252b' }} />
      <ThreeCanvas width={BOX.width} height={BOX.height} camera={{ position: [5.6, 4.6, 7.4], fov: 32 }}>
        <LookAt />
        <Lights />
        {cube}
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 20, bottom: 14, fontFamily: MONO, fontSize: 22, color: DIM }}>{caption}</div>
      <div style={{ position: 'absolute', right: 20, bottom: 14, fontFamily: MONO, fontSize: 20, color: '#5c5f66' }}>simulation</div>
    </div>
  );
};

export const Clip = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const info = INFO[scene.clip];
  const clip = timeline.clips[scene.clip];
  const head = interpolate(frame, [0, 8], [0, 1], CLAMP);
  return (
    <Frame scene={scene} index={info.index} name={scene.clip}>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 64, textAlign: 'center', opacity: head }}>
        <span style={{ fontFamily: SANS, fontSize: 50, color: FG, fontWeight: 700 }}>{info.n} {info.title}</span>
        <span style={{ fontFamily: MONO, fontSize: 40, color: DIM, marginLeft: 22 }}>{info.part}</span>
      </div>
      {clip && clip.exists
        ? <RealClip clip={clip} sceneFrames={durationInFrames} fps={fps} />
        : <SimClip name={scene.clip} frame={frame} />}
    </Frame>
  );
};
