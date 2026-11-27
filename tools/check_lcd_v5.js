// V5 main.ino 의 lcdShow 문자열 리터럴이 LCD1602(16칸)를 넘지 않는지 검사한다. 넘으면 종료코드 1.
// snprintf 로 만드는 줄은 형식 문자열만 보고하고(최악 길이 추정 불가) 통과시킨다. row1 버퍼는 char[17].
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'v5', 'firmware', 'main', 'main.ino'), 'utf8');
const MAX = 16;
let bad = 0, n = 0;
src.split('\n').forEach((line, i) => {
  if (!line.includes('lcdShow(') || /template|void lcdShow/.test(line)) return;
  const code = line.split('//')[0];
  for (const m of code.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    n++;
    if (m[1].length > MAX) { bad++; console.log(`FAIL main.ino:${i + 1}: "${m[1]}" (${m[1].length}자 > ${MAX})`); }
  }
});
src.split('\n').forEach((line, i) => {
  const m = line.match(/snprintf\(row1,[^"]*"([^"]*)"/);
  if (m) console.log(`INFO main.ino:${i + 1}: snprintf 형식 "${m[1]}" (최악 길이 미검사)`);
});
console.log(bad ? `FAIL: ${bad}개 초과` : `PASS: lcdShow 리터럴 ${n}개 모두 ${MAX}자 이하`);
process.exit(bad ? 1 : 0);
