# V4 Rev C 시뮬레이션·펌웨어·CAD 일치 점검 (이력)

현재 운전은 [PHYSICS_V4.md](PHYSICS_V4.md)의 Rev D를 따른다. 아래는 ab8c454 당시의 기록이다.

2026-10-24(KST), 기준 커밋 `be79ab0`의 Rev C 구조를 유지한 점검이다.
풀이 알고리즘은 이미 같았으며, 기구의 초기 상태·뒤집기 표시·오류 처리·시간 계산과 회로 표시에서 차이를 수정했다.
실제 모터·서보·센서를 연결해 시험한 결과와 구분한다.

## 공통 구조와 원본

- 형상: `tools/build_robot_v4.py` → `models/robot_v4/parameters.json`·STL/STEP. 큐브57 mm, 측면 띠 판16×50 네 개, 아래 D 판50×50 한 개, 잠금 막대6×6, 행정24/30 mm, 크랭크12/15, 링크36을 유지한다.
- 제어: `config/robot_v4.json` → `tools/gen_robot_contract.js` → `firmware/main/robot_contract.h`와 `sim/robot_contract.js`. 핀·면 매핑·초기 상태·서보 각도/시간·센서 제한·모터 펄스·수열 길이·대상 보드를 공유한다. JS 계약은 CAD의 수치와 좌표 배열도 포함한다.
- 형상 표시: `tools/embed_models_v4.js` → `sim/models.js`. 앱의 치수 기본값도 공통 계약에서 가져온다. 계약 검사에서 임베딩된 전체 CAD 매개변수가 현재 파일과 같은지 검사한다.
- 회전 명령: 논리 `U R F D L B`, 각 면90°/180°/역90°. 초기 `orient=1`은 흰색 U가 아래다. 물리 U 모터는 없으며, 필요한 경우 R/L로 월드−X 180° 뒤집은 뒤 D 헤드를 사용한다. 뒤집기는 논리 큐브 상태를 바꾸지 않는다.
- 서보: F·B·R·L·D·LOCK 여섯 개, 신호는 FB/RL/D/LOCK 네 개다. F/B는 D8, R/L은 D9를 공유한다. A4988은 다섯 개이고 DIR D7을 공유한다.

C++와 JS는 서로 다른 언어의 구현을 유지한다. 설정·표를 공통 원본에서 생성하고 실제 C++ 출력과 JS의 탐색/기구 동작을 비교해 차이를 검출한다.

## 발견한 차이와 수정

| 항목 | 점검 전 | 수정 후 |
|---|---|---|
| 웹 초기 상태 | 자동 LOAD 두 번으로 장착 완료 | 펌웨어 setup과 같이 미장착·모든 유닛 후퇴. LOAD 두 단계로 장착 |
| 뒤집기 | 웹 +X, 모터 −X | 웹·모터·CAD 검사 모두 −X. R 시계/L 반시계, 완료 후 FLIPPED 출력 |
| 재장착 자세 | 뒤집은 후 배출·재장착하면 화면 자세가 남음 | LOAD 완료 때 흰색 아래 자세로 복원해 논리/물리 면을 일치 |
| 동작 시간 | 웹90°150 ms·별도 이송 슬라이더·임의 뒤집기 시간 | 펌웨어 펄스·가감속·400 ms 서보 이동·250 ms 정지 대기를 사용. 배속은 표시만 조정 |
| 회전 진행 | 웹의 이차 보간 | 펌웨어 STEP 상승 시각에 맞춘 회전, 정지 대기 중 최종 각도 유지 |
| 센서 오류 | JS는 항상 성공 처리 | 결합/후퇴 실패 시 단락 중단. 결합 실패는 서보 후퇴 복구. 해당 수를 돌리지 않고 완료한 수만 보존 |
| 실행 예상 | 결합 횟수×2로 후퇴 횟수 추정 | 계획한 engage/retract/turn/flip을 실제로 모두 합산 |
| 풀이 시간 표시 | 오래된 AVR 시드1 결과로 보드 속도 추정 | 현재 브라우저 계산 시간 표시. 보드 속도로 오인하는 추정 제거 |
| 명령 길이 | C++는 최대 길이에서 앞부분만 실행 가능, 시리얼96 byte | 두 UI 모두 최대64수. C++ 시리얼256 byte, 초과 줄·잘못된 토큰·65수는 전체 거부 |
| 회로도 | 서보4개 표시 | 실제 설계와 같이6개 표시, FB/RL 신호 공유 |
| 보드 업로드 기본값 | 실제 보드도 UNO R3 | 공통 설정의 UNO R4 WiFi를 사용하고 출력은 `build/physical`로 분리 |
| 오래된 치수 설명 | 핀 삽입3, 가이드8.3, Rev A 막대 설명 | 삽입4.8, 가이드6.3, 막대6·끝−22.5로 정정 |

기구 지지는 새 쌍 결합 확인 → D/이전 쌍 해제 확인 → LOCK 결합 → 회전 순서다.
D 회전은 LOCK과 D를 결합하고 기존 측면 쌍을 유지한다. 뒤집기는 R/L 결합 후 FB·D·LOCK을 순서대로 해제한다.

기본 제어의 명목 시간은90° **787.655 ms**, 180° **1210.305 ms**, 뒤집기 **1153.600 ms**다.
각 값은 DIR 설정·STEP 펄스·가감속 간격·정지 대기를 포함한다. GPIO 함수 실행·인터럽트·센서 추가 대기·LCD/시리얼·알림음은 제외하므로 실물 실행 시간 보증이 아니다.
웹에서 서보는400 ms 동안의 이상 운동을 그린다. 실제 각도 피드백은 없다. 뒤집기는 R/L 교대 펄스의 한 쌍이 완료되는 시점으로 강체 큐브 각도를 표시한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| 공통 계약 신선도·회로·CAD | `gen_robot_contract.js --check`, `check_robot_contract.js` 통과. 핀 중복 없음, 6서보/4신호, 5모터, 직렬 스위치·버튼·부저·LCD 연결 확인 |
| 풀이기 실제 C++ ↔ JS | `host_check.js 1 300` 통과. 시드1~300의 섞기·단계별 수열·탐색 노드·최종 수열 **3,300줄 완전 일치** |
| 풀이 표 | `gen_tables.js` 통과. OLL57/PLL22 경우, F2L 트리거·거리표 검증. 기존 생성 파일과 차이 없음 |
| 기구/모터 실제 C++ ↔ JS | `host_mechanism_check.js` 통과. **648 오류 시나리오, 4,860명령**의 출력·장착/결합/방향/카운터·큐브 상태·서보 명령·STEP 시각/방향/개수·명목 시간 일치 |
| 부분 완료·파서 | 실제 `main.ino` execute/pollSerial 포함. `F R U`에서 R 결합 실패 시 F만 보존, 64수 허용/65수·초과 줄·잘못된 토큰 거부, 탭 구분 검증 |
| 웹 앱 동작 큐 | `test_sim_v4.js` 통과. LOAD×2·뒤집은 뒤 배출/재장착, 1배/4배 각180수, 섞기→풀이, 센서 오류 복구·중단. **54,886프레임** 중 뒤집기8,874/회전22,947프레임의 물리 축·지지·펄스 시간 검증. 실제 crank 함수로24/30 mm 행정 확인 |
| UNO R3 컴파일 | Arduino CLI1.5.1 / AVR1.8.8 / Servo1.3.0 / LiquidCrystal I2C1.1.2. Flash30,446/32,256 byte, 전역 RAM1,308/2,048 byte, 지역/스택 여유740 byte |
| UNO R4 WiFi 컴파일 | Renesas UNO1.6.0. Flash80,676/262,144 byte, 전역 RAM9,936/32,768 byte. LCD 라이브러리의 AVR 대상 선언 경고는 발생하며 컴파일·링크는 성공 |
| 음의 X 뒤집기 CAD | `check_robot_v4.py` 통과. −X0~180°의15° 간격13자세, 층36자세·이웃 헤드20자세·모듈3자세에서 허용치0.02 mm³ 초과 간섭 없음 |

호스트 기구 검사는 프로덕션 `main.ino`, `mechanism.cpp`, `motors.cpp`, `cube.cpp`, `solver.cpp`를 그대로 컴파일한다. GPIO·시계·LCD·서보/시리얼 입출력만 결정적 어댑터로 치환한다. 따라서 전기·기계 실측을 의미하지 않는다.
웹 검사는 실제 앱의 큐·패널·크랭크 코드를 실행하고 장면/시계를 어댑터로 대체한다. WebGL 화면 품질 검사가 아니다.

## 아직 실물에서 확인할 부분

현재 클라우드에는 Wokwi CLI/토큰과 실제 보드가 없다. Wokwi 생성 시나리오 두 개는 재생성했으며 기존과 내용이 동일하다. 이번 변경의 Wokwi 전기 시뮬레이션과 실물 업로드/운전은 실행하지 않았다.
로컬 환경에서 다음을 실행해 보완한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/mechanism_v4.test.yaml -TimeoutMs 120000
powershell -ExecutionPolicy Bypass -File scripts/simulate.ps1 -Scenario tests/solve_seed1.test.yaml -TimeoutMs 180000
```

F/B·R/L 스위치는 각 쌍의 **직렬 접점**이다. LOW는 두 개 모두 결합을 뜻하지만 HIGH는 하나 이상 접점이 열렸다는 뜻이다. 두 헤드의 완전 후퇴를 따로 검출할 수 없다. 공통 알고리즘과 시뮬레이터도 개별 후퇴 확인 기능이 있다고 주장하지 않는다.
서보 명령180°와 웹 후퇴 표시만으로 핀 두 개 모두의 물리적 후퇴가 보증되지는 않으므로 제작 설명서의 수동 간섭/후퇴 여유 점검을 수행한다.

뒤집기 때 중앙 슬라이스는 마찰로 따라온다는 기존 가정, 모터 배선 극성·풀스텝 설정, 서보 혼 영점·400 ms 이동 여유,6 mm 막대 비틀림·출력물 강도·핀/소켓 마찰은 실물 검증 대상이다.
UNO R3의740 byte는 컴파일러가 보고한 전역 변수 외 여유이며, 최대 재귀 깊이에서 스택 여유를 실측한 결과가 아니다. 실제 보드는 RAM 여유가 큰 UNO R4 WiFi를 사용한다.

## 재현 순서

```sh
node tools/gen_robot_contract.js --check
node tools/check_robot_contract.js
node tools/gen_tables.js
node tools/host_check.js 1 300
node tools/host_mechanism_check.js
node tools/test_sim_v4.js
node tools/gen_mechanism_test.js
node tools/gen_wokwi_test.js 1
arduino-cli compile --fqbn arduino:avr:uno --build-path build/avr-compile --output-dir build/avr firmware/main
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --build-path build/r4-compile --output-dir build/r4 firmware/main
python tools/check_robot_v4.py
python tools/package_robot_v4.py
```

CAD 치수를 변경하면 CAD 생성 → 계약 생성 → STL 임베딩을 먼저 수행한다.
제작 PDF·STL 형상은 이번 제어 일치 수정으로 바뀌지 않는다. 제작 ZIP에는 최신 제어 설정·시뮬레이터·펌웨어·검증 도구도 함께 포함한다.
