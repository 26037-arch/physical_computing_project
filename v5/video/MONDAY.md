# 월요일 절차 — 실물 클립 넣고 다시 렌더 (마감 11/30 18:00)

지금 영상은 실물 3장면(① 컵 · ② 후드 · ③ 리프터)이 3D 대체 화면("simulation")이고 무음이다.
클립·음성 파일만 넣고 명령 하나로 다시 렌더하면 된다.

## 1. 파일 넣기

| 무엇 | 어디에 | 이름 |
|---|---|---|
| ① 컵 회전 (NEMA17, 아랫층이 도는 장면) | `v5/video/public/clips/` | `cup.mp4` |
| ② 후드 (MG996R, 후드가 내려와 위 두 층을 잡음) | `v5/video/public/clips/` | `hood.mp4` |
| ③ 리프터 (SG90, 큐브가 앞으로 넘어감) | `v5/video/public/clips/` | `lifter.mp4` |
| TTS 음성 10줄 (선택) | `v5/video/public/tts/` | `01.mp3` ~ `10.mp3` (wav 도 됨) |

- 파일이 없는 장면은 자동으로 3D 대체 화면이 들어간다. 클립 하나만 있어도 렌더된다.
- 휴대폰 영상이 `.mov` 면 이름만 바꾸지 말고 변환: `ffmpeg -i in.mov -c:v libx264 -crf 18 -an cup.mp4`
- 클립·TTS 파일은 `.gitignore` 로 커밋되지 않는다 (최종 mp4 만 커밋).

## 2. 구간 잡기 — `v5/video/clips.json`

```json
"cup":    { "file": "clips/cup.mp4",    "startSec": 1.0, "endSec": 7.5 },
"hood":   { "file": "clips/hood.mp4",   "startSec": 0.5, "endSec": 6.0, "cropX": [0.2, 0.8] },
"lifter": { "file": "clips/lifter.mp4", "startSec": 0,   "endSec": null, "rotate": 90 }
```

- `startSec`~`endSec` 구간을 장면 길이(약 5 s, TTS 가 있으면 그 줄 길이 + 0.4 s)에 맞춰 **배속 재생**한다(0.5×~2.0×, 1× 가 아니면 오른쪽 아래에 `1.47×` 처럼 표시). 동작 앞뒤 1 s 여유를 남기고 자르면 된다. `endSec: null` = 끝까지.
- 세로 영상은 가운데 맞춤 + 좌우 검은 여백(흐린 배경 없음).
- `cropX: [왼쪽, 오른쪽]` 원본 가로 비율(0~1) 중 남길 범위. 로봇이 화면 한쪽에 작게 찍혔을 때만.
- `rotate`: 0/90/180/270 (시계 방향). 휴대폰 회전 정보가 틀려 옆으로 누운 경우에만.
- 구간을 잡은 뒤 `npm run stills` → `stills/cup_main.png` 등을 열어 잘림·방향을 먼저 본다(약 40 s).

## 3. 렌더 (명령 하나)

```bash
cd v5/video
npm run render
```

- 결과: `submission/1반_6팀_1103김재혁_1105나준우_영상.mp4` (1920×1080, 30 fps, H.264 yuv420p, TTS 가 있으면 AAC).
- 렌더 시간 실측(이 환경, 클립·TTS 없음, 58.5 s 영상): **약 3분 20초** (장면별 12~51 s). 실물 클립이 있으면 그 장면이 10 s 정도 더 걸린다(테스트 클립으로 cup 22 s → 32 s).
- 60 s 를 넘으면 종료코드 1 과 함께 알려 준다 → TTS 를 1.1배 빠르게 다시 만들거나 `scripts/timing.mjs` 의 `GAP`(줄 사이 0.15 s)·`TAIL`(장면 끝 0.15 s)을 줄인다. `npm run check` 도 60 s 초과를 잡는다.
- 클립 하나만 바꿨고 TTS 는 그대로면 그 장면만: `node scripts/timing.mjs && node scripts/render.mjs cup` (나머지는 `out/scenes/` 재사용). TTS 를 넣거나 바꿨으면 장면 길이가 바뀌므로 반드시 전체 `npm run render`.
- 처음 받은 컴퓨터면 먼저 `npm ci`. 브라우저는 `/usr/bin/google-chrome` 을 쓴다(다른 경로면 `REMOTION_BROWSER=... npm run render`). Windows 에서 위 경로가 없으면 Remotion 이 자체 브라우저를 내려받아 쓴다(네트워크 필요).

## 4. 촬영 가이드 (월요일 16~17시)

- **가로** 1920×1080 이상, 30 또는 60 fps. 세로로 찍으면 화면 가운데 좁게 들어간다.
- **삼각대 고정**(손떨림 없음), 로봇 **정면에서 약간 위 45°** — 컵 기울기·후드·리프터가 모두 보이는 각도.
- 각 동작 **앞뒤 1초 여유**, 한 클립 **6~8 s**. 동작 하나당 한 클립(① 컵 회전 · ② 후드 닫힘 · ③ 리프터 넘김).
- 배경 정리(책상 위 다른 물건 치우기), 조명은 위에서 고르게. 큐브 색이 잘 보이게.
- 시리얼 모니터나 LCD 가 같이 보이면 좋다(명령이 실제로 나가는 근거).
- 찍고 바로 노트북으로 옮겨 1~3 절을 하면 렌더까지 약 10분.
