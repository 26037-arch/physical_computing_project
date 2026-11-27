# 월요일 절차 — 실물 클립 넣고 다시 렌더 (마감 11/30 18:00)

지금 영상은 실물 3장면(① 컵 · ② 후드 · ③ 리프터)이 3D 대체 화면("simulation")이고 무음이다.

## 역할

| 누가 | 할 일 |
|---|---|
| **사용자** | 클립 3개를 찍어 **업로드만** 한다 (+ 원하면 사진, TTS 음성 `01`~`10`). 파일 이름에 `cup`·`hood`·`lifter` 가 들어가면 헷갈리지 않는다. |
| **Claude (이 원격 환경)** | 아래 1~5 단계 전부: 복사·변환, 구간 잡기, 세로/회전 확인 스틸, 렌더, 확인, 커밋. |

## 1. 업로드 파일을 public/clips 로 복사 (Claude)

업로드는 `/mnt/user-data/uploads/` 에 들어온다. 이름 앞에 해시가 붙을 수 있으니 먼저 목록을 본다.

```bash
ls -lt /mnt/user-data/uploads/ | head -20
cd /home/claude/physical_computing_project/v5/video
# 폰 영상(.mov/.mp4, HEVC 포함)을 H.264 mp4 로 변환하며 복사. 소리는 뺀다.
ffmpeg -y -i "/mnt/user-data/uploads/<컵 영상>"     -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -an public/clips/cup.mp4
ffmpeg -y -i "/mnt/user-data/uploads/<후드 영상>"   -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -an public/clips/hood.mp4
ffmpeg -y -i "/mnt/user-data/uploads/<리프터 영상>" -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -an public/clips/lifter.mp4
# TTS 가 왔으면 (mp3 또는 wav, 줄 번호 01~10)
cp "/mnt/user-data/uploads/<…01.mp3>" public/tts/01.mp3   # … 10 까지
```

- 파일이 없는 장면은 자동으로 3D 대체 화면이 들어간다. 클립 하나만 있어도 렌더된다.
- 클립·TTS 원본은 `.gitignore` 로 커밋되지 않는다(최종 mp4 만 커밋).
- 길이·해상도·회전 메타데이터: `ffprobe -v error -show_entries stream=width,height:stream_side_data=rotation:format=duration -of default=nw=1 public/clips/cup.mp4`

## 2. 구간 잡기 — `v5/video/clips.json` (Claude)

```json
"cup":    { "file": "clips/cup.mp4",    "startSec": 1.0, "endSec": 7.5 },
"hood":   { "file": "clips/hood.mp4",   "startSec": 0.5, "endSec": 6.0, "cropX": [0.2, 0.8] },
"lifter": { "file": "clips/lifter.mp4", "startSec": 0,   "endSec": null, "rotate": 90 }
```

- `startSec`~`endSec` 구간을 장면 길이(약 5 s, TTS 가 있으면 그 줄 길이 + 0.4 s)에 맞춰 **배속 재생**(0.5×~2.0×, 1× 가 아니면 오른쪽 아래에 `1.47×` 처럼 표시). 동작 앞뒤 1 s 여유를 남기고 자른다. `endSec: null` = 끝까지.
- 세로 영상은 가운데 맞춤 + 좌우 검은 여백(흐린 배경 없음).
- `cropX: [왼쪽, 오른쪽]` 원본 가로 비율(0~1) 중 남길 범위. 로봇이 화면 한쪽에 작게 찍혔을 때만.
- `rotate`: 0/90/180/270 (시계 방향). 폰 회전 정보가 틀려 옆으로 누운 경우에만.

## 3. 세로/회전 확인 스틸 (Claude, 약 40 s)

```bash
npm run stills      # 또는 한 장면만: node scripts/timing.mjs && node scripts/stills.mjs cup
```

`stills/cup_main.png`, `hood_main.png`, `lifter_main.png` 를 직접 열어 본다.
- 옆으로 누웠거나 거꾸로면 → `rotate` 를 넣고 3단계 다시.
- 로봇이 너무 작거나 한쪽에 치우쳤으면 → `cropX`.
- 동작이 장면 안에 다 안 들어가면 → `startSec`/`endSec`.
- "simulation" 문구가 아직 보이면 파일 이름·경로가 틀린 것.

## 4. 렌더 (Claude, 명령 하나)

```bash
cd /home/claude/physical_computing_project/v5/video
npm run render
```

- 결과: `submission/1반_6팀_1103김재혁_1105나준우_영상.mp4` (1920×1080, 30 fps, H.264 yuv420p, TTS 가 있으면 AAC).
- 렌더 시간 실측(이 환경, 약 57 s 영상): **약 3분 10초**(장면별 12~48 s). 실물 클립이 있으면 그 장면이 10 s 정도 더 걸린다.
- TTS 처리는 자동:
  - 각 파일 앞뒤 무음(-45 dB 이하)을 잘라 `out/tts/NN.wav` 로 쓰고 그 길이로 타이밍을 잡는다(원본은 그대로).
  - 그래도 60 s 를 넘으면 TTS 를 atempo 로 **최대 1.08배**까지 빠르게 하고 그 배수를 출력한다.
  - 1.08배로도 넘으면 렌더를 시작하지 않고 종료코드 1. **기존 제출 mp4 는 바뀌지 않는다**(최종 길이 검사도 제출 파일 교체 전에 한다). → 사용자에게 TTS 를 더 빠르게 다시 만들어 달라고 요청.
- `npm run check` 도 60 s 초과·대본/데이터 불일치를 잡는다.
- 클립 하나만 바꿨고 TTS 는 그대로면 그 장면만: `node scripts/timing.mjs && node scripts/render.mjs cup` (나머지는 `out/scenes/` 재사용). TTS 를 넣거나 바꿨으면 장면 길이가 바뀌므로 반드시 전체 `npm run render`.
- `node_modules` 가 없으면 먼저 `npm ci`. 브라우저는 `/usr/bin/google-chrome`(바꾸려면 `REMOTION_BROWSER=...`).

## 5. 확인·커밋 (Claude)

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of default=nw=1 ../../submission/1반_6팀_1103김재혁_1105나준우_영상.mp4
```
- 1920×1080, 30 fps, 길이 ≤ 60 s, TTS 가 있으면 audio 스트림이 있는지 본다.
- 클립 장면 프레임 몇 장을 `ffmpeg -ss <초> -i ... -frames:v 1` 로 뽑아 직접 본다.
- 커밋: 최종 mp4 + `clips.json` + 바뀐 `stills/*.png`.

## 촬영 가이드 (사용자, 월요일 16~17시)

- **가로** 1920×1080 이상, 30 또는 60 fps. 세로로 찍으면 화면 가운데 좁게 들어간다.
- **삼각대 고정**(손떨림 없음), 로봇 **정면에서 약간 위 45°** — 컵 기울기·후드·리프터가 모두 보이는 각도.
- 큐브는 **흰색 아래 · 초록 앞**(장착 자세, 대체 화면과 같음).
- 각 동작 **앞뒤 1초 여유**, 한 클립 **6~8 s**. 동작 하나당 한 클립(① 컵 회전 · ② 후드 닫힘 · ③ 리프터 넘김).
- 배경 정리(책상 위 다른 물건 치우기), 조명은 위에서 고르게. 큐브 색이 잘 보이게.
- 시리얼 모니터나 LCD 가 같이 보이면 좋다(명령이 실제로 나가는 근거).
- 찍으면 바로 업로드 → Claude 가 1~5 단계를 해서 약 10분 안에 끝난다.
