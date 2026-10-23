// motors.h — V4 스텝모터 제어: 측면 헤드 4개(F R B L) + 바닥 키 회전, A4988 ×5
//   STEP 핀은 모터마다, DIR 은 D7 하나를 공유한다 (한 번에 한 모터만 움직인다. 뒤집기는 R/L 펄스를
//   번갈아 내며 펄스마다 DIR 을 바꾼다 — A4988 의 DIR 셋업 시간 200 ns 보다 충분히 길다).
//   모터 번호 = 물리 면 번호 (U=0 은 모터 없음, R=1 F=2 D=3(키) L=4 B=5).
//   한 수(90°) = STEPS_PER_QUARTER 스텝(풀스텝 200 스텝/회전 기준 50). 180° 는 같은 방향으로 2배.
//   사다리꼴 가감속: START_US 로 시작해 스텝마다 ACCEL_US 씩 빨라지고 MIN_US 에서 등속, 끝에서 대칭 감속.
#pragma once
#include <Arduino.h>

enum MotorId : uint8_t { MOT_R = 1, MOT_F = 2, MOT_KEY = 3, MOT_L = 4, MOT_B = 5 };

class Motors {
 public:
  void begin();
  void turn(uint8_t physMove);          // 물리 수 번호 = face*3 + (회전수-1), face ∈ {R F D L B}
  void flip();                          // R·L 을 같은 월드 방향으로 동시에 180° (큐브 x축 뒤집기)
  void setEnabled(bool on) { enabled = on; }  // false 면 모터 신호 없이 즉시 반환 (가상 모드)
  bool isEnabled() const { return enabled; }
  uint16_t lastMoveMs = 0;              // 마지막 수 실행 시간(ms)

 private:
  bool enabled = true;
  void pulse(uint8_t motor, uint16_t gapUs);
  void setDir(bool cw);
};

// 핀 배치 (diagram.json, docs/HARDWARE_V4.md 4절과 함께 바꿀 것) — UNO R3/R4 공통 헤더
static const uint8_t STEP_PINS[6] = {255, 3, 2, 6, 5, 4};   // U(없음) R F KEY L B
static const uint8_t DIR_PIN = 7;
static const uint16_t STEPS_PER_QUARTER = 50;
static const uint16_t START_US = 12000, MIN_US = 8000, ACCEL_US = 100;
static const uint16_t FLIP_US = 9000;      // 뒤집기 중 R/L 한 쌍의 펄스 간격
static const uint8_t SETTLE_MS = 250;      // 면이 멈춘 뒤 다음 수까지 정착 시간
static const bool CW_LEVEL = HIGH;         // DIR 이 이 레벨이면 면이 시계 방향(면을 정면에서 볼 때)
