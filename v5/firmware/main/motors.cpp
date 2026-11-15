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

// 등가속 사다리꼴. c = 스텝 간격(1/16 µs 고정소수), n = 지금 속도까지 가속한 스텝 수(= 멈추는 데 필요한 스텝 수).
void Motors::rotate(uint16_t steps, bool cw) {
  if (!enabled || steps == 0) { lastMoveMs = 0; return; }
  uint32_t t0 = millis();
  setDir(cw);
  const uint32_t cMin = (uint32_t)MIN_US << 4;
  uint32_t c = (uint32_t)START_US << 4;
  uint16_t n = 0;
  for (uint16_t left = steps; left > 0; left--) {
    pulse((uint16_t)(c >> 4));
    uint16_t r = left - 1;                                    // 남은 펄스 수
    if (r <= n) {                                             // 남은 스텝으로 멈춰야 한다: 감속
      if (n) { c += 2 * c / (4UL * n - 1); n--; }
    } else if (r >= n + 2 && c > cMin) {                      // 가속 — 한 단계 올려도 같은 곡선으로 내려올 스텝이 남을 때만
                                                              //   (짝수 짧은 이동도 첫·끝 간격이 같아진다. MIN_US 에 닿으면 등속)
      n++; c -= 2 * c / (4UL * n + 1);
      if (c < cMin) c = cMin;
    }
  }
  lastMoveMs = millis() - t0;
}
