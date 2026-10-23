#include "motors.h"

void Motors::begin() {
  for (uint8_t i = 1; i < 6; i++) { pinMode(STEP_PINS[i], OUTPUT); digitalWrite(STEP_PINS[i], LOW); }
  pinMode(DIR_PIN, OUTPUT); digitalWrite(DIR_PIN, LOW);
}

void Motors::setDir(bool cw) {
  digitalWrite(DIR_PIN, cw ? CW_LEVEL : !CW_LEVEL);
  delayMicroseconds(DIR_SETUP_US);                                       // A4988 DIR 셋업 시간
}

void Motors::pulse(uint8_t motor, uint16_t gapUs) {
  digitalWrite(STEP_PINS[motor], HIGH);
  delayMicroseconds(PULSE_US);
  digitalWrite(STEP_PINS[motor], LOW);
  delayMicroseconds(gapUs);
}

void Motors::turn(uint8_t m) {
  uint8_t face = m / 3, k = m % 3;
  if (!enabled || face == 0 || face > 5) { lastMoveMs = 0; return; }
  uint32_t t0 = millis();
  bool cw = (k != 2);                                         // R, R2 는 시계, R' 는 반시계
  uint16_t steps = (k == 1) ? 2 * STEPS_PER_QUARTER : STEPS_PER_QUARTER;
  setDir(cw);
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

// 큐브 x축 180° 뒤집기: R 면 시계(= −x 회전) + L 면 반시계(= −x 회전) 를 번갈아 한 스텝씩.
// 두 층이 같은 월드 방향으로 돌아 큐브 전체가 돈다 (M 슬라이스는 마찰로 따라온다 — 실물 시험 항목).
void Motors::flip() {
  if (!enabled) return;
  for (uint16_t i = 0; i < 2 * STEPS_PER_QUARTER; i++) {
    setDir(true);  pulse(MOT_R, FLIP_PAIR_GAP_US);
    setDir(false); pulse(MOT_L, FLIP_US);
  }
  delay(SETTLE_MS);
}
