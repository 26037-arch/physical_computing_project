// 크로스 IDA*: (a) 무작정 탐색 vs IDA* 카운터, (b) 실제 trace 의 탐색 그래프(IdaTree.jsx, 05 줄 + 뒤 무음 연출), (c) 가운데 숫자가 5,797 로 줄어듦 + 짧은 로그 눈금
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Frame } from '../components/Overlay.jsx';
import { TreePart } from './IdaTree.jsx';
import { deriveFacts, fmt } from '../lib/facts.js';
import { DIM, FAINT, FG, GOAL, MONO } from '../theme.js';

const F = deriveFacts(data);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// ---------- (a) 무작정 탐색: 가운데 큰 카운터 ----------
const LOG_MAX = 9;
const slotsOf = (v) => fmt(v).padStart(fmt(F.brute.total).length, ' ').split('');

const BruteCount = ({ frame, total }) => {
  const bruteTotal = F.brute.total;
  const cum = [];
  F.brute.perDepth.reduce((acc, v, i) => { cum[i] = acc + v; return cum[i]; }, 0);
  const u = interpolate(frame, [8, total - 30], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  const val = u <= 0 ? 0 : Math.min(bruteTotal, Math.round(Math.pow(10, Math.log10(bruteTotal) * u)));
  return (
    <>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 250, textAlign: 'center', fontFamily: MONO }}>
        <div style={{ fontSize: 28, color: DIM }}>brute force · cross · depth ≤ 7</div>
        <div style={{ fontSize: 176, color: FG, fontWeight: 700, lineHeight: '210px', marginTop: 20 }}>{fmt(val)}</div>
        <div style={{ fontSize: 22, color: '#5c5f66', marginTop: 4 }}>move sequences · no same face twice · opposite faces one order</div>
      </div>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 640, textAlign: 'center', fontFamily: MONO, fontSize: 22, whiteSpace: 'nowrap' }}>
        {F.brute.perDepth.map((v, i) => (
          <span key={i} style={{ margin: '0 14px', color: val >= cum[i] ? DIM : '#2c2f35' }}>
            d{i + 1} <span style={{ color: val >= cum[i] ? FG : '#2c2f35' }}>{fmt(v)}</span>
          </span>
        ))}
      </div>
    </>
  );
};

// ---------- (c) 같은 자리의 숫자가 5,797 로 줄어듦 ----------
// 자릿수가 떨어져 나가며(앞자리 글자가 아래로 떨어지고 흐려짐) 카운트다운, 글자도 작아지고 노란색(IDA*)으로
const Shrink = ({ frame, total }) => {
  const from = F.brute.total;
  const to = F.crossNodes;
  const T0 = 4;
  const T1 = Math.min(total - 40, 58);
  const valAt = (f) => {
    const u = interpolate(f, [T0, T1], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
    return Math.round(Math.pow(10, Math.log10(from) + (Math.log10(to) - Math.log10(from)) * u));
  };
  const val = valAt(frame);
  const cur = slotsOf(val);
  // 각 자리가 마지막으로 보였던 프레임 → 그 뒤 12 프레임 동안 떨어지는 글자
  const falling = cur.map((ch, i) => {
    if (ch !== ' ') return null;
    for (let f = Math.floor(frame); f >= Math.max(0, frame - 14); f--) {
      const prev = slotsOf(valAt(f))[i];
      if (prev !== ' ') return { ch: prev, age: frame - f };
    }
    return null;
  });
  const k = interpolate(frame, [T0, T1], [0, 1], CLAMP);
  const size = 176 - 56 * k;
  const color = k >= 1 ? GOAL : FG;
  const after = interpolate(frame, [T1 + 2, T1 + 12], [0, 1], CLAMP);
  const axis = interpolate(frame, [T1 + 14, T1 + 30], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const ratio = from / to;
  const X0 = 560;
  const W = 800;
  const xOf = (v) => X0 + (Math.log10(v) / LOG_MAX) * W;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 250, textAlign: 'center', fontFamily: MONO }}>
        <div style={{ fontSize: 28, color: DIM, position: 'relative', height: 36 }}>
          <span style={{ position: 'absolute', left: 0, right: 0, opacity: interpolate(k, [0, 0.4], [1, 0], CLAMP) }}>brute force · cross · depth ≤ 7</span>
          <span style={{ position: 'absolute', left: 0, right: 0, opacity: interpolate(k, [0.6, 1], [0, 1], CLAMP), color: GOAL }}>ida* · nodes visited</span>
        </div>
        <div style={{ fontSize: size, color, fontWeight: 700, lineHeight: '210px', marginTop: 20, whiteSpace: 'pre', display: 'inline-flex' }}>
          {cur.map((ch, i) => {
            const fl = falling[i];
            if (ch !== ' ') return <span key={i}>{ch}</span>;
            if (!fl) return <span key={i} style={{ width: 0, overflow: 'hidden' }} />;
            // 떨어지는 글자: 자리는 점점 좁아지고 글자는 아래로
            const t = fl.age / 14;
            return (
              <span key={i} style={{ display: 'inline-block', width: `${(1 - t) * 0.6}em`, overflow: 'visible', transform: `translateY(${t * t * 260}px)`, opacity: 1 - t, color: '#6a6d74' }}>{fl.ch}</span>
            );
          })}
        </div>
        <div style={{ fontSize: 30, color: GOAL, marginTop: 8, opacity: after }}>÷ {fmt(ratio)}</div>
        <div style={{ fontSize: 20, color: '#5c5f66', marginTop: 6, opacity: after }}>
          {fmt(from)} → {fmt(to)} · bound {F.bounds.map((b) => b.bound).join('·')} = {F.bounds.map((b) => fmt(b.visited)).join(' + ')}
        </div>
      </div>
      {axis > 0 ? (
        <div style={{ position: 'absolute', left: 0, top: 730, width: 1920, height: 80, fontFamily: MONO, opacity: axis }}>
          <div style={{ position: 'absolute', left: X0, top: 30, width: W * axis, height: 1, background: FAINT }} />
          {Array.from({ length: LOG_MAX + 1 }, (_, e) => (
            <div key={e} style={{ position: 'absolute', left: X0 + (e / LOG_MAX) * W - 20, top: 40, width: 40, textAlign: 'center', fontSize: 15, color: '#55585f' }}>10<sup>{e}</sup></div>
          ))}
          <div style={{ position: 'absolute', left: xOf(from) - 1, top: 14, width: 3, height: 32, background: FG }} />
          <div style={{ position: 'absolute', left: xOf(from) - 60, top: -12, width: 120, textAlign: 'center', fontSize: 16, color: DIM }}>brute</div>
          <div style={{ position: 'absolute', left: xOf(to) - 1, top: 14, width: 3, height: 32, background: GOAL }} />
          <div style={{ position: 'absolute', left: xOf(to) - 60, top: -12, width: 120, textAlign: 'center', fontSize: 16, color: GOAL }}>ida*</div>
          <div style={{ position: 'absolute', left: X0 + W + 30, top: 20, fontSize: 16, color: DIM }}>log₁₀</div>
        </div>
      ) : null}
    </>
  );
};

export const Ida = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [, l5, l6] = scene.lines;
  const aEnd = l5.from;
  const bEnd = l6.from;
  const X = 8;
  const opA = interpolate(frame, [aEnd - X, aEnd], [1, 0], CLAMP);
  const opB = interpolate(frame, [aEnd - X, aEnd, bEnd - X, bEnd], [0, 1, 1, 0], CLAMP);
  const opC = interpolate(frame, [bEnd - X, bEnd], [0, 1], CLAMP);
  return (
    <Frame scene={scene} index={3} name="ida*">
      {frame < aEnd ? <AbsoluteFill style={{ opacity: opA }}><BruteCount frame={frame} total={aEnd} /></AbsoluteFill> : null}
      {frame >= aEnd - X && frame < bEnd ? (
        <AbsoluteFill style={{ opacity: opB }}><TreePart frame={Math.max(0, frame - aEnd)} total={bEnd - aEnd} /></AbsoluteFill>
      ) : null}
      {frame >= bEnd - X ? <AbsoluteFill style={{ opacity: opC }}><Shrink frame={Math.max(0, frame - bEnd)} total={durationInFrames - bEnd} /></AbsoluteFill> : null}
    </Frame>
  );
};
