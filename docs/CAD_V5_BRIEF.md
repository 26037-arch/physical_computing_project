# CAD V5 작업 지시 (Codex 용) — Rev B

**Rev B (2026-10-24 오후):** 1차 실행의 3D 검사 실패 8건을 `tools/robot_v5_params.py`(P)·`tools/check_robot_v5.py`·`docs/HARDWARE_V5.md` 2절에 반영했다. 아래 표의 치수 중 2절과 다른 것은 **2절이 우선**이다. 요약: 후드는 뒷벽 없음(ㄷ자), 힌지 (−90, 40), FLIP 90°, LOAD 120°; 홀더 판 70, 기둥 두께 5·모따기 4; 허브는 별도 부품 `hub`(플랜지 Ø30×3, M3 ×2) → 출력 7종; 모터 상자 바깥 50, 윗판 z −25~−20, 모터 면 z −25, 책상 z_w −78; 리프터 Q0 = (−23.8, −6.5)(P 파생값 그대로), 크로스바 x ±38.5, 슬롯은 M3 볼트 몸통(Ø3.4)만; 크랭크 축 = 최상 크로스바 + 37·(슬롯 방향) = (−83.0, 81.1), 왼쪽 타워를 z 95 까지 올려 SG90 을 거기 둔다; 검사 (e) 는 0°/180° 끝점만 0/66, 90° 는 24.7; 검사 (g) 는 7종 모두 서포트 없이(홀더 판 아래 허브 없음) 통과해야 한다.

이 저장소(`C:\program code\physical_computing_project`)에서 **V5 기구(기울어진 컵 + 후드 + 리프터, 3축)의 CadQuery 생성기·3D 검사기·렌더·임베드 스크립트**를 만든다.
치수·좌표·부품은 **`docs/HARDWARE_V5.md` 1·2절이 기준**이고 숫자는 **`tools/robot_v5_params.py` 의 `P`** 에 있다 (import 해서 쓰고 복사하지 않는다).
2D 운동학 검사기 `tools/check_robot_v5.py` 가 같은 `P` 로 통과한 상태다 (`models/robot_v5/kinematic_checks.json`).
`firmware/`·`sim/`·`tests/`·`tools/gen_*.js`·`diagram.json`·`docs/HARDWARE_V5.md`(8절 추가 제외)는 건드리지 않는다. 커밋하지 않는다.

## 환경
- 파이썬은 반드시 `.venv-cad\Scripts\python.exe` (Python 3.12, CadQuery 2.7, shapely, numpy, matplotlib, reportlab). 다른 인터프리터 금지.
- 재사용: `tools/build_robot_v2.py` 의 헬퍼(box/cyl/rounded/fuse/export_shape), `tools/build_robot_v4.py` 의 `print_offsets`/`purchased`/`manufacturing.json` 작성 방식, `tools/check_robot_v4.py` 의 `overlap` 검사 방식, `tools/embed_models_v4.js` 의 임베드 형식.
- 출력은 `models/robot_v5/` 에만 쓴다.

## 좌표
국소 홀더 좌표(x 오른쪽, y 앞, z 바닥 법선 위; 원점 = 홀더 판 윗면 중심 = 큐브 아래면 중심). 모든 부품은 국소 좌표로 만들고, 조립 STEP/GLB 와 검사는 국소 좌표로 한다.
월드(책상)로 보일 때만 x축 둘레 −20° 회전(뒤 −y 가 낮아짐). 책상면은 월드 z_w = −72 → 국소에서는 평면 z = −72/cos20° − y·tan20°. 베이스 바닥은 이 평면이다.

## 만들 것

### 1. `tools/build_robot_v5.py` — 출력 부품 6종 + 구매품 외형 + 조립
모두 단일 유효 솔리드여야 한다(assert). STL 은 V2 `export_shape` 처럼 **XY 중심·바닥 z=0** 으로 내보내고, 국소 조립 좌표의 `[x중심, y중심, z최소]` 를 `print_offsets` 에 기록한다.

| 부품 | 내용 (HARDWARE_V5.md 2절) |
|---|---|
| `cube_holder` | 판 66×66×4 (z −4~0, R6) − 4변 노치(|x|≤10, |y|≥23) + 기둥 4 (L자: x∈[16,33]×y∈[29.5,33] ∪ x∈[29.5,33]×y∈[16,33] 와 대칭, z 0~15, 안쪽 윗모서리 45° 모따기 5) + 허브 Ø16 z −18~−4 (D 보어 Ø5/평면 4.5, M3 멈춤나사 구멍 반경 방향 z −11) |
| `hood` | 벽: 바깥 66×66, 안 60×60, z 21~61.5; 지붕 z 58.5~61.5 에 44×44 구멍; 팔 2장 두께 6 (|x| 33~39) 힌지 허브 Ø20 @ (y −82, z 14.4) 에서 뒷벽까지 (팔의 아래 모서리는 허브 아래(z 4.4)에서 뒷벽 아래끝(y −33, z 21)까지 직선); 오른쪽 허브 바깥면에 Ø21.5×2.5 원형 혼 포켓 + M2 ×4 (PCD 14), 가운데 Ø3.2; 왼쪽 허브 Ø3.2 관통 |
| `lifter` | 갈고리(x 폭 16): 선반 3.5×2.5(앞윗모서리 1 모따기), 입술 두께 3·선반 위 1.5, 최하 위치 선반 앞끝 Q0 = (y −30.2, z −6.5); 몸통은 Q 뒤·아래로 크로스바까지; 크로스바 4×4, x ±41, 중심 Q0 + (−14, −5) = (−44.2, −11.5), 양끝 Ø3.2 (M3×16 볼트 = 슬롯 핀); 선반 윗면 0.5 패드 홈 |
| `base` | 모터 상자(바깥 48×48, 벽 3, 윗판 z −25~−20, Ø23 + Ø3.4 ×4 @ ±15.5, 벽은 책상 평면까지) + 뒤 데크(월드 수평판, 두께 4, x ±50, 모터 상자 뒤 ~ 타워 뒤 y −95) + 타워 2 (두께 6, 안쪽면 |x| 39.5, y −95~−30, 데크~z 60, 윗모서리 R10) 에 힌지 Ø3.2 @ (−82, 14.4), 오른쪽 타워 안쪽면 Ø24×6 카운터보어, 바깥면 MG996R 포켓(몸체 40.5×20.5, 귀 M3 ×4 간격 49.5/10, 축이 힌지와 일치), 리프터 슬롯(폭 3.4, 중심선 (−44.2, −11.5)→(−73.1, 47.8) 양끝 반원), 왼쪽 타워 바깥면 SG90 포켓(22.5×12.2, M2 ×2 @ 28) 축 중심 (−28, −45) — 타워가 거기까지 내려오지 않으면 데크에서 올라오는 받침을 붙인다; 바닥 모서리 고무발 자리 Ø10×1 ×4 |
| `crank` | SG90 혼용 팔: 길이 33 (축~핀), 폭 8, 두께 4, 축 쪽 Ø6 보스(스플라인 대신 혼 포켓 + M2), 끝 Ø3.2 |
| `link` | 핀 중심 간 70, 폭 8, 두께 4, 양끝 Ø3.2 |

구매품 외형(`purchased`, 단면 상자/원통만): NEMA17(42.3×42.3×40, 축 Ø5×22), MG996R(40.5×20.5×38 + 축), SG90(22.5×12.2×22.7), M3 볼트는 생략.
조립 `robot_assembly.step/.glb`: 큐브(57 상자, 월드 색 없음) 장착, 후드 OPEN 60°, 리프터 최하, 크랭크/링크 그 위치. 추가로 `robot_assembly_close.step`(후드 CLOSE), `robot_assembly_flip.step`(후드 70°, 리프터 최상, 큐브 65° 기울어짐 — 큐브는 (y −28.3, 0) 모서리 둘레로 65.1° 회전).
`parameters.json`: `P` 전체 + 파생값(hood_in/out, post_in/out, hinge, lift path 끝점, servo axes) + `print_offsets` + `purchased` + `faces`(없음, 빈 객체) . `manufacturing.json`: 부품별 수량·체적·g(PETG 1.27 g/cm³·충전 20 %·벽 3 기준 근사)·치수.

### 2. `tools/check_robot_v5_cad.py` — 3D 간섭 검사 (`models/robot_v5/mechanical_checks.json`, 실패 시 종료코드 1)
(a) CLOSE: 후드 ↔ 큐브·홀더·베이스 겹침 0 (>0.02 mm³ 실패), 벽-큐브 간격 1.5 보고. (b) 후드 0°→150° 를 5° 간격으로 돌리며 홀더·큐브 **회전 쓸림 체**(홀더+기둥을 z축 둘레로 15° 간격 회전한 합집합, 큐브는 반경 40.3 원통) 와의 겹침: 0~60° 구간은 큐브 정지 상태만, 60°·150° 는 쓸림 체와도 0. 후드 ↔ 타워 전 구간 0. (c) 리프터 경로 0~66 을 2 mm 간격으로: 리프터 ↔ 타워 슬롯 외 베이스·모터·허브 겹침 0, 리프터 ↔ 앉은 큐브는 z>3 영역 0 (z≤3 은 모따기 스침 허용, 최대 겹침 깊이 보고). (d) FLIP 자세(후드 70°, 리프터 최상)에서 65° 기운 큐브와 후드·팔·타워 겹침 0. (e) 크랭크 0/90/180° 운동학: 슬라이더 위치 0/33/66 ±0.05, 링크가 타워·베이스와 안 겹침. (f) 베이스 바닥 평면이 월드 수평(모든 고무발 자리 z_w = −72 ±0.01), 모터 최저점 z_w ≥ −66. (g) 모든 출력 부품 최대 치수 ≤ 220 (베드 220×220) 과 서포트 없이 출력 가능한 자세 기록(지붕/데크/판을 베드에).
치수가 불가능하면 `P` 를 **최소로** 고치고(`tools/robot_v5_params.py`), `check_robot_v5.py` 를 다시 돌려 통과시키고, 보고에 "CAD 조정: …" 한 줄과 함께 `docs/HARDWARE_V5.md` 2절의 해당 숫자를 고친다.

### 3. `tools/render_robot_v5.py` (matplotlib, `render_robot_v4.py` 참고)
`docs/images/robot_v5_assembly.png`(월드 자세, 비스듬히 앞에서), `robot_v5_flip.png`(FLIP 자세 단면: y–z 평면, 큐브 65°), `robot_v5_parts.png`(출력 6종 나열). 

### 4. `tools/embed_models_v5.js`
`models/robot_v5/print/*.stl` 과 `parameters.json` 을 `sim/models.js` 에 넣는다 (형식은 `tools/embed_models_v4.js` 와 같이 `CubeModels.params`, `CubeModels.parts[이름].b64`; 6 MB 초과 시 STL 허용오차 0.1/0.3). 실행해서 `sim/models.js` 를 갱신한다 (기존 V3/V4 내용은 덮어쓴다).

### 5. `fusion/scripts/import_robot_v5.py`
`fusion/scripts/import_robot_v3.py` 와 같은 형식: `models/robot_v5/robot_assembly.step` 을 새 Fusion 문서에 가져오고 `parameters.json` 의 숫자를 사용자 매개변수로 기록하고 `models/robot_v5/CubeRobotV5.f3d` 로 내보내는 `run(context)`. (실행은 하지 않는다 — Fusion 은 별도 세션에서 연다.)

### 6. `docs/HARDWARE_V5.md` 끝에 "## 8. CAD 결과 (build_robot_v5.py)" 절을 한국어로 덧붙인다
부품·수량·질량(g)·출력 자세·예상 출력 시간(0.2 mm, 60 mm/s 근사), `mechanical_checks.json` 수치, 이미지 3장, 재생성 명령. 실물 검증을 주장하지 않는다. 8절 외의 본문은 고치지 않는다(치수 조정 한 줄 제외).

## 보고
실행한 명령, `check_robot_v5.py`·`check_robot_v5_cad.py` 통과 여부, 바꾼 치수와 이유, `print_offsets` 전체, 부품별 g 합계, `sim/models.js` 크기.
