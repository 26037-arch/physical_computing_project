// 대본(docs/V5H_ASSEMBLY_STEPS.json)과 3D 데이터(models/robot_v5h/assembly_web.json)의 인스턴스 이름을 대조한다.
// 오류가 있으면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const web = JSON.parse(fs.readFileSync(path.join(root, 'models/robot_v5h/assembly_web.json'), 'utf8'));
const script = JSON.parse(fs.readFileSync(process.env.STEPS_JSON || path.join(root, 'docs/V5H_ASSEMBLY_STEPS.json'), 'utf8'));

const pieces = new Set(web.pieces.map((p) => p.inst));
const parts = new Set(web.parts.map((p) => p.inst));
const all = new Set([...pieces, ...parts]);
const errors = [];
const warns = [];
const addCount = new Map();

for (const st of script.steps) {
  const tag = `단계 ${st.n}`;
  for (const a of st.add) {
    if (!all.has(a)) errors.push(`${tag}: add '${a}' 가 JSON 에 없음`);
    addCount.set(a, (addCount.get(a) || 0) + 1);
  }
  for (const f of st.focus || []) if (!all.has(f)) errors.push(`${tag}: focus '${f}' 가 JSON 에 없음`);
  for (const f of st.fasteners || []) {
    if (!all.has(f)) warns.push(`${tag}: 철물 '${f}' 는 3D 모델 없음 (패널 글로만 표시)`);
  }
  if (!script.modules.some((m) => m.id === st.module)) errors.push(`${tag}: 모듈 '${st.module}' 없음`);
  if (!['glue', 'bolt', 'place', 'drill', 'check'].includes(st.join)) errors.push(`${tag}: join '${st.join}' 알 수 없음`);
  if (!Array.isArray(st.from) || st.from.length !== 3) errors.push(`${tag}: from 형식 오류`);
}
for (const p of pieces) {
  const c = addCount.get(p) || 0;
  if (c !== 1) errors.push(`조각 '${p}' 가 add 에 ${c}번 나옴 (정확히 1번이어야 함)`);
}
for (const [k, c] of addCount) if (c > 1 && !pieces.has(k)) errors.push(`구매품 '${k}' 가 add 에 ${c}번`);
const ns = script.steps.map((s) => s.n);
ns.forEach((n, i) => { if (n !== i + 1) errors.push(`단계 번호가 연속이 아님: index ${i} n=${n}`); });

for (const w of warns) console.warn('경고:', w);
console.log(`조각 ${pieces.size} / 구매품·철물 ${parts.size} / 단계 ${script.steps.length} / 경고 ${warns.length}`);
if (errors.length) {
  for (const e of errors) console.error('오류:', e);
  console.error(`검사 실패: 오류 ${errors.length}건`);
  process.exit(1);
}
console.log('검사 통과');
