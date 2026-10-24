#include "motors.h"

void Motors::begin() {
  pinMode(STEP_PIN, OUTPUT); digitalWrite(STEP_PIN, LOW);
  pinMode(DIR_PIN, OUTPUT); digitalWrite(DIR_PIN, LOW);
  pinMode(EN_PIN, OUTPUT); digitalWrite(EN_PIN, LOW);         // 켬 (유지 토크로 컵 위치를 지킨다)
}

void Motors::hold(bool on) { digitalWrite(EN_PIN, on ? LOW : HIGH); }

void Motors::setDir(bool cw) {
  digitalWrite(DIR_PIN, cw ? CW_LEVEL : !CW_LEVEL);
  delayMicroseconds(5);                                       // A4988 DIR 셋업 시간
}

void Motors::pulse(uint16_t gapUs) {
  digitalWrite(STEP_PIN, HIGH);
  delayMicroseconds(3);
  digitalWrite(STEP_PIN, LOW);
  delayMicroseconds(gapUs);
}

void Motors::rotate(uint16_t steps, bool cw) {
  if (!enabled || steps == 0) { lastMoveMs = 0; return; }
  uint32_t t0 = millis();
  setDir(cw);
  uint16_t rampSteps = (START_US - MIN_US) / ACCEL_US;        // 가속에 필요한 스텝 수
  if (rampSteps > steps / 2) rampSteps = steps / 2;
  uint16_t gap = START_US;
  for (uint16_t i = 0; i < steps; i++) {
    pulse(gap);
    if (i < rampSteps) gap -= ACCEL_US;                       // 가속
    else if (steps - i - 1 < rampSteps) gap += ACCEL_US;      // 감속
  }
  delay(SETTLE_MS);
  lastMoveMs = millis() - t0;
}
