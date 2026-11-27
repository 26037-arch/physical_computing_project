# v5/poster — 제출 포스터 (B4 1쪽)

결과: `submission/1반_6팀_1103김재혁_1105나준우_포스터.pdf` (257 × 364 mm), 미리보기 `preview.png`.

```
cd v5/poster
npm ci
npm run build    # HTML 조립 → 헤드리스 Chrome PDF + preview.png (CHROME=<경로> 로 브라우저 지정)
npm run check    # 숫자·LCD 문구·명령이 근거 파일과 같은지, 오프라인·1쪽·크기·넘침·글자 크기·색 대비 검사
```

- 숫자·문구 근거: `scripts/facts.mjs` 가 `v5/firmware/main/*.ino|.h|.cpp`, `v5/video/data/algo_seed1.json`, `docs/HARDWARE_V5.md`, `docs/REPORT_V5.md`, `docs/V5H_DESIGN.md` 에서 직접 읽는다. 근거가 바뀌어 못 읽으면 빌드가 멈춘다.
- 그림은 전부 SVG 로 데이터에서 그린다 (`scripts/figs.mjs`). 섹션 색 = 큐브 6면 (`scripts/theme.mjs`).
- 글꼴: 한글 Noto Sans CJK KR(로컬 설치, 없으면 Noto Sans KR → 맑은 고딕), 숫자·코드·LCD 는 JetBrains Mono(`@fontsource/jetbrains-mono`). 네트워크 리소스 없음.

## 제품 사진 바꾸기 (실물 사진이 생기면)
1. 사진을 `img/product.png` 로 덮어쓴다 (가로:세로 ≈ 97:55, 넘치는 부분은 가운데 기준으로 잘린다).
2. `img/product.txt` 의 캡션 한 줄을 고친다 (예: "실물 — 2026-11-30 촬영").
3. `npm run build && npm run check`.

지금 이미지는 3D 렌더다: 저장소 루트에서 `node tools/serve.js 8765` 를 띄우고 `python v5/poster/scripts/capture_product.py`
(three.js CDN 이 막혀 있으면 `THREE_JS=<three r128 three.min.js 경로>`).
