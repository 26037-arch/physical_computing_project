// JetBrains Mono 는 npm(@fontsource) 로 번들한다 (네트워크 폰트 없음). 한글은 로컬 Noto Sans CJK KR.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([
      document.fonts.load('400 32px "JetBrains Mono"', '0123 abc'),
      document.fonts.load('700 32px "JetBrains Mono"', '0123 abc'),
      document.fonts.load('400 32px "Noto Sans CJK KR"', '큐브'),
      document.fonts.load('700 32px "Noto Sans CJK KR"', '큐브'),
    ]).then(() => document.fonts.ready).then(() => continueRender(handle));
  }, [handle]);
};
