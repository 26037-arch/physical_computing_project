// motors.h — 6면 직결 스텝모터 제어 (A4988 STEP/DIR ×6)
//   면 순서 U R F D L B 가 STEP_PINS/DIR_PINS 의 인덱스. V3 F/B는 40T:40T 벨트, 나머지 면은 직접 핀 구동한다.
//   한 수(90°) = STEPS_PER_QUARTER 스텝(풀스텝 200 스텝/회전 기준 50). 180° 는 같은 방향으로 2배.
//   사다리꼴 가감속: START_US 로 시작해 스텝마다 ACCEL_US 씩 빨라지고 MIN_US 에서 등속, 끝에서 대칭 감속.
#pragma once
#include <Arduino.h>

class Motors {
 public:
  void begin();
  void turn(uint8_t m);                 // 수 번호 m = face*3 + (회전수-1)
  void setEnabled(bool on) { enabled = on; }  // false 면 모터 신호 없이 즉시 반환 (계산 벤치마크용)
  bool isEnabled() const { return enabled; }
  uint16_t lastMoveMs = 0;              // 마지막 수 실행 시간(ms)

 private:
  bool enabled = true;
  void pulse(uint8_t face, uint16_t gapUs);
};

// 핀 배치 (diagram.json 과 함께 바꿀 것) — UNO R3/R4 공통 헤더
static const uint8_t STEP_PINS[6] = {2, 3, 4, 5, 6, 7};
static const uint8_t DIR_PINS[6] = {8, 9, 10, 11, 12, 13};
static const uint16_t STEPS_PER_QUARTER = 50;
static const uint16_t START_US = 12000, MIN_US = 8000, ACCEL_US = 100;
static const uint8_t SETTLE_MS = 250;      // 면이 멈춘 뒤 다음 수까지 정착 시간
static const bool CW_LEVEL = HIGH;        // DIR 이 이 레벨이면 면이 시계 방향(면을 정면에서 볼 때)
