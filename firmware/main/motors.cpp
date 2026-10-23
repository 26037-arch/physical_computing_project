#include "motors.h"

void Motors::begin() {
  for (uint8_t i = 0; i < 6; i++) {
    pinMode(STEP_PINS[i], OUTPUT); digitalWrite(STEP_PINS[i], LOW);
    pinMode(DIR_PINS[i], OUTPUT); digitalWrite(DIR_PINS[i], LOW);
  }
}

void Motors::pulse(uint8_t face, uint16_t gapUs) {
  digitalWrite(STEP_PINS[face], HIGH);
  delayMicroseconds(3);
  digitalWrite(STEP_PINS[face], LOW);
  delayMicroseconds(gapUs);
}

void Motors::turn(uint8_t m) {
  uint8_t face = m / 3, k = m % 3;
  if (!enabled) { lastMoveMs = 0; return; }
  uint32_t t0 = millis();
  bool cw = (k != 2);                                         // U, U2 는 시계, U' 는 반시계
  uint16_t steps = (k == 1) ? 2 * STEPS_PER_QUARTER : STEPS_PER_QUARTER;
  digitalWrite(DIR_PINS[face], cw ? CW_LEVEL : !CW_LEVEL);
  delayMicroseconds(5);                                       // A4988 DIR 셋업 시간

  uint16_t rampSteps = (START_US - MIN_US) / ACCEL_US;        // 가속에 필요한 스텝 수
  if (rampSteps > steps / 2) rampSteps = steps / 2;
  uint16_t gap = START_US;
  for (uint16_t i = 0; i < steps; i++) {
    pulse(face, gap);
    if (i < rampSteps) gap -= ACCEL_US;                       // 가속
    else if (steps - i - 1 < rampSteps) gap += ACCEL_US;      // 감속
  }
  delay(SETTLE_MS);
  lastMoveMs = millis() - t0;
}
