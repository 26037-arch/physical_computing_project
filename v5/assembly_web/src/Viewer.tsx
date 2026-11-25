import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Scene, FPS, STEP_FRAMES, FINAL_FRAMES, type SceneProps } from './Scene';

export type Cam = { dyaw: number; dpitch: number; zoom: number };

type Props = {
  stepIndex: number; // -1 이면 완성 모습
  ghost: boolean;
  cam: Cam;
  onCam: (c: Cam) => void;
  playing: boolean;
  onStall: () => void;
};

export const Viewer: React.FC<Props> = ({ stepIndex, ghost, cam, onCam, playing, onStall }) => {
  const ref = useRef<PlayerRef>(null);
  const final = stepIndex < 0;
  const camRef = useRef(cam);
  camRef.current = cam;

  const inputProps = useMemo<SceneProps>(
    () => ({ stepIndex, ghost, dyaw: cam.dyaw, dpitch: cam.dpitch, zoom: cam.zoom }),
    [stepIndex, ghost, cam.dyaw, cam.dpitch, cam.zoom],
  );

  const last = (final ? FINAL_FRAMES : STEP_FRAMES) - 1;
  // 단계에 들어올 때: 정지 상태면 도착 상태(마지막 프레임)로, 재생 중이면 처음부터.
  // 자동재생이 막혀 프레임이 안 움직이면 도착 상태로 두고 정지한다.
  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    if (!playing) {
      p.pause();
      p.seekTo(last);
      return;
    }
    p.seekTo(0);
    p.play();
    const t = window.setTimeout(() => {
      if (!p.isPlaying() || p.getCurrentFrame() === 0) {
        p.pause();
        p.seekTo(last);
        onStall();
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    if (playing) p.play();
    else {
      p.pause();
      if (p.getCurrentFrame() === 0) p.seekTo(last);
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // 포인터: 드래그 = 회전, 휠/핀치 = 확대 (애니메이션은 계속 돈다)
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    const c = camRef.current;
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0) onCam({ ...c, zoom: Math.min(5, Math.max(0.4, (c.zoom * d) / pinch.current)) });
      pinch.current = d;
    } else {
      onCam({
        ...c,
        dyaw: c.dyaw - (cur.x - prev.x) * 0.4,
        dpitch: Math.max(-85, Math.min(85, c.dpitch + (cur.y - prev.y) * 0.4)),
      });
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    pinch.current = 0;
  };
  const wheelEl = useRef<HTMLDivElement>(null);
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      onCam({ ...c, zoom: Math.min(5, Math.max(0.4, c.zoom * Math.exp(-e.deltaY * 0.0012))) });
    },
    [onCam],
  );
  useEffect(() => {
    const el = wheelEl.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div className="viewer">
      <Player
        key={final ? 'final' : 'step'}
        ref={ref}
        component={Scene}
        inputProps={inputProps}
        durationInFrames={final ? FINAL_FRAMES : STEP_FRAMES}
        fps={FPS}
        compositionWidth={1280}
        compositionHeight={800}
        loop
        autoPlay={playing}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        acknowledgeRemotionLicense
        style={{ width: '100%' }}
      />
      <div
        ref={wheelEl}
        className="viewer-hit"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="3D 화면: 끌면 회전, 휠·핀치로 확대"
      />
    </div>
  );
};
