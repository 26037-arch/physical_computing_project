// 크로스 IDA* 탐색 그래프 (05 줄 + 뒤 무음 연출 구간).
// 전부 data/algo_seed1.json 의 cross.ida.trace 실제 행으로 그린다 (방문 순서 = trace 순서, 시간만 압축).
//   bound 5 → 6 → 7 반복마다 트리가 자라고, 반복 사이에 지워지며 "bound +1" 전환
//   bound 6 에서 카메라가 가지가 많이 잘리는 깊은 노드로 줌 → 그 노드의 자식들을 부채꼴로 펼쳐 수·g·h·f 와 f > bound 비교를 실제 값으로 표시 → 다시 넓게
//   bound 7 에서 goal 경로를 루트→goal 로 그리며 h 가 줄어드는 값, 그다음 goal→루트로 거슬러 올라가는 빛
import { useLayoutEffect, useRef } from 'react';
import { Easing, interpolate } from 'remotion';
import data from '../../data/algo_seed1.json';
import { deriveFacts, fmt } from '../lib/facts.js';
import { treeSegments } from '../lib/plan.js';
import { DIM, FG, GOAL, MONO, PRUNE } from '../theme.js';

const F = deriveFacts(data);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const EASE = Easing.inOut(Easing.cubic);

// ---------- 배치 (반복마다 방사형, 각 = 잎 수 비례) ----------
const CX = 960; // 트리 좌표의 중심 (월드)
const CY = 468;
const RSTEP = 48;
const SX = 960; // 화면 중심
const SY = 470;

function layout(iter) {
  const rows = iter.rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const index = new Map(rows.map((r, i) => [r.id, i]));
  const kids = new Map(rows.map((r) => [r.id, []]));
  for (const r of rows) if (r.parent >= 0 && kids.has(r.parent)) kids.get(r.parent).push(r.id);
  const leaves = new Map();
  const countLeaves = (id) => {
    let n = kids.get(id).length ? 0 : 1;
    for (const k of kids.get(id)) n += countLeaves(k);
    leaves.set(id, n);
    return n;
  };
  countLeaves(rows[0].id);
  const pos = new Map();
  const ang = new Map();
  const place = (id, a0, a1) => {
    const r = byId.get(id);
    const mid = (a0 + a1) / 2;
    ang.set(id, mid);
    pos.set(id, [CX + Math.sin(mid) * r.depth * RSTEP, CY - Math.cos(mid) * r.depth * RSTEP]);
    let a = a0;
    for (const k of kids.get(id)) {
      const span = ((a1 - a0) * leaves.get(k)) / leaves.get(id);
      place(k, a, a + span);
      a += span;
    }
  };
  place(rows[0].id, -Math.PI, Math.PI);
  const goalRow = rows.find((r) => r.event === 'goal') || null;
  const path = [];
  if (goalRow) for (let r = goalRow; r; r = byId.get(r.parent)) path.unshift(r);
  return { rows, byId, index, kids, pos, ang, goalRow, path, bound: iter.bound };
}

export const LAYOUTS = F.iterations.map(layout);

// 클로즈업 노드 (bound 6 반복): 깊이 3 이상에서 자식이 가장 많고, 그중 확장 자식이 하나뿐이라 자식들이 연달아 방문되며,
// 반복의 25~70% 지점에 있는 노드. 데이터에서 규칙으로 고른다.
export const FOCUS = (() => {
  const L = LAYOUTS[1];
  let best = null;
  for (const r of L.rows) {
    if (r.event !== 'expand' || r.depth < 3) continue;
    const ks = L.kids.get(r.id).map((id) => L.index.get(id));
    if (ks.length < 8) continue;
    const ex = ks.filter((i) => L.rows[i].event !== 'prune').length;
    const frac = ks[0] / L.rows.length;
    if (ex !== 1 || frac < 0.25 || frac > 0.7) continue;
    const span = ks[ks.length - 1] - ks[0];
    const score = [ks.length, -span, -Math.abs(frac - 0.45)];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) {
      best = { row: r, kids: ks, score };
    }
  }
  return best;
})();

// 반복 i 의 행 포인터 (방문한 행 수, 실수)
function rowPointer(S, frame) {
  const n1 = LAYOUTS[0].rows.length;
  const n2 = LAYOUTS[1].rows.length;
  const n3 = LAYOUTS[2].rows.length;
  if (frame < S.t12[1]) return { iter: 0, p: interpolate(frame, S.i1, [1, n1], CLAMP) };
  if (frame < S.t23[1]) {
    const a = FOCUS.kids[0] - 1;
    const b = FOCUS.kids[FOCUS.kids.length - 1] + 1;
    const p = interpolate(frame,
      [S.i2wide[0], S.i2wide[1], S.zoomIn[1], S.fan[1], S.zoomOut[1], S.i2post[1]],
      [1, a - 30, a, b, b + 40, n2], CLAMP);
    return { iter: 1, p };
  }
  return { iter: 2, p: interpolate(frame, S.i3, [1, n3], CLAMP) };
}

// 카메라: 월드 점 (cx, cy) 를 화면 중심에, 배율 s
function camera(S, frame) {
  const wide = { cx: CX, cy: CY, s: 1 };
  const fp = LAYOUTS[1].pos.get(FOCUS.row.id);
  const zoom = { cx: fp[0], cy: fp[1], s: 3.4 };
  const L3 = LAYOUTS[2];
  const mid = L3.path.length ? L3.pos.get(L3.path[Math.floor(L3.path.length / 2)].id) : [CX, CY];
  const goal = { cx: (mid[0] + CX * 3) / 4, cy: (mid[1] + CY * 3) / 4, s: 1.12 };
  const mix = (A, B, t) => ({ cx: A.cx + (B.cx - A.cx) * t, cy: A.cy + (B.cy - A.cy) * t, s: A.s * Math.pow(B.s / A.s, t) });
  if (frame < S.zoomIn[0]) return mix(wide, { ...wide, s: 1.04 }, interpolate(frame, [0, S.zoomIn[0]], [0, 1], CLAMP));
  if (frame < S.zoomIn[1]) return mix({ ...wide, s: 1.04 }, zoom, EASE(interpolate(frame, S.zoomIn, [0, 1], CLAMP)));
  if (frame < S.fan[1]) return mix(zoom, { ...zoom, s: 3.6 }, interpolate(frame, S.fan, [0, 1], CLAMP));
  if (frame < S.zoomOut[1]) return mix({ ...zoom, s: 3.6 }, wide, EASE(interpolate(frame, S.zoomOut, [0, 1], CLAMP)));
  if (frame < S.goalFwd[0]) return wide;
  return mix(wide, goal, EASE(interpolate(frame, [S.goalFwd[0], S.goalFwd[0] + 24], [0, 1], CLAMP)));
}

const toScreen = (cam, p) => [SX + (p[0] - cam.cx) * cam.s, SY + (p[1] - cam.cy) * cam.s];

// 펼치기: 클로즈업 노드의 자식들을 화면 공간에서 오른쪽 세로 열로 펼친다 (방문 순서대로 위→아래)
const FAN_X = 1190;
const FAN_DY = 34;
function fanSlots() {
  const n = FOCUS.kids.length;
  return FOCUS.kids.map((ri, k) => ({ ri, x: FAN_X, y: SY + (k - (n - 1) / 2) * FAN_DY, side: 1 }));
}
const FAN = fanSlots();

function state(frame, total) {
  const S = treeSegments(total);
  const { iter, p } = rowPointer(S, frame);
  const cam = camera(S, frame);
  return { S, iter, p, cam, frame };
}

const TreeCanvas = ({ st }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const ctx = ref.current.getContext('2d');
    const { S, iter, p, cam, frame } = st;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1920, 1080);
    const L = LAYOUTS[iter];
    // 반복 끝 → 지우기
    const trans = iter === 0 ? S.t12 : iter === 1 ? S.t23 : null;
    const fade = trans ? interpolate(frame, [trans[0], trans[0] + (trans[1] - trans[0]) * 0.6], [1, 0], CLAMP) : 1;
    // 깊이 고리: bound 고리는 전환 동안 다음 bound 반지름으로 커진다
    const nextB = trans ? F.iterations[iter + 1].bound : L.bound;
    const ringT = trans ? EASE(interpolate(frame, trans, [0, 1], CLAMP)) : 0;
    const boundR = (L.bound + (nextB - L.bound) * ringT) * RSTEP;
    const c0 = toScreen(cam, [CX, CY]);
    for (let d = 1; d <= 7; d++) {
      ctx.beginPath();
      ctx.arc(c0[0], c0[1], d * RSTEP * cam.s, 0, Math.PI * 2);
      ctx.strokeStyle = d < L.bound ? '#1e2026' : '#14161a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c0[0], c0[1], boundR * cam.s, 0, Math.PI * 2);
    ctx.strokeStyle = '#5a5e66';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.globalAlpha = fade;
    const n = Math.min(L.rows.length, Math.floor(p));
    // 행 포인터 속도 (프레임당 행) → 빨강 잔상 길이
    const rate = Math.max(0.05, rowPointer(S, frame + 1).p - p);
    const LIFE = Math.max(3, 9 * rate);
    // 확장 간선 (흰 선)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(232,232,228,0.5)';
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const r = L.rows[i];
      if (r.event === 'prune') continue;
      const a = toScreen(cam, L.pos.get(r.parent));
      const b = toScreen(cam, L.pos.get(r.id));
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.fillStyle = FG;
    for (let i = 0; i < n; i++) {
      const r = L.rows[i];
      if (r.event === 'prune') continue;
      const b = toScreen(cam, L.pos.get(r.id));
      ctx.fillRect(b[0] - 1.5, b[1] - 1.5, 3, 3);
    }
    // 잘린 자식: 빨강으로 깜빡이고 사라짐
    for (let i = 1; i < n; i++) {
      const r = L.rows[i];
      if (r.event !== 'prune') continue;
      const age = p - i;
      if (age > LIFE) continue;
      const al = Math.max(0, 1 - age / LIFE);
      const a = toScreen(cam, L.pos.get(r.parent));
      const b = toScreen(cam, L.pos.get(r.id));
      ctx.strokeStyle = `rgba(216,66,58,${0.7 * al})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.fillStyle = `rgba(216,66,58,${al})`;
      ctx.beginPath();
      ctx.arc(b[0], b[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 현재 방문 노드 표시 (작은 고리)
    if (n > 1 && n < L.rows.length) {
      const cur = L.rows[n - 1];
      const b = toScreen(cam, L.pos.get(cur.id));
      ctx.strokeStyle = cur.event === 'prune' ? PRUNE : FG;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b[0], b[1], 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 부채꼴 (클로즈업)
    if (iter === 1) {
      const fa = interpolate(frame, [S.zoomIn[1] - 4, S.zoomIn[1] + 4, S.fan[1] - 2, S.zoomOut[0] + 10], [0, 1, 1, 0], CLAMP);
      if (fa > 0) {
        ctx.globalAlpha = fa;
        const top = FAN[0].y - 34;
        const bot = FAN[FAN.length - 1].y + 34;
        ctx.fillStyle = 'rgba(11,12,15,0.84)';
        ctx.fillRect(SX - 60, top, 600, bot - top);
        ctx.strokeStyle = '#2a2d33';
        ctx.lineWidth = 1;
        ctx.strokeRect(SX - 60, top, 600, bot - top);
        for (const slot of FAN) {
          if (p < slot.ri + 1) continue;
          const r = LAYOUTS[1].rows[slot.ri];
          const age = p - slot.ri;
          ctx.strokeStyle = r.event === 'prune' ? `rgba(216,66,58,${Math.min(1, 0.45 + 0.55 * Math.max(0, 1 - age / 3))})` : FG;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(SX, SY);
          ctx.lineTo(slot.x, slot.y);
          ctx.stroke();
          ctx.fillStyle = r.event === 'prune' ? PRUNE : FG;
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = FG;
        ctx.beginPath();
        ctx.arc(SX, SY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // goal 경로
    if (iter === 2 && frame >= S.goalFwd[0]) {
      const fwd = interpolate(frame, [S.goalFwd[0], S.goalFwd[1] - 6], [0, L.path.length - 1], CLAMP);
      const pts = L.path.map((r) => toScreen(cam, L.pos.get(r.id)));
      ctx.strokeStyle = GOAL;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i > fwd + 1) break;
        let q = pts[i];
        if (i > fwd) { const t = fwd - (i - 1); q = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.fillStyle = GOAL;
      for (let i = 0; i < pts.length && i <= fwd; i++) {
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // goal → 루트로 거슬러 올라가는 빛
      if (frame >= S.goalUp[0] && frame < S.goalUp[1] + 6) {
        const u = EASE(interpolate(frame, S.goalUp, [0, 1], CLAMP)) * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(u));
        const t = u - i;
        const A = pts[pts.length - 1 - i];
        const B = pts[pts.length - 2 - i];
        const q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
        ctx.fillStyle = 'rgba(240,207,58,0.22)';
        ctx.beginPath();
        ctx.arc(q[0], q[1], 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff6cc';
        ctx.beginPath();
        ctx.arc(q[0], q[1], 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [st]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }} />;
};

const Chip = ({ x, y, align = 'left', color = FG, size = 20, opacity = 1, children }) => (
  <div style={{
    position: 'absolute', left: align === 'left' ? x : undefined, right: align === 'right' ? 1920 - x : undefined, top: y - size * 0.75,
    fontFamily: MONO, fontSize: size, color, whiteSpace: 'pre', opacity, background: 'rgba(11,12,15,0.8)', padding: '1px 6px', lineHeight: `${size * 1.4}px`,
  }}>{children}</div>
);

export const TreePart = ({ frame, total }) => {
  const st = state(frame, total);
  const { S, iter, p, cam } = st;
  const L = LAYOUTS[iter];
  const n = Math.min(L.rows.length, Math.max(1, Math.floor(p)));
  const prevVisited = F.bounds.slice(0, iter).reduce((a, b) => a + b.visited, 0);
  const prevPruned = F.bounds.slice(0, iter).reduce((a, b) => a + b.pruned, 0);
  const shown = L.rows.slice(1, n);
  const visited = prevVisited + shown.length;
  const pruned = prevPruned + shown.filter((r) => r.event === 'prune').length;
  const last = L.rows[n - 1];
  const B = F.bounds[iter];
  const labelSeg = iter === 0 ? S.i1label : iter === 1 ? S.i2label : null;
  const trans = iter === 0 ? S.t12 : iter === 1 ? S.t23 : null;
  const labelOp = labelSeg ? interpolate(frame, [labelSeg[0], labelSeg[0] + 4, trans[0] + 4, trans[0] + 9], [0, 1, 1, 0], CLAMP) : 0;
  const transOp = trans ? interpolate(frame, [trans[0] + 2, trans[0] + 6, trans[1] - 2, trans[1] + 4], [0, 1, 1, 0], CLAMP) : 0;
  const goalLabelOp = iter === 2 ? interpolate(frame, [S.final[0] - 4, S.final[0] + 4], [0, 1], CLAMP) : 0;

  // 반복별 누적 표 (지난 반복은 확정 값, 지금 반복은 진행 값)
  const perBound = F.bounds.map((b, i) => (i < iter ? b.visited : i === iter ? shown.length : null));

  // bound 5 처음 잘리는 자식 3개에 f > bound 표시 (넓은 화면)
  const firstPrunes = iter === 0 ? L.rows.map((r, i) => [r, i]).filter(([r]) => r.event === 'prune').slice(0, 3) : [];

  // goal 경로 라벨
  const fwd = iter === 2 ? interpolate(frame, [S.goalFwd[0], S.goalFwd[1] - 6], [0, L.path.length - 1], CLAMP) : -1;
  const hNow = iter === 2 && frame >= S.goalFwd[0] ? L.path[Math.min(L.path.length - 1, Math.floor(fwd + 0.001))] : null;

  // 클로즈업 대상
  const fr = FOCUS.row;
  const fanOp = iter === 1 ? interpolate(frame, [S.zoomIn[1] - 4, S.zoomIn[1] + 4, S.fan[1] - 2, S.zoomOut[0] + 10], [0, 1, 1, 0], CLAMP) : 0;
  const fanKids = FAN.filter((s) => p >= s.ri + 1);
  const fanPr = fanKids.filter((s) => LAYOUTS[1].rows[s.ri].event === 'prune').length;

  return (
    <>
      <TreeCanvas st={st} />

      {/* bound 5: 대표 prune 3개 */}
      {firstPrunes.map(([r, i]) => {
        const op = interpolate(p, [i, i + 2, i + 45, i + 60], [0, 1, 1, 0], CLAMP);
        if (op <= 0) return null;
        const q = toScreen(cam, L.pos.get(r.id));
        return <Chip key={r.id} x={q[0] + 12} y={q[1]} color={PRUNE} opacity={op}>{`${r.move}  f ${r.g}+${r.h}=${r.f} > ${r.bound}`}</Chip>;
      })}

      {/* 클로즈업 부채꼴 라벨 */}
      {fanOp > 0 ? (
        <>
          <Chip x={SX - 16} y={SY} align="right" size={22} opacity={fanOp}>
            {`${fr.move}  g ${fr.g} h ${fr.h} f ${fr.f}`}
          </Chip>
          {fanKids.map((s) => {
            const r = LAYOUTS[1].rows[s.ri];
            const pr = r.event === 'prune';
            const txt = `${r.move.padEnd(2)} g${r.g} h${r.h} f${r.f} ${pr ? '>' : '≤'} ${r.bound}${pr ? '  ✕' : '  →'}`;
            return (
              <Chip key={s.ri} x={s.x + 12 * s.side} y={s.y + 2} align={s.side > 0 ? 'left' : 'right'} size={18} color={pr ? PRUNE : FG} opacity={fanOp}>{txt}</Chip>
            );
          })}
          <div style={{ position: 'absolute', left: 0, width: 1920, top: 846, textAlign: 'center', fontFamily: MONO, fontSize: 24, color: DIM, opacity: fanOp }}>
            depth {fr.depth} · {fanKids.length} children · <span style={{ color: PRUNE }}>{fanPr} pruned</span> · bound {LAYOUTS[1].bound}
          </div>
        </>
      ) : null}

      {/* goal 경로 라벨: 수 · g · h */}
      {iter === 2 && frame >= S.goalFwd[0] ? L.path.map((r, i) => {
        if (i === 0 || i > fwd + 0.001) return null;
        const q = toScreen(cam, L.pos.get(r.id));
        const op = interpolate(fwd, [i - 0.001, i + 0.4], [0, 1], CLAMP);
        return (
          <Chip key={r.id} x={q[0] + 14} y={q[1]} size={19} color={GOAL} opacity={op}>
            {`${r.move}  g${r.g} h${r.h}`}
          </Chip>
        );
      }) : null}

      {/* HUD 왼쪽 */}
      <div style={{ position: 'absolute', left: 64, top: 120, fontFamily: MONO, color: FG }}>
        <div style={{ fontSize: 22, color: DIM }}>ida* · cross</div>
        <div style={{ fontSize: 46, marginTop: 8 }}>f = g + h</div>
        <div style={{ fontSize: 18, color: DIM, marginTop: 10, lineHeight: '28px' }}>
          g = 지금까지 쓴 수<br />h = 남은 수의 하한 (엣지 쌍 거리표)<br />f &gt; bound → 가지 자름
        </div>
        <div style={{ fontSize: 22, marginTop: 34, color: DIM }}>{hNow ? 'goal path' : 'last node'}</div>
        {hNow ? (
          <>
            <div style={{ fontSize: 24, marginTop: 6, color: GOAL }}>{`g ${hNow.g}  h ${hNow.h}  f ${hNow.f}`}</div>
            <div style={{ fontSize: 18, color: DIM, marginTop: 12 }}>h</div>
            <div style={{ fontSize: 30, color: GOAL, letterSpacing: 2 }}>
              {L.path.map((r, i) => <span key={i} style={{ opacity: i <= fwd + 0.001 ? 1 : 0.2 }}>{r.h}{i < L.path.length - 1 ? ' ' : ''}</span>)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 24, marginTop: 6, whiteSpace: 'pre' }}>
              {last.id === 0 ? `root  h ${last.h}` : `${(last.move || '').padEnd(3)} g ${last.g}  h ${last.h}  f ${last.f}`}
            </div>
            <div style={{ fontSize: 24, marginTop: 4, color: last.event === 'prune' ? PRUNE : last.event === 'goal' ? GOAL : FG }}>
              {last.id === 0 ? 'expand' : last.event === 'prune' ? `${last.f} > ${last.bound} · prune` : last.event === 'goal' ? 'goal' : `${last.f} ≤ ${last.bound} · expand`}
            </div>
          </>
        )}
      </div>

      {/* HUD 오른쪽 */}
      <div style={{ position: 'absolute', right: 64, top: 120, fontFamily: MONO, color: FG, textAlign: 'right' }}>
        <div style={{ fontSize: 22, color: DIM }}>bound</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: '84px' }}>{L.bound}</div>
        <div style={{ fontSize: 20, color: DIM }}>iteration {iter + 1} / {F.iterations.length}</div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 26 }}>visited</div>
        <div style={{ fontSize: 44 }}>{fmt(visited)}</div>
        <div style={{ fontSize: 18, color: DIM, marginTop: 6, lineHeight: '26px' }}>
          {F.bounds.map((b, i) => (
            <div key={b.bound} style={{ color: i === iter ? FG : perBound[i] == null ? '#33363c' : DIM }}>
              bound {b.bound} · {perBound[i] == null ? '—' : fmt(perBound[i])}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 22, color: DIM, marginTop: 16 }}>pruned</div>
        <div style={{ fontSize: 32, color: PRUNE }}>{fmt(pruned)}</div>
      </div>

      {/* 반복 끝 라벨 / bound +1 전환 */}
      {labelOp > 0 ? (
        <div style={{ position: 'absolute', left: 0, width: 1920, top: 866, textAlign: 'center', fontFamily: MONO, fontSize: 28, color: FG, opacity: labelOp }}>
          bound {B.bound} · no solution · {fmt(B.visited)} nodes
        </div>
      ) : null}
      {transOp > 0 ? (
        <div style={{ position: 'absolute', left: 0, width: 1920, top: SY - 60, textAlign: 'center', fontFamily: MONO, color: FG, opacity: transOp }}>
          <div style={{ fontSize: 30, color: DIM }}>bound {B.bound} → {F.bounds[iter + 1].bound}</div>
          <div style={{ fontSize: 64, fontWeight: 700 }}>+1</div>
        </div>
      ) : null}
      {goalLabelOp > 0 ? (
        <div style={{ position: 'absolute', left: 0, width: 1920, top: 866, textAlign: 'center', fontFamily: MONO, fontSize: 28, color: GOAL, opacity: goalLabelOp }}>
          bound {B.bound} · goal · {F.crossSolution.join(' ')}
        </div>
      ) : null}
    </>
  );
};
