// figs.mjs — 포스터 그림(SVG)을 근거 데이터에서 그린다. 좌표 단위는 mm (viewBox = mm).
// 숫자를 담은 글자에는 data-fact 를 달아 check.mjs 가 근거 값과 대조한다.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 큐브 6색 (v5/sim/app.js colors: U R F D L B) — 스티커 그림용
export const STICKER = { U: '#f6f4e9', R: '#de413f', F: '#35b76f', D: '#ffd742', L: '#ff893e', B: '#3483d7' };

const svg = (w, h, body, cls = '') => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">${body}</svg>`;
function text(x, y, s, o = {}) {
  const a = [`x="${x}"`, `y="${y}"`];
  if (o.size) a.push(`font-size="${o.size}"`);
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  if (o.weight) a.push(`font-weight="${o.weight}"`);
  if (o.fill) a.push(`fill="${o.fill}"`);
  if (o.cls) a.push(`class="${o.cls}"`);
  if (o.fact) a.push(`data-fact="${o.fact}"`);
  if (o.ok) a.push(`data-ok="${esc(o.ok)}"`);
  return `<text ${a.join(' ')}>${esc(s)}</text>`;
}

// ---- 펼친 그림(전개도) 54칸: 면 순서 U R F D L B, 면 안 왼위→오른아래 ----
export function cubeNet(stickers, cell = 2.3, label = '') {
  const pos = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const order = 'URFDLB';
  const W = 12 * cell, H = 9 * cell;
  let b = '';
  for (let f = 0; f < 6; f++) {
    const [fx, fy] = pos[order[f]];
    for (let i = 0; i < 9; i++) {
      const c = stickers[f * 9 + i];
      const x = (fx * 3 + (i % 3)) * cell, y = (fy * 3 + Math.floor(i / 3)) * cell;
      b += `<rect x="${(x + 0.12).toFixed(2)}" y="${(y + 0.12).toFixed(2)}" width="${(cell - 0.24).toFixed(2)}" height="${(cell - 0.24).toFixed(2)}" rx="0.3" fill="${STICKER[c]}" stroke="#1b1f24" stroke-width="0.18"/>`;
    }
  }
  return svg(W, H + (label ? 4 : 0), b + (label ? text(W / 2, H + 3.2, label, { size: 2.6, anchor: 'middle', cls: 'svgsub' }) : ''), 'net');
}

// ---- 재배향 칸: 물리 위치 p 를 칠하고 아래(D)를 굵게 ----
export function reorientNet(p, color) {
  const pos = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const c = 3.4; let b = '';
  for (const [k, [x, y]] of Object.entries(pos)) {
    const on = k === p, d = k === 'D';
    b += `<rect x="${x * c + 0.2}" y="${y * c + 0.2}" width="${c - 0.4}" height="${c - 0.4}" rx="0.4" fill="${on ? color : '#ffffff'}" stroke="${d ? '#1b1f24' : '#9aa3aa'}" stroke-width="${d ? 0.55 : 0.2}"/>`;
  }
  return svg(4 * c, 3 * c, b, 'rnet');
}

// ---- 회전 오차 보정: 컵 명령 위치 (목표 근처 확대) ----
export function cupMoveFig(fx, color) {
  const q = +fx.quarter.v, over = +fx.over.v, play = +fx.play.v;
  const W = 62, H = 37, x0 = 11, x1 = 61, yTop = 4, yBot = 30;
  const lo = q - play - 4, hi = q + over + 3;
  const Y = (s) => yBot - (s - lo) / (hi - lo) * (yBot - yTop);
  const xs = [x0, x0 + 10, x0 + 22, x0 + 32, x1 - 5];
  let b = '';
  // 목표선
  b += `<line x1="${x0}" x2="${x1}" y1="${Y(q)}" y2="${Y(q)}" stroke="#1b1f24" stroke-width="0.3" stroke-dasharray="1 0.8"/>`;
  b += text(x0 - 1.2, Y(q) + 0.9, `${q}`, { size: 2.6, anchor: 'end', fact: 'quarter', weight: 700 });
  b += text(x0 - 1.2, Y(q + over) + 0.9, `${q + over}`, { size: 2.5, anchor: 'end', fact: 'turnFwd', fill: '#555' });
  b += text(x0 - 1.2, Y(q - play) + 0.9, `${q - play}`, { size: 2.5, anchor: 'end', fact: 'turnLow', fill: '#555' });
  b += text(x0 - 1.2, yTop - 0.6, '스텝', { size: 2.5, anchor: 'end', fill: '#555' });
  b += text(x1, Y(q) - 1.0, '목표 90°', { size: 2.5, anchor: 'end', ok: '정의: 한 수 = 90°' });
  // 아래에서 올라오는 시작 (0 → 생략)
  b += `<path d="M${xs[0]} ${yBot + 3} L${xs[0] + 4} ${Y(lo + 1)}" stroke="${color}" stroke-width="0.6" fill="none" stroke-dasharray="0.8 0.6"/>`;
  const pts = [[xs[0] + 4, Y(lo + 1)], [xs[1], Y(q + over)], [xs[2] - 2, Y(q + over)], [xs[3] - 2, Y(q - play)], [xs[3] + 3, Y(q - play)], [xs[4] - 6, Y(q)], [xs[4], Y(q)]];
  b += `<polyline points="${pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="0.8" stroke-linejoin="round"/>`;
  b += `<circle cx="${xs[4]}" cy="${Y(q)}" r="0.9" fill="${color}"/>`;
  // 행정 표시
  const lab = (x, y, n, body) => text(x, y, n, { size: 2.9, weight: 700, fill: color }) + `<text x="${x + 3.4}" y="${y}" font-size="2.6">${body}</text>`;
  b += lab(xs[0] + 4.5, Y(q + over) - 1.4, '①', `<tspan>+</tspan><tspan data-fact="quarter">${q}</tspan><tspan>+</tspan><tspan data-fact="over">${over}</tspan>`);
  b += lab(xs[2] + 0.5, Y(q) + 3.4, '②', `<tspan>−</tspan><tspan data-fact="back">${over + play}</tspan>`);
  b += lab(xs[3] + 3.6, Y(q - play) + 1.0, '③', `<tspan>+</tspan><tspan data-fact="play">${play}</tspan>`);
  b += text(x0, yBot + 5.8, '0 에서 출발 (아래 생략) · 가로는 순서', { size: 2.5, fill: '#555', ok: '정의: 시작 위치 0' });
  return svg(W, H, b, 'cupfig');
}

// ---- IDA*: 한도별 방문·잘림 막대 + 한도 5 루트 자식 18개 + 해 경로 ----
export function idaFig(D, fx, color) {
  const W = 140, H = 50;
  let b = '';
  // (가) 한도별 막대
  const maxV = Math.max(...D.bounds.map((x) => x.visited));
  const bx = 26, bw = 64;
  b += text(0, 3.2, '반복 심화 — 한도마다 처음부터 다시', { size: 2.8, weight: 700 });
  D.bounds.forEach((bd, i) => {
    const y = 5 + i * 5.2, w = bd.visited / maxV * bw, wp = bd.pruned / maxV * bw;
    b += text(0, y + 3.0, `한도 ${bd.bound}`, { size: 2.7, weight: 700 }).replace(`>한도 ${bd.bound}<`, `><tspan data-ok="라벨">한도 </tspan><tspan data-fact="bound${i}">${bd.bound}</tspan><`);
    b += `<rect x="${bx}" y="${y}" width="${w.toFixed(2)}" height="3.8" fill="${color}" opacity="0.25"/>`;
    b += `<rect x="${bx}" y="${y}" width="${wp.toFixed(2)}" height="3.8" fill="none" stroke="${color}" stroke-width="0.25" stroke-dasharray="0.6 0.5"/>`;
    b += `<rect x="${bx}" y="${y}" width="${w.toFixed(2)}" height="3.8" fill="none" stroke="${color}" stroke-width="0.35"/>`;
    const tx = Math.min(bx + w + 1.5, bx + bw + 1.5);
    b += `<text x="${tx.toFixed(2)}" y="${y + 3.0}" font-size="2.6"><tspan data-fact="visited${i}" font-weight="700">${fx['visited' + i].v}</tspan><tspan> 노드 · 잘림 </tspan><tspan data-fact="pruned${i}">${fx['pruned' + i].v}</tspan><tspan font-weight="700" fill="${bd.goalFound ? color : '#555'}"> ${bd.goalFound ? '→ 크로스 찾음' : '· 해 없음'}</tspan></text>`;
  });
  // (나) 한도 5 의 루트 자식 18개
  const root = D.trace.find((t) => t.bound === D.bounds[0].bound && t.id === 0);
  const kids = D.trace.filter((t) => t.bound === D.bounds[0].bound && t.parent === 0 && t.depth === 1);
  const ky = 24;
  b += `<text x="0" y="${ky}" font-size="2.8" font-weight="700"><tspan data-ok="라벨">한도 </tspan><tspan data-fact="bound0">${D.bounds[0].bound}</tspan><tspan> 첫 단계 — 루트 h = </tspan><tspan data-fact="rootH">${root.h}</tspan><tspan>, 첫 수 </tspan><tspan data-trace-count="kids">${kids.length}</tspan><tspan>개의 f = g + h</tspan></text>`;
  const cw = 7.6, ch = 6.6;
  kids.forEach((k, i) => {
    const x = (i % 18) * cw, y = ky + 2;
    const cut = k.event === 'prune';
    b += `<rect x="${x + 0.2}" y="${y}" width="${cw - 0.4}" height="${ch}" rx="0.6" fill="${cut ? '#eef0f2' : '#ffffff'}" stroke="${cut ? '#b5bcc2' : color}" stroke-width="${cut ? 0.2 : 0.45}"/>`;
    b += `<text x="${x + cw / 2}" y="${y + 3}" font-size="2.7" text-anchor="middle" class="mono" font-weight="700" data-ok="회전 기호(${k.move})" fill="${cut ? '#6b747b' : '#1b1f24'}">${esc(k.move)}</text>`;
    b += `<text x="${x + cw / 2}" y="${y + 5.7}" font-size="2.5" text-anchor="middle" class="mono" data-trace="${k.id}" data-trace-bound="${D.bounds[0].bound}" data-trace-kind="f" fill="${cut ? '#6b747b' : color}">${cut ? '✕' : ''}${k.f}</text>`;
  });
  const nExp = kids.filter((k) => k.event !== 'prune').length;
  b += `<text x="0" y="${ky + ch + 5.0}" font-size="2.6" fill="#333"><tspan>테두리 = f ≤ 한도라 더 내려감(</tspan><tspan data-trace-count="expand">${nExp}</tspan><tspan>) · 회색 ✕ = f &gt; 한도라 잘림(</tspan><tspan data-trace-count="prune">${kids.length - nExp}</tspan><tspan>). 같은 면 연속·반대면 역순은 만들지 않는다.</tspan></text>`;
  // (다) 해 경로 (한도 7)
  const last = D.bounds[D.bounds.length - 1].bound;
  const b7 = D.trace.filter((t) => t.bound === last);
  const byId = new Map(b7.map((t) => [t.id, t]));
  let g = b7.find((t) => t.event === 'goal'); const path = [];
  while (g) { path.unshift(g); g = byId.get(g.parent); }
  const py = 40.5;
  b += `<text x="0" y="${py}" font-size="2.8" font-weight="700"><tspan data-ok="라벨">한도 </tspan><tspan data-fact="bound2">${last}</tspan><tspan> 에서 찾은 크로스 — 원 안 숫자 = h (남은 수의 하한)</tspan></text>`;
  const step = 134 / (path.length - 1 || 1);
  path.forEach((n, i) => {
    const x = 3 + i * step, y = py + 5.8;
    if (i) {
      b += `<line x1="${x - step + 2.6}" y1="${y}" x2="${x - 2.6}" y2="${y}" stroke="${color}" stroke-width="0.4"/>`;
      b += `<text x="${x - step / 2}" y="${y - 1.2}" font-size="2.8" text-anchor="middle" class="mono" font-weight="700" data-ok="회전 기호(${n.move})">${esc(n.move)}</text>`;
    }
    const goal = n.event === 'goal';
    b += `<circle cx="${x}" cy="${y}" r="2.3" fill="${goal ? color : '#fff'}" stroke="${color}" stroke-width="0.4"/>`;
    b += `<text x="${x}" y="${y + 0.95}" font-size="2.6" text-anchor="middle" class="mono" data-trace="${n.id}" data-trace-bound="${last}" data-trace-kind="h" fill="${goal ? '#fff' : '#1b1f24'}">${n.h}</text>`;
  });
  return svg(W, H, b, 'idafig');
}

// ---- 단계별 수 막대 (합 = 총 수) ----
export function stageBar(D, fx, color) {
  const W = 93, H = 13.5; let b = '', x = 0;
  const tot = +fx.stageSum.v;
  const shades = ['1', '0.78', '0.62', '0.5', '0.38', '0.6', '0.85'];
  D.stages.forEach((s, i) => {
    const w = s.moves / tot * W;
    b += `<rect x="${x.toFixed(2)}" y="0" width="${(w - 0.3).toFixed(2)}" height="5" fill="${color}" opacity="${shades[i % shades.length]}"/>`;
    b += `<text x="${(x + w / 2).toFixed(2)}" y="3.7" font-size="2.5" text-anchor="middle" fill="#fff" font-weight="700" data-fact="stMoves${i}">${s.moves}</text>`;
    b += `<text x="${(x + w / 2).toFixed(2)}" y="8.2" font-size="2.5" text-anchor="middle" class="mono" fill="#333" data-fact="stShort${i}">${esc(fx['stShort' + i].v)}</text>`;
    x += w;
  });
  b += `<text x="0" y="12.6" font-size="2.6" fill="#333"><tspan>노드 </tspan>${D.stages.map((st, i) => `<tspan data-fact="stNodes${i}">${fx['stNodes' + i].v}</tspan>`).join('<tspan> · </tspan>')}</tspan></text>`;
  b += `<text x="${W}" y="12.6" font-size="2.6" text-anchor="end" font-weight="700"><tspan>단계 합 </tspan><tspan data-fact="stageSum">${tot}</tspan><tspan> − 경계 합치기 </tspan><tspan data-fact="merged">${fx.merged.v}</tspan><tspan> = </tspan><tspan data-fact="moves">${fx.moves.v}</tspan><tspan>수</tspan></text>`;
  return svg(W, H, b, 'stagebar');
}

// ---- 버튼 아이콘: 짧게 / 길게 ----
export function btnIcon(kind, color) {
  if (kind === 'short') {
    return svg(9, 9, `<circle cx="4.5" cy="4.5" r="3.6" fill="#fff" stroke="#1b1f24" stroke-width="0.45"/><circle cx="4.5" cy="4.5" r="1.7" fill="${color}"/>`, 'btn');
  }
  // 길게: 3/4 진행 고리
  const r = 3.9, a = 1.5 * Math.PI, ex = 4.5 + r * Math.sin(a), ey = 4.5 - r * Math.cos(a);
  return svg(9, 9, `<circle cx="4.5" cy="4.5" r="2.7" fill="#fff" stroke="#1b1f24" stroke-width="0.45"/><circle cx="4.5" cy="4.5" r="1.4" fill="${color}"/>` +
    `<path d="M4.5 0.6 A${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.7" stroke-linecap="round"/>`, 'btn');
}
