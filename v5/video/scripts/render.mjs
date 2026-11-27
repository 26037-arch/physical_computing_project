// 장면별 mp4 렌더 → ffmpeg concat(-c copy) → (TTS 가 있으면) 음성 얹기(-c:v copy)
// 결과: <repo>/submission/1반_6팀_1103김재혁_1105나준우_영상.mp4. 60 s 넘으면 종료코드 1.
// 사용: npm run render            (timing.mjs 가 먼저 돈다)
//       node scripts/render.mjs cup   (그 장면만 다시 렌더, 나머지는 out/scenes 의 기존 파일 재사용)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { BROWSER, CHROMIUM, REPO, ROOT, logCollector, makeBundle, readTimeline } from './common.mjs';

const OUT_NAME = '1반_6팀_1103김재혁_1105나준우_영상.mp4';
const FINAL = path.join(REPO, 'submission', OUT_NAME);
const SCENE_DIR = path.join(ROOT, 'out', 'scenes');
const t0 = Date.now();

const tl = readTimeline();
const only = process.argv[2] || null;
fs.mkdirSync(SCENE_DIR, { recursive: true });

const serveUrl = await makeBundle();
const errors = [];
for (const s of tl.scenes) {
  const final = path.join(SCENE_DIR, `${s.id}.mp4`);
  if (only && s.id !== only && fs.existsSync(final)) continue;
  const tmp = path.join(SCENE_DIR, `${s.id}.tmp.mp4`);
  const composition = await selectComposition({ serveUrl, id: s.id, browserExecutable: BROWSER, chromiumOptions: CHROMIUM, onBrowserLog: logCollector(errors), logLevel: 'error' });
  const ts = Date.now();
  let lastPct = -1;
  await renderMedia({
    serveUrl, composition, outputLocation: tmp, overwrite: true,
    codec: 'h264', crf: 18, x264Preset: 'veryfast', pixelFormat: 'yuv420p', colorSpace: 'bt709',
    muted: true, enforceAudioTrack: false,
    browserExecutable: BROWSER, chromiumOptions: CHROMIUM,
    onBrowserLog: logCollector(errors), logLevel: 'error',
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10);
      if (pct !== lastPct) { lastPct = pct; process.stdout.write(`\r${s.id.padEnd(7)} ${String(pct * 10).padStart(3)}%`); }
    },
  });
  fs.renameSync(tmp, final);
  process.stdout.write(`\r${s.id.padEnd(7)} done  ${(s.durationInFrames / tl.fps).toFixed(2)} s video, ${((Date.now() - ts) / 1000).toFixed(1)} s render\n`);
}
if (errors.length) {
  console.error(`browser console errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
  process.exit(1);
}

// 이어 붙이기 (같은 설정으로 렌더했으므로 -c copy)
const listFile = path.join(ROOT, 'out', 'concat.txt');
fs.writeFileSync(listFile, tl.scenes.map((s) => `file '${path.join(SCENE_DIR, `${s.id}.mp4`)}'`).join('\n') + '\n');
const joined = path.join(ROOT, 'out', 'joined.mp4');
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', joined]);

fs.mkdirSync(path.dirname(FINAL), { recursive: true });
const finalTmp = FINAL.replace(/\.mp4$/, '.tmp.mp4');
const audioLines = tl.scenes.flatMap((s) => s.lines.filter((l) => l.audio).map((l) => ({ file: path.join(ROOT, 'public', l.audio), ms: Math.round(((s.startFrame + l.from) / tl.fps) * 1000) })));
if (audioLines.length) {
  // 각 줄을 제자리(장면 시작 + 줄 시작)에 놓고 섞는다
  const inputs = audioLines.flatMap((a) => ['-i', a.file]);
  const filters = audioLines.map((a, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${a.ms}|${a.ms}[a${i}]`);
  const mix = `${audioLines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioLines.length}:normalize=0:duration=longest,apad[aout]`;
  ff(['-i', joined, ...inputs, '-filter_complex', [...filters, mix].join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', finalTmp]);
} else {
  fs.copyFileSync(joined, finalTmp);
}
fs.renameSync(finalTmp, FINAL);

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', FINAL], { encoding: 'utf8' }));
const v = probe.streams.find((x) => x.codec_type === 'video');
const dur = Number(probe.format.duration);
const sizeMb = fs.statSync(FINAL).size / 1e6;
console.log(`\n${path.relative(REPO, FINAL)}`);
console.log(`  ${v.width}x${v.height} ${v.r_frame_rate} fps ${v.codec_name} ${v.pix_fmt}, ${dur.toFixed(2)} s, audio=${probe.streams.some((x) => x.codec_type === 'audio') ? 'tts' : 'none'}, ${sizeMb.toFixed(1)} MB`);
console.log(`  render time ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (dur > 60) {
  console.error(`길이 ${dur.toFixed(2)} s > 60 s — TTS 를 1.1배 정도 빠르게 다시 만들 것`);
  process.exit(1);
}
