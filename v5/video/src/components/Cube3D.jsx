// 3D 큐브: 스티커 54자 상태 + (선택) 진행 중인 한 수의 층 회전.
// 층 회전 방향은 lib/cube.js 기하와 같다 (check.mjs 가 stickerSteps 전체로 검증).
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CUBIES, FACELETS, COLORS, parseMove, inLayer } from '../lib/cube.js';

const STICKER_ROT = {
  '1,0,0': [0, Math.PI / 2, 0],
  '-1,0,0': [0, -Math.PI / 2, 0],
  '0,1,0': [-Math.PI / 2, 0, 0],
  '0,-1,0': [Math.PI / 2, 0, 0],
  '0,0,1': [0, 0, 0],
  '0,0,-1': [0, Math.PI, 0],
};

// 강조 단계: 2 = 원래 색, 1 = 은은하게, 0 = 어둡게. sRGB 값에서 어두운 회색 쪽으로 섞는다 (0 은 거의 회색).
const DARK = [0x1f, 0x20, 0x25];
const KEEP = [0.13, 0.42, 1];
const shade = (hex, level) => {
  if (level == null || level >= 2) return hex;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const g = (c[0] + c[1] + c[2]) / 3;
  const k = KEEP[level];
  // 0 단계는 색을 절반 탈색한 뒤 섞는다
  const src = level === 0 ? c.map((v) => (v + g) / 2) : c;
  return '#' + src.map((v, i) => Math.round(DARK[i] + (v - DARK[i]) * k).toString(16).padStart(2, '0')).join('');
};

// 글로우: 밝기를 흰색 쪽으로 조금 + 스티커 둘레의 얇은 밝은 테두리 (블룸 없음)
const lighten = (hex, g) => '#' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.round(v + (255 - v) * 0.3 * g).toString(16).padStart(2, '0')).join('');

const Cubie = ({ p, stickers, state, levels, glow, opacity = 1 }) => (
  <group position={p}>
    <mesh>
      <boxGeometry args={[0.97, 0.97, 0.97]} />
      <meshLambertMaterial color="#121317" transparent={opacity < 1} opacity={opacity} />
    </mesh>
    {stickers.map((i) => {
      const n = FACELETS[i].n;
      const g = glow ? glow[i] : 0;
      const base = shade(COLORS[state[i]], levels ? levels[i] : 2);
      return (
        <group key={i}>
          {g > 0.01 ? (
            <mesh position={[n[0] * 0.4865, n[1] * 0.4865, n[2] * 0.4865]} rotation={STICKER_ROT[n.join(',')]}>
              <planeGeometry args={[0.84 + 0.11 * g, 0.84 + 0.11 * g]} />
              <meshBasicMaterial color="#fff4cf" transparent opacity={0.75 * g} />
            </mesh>
          ) : null}
          <mesh position={[n[0] * 0.488, n[1] * 0.488, n[2] * 0.488]} rotation={STICKER_ROT[n.join(',')]}>
            <planeGeometry args={[0.84, 0.84]} />
            <meshLambertMaterial color={g > 0.01 ? lighten(base, g) : base} transparent={opacity < 1} opacity={opacity} />
          </mesh>
        </group>
      );
    })}
  </group>
);

// move: 'R2' 같은 수, t: 0..1 진행. layerAxis/layerAngle 로 임의 층 회전도 가능.
export const Cube3D = ({ stickers, levels = null, glow = null, move = null, t = 0, layer = null, rotation = [0, 0, 0], position = [0, 0, 0], opacity = 1, children }) => {
  let axis = null;
  let angle = 0;
  if (move) {
    const pm = parseMove(move);
    axis = pm.axis;
    angle = pm.angle * t;
  } else if (layer) {
    axis = layer.axis;
    angle = layer.angle;
  }
  const moving = [];
  const still = [];
  for (const c of CUBIES) (axis && inLayer(c.p, axis) ? moving : still).push(c);
  const rot = axis ? [axis[0] * angle, axis[1] * angle, axis[2] * angle] : [0, 0, 0];
  return (
    <group rotation={rotation} position={position}>
      {still.map((c) => <Cubie key={c.p.join()} {...c} state={stickers} levels={levels} glow={glow} opacity={opacity} />)}
      <group rotation={rot}>
        {moving.map((c) => <Cubie key={c.p.join()} {...c} state={stickers} levels={levels} glow={glow} opacity={opacity} />)}
      </group>
      {children}
    </group>
  );
};

export const LookAt = ({ target = [0, 0, 0] }) => {
  const camera = useThree((s) => s.camera);
  useMemo(() => camera.lookAt(...target), [camera, target]);
  useEffect(() => { camera.lookAt(...target); camera.updateProjectionMatrix(); }, [camera, target]);
  return null;
};

export const Lights = () => (
  <>
    <ambientLight intensity={1.7} />
    <directionalLight position={[4, 8, 6]} intensity={1.6} />
    <directionalLight position={[-6, -2, 3]} intensity={0.5} />
  </>
);
