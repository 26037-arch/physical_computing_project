// 크로스 IDA*: (a) 무작정 탐색 vs IDA* 카운터, (b) 실제 trace 5,797 노드의 탐색 트리, (c) 다시 비교 + 로그 막대
import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import data from '../../data/algo_seed1.json';
import { Frame } from '../components/Overlay.jsx';
import { deriveFacts, fmt } from '../lib/facts.js';
import { DIM, FAINT, FG, GOAL, LINE, MONO, PRUNE } from '../theme.js';

const F = deriveFacts(data);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// ---------- 트리 배치 (반복마다 방사형, DFS 순서 = trace 순서) ----------
const CX = 960;
const CY = 468;
const RSTEP = 48;

function layout(iter) {
  const rows = iter.rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kids = new Map(rows.map((r) => [r.id, []]));
  for (const r of rows) if (r.parent >= 0 && kids.has(r.parent)) kids.get(r.parent).push(r.id);
  const leaves = new Map();
  const countLeaves = (id) => {
    const ks = kids.get(id);
    let n = ks.length ? 0 : 1;
    for (const k of ks) n += countLeaves(k);
    leaves.set(id, n);
    return n;
  };
  const root = rows[0].id;
  countLeaves(root);
  const pos = new Map();
  const place = (id, a0, a1) => {
    const r = byId.get(id);
    const mid = (a0 + a1) / 2;
    pos.set(id, [CX + Math.sin(mid) * r.depth * RSTEP, CY - Math.cos(mid) * r.depth * RSTEP]);
    let a = a0;
    for (const k of kids.get(id)) {
      const span = ((a1 - a0) * leaves.get(k)) / leaves.get(id);
      place(k, a, a + span);
      a += span;
    }
  };
  place(root, -Math.PI, Math.PI);
  const visited = rows.length - 1;
  const goalRow = rows.find((r) => r.event === 'goal') || null;
  const path = [];
  if (goalRow) for (let r = goalRow; r; r = byId.get(r.parent)) path.unshift(r);
  return { rows, pos, visited, goalRow, path, bound: iter.bound };
}

const LAYOUTS = F.iterations.map(layout);

// 파트 b 안의 시간 배분 (비율)
const PLAN = [
  { grow: 0.12, hold: 0.08 },
  { grow: 0.36, hold: 0.08 },
  { grow: 0.15, hold: 0 },
];

function treeTimeline(frame, total) {
  let t = 0;
  for (let i = 0; i < PLAN.length; i++) {
    const g = PLAN[i].grow * total;
    const h = i === PLAN.length - 1 ? total - t - g : PLAN[i].hold * total;
    if (frame < t + g + h || i === PLAN.length - 1) {
      const local = frame - t;
      const rowsShown = Math.min(LAYOUTS[i].rows.length, Math.max(1, Math.floor((local / g) * LAYOUTS[i].rows.length) + 1));
      return { iter: i, local, grow: g, hold: h, rowsShown, done: local >= g, rowsPerFrame: LAYOUTS[i].rows.length / g };
    }
    t += g + h;
  }
  return null;
}

const TreeCanvas = ({ st }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 1920, 1080);
    const L = LAYOUTS[st.iter];
    const fadeOut = st.hold > 0 ? interpolate(st.local, [st.grow + st.hold - 7, st.grow + st.hold], [1, 0], CLAMP) : 1;
    ctx.globalAlpha = fadeOut;
    // 깊이 고리 (g = 1..bound), bound 고리는 조금 밝게
    for (let d = 1; d <= 7; d++) {
      ctx.beginPath();
      ctx.arc(CX, CY, d * RSTEP, 0, Math.PI * 2);
      ctx.strokeStyle = d === L.bound ? '#4a4d55' : d < L.bound ? '#1e2026' : '#14161a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const n = st.rowsShown;
    const curRowF = (st.local / st.grow) * L.rows.length; // 방문 시각(행 단위)
    // 확장 간선 (흰 선)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(232,232,228,0.55)';
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const r = L.rows[i];
      if (r.event === 'prune') continue;
      const a = L.pos.get(r.parent);
      const b = L.pos.get(r.id);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.fillStyle = FG;
    for (let i = 0; i < n; i++) {
      const r = L.rows[i];
      if (r.event === 'prune') continue;
      const b = L.pos.get(r.id);
      ctx.fillRect(b[0] - 1.5, b[1] - 1.5, 3, 3);
    }
    // 잘린 자식 (빨강으로 깜빡이고 사라짐)
    const LIFE = 9 * st.rowsPerFrame; // 약 9 프레임
    for (let i = 1; i < n; i++) {
      const r = L.rows[i];
      if (r.event !== 'prune') continue;
      const age = curRowF - i;
      if (age > LIFE) continue;
      const alpha = Math.max(0, 1 - age / LIFE);
      const a = L.pos.get(r.parent);
      const b = L.pos.get(r.id);
      ctx.strokeStyle = `rgba(216,66,58,${0.7 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.fillStyle = `rgba(216,66,58,${alpha})`;
      ctx.beginPath();
      ctx.arc(b[0], b[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 목표 경로 강조
    if (L.goalRow && st.done) {
      const k = interpolate(st.local - st.grow, [0, 14], [0, 1], CLAMP);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GOAL;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      const upto = 1 + k * (L.path.length - 1);
      for (let i = 0; i < L.path.length && i <= upto; i++) {
        const p = L.pos.get(L.path[i].id);
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.fillStyle = GOAL;
      for (let i = 0; i < L.path.length && i <= upto; i++) {
        const p = L.pos.get(L.path[i].id);
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [st]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }} />;
};

const TreePart = ({ frame, total }) => {
  const st = treeTimeline(frame, total);
  const L = LAYOUTS[st.iter];
  const prevVisited = F.bounds.slice(0, st.iter).reduce((a, b) => a + b.visited, 0);
  const rowsDone = st.rowsShown - 1;
  const visited = prevVisited + rowsDone;
  const pruned = L.rows.slice(1, st.rowsShown).filter((r) => r.event === 'prune').length;
  const last = L.rows[st.rowsShown - 1];
  const B = F.bounds[st.iter];
  const labelOpacity = st.done ? interpolate(st.local - st.grow, [0, 5], [0, 1], CLAMP) : 0;
  return (
    <>
      <TreeCanvas st={st} />
      {L.goalRow && st.done ? L.path.slice(1).map((r, i) => {
        const k = interpolate(st.local - st.grow, [0, 14], [0, 1], CLAMP);
        if (i + 1 > 1 + k * (L.path.length - 1)) return null;
        // 수 이름은 노드 옆(경로 진행 방향의 수직 쪽)에
        const p = L.pos.get(r.id);
        const q = L.pos.get(r.parent);
        const dx = p[0] - q[0];
        const dy = p[1] - q[1];
        const len = Math.hypot(dx, dy) || 1;
        const tx = p[0] - (dy / len) * 30;
        const ty = p[1] + (dx / len) * 30;
        return (
          <div key={r.id} style={{ position: 'absolute', left: tx - 30, top: ty - 15, width: 60, height: 30, textAlign: 'center', lineHeight: '30px', fontFamily: MONO, fontWeight: 700, fontSize: 22, color: GOAL }}>
            {r.move}
          </div>
        );
      }) : null}
      <div style={{ position: 'absolute', left: 64, top: 120, fontFamily: MONO, color: FG }}>
        <div style={{ fontSize: 22, color: DIM }}>ida* · cross</div>
        <div style={{ fontSize: 46, marginTop: 8 }}>f = g + h</div>
        <div style={{ fontSize: 18, color: DIM, marginTop: 10, lineHeight: '28px' }}>
          g = 지금까지 쓴 수<br />h = 남은 수의 하한 (엣지 쌍 거리표)<br />f &gt; bound → 가지 자름
        </div>
        <div style={{ fontSize: 22, marginTop: 34, color: DIM }}>last node</div>
        <div style={{ fontSize: 24, marginTop: 6, whiteSpace: 'pre' }}>
          {last.id === 0 ? `root  h ${last.h}` : `${(last.move || '').padEnd(3)} g ${last.g}  h ${last.h}  f ${last.f}`}
        </div>
        <div style={{ fontSize: 24, marginTop: 4, color: last.event === 'prune' ? PRUNE : last.event === 'goal' ? GOAL : FG }}>
          {last.id === 0 ? 'expand' : last.event === 'prune' ? `${last.f} > ${last.bound} · prune` : last.event === 'goal' ? 'goal' : `${last.f} ≤ ${last.bound} · expand`}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 64, top: 120, fontFamily: MONO, color: FG, textAlign: 'right' }}>
        <div style={{ fontSize: 22, color: DIM }}>bound</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: '84px' }}>{L.bound}</div>
        <div style={{ fontSize: 20, color: DIM }}>iteration {st.iter + 1} / {F.iterations.length}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 30 }}>visited</div>
        <div style={{ fontSize: 44 }}>{fmt(visited)}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 16 }}>pruned (this bound)</div>
        <div style={{ fontSize: 32, color: PRUNE }}>{fmt(pruned)}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 866, textAlign: 'center', fontFamily: MONO, fontSize: 28, opacity: labelOpacity, color: B.goalFound ? GOAL : FG }}>
        {B.goalFound ? `bound ${B.bound} · goal · ${F.crossSolution.join(' ')}` : `bound ${B.bound} · no solution · ${fmt(B.visited)} nodes`}
      </div>
    </>
  );
};

// ---------- 나란히 비교 ----------
const LOG_MAX = 9;

const Compare = ({ frame, total, mode }) => {
  const bruteTotal = F.brute.total;
  const cum = [];
  F.brute.perDepth.reduce((a, b, i) => { cum[i] = a + b; return cum[i]; }, 0);
  let bruteVal;
  if (mode === 'a') {
    const u = interpolate(frame, [10, total - 30], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
    bruteVal = u <= 0 ? 0 : Math.min(bruteTotal, Math.round(Math.pow(10, Math.log10(bruteTotal) * u)));
  } else bruteVal = bruteTotal;
  const idaVal = mode === 'a' ? 0 : Math.round(interpolate(frame, [4, 22], [0, F.crossNodes], { ...CLAMP, easing: Easing.out(Easing.cubic) }));
  const barK = mode === 'c' ? interpolate(frame, [26, 48], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) }) : 0;
  const big = mode === 'a' ? 112 : 92;
  const ratio = bruteTotal / F.crossNodes;
  return (
    <>
      <div style={{ position: 'absolute', left: 959, top: 130, width: 1, height: mode === 'a' ? 660 : 340, background: LINE }} />
      <div style={{ position: 'absolute', left: 0, width: 960, top: 140, textAlign: 'center', fontFamily: MONO }}>
        <div style={{ fontSize: 26, color: DIM }}>brute force · depth ≤ 7</div>
        <div style={{ fontSize: big, color: FG, fontWeight: 700, marginTop: 30 }}>{fmt(bruteVal)}</div>
        <div style={{ fontSize: 20, color: '#5c5f66', marginTop: 6 }}>sequences (no same face twice · opposite faces one order)</div>
      </div>
      <div style={{ position: 'absolute', left: 960, width: 960, top: 140, textAlign: 'center', fontFamily: MONO }}>
        <div style={{ fontSize: 26, color: DIM }}>ida* · bound {F.bounds.map((b) => b.bound).join(' → ')}</div>
        <div style={{ fontSize: big, color: mode === 'a' ? FAINT : FG, fontWeight: 700, marginTop: 30 }}>{fmt(idaVal)}</div>
        <div style={{ fontSize: 20, color: '#5c5f66', marginTop: 6 }}>
          {mode === 'a' ? 'nodes visited' : F.bounds.map((b) => `${b.bound}: ${fmt(b.visited)}`).join('  +  ') + '  nodes'}
        </div>
      </div>
      {mode === 'a' ? (
        <div style={{ position: 'absolute', left: 300, top: 470, width: 400, fontFamily: MONO, fontSize: 26, lineHeight: '42px' }}>
          {F.brute.perDepth.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: bruteVal >= cum[i] ? FG : '#33363c' }}>
              <span style={{ color: bruteVal >= cum[i] ? DIM : '#33363c' }}>depth {i + 1}</span><span>{fmt(v)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {mode === 'a' ? (
        <div style={{ position: 'absolute', left: 960, width: 960, top: 520, textAlign: 'center', fontFamily: MONO, fontSize: 24, color: '#45484f' }}>waiting</div>
      ) : null}
      {mode === 'c' ? (
        <div style={{ position: 'absolute', left: 260, top: 560, width: 1400, fontFamily: MONO }}>
          {[{ name: 'brute force', v: bruteTotal, c: FG }, { name: 'ida*', v: F.crossNodes, c: GOAL }].map((b, i) => (
            <div key={b.name} style={{ position: 'absolute', left: 0, top: i * 74, width: 1400, height: 54 }}>
              <div style={{ position: 'absolute', left: 0, top: 12, width: 170, fontSize: 24, color: DIM }}>{b.name}</div>
              <div style={{ position: 'absolute', left: 190, top: 8, height: 38, width: (Math.log10(b.v) / LOG_MAX) * 1000 * barK, background: b.c }} />
              <div style={{ position: 'absolute', left: 190 + (Math.log10(b.v) / LOG_MAX) * 1000 * barK + 16, top: 12, fontSize: 24, color: FG, opacity: barK }}>{fmt(b.v)}</div>
            </div>
          ))}
          <div style={{ position: 'absolute', left: 190, top: 158, width: 1000, height: 1, background: FAINT }} />
          {Array.from({ length: LOG_MAX + 1 }, (_, e) => (
            <div key={e} style={{ position: 'absolute', left: 190 + (e / LOG_MAX) * 1000 - 30, top: 166, width: 60, textAlign: 'center', fontSize: 18, color: '#5c5f66' }}>
              10<sup>{e}</sup>
            </div>
          ))}
          <div style={{ position: 'absolute', left: 1220, top: 150, fontSize: 20, color: DIM }}>log₁₀ scale</div>
          <div style={{ position: 'absolute', left: 1220, top: 82, fontSize: 30, color: GOAL, opacity: barK }}>÷ {fmt(ratio)}</div>
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
      {frame < aEnd ? <AbsoluteFill style={{ opacity: opA }}><Compare frame={frame} total={aEnd} mode="a" /></AbsoluteFill> : null}
      {frame >= aEnd - X && frame < bEnd ? (
        <AbsoluteFill style={{ opacity: opB }}><TreePart frame={Math.max(0, frame - aEnd)} total={bEnd - aEnd} /></AbsoluteFill>
      ) : null}
      {frame >= bEnd - X ? <AbsoluteFill style={{ opacity: opC }}><Compare frame={Math.max(0, frame - bEnd)} total={durationInFrames - bEnd} mode="c" /></AbsoluteFill> : null}
    </Frame>
  );
};
