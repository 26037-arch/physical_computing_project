// 렌더·스틸 공통 설정
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(ROOT, '..', '..');

// 이 환경은 chrome-headless-shell 다운로드가 막혀 있을 수 있어 시스템 Chrome 을 쓴다.
// REMOTION_BROWSER 로 바꿀 수 있다.
export const BROWSER = process.env.REMOTION_BROWSER
  || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p))
  || null;
export const CHROMIUM = { gl: process.env.REMOTION_GL || 'angle', headless: true };

export function readTimeline() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'generated', 'timeline.json'), 'utf8'));
}

export async function makeBundle() {
  return bundle({
    entryPoint: path.join(ROOT, 'src', 'index.jsx'),
    publicDir: path.join(ROOT, 'public'),
    outDir: path.join(ROOT, 'out', 'bundle'),
    onProgress: () => {},
  });
}

// 콘솔 오류를 모아 둔다 (stills/렌더 끝에 0 이어야 함)
export function logCollector(errors) {
  return (log) => {
    const t = log.type || '';
    const text = typeof log.text === 'string' ? log.text : JSON.stringify(log);
    if (t === 'error') errors.push(text);
  };
}
