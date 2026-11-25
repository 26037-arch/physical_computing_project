import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Viewer, type Cam } from './Viewer';
import {
  script, steps, modules, JOIN_LABEL, baseName, partDesc, fastenerNoModel, web, firstStep,
  type Step, type JoinKind,
} from './data';

const N = steps.length;
const END = N + 1; // 0 = 시작 화면, 1..N = 단계, N+1 = 완성
const CAM0: Cam = { dyaw: 0, dpitch: 0, zoom: 1 };

function readHash(): number {
  const m = /step=(\d+)/.exec(location.hash);
  const v = m ? parseInt(m[1], 10) : 0;
  return Math.min(END, Math.max(0, v));
}

const Icon: React.FC<{ kind: JoinKind }> = ({ kind }) => {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (kind) {
    case 'glue':
      return (<svg {...p}><path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.500 9 7 12 3z" /><path d="M9.500 13a2.500 2.500 0 0 0 2.500 2.500" /></svg>);
    case 'bolt':
      return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100" /></svg>);
    case 'place':
      return (<svg {...p}><path d="M4 9l8-5 8 5v8l-8 5-8-5z" /><path d="M4 9l8 5 8-5M12 14v8" /></svg>);
    case 'drill':
      return (<svg {...p}><path d="M3 21l7-7" /><path d="M10 14l-2-2 8-8 4 4-8 8z" /></svg>);
    default:
      return (<svg {...p}><path d="M4 12.500l5 5L20 6.500" /></svg>);
  }
};

function group(insts: string[], label: (i: string) => string) {
  const m = new Map<string, number>();
  for (const i of insts) {
    const k = label(i);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()];
}

const pieceByInst = new Map(web.pieces.map((p) => [p.inst, p]));
const pieceLabel = (i: string) => {
  const p = pieceByInst.get(i);
  if (p) return `${baseName(i)} ${p.name}`;
  return partDesc.get(i) ?? i;
};
const fastenerLabel = (i: string) => {
  const d = partDesc.get(i);
  if (d) return d;
  return `${baseName(i)} ${fastenerNoModel[baseName(i)] ?? ''}`.trim();
};

const StepPanel: React.FC<{ st: Step; index: number }> = ({ st, index }) => {
  const mod = modules.find((m) => m.id === st.module)!;
  // add 중 구매품(NEMA17 등)과 조각 구분 없이 나열
  const added = group(st.add, pieceLabel);
  const fast = group(st.fasteners, fastenerLabel);
  return (
    <div className="panel-body" key={st.n}>
      <div className="mod-chip" style={{ background: mod.color }}>{mod.title}</div>
      <div className="step-no">{st.n} / {N}</div>
      <h2>{st.title}</h2>
      <p className="text">{st.text}</p>
      <div className="join">
        <span className="join-ico" style={{ color: mod.color }}><Icon kind={st.join} /></span>
        <span className="join-txt">{JOIN_LABEL[st.join]}</span>
      </div>
      {added.length > 0 && (
        <div className="box">
          <h3>이번 단계 조각·부품</h3>
          <ul>{added.map(([k, c]) => <li key={k}>{k} <b>×{c}</b></li>)}</ul>
        </div>
      )}
      {fast.length > 0 && (
        <div className="box">
          <h3>볼트·철물</h3>
          <ul>{fast.map(([k, c]) => <li key={k}>{k} <b>×{c}</b></li>)}</ul>
        </div>
      )}
      {st.tip && <div className="tip"><b>팁</b> {st.tip}</div>}
      {st.check && <div className="check"><span className="chk">&#10003;</span><span><b>확인</b> {st.check}</span></div>}
      <span hidden>{index}</span>
    </div>
  );
};

const ModuleBar: React.FC<{ cur: number; go: (n: number) => void }> = ({ cur, go }) => {
  const curMod = cur >= 1 && cur <= N ? steps[cur - 1].module : cur > N ? 'final' : '';
  return (
    <div className="modbar" role="navigation" aria-label="모듈 진행">
      {modules.map((m, mi) => {
        const idx = steps.map((s, i) => (s.module === m.id ? i : -1)).filter((i) => i >= 0);
        const first = idx[0];
        const last = idx[idx.length - 1];
        const isCur = m.id === curMod;
        const done = cur - 1 > last || cur > N;
        const frac = isCur && cur <= N ? (cur - 1 - first + 1) / idx.length : done ? 1 : 0;
        return (
          <button
            key={m.id}
            className={'seg' + (isCur ? ' cur' : '')}
            style={{ flex: Math.pow(idx.length, 0.55), ['--c' as string]: m.color }}
            title={`${m.title} (${idx.length}단계)`}
            onClick={(e) => { go(first + 1); e.currentTarget.blur(); }}
          >
            <span className="seg-fill" style={{ width: `${frac * 100}%` }} />
            <span className="seg-txt">{mi + 1}. {m.title}</span>
          </button>
        );
      })}
    </div>
  );
};

export const App: React.FC = () => {
  const [cur, setCur] = useState(readHash);
  const [ghost, setGhost] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [cam, setCam] = useState<Cam>(CAM0);

  const go = useCallback((n: number) => {
    const v = Math.min(END, Math.max(0, n));
    setCur(v);
    setCam(CAM0);
    history.replaceState(null, '', `#step=${v}`);
  }, []);

  useEffect(() => {
    const on = () => setCur(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' || (e.key === ' ' && t.tagName !== 'BUTTON')) { e.preventDefault(); go(cur + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [cur, go]);

  const stepIndex = cur >= 1 && cur <= N ? cur - 1 : -1;
  const st = stepIndex >= 0 ? steps[stepIndex] : undefined;
  void firstStep;

  const nav = useMemo(() => {
    const blur = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.blur();
    return { blur };
  }, []);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">V5H 큐브 로봇 · 3D 조립 설명서</div>
        <ModuleBar cur={cur} go={go} />
      </header>
      <main className="main">
        <section className="left">
          <Viewer stepIndex={stepIndex} ghost={ghost && stepIndex >= 0} cam={cam} onCam={setCam} playing={playing} />
          <div className="toolbar">
            <button onClick={(e) => { setCam(CAM0); nav.blur(e); }}>시점 초기화</button>
            <button onClick={(e) => { setPlaying((p) => !p); nav.blur(e); }}>{playing ? '일시정지' : '재생'}</button>
            {stepIndex >= 0 && (
              <label className="toggle">
                <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
                완성 미리보기
              </label>
            )}
            <span className="hint">끌어서 회전 · 휠/핀치로 확대 · ← → 로 이동</span>
          </div>
        </section>
        <aside className="panel">
          {cur === 0 && (
            <div className="panel-body">
              <h1>{script.title}</h1>
              <p className="text">{script.scope}</p>
              <div className="box">
                <h3>준비물</h3>
                <ul className="chips">{script.tools.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <div className="box warn">
                <h3>주의</h3>
                <p className="small">{script.notes.assumed_state}</p>
                <ul className="rules">{script.notes.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            </div>
          )}
          {st && <StepPanel st={st} index={stepIndex} />}
          {cur === END && (
            <div className="panel-body">
              <h1>기구 조립 끝</h1>
              <p className="text">홀더·타워·리프터·후드·크랭크·패널까지 모두 붙였다. 화면의 완성 모습을 돌려 가며 내 로봇과 비교한다.</p>
              <div className="box">
                <h3>다음은 배선</h3>
                <p className="small">모터·서보·LCD·버튼 배선과 전원, 펌웨어는 이 설명서 범위 밖이다. 배선 설명서를 연다.</p>
                <p><a className="link" href="WIRING_V5_R4.html">docs/WIRING_V5_R4.html 열기</a></p>
              </div>
            </div>
          )}
          <div className="navbar">
            {cur === 0 ? (
              <button className="big primary" onClick={() => go(1)}>시작 ▶</button>
            ) : (
              <>
                <button className="big" onClick={(e) => { go(cur - 1); nav.blur(e); }}>◀ 이전</button>
                {cur < END ? (
                  <button className="big primary" onClick={(e) => { go(cur + 1); nav.blur(e); }}>다음 ▶</button>
                ) : (
                  <button className="big" onClick={(e) => { go(0); nav.blur(e); }}>처음으로</button>
                )}
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};
