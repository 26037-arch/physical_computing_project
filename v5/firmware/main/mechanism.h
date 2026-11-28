// mechanism.h — V5 기구 절차 (docs/HARDWARE_V5.md 3절): 컵 스텝모터 1 + 후드 서보 + 리프터 서보.
//   규칙·동작 순서·출력 줄은 sim/mechanism.js 와 같다 (flips/spins 횟수까지 Wokwi 로 교차검증).
//   물리 위치: U(0) R(1) F(2) D(3) L(4) B(5). ori[p] = 그 물리 위치에 지금 있는 논리 면.
//   모든 층 회전은 아래(D 위치)에서만 한다. 논리 면 f 를 아래로 가져오는 재배향:
//     D: 없음 / F: FLIP / R: SPIN y → FLIP / L: SPIN y' → FLIP / B: SPIN y2 → FLIP / U: FLIP → FLIP
//   SPIN y = 큐브 전체가 위에서 봐서 시계 방향(U 와 같은 방향) = 컵 시계. FLIP = x' (F→D, D→B, B→U, U→F).
//   TURN D = 아래 층을 아래에서 봐서 시계 = 컵을 위에서 봐서 반시계.
//   여유 보정(센서가 없으므로 큐브를 매번 기하로 다시 가운데에 놓는다) — cupMove(steps, cw, over):
//     큐브는 컵 안에서 ±2.05°(기둥 여유 1.0), 위 두 층은 후드 안에서 ±3.1°(여유 1.5) 놀 수 있다. θc = playSteps, θh = 후드 여유.
//     ① steps+over 전진  ② over+play 후진  ③ play 전진.  스텝 합은 항상 steps 라 컵 위치 오차는 쌓이지 않는다.
//     TURN (over = overshootSteps ≈ θc+θh): ① 끝에 아래 층은 컵−θc, 위 두 층은 후드 벽 +θh → 상대 회전 ≈ 90°
//          (이상 모델 가정: 컵 영점이 맞고, 시작 때 층이 정렬돼 있고, over = θc+θh, 접촉이 단단하고 반복되며,
//           ② 에서 위 두 층이 아래 층을 따라온다. 기본값은 5.40 − 5.15 = 0.25° 남는다. 실물에서는 ② 때 층이 미끄러질 수 있다 → BUILD 4b 로 맞춘다)
//          ② 가 컵 여유 2θc 를 지난 뒤 큐브 전체를 θh 만큼 되끌어 후드 가운데로, ③ 이 컵을 큐브 가운데로 가져온다.
//     SPIN (over = play): ① 뒤 큐브는 컵 기준 ±θc 어디든 있을 수 있다(관성) → ② 가 앞선 쪽 기둥으로 밀어 정확히 90° 에, ③ 컵 복귀.
//     FLIP 뒤 (steps = 0, over = play): 착지한 큐브가 어느 쪽으로 틀어져 있어도 ①② 가 틀어짐(최대 ±2.05°)을 없앤다
//          → 닫히는 후드 벽과 큐브 모서리 사이 여유가 최악 0.5 mm 에서 약 1.3 mm 로 (가로 치우침 ±1.0 mm 은 남는다).
//     play = 0 이면 ①② 만 남아 기존(오버슈트 후 복귀) 동작과 같다.
//   스핀·뒤집기 앞에는 HOOD OPEN, 층 회전 앞에는 HOOD CLOSE 가 자동으로 들어간다(상태가 바뀔 때만 줄을 낸다).
//   가상 모드(Motors::isEnabled()==false)에서는 줄만 내고 서보·스텝은 생략한다.
#pragma once
#include <Arduino.h>
#include <Servo.h>
#include "motors.h"

enum HoodPos : uint8_t { HOOD_CLOSE = 0, HOOD_OPEN = 1, HOOD_LOAD = 2 };

class Mechanism {
 public:
  void begin(Motors* m);
  bool doMove(uint8_t logicalMove);     // 재배향(+HOOD CLOSE) → TURN. 실패(장착 안 됨)면 false
  bool flip();                          // 큐브 x' (후드 OPEN → 90° → 리프터 올렸다 내림 → 60° + 중심 맞춤)
  bool spin(uint8_t k);                 // 큐브 전체 y^k (k 1..3), 후드 OPEN
  bool load();                          // LOAD 버튼 한 단계 (비어 있음→후드 LOAD·큐브 대기 / 넣음→후드 OPEN·장착 / 장착됨→배출)
  bool eject();
  bool isLoaded() const { return loaded; }
  bool waitingForCube() const { return !loaded && hoodPos == HOOD_LOAD; }
  void resetCounters() { flips = 0; spins = 0; hoods = 0; }
  void printStatus(Print& p);
  void rehood();                        // H 로 바꾼 각을 지금 자세에 바로 적용 (조정용)
  uint8_t ori[6];
  uint16_t flips = 0, spins = 0, hoods = 0;
  // 조정값 (시리얼 H/K/O 명령으로 바꾸고 맞으면 아래 기본값을 고친다)
  uint8_t hoodDeg[3] = {140, 70, 50};   // CLOSE / OPEN / LOAD — 실물 측정(2026-11-28): 140 누름, 70 기준, 50 최대로 젖힘 (설계 15/75/135 와 방향 반대)
  uint8_t hoodFlipDeg = 50;             // 뒤집는 동안 후드 — 실물 최대 젖힘(50)을 쓴다 (설계 105 = 후드 각 90°)
  uint8_t liftUpDeg = 140;              // 리프터 최상 — 실물 측정: 140 에서 뒤집힘 (설계 180 = 크랭크 사점)
  uint8_t overshootSteps = 3 * MICROSTEP;          // 층 회전 오버슈트 = 컵 여유 + 후드 여유 (12 스텝 = 5.4° ≈ 2.05° + 3.1°)
  uint8_t playSteps = (5 * MICROSTEP + 2) / 4;     // 컵 한쪽 여유 (5 스텝 = 2.25° ≈ 2.05°). 0 이면 중심 맞춤 생략

 private:
  Motors* motors = nullptr;
  Servo hood, lift;
  uint8_t hoodPos = HOOD_OPEN;
  uint8_t hoodNow = 0;                  // 후드 서보에 마지막으로 쓴 각 (가상 모드에서는 바뀌지 않는다)
  bool loaded = false;
  bool virt() const { return !motors->isEnabled(); }
  bool ready();                         // 장착돼 있거나 가상 모드면 true, 아니면 "ERR not loaded"
  void setHood(uint8_t pos);
  void hoodTo(uint8_t deg, uint16_t ms);
  void cupMove(uint16_t steps, bool cw, uint8_t over);
  void sweep(Servo& s, uint8_t from, uint8_t to, uint16_t ms);
  void resetOri();
};

// 핀 배치 (diagram.json, docs/HARDWARE_V5.md 4절) — UNO R3/R4 공통 헤더
static const uint8_t HOOD_SERVO_PIN = 8, LIFT_SERVO_PIN = 9;
static const uint8_t LIFT_DOWN_DEG = 75;   // 실물 측정: 75 가 안정(최하) 자세 (설계 0)
// 후드는 HOOD_MS 동안 20 ms 간격으로 나눠 옮기고(서보 최고 속도로 큐브·타워를 치지 않게) HOOD_SETTLE_MS 를 기다린다.
// FLIP_SETTLE_MS: 큐브가 65° 를 넘어 떨어져 튐이 멎을 시간(넘어가는 시간 상수 0.074 s × ln(25°/1°) ≈ 0.24 s + 여유).
static const uint16_t HOOD_MS = 300, HOOD_SETTLE_MS = 60, LIFT_UP_MS = 700, LIFT_DOWN_MS = 400, FLIP_SETTLE_MS = 350;   // 뒤집기 합계 약 1.9 s
static const uint8_t REVERSE_MS = 20, SETTLE_MS = 120;   // 컵: 방향을 바꾸기 전 / 마지막 스텝 뒤 정착 시간
