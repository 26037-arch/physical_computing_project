// CFOP 장면의 큐브 자세: 단계마다 목표 조각이 카메라 쪽(화면 앞·약간 아래)을 향하도록 돌린다.
// 단계마다 그 단계 동안 지나가는 모든 상태에서 목표 스티커가 카메라를 향하는 정도(facingScore)가 가장 큰 자세를
// 후보(세로축 회전 × 앞뒤 숙임) 중에서 데이터로 고르고, 단계 경계에서 쿼터니언으로 부드럽게 보간한다.
// (targetDir = 목표 스티커 평균 방향은 참고값으로 남긴다.)
// 층 회전은 큐브 그룹 안에서 일어나므로 이 자세 회전과 겹치지 않는다. scripts/check.mjs 가 보이는 비율을 검사한다.
import { Quaternion, Vector3 } from 'three';
import { FACELETS } from './cube.js';
import { glowMask, isTarget } from './stages.js';

export const CAM = [6.0, 4.8, 7.6];
// 카메라 방향보다 조금 아래 (목표가 화면 앞·약간 아래에 오게)
export const AIM = new Vector3(6.0, 2.3, 7.6).normalize();
export const CAM_DIR = new Vector3(...CAM).normalize();

export function targetDir(phase, states) {
  const acc = new Vector3();
  for (const s of states) {
    const v = new Vector3();
    let n = 0;
    for (let i = 0; i < 54; i++) {
      if (!isTarget(phase, s, i)) continue;
      const { p, n: nn } = FACELETS[i];
      v.add(new Vector3(p[0] + 0.5 * nn[0], p[1] + 0.5 * nn[1], p[2] + 0.5 * nn[2]));
      n++;
    }
    if (n) acc.add(v.multiplyScalar(1 / n));
  }
  if (acc.lengthSq() < 1e-6) acc.set(0, 1, 0);
  return acc.normalize();
}

// 목표 스티커가 카메라를 얼마나 향하는지 (법선·카메라 방향, 음수는 0) 의 평균 — 단계 상태들 전체
export function facingScore(phase, states, q) {
  let sum = 0;
  let n = 0;
  for (const s of states) {
    for (let i = 0; i < 54; i++) {
      if (!isTarget(phase, s, i)) continue;
      sum += Math.max(0, new Vector3(...FACELETS[i].n).applyQuaternion(q).dot(CAM_DIR));
      n++;
    }
  }
  return n ? sum / n : 0;
}

function maskScore(mask, q) {
  let sum = 0;
  let n = 0;
  mask.forEach((m, i) => {
    if (!m) return;
    sum += Math.max(0, new Vector3(...FACELETS[i].n).applyQuaternion(q).dot(CAM_DIR));
    n++;
  });
  return n ? sum / n : 0;
}

// 후보 자세: 세로축 회전(yaw 15° 간격) × 앞뒤 숙임(pitch −60°~+60°, 15° 간격). 옆으로 눕히는 회전은 쓰지 않는다.
const CANDIDATES = (() => {
  const out = [];
  for (let yaw = 0; yaw < 360; yaw += 15) for (let pitch = -60; pitch <= 60; pitch += 15) {
    const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (yaw * Math.PI) / 180);
    const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (pitch * Math.PI) / 180);
    out.push({ yaw, pitch, q: qx.multiply(qy) });
  }
  return out;
})();

// steps = data.stickerSteps → 단계 배열 [{phase, first, q, dir}]
// 단계마다 facingScore 가 가장 큰 후보를 고른다 (앞 단계 자세에서 많이 돌수록 조금 감점해 움직임을 줄인다).
export function phaseViews(steps) {
  const solve = steps.map((s, k) => ({ ...s, k })).filter((s) => s.move && s.phase !== 'scramble');
  const phases = [];
  for (const s of solve) {
    let ph = phases[phases.length - 1];
    if (!ph || ph.phase !== s.phase) { ph = { phase: s.phase, ks: [] }; phases.push(ph); }
    ph.ks.push(s.k);
  }
  const firstSolve = solve[0].k;
  let prev = null;
  for (const ph of phases) {
    // 단계 안의 상태들: 첫 수 직전 상태 ~ 마지막 수 뒤 상태
    ph.states = [steps[ph.ks[0] - 1].stickers, ...ph.ks.map((k) => steps[k].stickers)];
    ph.dir = targetDir(ph.phase, ph.states);
    const next = phases[phases.indexOf(ph) + 1];
    ph.glow = glowMask(ph.phase, next ? next.phase : null, ph.states[ph.states.length - 1]);
    let best = null;
    for (const c of CANDIDATES) {
      const turn = prev ? 2 * Math.acos(Math.min(1, Math.abs(prev.dot(c.q)))) : 0;
      // 단계 동안 목표 + 단계 끝 멈춤의 글로우 부분(완성한 부분)도 보이게
      const score = facingScore(ph.phase, ph.states, c.q) + 0.25 * maskScore(ph.glow, c.q) - 0.04 * turn;
      if (!best || score > best.score + 1e-9) best = { ...c, score };
    }
    ph.q = best.q.clone();
    ph.yaw = best.yaw;
    ph.pitch = best.pitch;
    ph.first = ph.ks[0] - firstSolve; // 풀이 수 번호
    prev = ph.q;
  }
  return phases;
}

// 풀이 진행 위치(수 단위, 실수) → 자세. 다음 단계 시작 lead 수 전부터 span 수 동안 보간.
export function quatAt(phases, solvePos, lead = 2.5, span = 3.5) {
  const q = phases[0].q.clone();
  for (let i = 1; i < phases.length; i++) {
    const t = Math.min(1, Math.max(0, (solvePos - (phases[i].first - lead)) / span));
    const e = t * t * (3 - 2 * t);
    if (e > 0) q.slerp(phases[i].q, e);
  }
  return q;
}

const faces = (i, q) => new Vector3(...FACELETS[i].n).applyQuaternion(q).dot(CAM_DIR) > 0.15;

// 검사용: 자세 q 에서 목표 조각(목표 스티커가 붙은 큐비) 중 카메라 쪽 면이 하나라도 보이는 비율
export function facingRatio(phase, stickers, q) {
  const cubies = new Map();
  for (let i = 0; i < 54; i++) {
    if (!isTarget(phase, stickers, i)) continue;
    cubies.set(FACELETS[i].p.join(), FACELETS[i].p);
  }
  if (!cubies.size) return 1;
  let vis = 0;
  for (const p of cubies.values()) {
    const ok = FACELETS.some((f, i) => f.p.join() === p.join() && faces(i, q));
    if (ok) vis++;
  }
  return vis / cubies.size;
}
