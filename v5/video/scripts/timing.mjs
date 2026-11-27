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
export const MAX_SEC = 60;
export const MAX_TEMPO = 1.08;
// 앞 무음 제거 → 뒤집기 → 앞(=원래 뒤) 무음 제거 → 다시 뒤집기
const SR = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02';
export const TRIM_FILTER = `${SR},areverse,${SR},areverse`;

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

  // TTS: 원본(public/tts)은 그대로 두고 앞뒤 무음(-45 dB 이하)을 잘라 out/tts/NN.wav 로 가공한 길이를 쓴다
  const ttsOut = path.join(ROOT, 'out', 'tts');
  for (const l of narration) {
    l.audio = null;
    for (const ext of ['mp3', 'wav']) {
      const f = path.join(ROOT, 'public', 'tts', `${l.id}.${ext}`);
      if (!fs.existsSync(f)) continue;
      fs.mkdirSync(ttsOut, { recursive: true });
      const trimmed = path.join(ttsOut, `${l.id}.wav`);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', f, '-af', TRIM_FILTER, '-ar', '48000', '-ac', '2', trimmed]);
      l.audio = `tts/${l.id}.${ext}`;
      l.audioRawSec = probeDuration(f);
      l.audioTrimmed = trimmed;
      l.audioSec = probeDuration(trimmed);
      if (!(l.audioSec > 0.05)) throw new Error(`TTS ${l.id}: 무음을 자르고 나니 소리가 없음 (${f})`);
      break;
    }
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

  const layoutScenes = (tempo) => {
    const scenes = [];
    let start = 0;
    for (const s of SCENES) {
      let t = LEAD;
      const lines = [];
      for (const id of s.lines) {
        const l = byId[id];
        if (!l) throw new Error(`narration.md 에 줄 ${id} 없음`);
        const durSec = l.audio ? l.audioSec / tempo : l.targetSec;
        const from = Math.round(t * FPS);
        const dur = Math.round((durSec + GAP) * FPS);
        lines.push({ id, text: l.text, from, durationInFrames: dur, audio: l.audio, audioTrimmed: l.audioTrimmed || null, durSec });
        t = (from + dur) / FPS;
      }
      const durationInFrames = Math.round((t + TAIL) * FPS);
      scenes.push({ id: s.id, clip: s.clip || null, startFrame: start, durationInFrames, lines });
      start += durationInFrames;
    }
    return { scenes, totalFrames: start };
  };

  // 60 s 를 넘으면 TTS 를 atempo 로 최대 MAX_TEMPO 배까지만 빠르게 (그 이상은 실패로 남긴다)
  const hasAudio = narration.some((l) => l.audio);
  let tempo = 1;
  let lay = layoutScenes(1);
  if (hasAudio && lay.totalFrames > MAX_SEC * FPS) {
    for (let k = 1.005; k <= MAX_TEMPO + 1e-9; k += 0.005) {
      tempo = Math.round(k * 1000) / 1000;
      lay = layoutScenes(tempo);
      if (lay.totalFrames <= MAX_SEC * FPS) break;
    }
  }
  const { scenes, totalFrames: start } = lay;

  return {
    fps: FPS, width: WIDTH, height: HEIGHT,
    hasAudio,
    tempo,
    overLimit: start > MAX_SEC * FPS,
    trimmedSec: Object.fromEntries(narration.filter((l) => l.audio).map((l) => [l.id, { raw: l.audioRawSec, trimmed: l.audioSec }])),
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
  if (tl.hasAudio) console.log('tts trimmed: ' + Object.entries(tl.trimmedSec).map(([id, d]) => `${id} ${d.raw.toFixed(2)}→${d.trimmed.toFixed(2)}`).join('  '));
  if (tl.tempo > 1 && !tl.overLimit) console.log(`60 s 초과 → TTS atempo ${tl.tempo}× 로 줄임`);
  if (tl.overLimit) console.log(`경고: atempo ${MAX_TEMPO}× 로도 ${tl.totalSec.toFixed(2)} s > ${MAX_SEC} s — 렌더는 실패한다. TTS 를 다시 빠르게 만들 것`);
  console.log(`total ${tl.totalSec.toFixed(2)} s (${tl.totalFrames} frames)  audio=${tl.hasAudio ? 'tts' : 'none (목표 초)'}  clips=${Object.entries(tl.clips).map(([k, c]) => k + ':' + (c.exists ? 'file' : 'sim')).join(' ')}`);
}
