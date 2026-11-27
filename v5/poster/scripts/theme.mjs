// theme.mjs — 섹션 색 = 큐브 한 면 색 (인쇄용으로 채도·명도 조정). check.mjs 가 대비 4.5:1 을 검사한다.
export const PAPER = '#ffffff';
export const INK = '#1b1f24';
export const MUTED = '#4a535b';
// tag: 섹션 이름표 바탕, tagInk: 이름표 글자, accent: 종이 위 강조 글자·선
export const FACE = {
  white:  { name: '흰 (U)',  tag: '#ffffff', tagInk: '#1b1f24', accent: '#1b1f24', border: '#1b1f24' },
  green:  { name: '초록 (F)', tag: '#14773f', tagInk: '#ffffff', accent: '#14773f' },
  red:    { name: '빨강 (R)', tag: '#b3261e', tagInk: '#ffffff', accent: '#b3261e' },
  orange: { name: '주황 (L)', tag: '#a94a00', tagInk: '#ffffff', accent: '#a94a00' },
  blue:   { name: '파랑 (B)', tag: '#1b5aa6', tagInk: '#ffffff', accent: '#1b5aa6' },
  yellow: { name: '노랑 (D)', tag: '#f4c20d', tagInk: '#1b1f24', accent: '#7a5c00' },
};
export const LCD = { bg: '#dfeab8', ink: '#1d2a12', frame: '#2b3a4a' };

// WCAG 상대 휘도 대비
export function contrast(a, b) {
  const L = (hex) => {
    const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
