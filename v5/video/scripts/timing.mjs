// 타이밍 생성: narration.md(대본·목표 초) + public/tts/NN.(mp3|wav) 길이(ffprobe) + clips.json
// → src/generated/timeline.json. 렌더·스틸·스튜디오 전에 항상 돈다.
// TTS 가 없으면 목표 초로 무음 타이밍을 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
// 장면 앞 여유 + 줄 사이 여유 + 장면 끝 여유 (초)
export const LEAD = 0.1;
export const GAP = 0.15;
export const TAIL = 0.15;

export const SCENES = [
  { id: 'title', lines: ['01'] },
  { id: 'cfop', lines: ['02', '03'] },
  { id: 'ida', lines: ['04', '05', '06'] },
  { id: 'cup', lines: ['07'], clip: 'cup' },
  { id: 'hood', lines: ['08'], clip: 'hood' },
  { id: 'lifter', lines: ['09'], clip: 'lifter' },
  { id: 'outro', lines: ['10'] },
];

export function parseNarration(md) {
  const lines = [];
  for (const raw of md.split('\n')) {
    const m = /^\|\s*(\d\d)\s*\|\s*([\d.]+)\s*s\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/.exec(raw);
    if (m) lines.push({ id: m[1], targetSec: Number(m[2]), screen: m[3], text: m[4] });
  }
  return lines;
}

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  return JSON.parse(out);
}

function probeDuration(file) {
  return Number(probe(file).format.duration);
}

function probeVideo(file) {
  const j = probe(file);
  const v = j.streams.find((s) => s.codec_type === 'video');
  let rotation = 0;
  for (const sd of v.side_data_list || []) if (typeof sd.rotation === 'number') rotation = sd.rotation;
  if (v.tags && v.tags.rotate) rotation = -Number(v.tags.rotate);
  return { width: v.width, height: v.height, rotation, durationSec: Number(j.format.duration) };
}

export function buildTimeline() {
  const narration = parseNarration(fs.readFileSync(path.join(ROOT, 'narration.md'), 'utf8'));
  if (narration.length !== 10) throw new Error(`narration.md 대본 줄 수 ${narration.length} (10이어야 함)`);
  const byId = Object.fromEntries(narration.map((l) => [l.id, l]));

  for (const l of narration) {
    l.audio = null;
    for (const ext of ['mp3', 'wav']) {
      const f = path.join(ROOT, 'public', 'tts', `${l.id}.${ext}`);
      if (fs.existsSync(f)) { l.audio = `tts/${l.id}.${ext}`; l.audioSec = probeDuration(f); break; }
    }
    l.durSec = l.audio ? l.audioSec : l.targetSec;
  }

  const clipsCfgPath = path.join(ROOT, 'clips.json');
  const clipsCfg = JSON.parse(fs.readFileSync(clipsCfgPath, 'utf8'));
  const clips = {};
  for (const [name, cfg] of Object.entries(clipsCfg)) {
    if (name.startsWith('_')) continue;
    const abs = path.join(ROOT, 'public', cfg.file);
    const exists = fs.existsSync(abs);
    clips[name] = { ...cfg, exists };
    if (exists) Object.assign(clips[name], probeVideo(abs));
  }

  const scenes = [];
  let start = 0;
  for (const s of SCENES) {
    let t = LEAD;
    const lines = [];
    for (const id of s.lines) {
      const l = byId[id];
      if (!l) throw new Error(`narration.md 에 줄 ${id} 없음`);
      const from = Math.round(t * FPS);
      const dur = Math.round((l.durSec + GAP) * FPS);
      lines.push({ id, text: l.text, from, durationInFrames: dur, audio: l.audio, durSec: l.durSec });
      t = (from + dur) / FPS;
    }
    const durationInFrames = Math.round((t + TAIL) * FPS);
    scenes.push({ id: s.id, clip: s.clip || null, startFrame: start, durationInFrames, lines });
    start += durationInFrames;
  }

  return {
    fps: FPS, width: WIDTH, height: HEIGHT,
    hasAudio: narration.some((l) => l.audio),
    totalFrames: start,
    totalSec: start / FPS,
    scenes,
    clips,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tl = buildTimeline();
  fs.mkdirSync(path.join(ROOT, 'src', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'generated', 'timeline.json'), JSON.stringify(tl, null, 2) + '\n');
  const rows = tl.scenes.map((s) => `${s.id.padEnd(7)} ${(s.durationInFrames / FPS).toFixed(2).padStart(6)} s  [${s.lines.map((l) => l.id + (l.audio ? '*' : '')).join(' ')}]`);
  console.log(rows.join('\n'));
  console.log(`total ${tl.totalSec.toFixed(2)} s (${tl.totalFrames} frames)  audio=${tl.hasAudio ? 'tts' : 'none (목표 초)'}  clips=${Object.entries(tl.clips).map(([k, c]) => k + ':' + (c.exists ? 'file' : 'sim')).join(' ')}`);
}
