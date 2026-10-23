# CAD V4 작업 지시 (Codex 용)

이 저장소(`C:\program code\physical_computing_project`)에서 **V4 기구의 CadQuery 생성기와 검사기**를 만든다. 치수·좌표·부품은 `docs/HARDWARE_V4.md` 2절이 기준이다(먼저 전부 읽을 것). 펌웨어·`sim/`·`diagram.json`·`tests/`·`tools/gen_*.js` 는 건드리지 않는다. 커밋하지 않는다.

## 환경

CadQuery 전용 가상환경이 `.venv-cad\Scripts\python.exe` 에 준비돼 있다(없으면 `py -3.14 -m pip install --user uv` → `uv venv --python 3.12 .venv-cad` → `uv pip install --python .venv-cad\Scripts\python.exe cadquery==2.7.0`). 모든 파이썬은 이 인터프리터로 실행한다. `tools/build_robot_v2.py`(헬퍼 box/cyl/ball/rounded/fuse, cube_parts, head_parts, cube_instances, export_shape)와 `tools/build_robot_v3.py`(`module_design(hollow=True)` 중공 모듈, `index_wheel`은 쓰지 않음)를 import 해서 재사용한다. 출력은 `models/robot_v4/` 에만 쓴다.

## 만들 것

1. `tools/build_robot_v4.py`
   - `FACES_V4` = HARDWARE_V4.md 2.1 표 (F/R/B/L xDir (0,1,0), D xDir (1,0,0)), `face_location_v4(face)`.
   - 큐브: V2 core/edge/corner/center 그대로 + `center_recessed`(U/D): 캡 대신 두께 3 판이 면에서 8 mm 안쪽, 판 바깥면 중앙에 사각 소켓 8.4×8.4 깊이 3, 줄기는 8×8 사각(코어의 사각 구멍에 끼움, 회전 불가), M3 체결은 유지. 코어에 U/D 사각 구멍 8.3×8.3 추가. `cube_instances` 에서 U/D 센터를 `center_recessed` 로 바꾼다(V2 템플릿은 −Z 를 향하므로 회전 주의).
   - 측면 모듈(F R B L): V2 `head_parts` 를 바탕으로 `drive_plate_2pin`(핀 구멍 (0,±19.1) 2개만, 중앙 Ø22 유지), 캐리지의 M5 너트 포켓 대신 링크 핀 보스 (22,−44,147) Ø3, 레일 지지판 뒤 끝에 MG996R 서보 마운트(축 중심 (22,−44,195), 축 방향 국소 x), 크랭크 r12(외형 폭 6×두께 4), 링크 36(핀 중심 간, 외형 8×4), 결합 마이크로스위치 외형 12.8×6.5×5.8 (레일 지지판 z≈150, 캐리지가 결합 위치에서 누름). θ=0 결합(이송 0), θ=180 후퇴(이송 24).
   - D 모듈: `build_robot_v3.module_design(hollow=True)` 를 바탕으로 중공축 OD 17 / ID 12, 베어링 6003(17×35×10) 2개, 하우징/캡 보어 맞춤, 구동판은 `drive_plate_2pin`, 비킨 모터(국소 x +60)와 40T:40T 벨트는 V3 그대로, 이송·스위치는 측면과 같은 서보 크랭크. 잠금핀/인덱스 휠은 없다.
   - 잠금 막대 유닛(D 모듈 아래, y 축): 강재 막대 8×8 길이 ≈230, 끝 모따기 1, 결합 시 끝 y=−17.5, 후퇴 시 −47.5(행정 30). 출력 가이드 블록(사각 구멍 8.3)과 캐리지, MG996R 서보(크랭크 r15, 링크 36), 결합 스위치. 막대는 D 층 엣지 벽(칸 19.4)에 닿지 않는다.
   - `models/robot_v4/print/<부품>.stl|.step` (출력 부품 전부: cube_core, cube_center, center_recessed, cube_edge, cube_corner, socket_coupon, drive_plate_2pin, shaft_hub, bearing_housing_direct/hollow, bearing caps, carriage_direct/hollow, rail_support, servo_mount, crank, link, lock_guide, lock_carriage 등), `robot_assembly.step/.glb`(큐브 장착, F/B·D·막대 결합, R/L 후퇴), `manufacturing.json`(수량), `parameters.json`(V2 P + 파생값 + `lock_bar_mm=8, lock_socket_mm=8.4, lock_stroke_mm=30, lock_crank_r_mm=15, hollow_id_mm=12, hollow_od_mm=17, crank_r_mm=12, link_mm=36, servo_axis=[22,-44,195], pin_positions=[[0,19.1],[0,-19.1]], faces_v4`, 그리고 **`print_offsets`**: 출력 부품마다 모듈 국소 조립 좌표의 [x중심, y중심, z최소](STL 은 V2 `export_shape` 처럼 XY 중심·바닥 z=0 으로 내보내므로 시뮬레이터가 이 값을 더한다), **`purchased`**: 구매품 외형 {name: {size:[..], center:[..]}} (servo_MG996R, engage_switch, lift 없음)).
   - 모든 출력 부품이 단일 유효 솔리드인지 assert.
2. `tools/check_robot_v4.py` (`tools/check_robot_v2.py` 의 `overlap` 재사용): (a) 큐브 조립 27개 겹침 없음(>0.02 mm³), (b) 세 축 15°~90° 층 회전 간섭, (c) 막대 결합 상태 vs 큐브 전체(센터 판 소켓 외 겹침 없음, D 엣지까지의 간격 보고), (d) 막대가 D 헤드 이송 0/24 에서 중공축과 겹치지 않음, (e) 뒤집기: 큐브를 x축 0~180° 15° 간격으로 돌려 후퇴한 F/B·D 모듈·후퇴한 막대와 간섭 없음, (f) 자세별(FB 결합/RL 결합/모두 후퇴) 모듈 간·모듈-큐브 간섭, (g) 레일 지지판 5개 + 막대 유닛 상호 간섭 없음, (h) 크랭크 운동학: θ=0 → 147, θ=180 → 171 (막대: 204/234) 오차 0.01 이내. 결과 `models/robot_v4/mechanical_checks.json`, 실패 시 종료코드 1. 불가능한 치수는 최소로 바꾸고 HARDWARE_V4.md 2절 숫자를 고친 뒤 "CAD 조정: …" 한 줄을 남긴다.
3. `tools/render_robot_v4.py` (matplotlib, `render_robot_v2.py` 참고): `docs/images/robot_v4_assembly.png`, `docs/images/robot_v4_lock_bar.png`(큐브 단면/투명으로 막대가 센터 판 소켓에 든 모습). `tools/requirements-robot-v4.txt`.
4. `tools/embed_models.js` 는 다른 세션이 V3 용으로 바꿔 놓았다. **새 파일 `tools/embed_models_v4.js`** 를 만들어 `models/robot_v4/print/*.stl` 과 `parameters.json` 을 `sim/models.js` 에 넣는다(출력 형식은 `tools/embed_models_v2.js` 와 같이 `CubeModels.params`, `CubeModels.parts[이름].b64`). 크기가 6 MB 를 넘으면 STL 허용오차를 0.1/0.3 으로 낮추고, 그래도 크면 헤드 부품(drive_plate_2pin, shaft_hub, bearing_*, carriage*, rail_support, servo_mount, center_recessed)만 넣는다. 실행해서 `sim/models.js` 를 갱신한다.
5. `docs/HARDWARE_V4.md` 끝에 "## 7. CAD 결과 (build_robot_v4.py)" 절을 한국어로 덧붙인다: 부품·수량, 검사 결과 숫자(mechanical_checks.json), 이미지 2장, 재생성 명령. 실물 검증을 주장하지 않는다. 7절 외의 본문은 고치지 않는다(치수 조정 한 줄 제외).

## 보고

실행한 명령, `check_robot_v4.py` 통과 여부, 바꾼 치수와 이유, `print_offsets` 전체, `sim/models.js` 크기.
