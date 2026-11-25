import React, { useLayoutEffect, useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { web, steps, firstStep, type View } from './data';
import { getBuilt, boxOf, type Built } from './geometry';

export const FPS = 30;
export const STEP_FRAMES = 100;
export const FINAL_FRAMES = 360;
const FLY_FRAMES = 36;
const ORANGE = new THREE.Color('#ff7a00');
const FOV = 35;

export type SceneProps = {
  /** 0..steps.length-1 이면 해당 단계, 그 외(-1)면 완성 모습 */
  stepIndex: number;
  ghost: boolean;
  dyaw: number; // 도, 사용자 회전
  dpitch: number;
  zoom: number;
};

const VIEWS: Record<View, [number, number]> = {
  // [방위각(도, +Y=0, +X=90), 고도(도)]
  front: [0, 12],
  back: [180, 12],
  left: [-90, 12],
  right: [90, 12],
  top: [0, 86],
  iso: [35, 28],
  'iso-back': [215, 28],
};

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function dim(hex: string): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.35, hsl.l * 0.9 + 0.06);
  return c;
}

const CameraRig: React.FC<{ target: THREE.Vector3; pos: THREE.Vector3 }> = ({ target, pos }) => {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    camera.up.set(0, 0, 1);
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  });
  return null;
};

type Item = { b: Built; kind: 'old' | 'new' | 'ghost' | 'focus'; delay: number; from: THREE.Vector3; isBolt: boolean; xray?: boolean };

const ItemMesh: React.FC<{ it: Item; frame: number; xray: boolean }> = ({ it, frame, xray }) => {
  const { b } = it;
  const t = easeOut((frame - it.delay) / FLY_FRAMES);
  const k = 1 - t;
  const arrived = frame >= it.delay + FLY_FRAMES;
  const blink = it.kind === 'new' || it.kind === 'focus' ? (arrived || it.kind === 'focus' ? 0.5 + 0.5 * Math.sin(((frame - it.delay - FLY_FRAMES) / 10) * Math.PI) : 0) : 0;
  const color = useMemo(() => {
    if (it.kind === 'old') return dim(b.color);
    return new THREE.Color(b.color);
  }, [it.kind, b.color]);
  const mixed = useMemo(() => color.clone().lerp(ORANGE, it.kind === 'new' || it.kind === 'focus' ? 0.2 + 0.45 * blink : 0), [color, blink, it.kind]);
  const ghost = it.kind === 'ghost';
  const translucent = ghost || xray || b.inst === 'CUBE';
  const opacity = ghost ? 0.13 : xray ? 0.22 : b.inst === 'CUBE' ? 0.28 : 1;
  const edgeColor = it.kind === 'new' || it.kind === 'focus' ? '#ff6a00' : '#1b1f27';
  const pos: [number, number, number] =
    it.kind === 'new' ? [it.from.x * k, it.from.y * k, it.from.z * k] : [0, 0, 0];
  return (
    <group position={pos}>
      <mesh geometry={b.geom} renderOrder={translucent ? 2 : 0}>
        <meshStandardMaterial
          color={mixed}
          roughness={b.metal > 0.3 ? 0.35 : 0.85}
          metalness={b.metal}
          side={THREE.DoubleSide}
          transparent={translucent}
          opacity={opacity}
          depthWrite={!translucent}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {b.edges && !ghost && !xray ? (
        <lineSegments geometry={b.edges}>
          <lineBasicMaterial color={edgeColor} transparent opacity={it.kind === 'old' ? 0.45 : 0.9} />
        </lineSegments>
      ) : null}
    </group>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const { stepIndex, ghost, dyaw, dpitch, zoom } = props;
  const isFinal = stepIndex < 0;
  const step = isFinal ? undefined : steps[stepIndex];

  const items = useMemo(() => {
    const out: Item[] = [];
    let newIdx = 0;
    const from = step ? new THREE.Vector3(...step.from) : new THREE.Vector3();
    const all = [...web.pieces.map((p) => p.inst), ...web.parts.map((p) => p.inst)];
    // 보이는 게 하나도 없는 단계(준비 등)는 완성 미리보기를 깔아 준다
    const anyVisible = isFinal || all.some((i) => (firstStep.get(i) ?? 1e9) <= stepIndex);
    for (const inst of all) {
      const fs = firstStep.get(inst);
      const b = getBuilt(inst);
      if (!b || fs === undefined) continue;
      const isBolt = /^F\d/.test(inst);
      if (isFinal || fs < stepIndex) out.push({ b, kind: 'old', delay: 0, from, isBolt });
      else if (fs === stepIndex) {
        out.push({ b, kind: 'new', delay: Math.min(newIdx, 12) + (isBolt ? 12 : 0), from, isBolt });
        newIdx += 1;
      } else if (ghost || !anyVisible) out.push({ b, kind: 'ghost', delay: 0, from, isBolt });
    }
    // add 가 빈 단계(가공·확인)는 focus 조각을 깜빡여 보여 준다
    if (step && !all.some((i) => firstStep.get(i) === stepIndex)) {
      const set = new Set(step.focus);
      for (const it of out) if (set.has(it.b.inst) && it.kind === 'old') it.kind = 'focus';
    }
    return out;
  }, [stepIndex, ghost, isFinal, step]);

  const cam = useMemo(() => {
    const whole = new THREE.Box3(new THREE.Vector3(...web.bbox[0]), new THREE.Vector3(...web.bbox[1]));
    let box: THREE.Box3;
    let az: number;
    let el: number;
    if (isFinal || !step) {
      box = whole;
      az = 35;
      el = 24;
    } else {
      // 아직 붙지 않은 조각(준비 단계 등)은 카메라 기준에서 뺀다
      box = boxOf(step.focus.filter((i) => (firstStep.get(i) ?? 1e9) <= stepIndex));
      if (box.isEmpty()) box = whole;
      box = box.clone().expandByScalar(18);
      [az, el] = VIEWS[step.view] ?? VIEWS.iso;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.length() * 0.5, 55);
    return { center, r, az, el };
  }, [isFinal, step, stepIndex]);

  const wob = isFinal ? (360 * frame) / durationInFrames : 15 * Math.sin((2 * Math.PI * frame) / durationInFrames);
  const az = ((cam.az + wob + dyaw) * Math.PI) / 180;
  const el = (Math.max(-85, Math.min(89, cam.el + dpitch)) * Math.PI) / 180;
  const dist = (cam.r / Math.sin((FOV * Math.PI) / 360)) * 1.15 / zoom;
  const pos = new THREE.Vector3(
    cam.center.x + dist * Math.cos(el) * Math.sin(az),
    cam.center.y + dist * Math.cos(el) * Math.cos(az),
    cam.center.z + dist * Math.sin(el),
  );

  // 카메라와 초점 조각 사이를 가리는 기존 조각은 투명하게
  const xray = useMemo(() => {
    const set = new Set<string>();
    if (isFinal || !step) return set;
    const targets = step.focus.map((i) => getBuilt(i)).filter(Boolean).slice(0, 8).map((b) => b!.box.getCenter(new THREE.Vector3()));
    if (targets.length === 0) return set;
    for (const it of items) {
      if (it.kind !== 'old' || step.focus.includes(it.b.inst) || it.b.inst === 'CUBE') continue;
      for (const t of targets) {
        const dir = t.clone().sub(pos);
        const len = dir.length();
        const ray = new THREE.Ray(pos.clone(), dir.normalize());
        const hit = ray.intersectBox(it.b.box, new THREE.Vector3());
        if (hit && hit.distanceTo(pos) < len - 1) { set.add(it.b.inst); break; }
      }
    }
    return set;
  }, [items, isFinal, step, pos.x, pos.y, pos.z]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#f6f8fb, #dfe5ee)' }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: FOV, near: 5, far: 4000, position: [0, 600, 300], up: [0, 0, 1] }}>
        <CameraRig target={cam.center} pos={pos} />
        <ambientLight intensity={1.15} />
        <hemisphereLight args={['#ffffff', '#9aa3b2', 0.9]} position={[0, 0, 400]} />
        <directionalLight position={[150, 250, 400]} intensity={2.2} />
        <directionalLight position={[-300, -200, 150]} intensity={0.8} />
        <mesh position={[0, 20, web.table_zw - 0.5]}>
          <planeGeometry args={[520, 520]} />
          <meshStandardMaterial color="#eef1f6" roughness={1} />
        </mesh>
        <gridHelper args={[520, 26, '#c3cad6', '#d5dae3']} position={[0, 20, web.table_zw]} rotation={[Math.PI / 2, 0, 0]} />
        {items.map((it) => (
          <ItemMesh key={it.b.inst} it={it} frame={frame} xray={xray.has(it.b.inst)} />
        ))}
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
