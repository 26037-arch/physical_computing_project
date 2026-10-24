// mechanism.h — V5 기구 절차 (docs/HARDWARE_V5.md 3절): 컵 스텝모터 1 + 후드 서보 + 리프터 서보.
//   규칙·동작 순서·출력 줄은 sim/mechanism.js 와 같다 (flips/spins 횟수까지 Wokwi 로 교차검증).
//   물리 위치: U(0) R(1) F(2) D(3) L(4) B(5). ori[p] = 그 물리 위치에 지금 있는 논리 면.
//   모든 층 회전은 아래(D 위치)에서만 한다. 논리 면 f 를 아래로 가져오는 재배향:
//     D: 없음 / F: FLIP / R: SPIN y → FLIP / L: SPIN y' → FLIP / B: SPIN y2 → FLIP / U: FLIP → FLIP
//   SPIN y = 큐브 전체가 위에서 봐서 시계 방향(U 와 같은 방향) = 컵 시계. FLIP = x' (F→D, D→B, B→U, U→F).
//   TURN D = 아래 층을 아래에서 봐서 시계 = 컵을 위에서 봐서 반시계 (+ 오버슈트 2 스텝 후 복귀).
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
  bool flip();                          // 큐브 x' (후드 OPEN → 70° → 리프터 올렸다 내림 → 60°)
  bool spin(uint8_t k);                 // 큐브 전체 y^k (k 1..3), 후드 OPEN
  bool load();                          // LOAD 버튼 한 단계 (비어 있음→후드 LOAD·큐브 대기 / 넣음→후드 OPEN·장착 / 장착됨→배출)
  bool eject();
  bool isLoaded() const { return loaded; }
  bool waitingForCube() const { return !loaded && hoodPos == HOOD_LOAD; }
  void resetCounters() { flips = 0; spins = 0; hoods = 0; }
  void printStatus(Print& p);
  uint8_t ori[6];
  uint16_t flips = 0, spins = 0, hoods = 0;
  // 조정값 (시리얼 H/K/O 명령으로 바꾸고 맞으면 아래 기본값을 고친다)
  uint8_t hoodDeg[3] = {15, 75, 135};   // CLOSE / OPEN / LOAD (후드 각 0/60/120 + 15)
  uint8_t hoodFlipDeg = 105;            // 뒤집는 동안 후드 (90 + 15: 팔이 리프터 크로스바 뒤로 비킨다)
  uint8_t liftUpDeg = 180;              // 리프터 최상 (크랭크 사점)
  uint8_t overshootSteps = 2;           // 층 회전 오버슈트 (2 스텝 = 3.6°)

 private:
  Motors* motors = nullptr;
  Servo hood, lift;
  uint8_t hoodPos = HOOD_OPEN;
  bool loaded = false;
  bool virt() const { return !motors->isEnabled(); }
  void setHood(uint8_t pos);
  void sweep(Servo& s, uint8_t from, uint8_t to, uint16_t ms);
  void resetOri();
};

// 핀 배치 (diagram.json, docs/HARDWARE_V5.md 4절) — UNO R3/R4 공통 헤더
static const uint8_t HOOD_SERVO_PIN = 8, LIFT_SERVO_PIN = 9;
static const uint8_t LIFT_DOWN_DEG = 0;
static const uint16_t HOOD_MS = 300, LIFT_UP_MS = 700, LIFT_DOWN_MS = 400, FLIP_SETTLE_MS = 250;   // 뒤집기 합계 약 1.65 s
