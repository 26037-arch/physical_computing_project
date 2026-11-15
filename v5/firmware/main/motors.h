// motors.h — V5 스텝모터 제어: 컵(홀더) 모터 1개(NEMA17 + A4988 직결). 후드 닫힘이면 아래 층, 열림이면 큐브 전체가 돈다.
//   A4988 은 1/4 마이크로스텝(MS2 → 5 V): 90° = STEPS_PER_QUARTER = 200 스텝, 1 스텝 = 0.45°.
//     풀스텝(1.8°)으로는 컵 여유(±2.05°)·전원 인가 때 로터가 튀는 양(최대 ±3.6°)을 보정할 수 없고 저속 공진이 크다.
//     MS2 를 꽂지 않은 풀스텝 배선이면 MICROSTEP 을 1 로 바꾼다(다른 상수는 따라 바뀐다).
//   등가속 램프(D. Austin 2005: c0 = 0.676·√(2/a), c_n = c_{n-1} − 2·c_{n-1}/(4n+1)): 가속도가 전 구간에서 같아
//     토크가 가장 작은 고속 구간에 부하가 몰리지 않는다(탈조 = 영구 위치 오차를 막는 첫 번째 수단 — 센서가 없다).
//     남은 스텝이 지금까지 가속한 스텝 수 이하가 되면 같은 곡선을 거꾸로 따라 감속한다. 90° 약 0.2 s, 180° 약 0.3 s.
//   컵·후드 여유를 흡수하는 오버슈트·중심 맞춤 왕복은 Mechanism 이 한다 (mechanism.h).
//   방향: CW_LEVEL 이면 컵이 위에서 봐서 시계 방향 (docs/HARDWARE_V5.md 3.2절). 실물 배선에 따라 한 줄로 반전.
#pragma once
#include <Arduino.h>

class Motors {
 public:
  void begin();
  void rotate(uint16_t steps, bool cwFromAbove);   // 등가속 회전 후 바로 반환 — 정착 지연은 호출자가 준다 (가상 모드면 즉시 반환)
  void setEnabled(bool on) { enabled = on; }       // false 면 모터 신호 없이 즉시 반환 (가상 모드)
  bool isEnabled() const { return enabled; }
  void hold(bool on);                              // A4988 ENABLE (LOW = 켬). 끄면 로터가 풀려 컵 영점을 잃는다 — 운전 중에는 끄지 않는다
  uint16_t lastMoveMs = 0;                         // 마지막 회전 시간(ms)

 private:
  bool enabled = true;
  void pulse(uint16_t gapUs);
  void setDir(bool cw);
};

// 핀 배치 (diagram.json, docs/HARDWARE_V5.md 4절과 함께 바꿀 것) — UNO R3/R4 공통 헤더
static const uint8_t STEP_PIN = 2, DIR_PIN = 7, EN_PIN = 6;
static const uint8_t MICROSTEP = 4;                               // A4988 MS1/MS2/MS3 = L/H/L (1/4 스텝)
static const uint16_t STEPS_PER_QUARTER = 50 * MICROSTEP;         // 90°
static const uint16_t MAX_SPS = 500 * MICROSTEP;                  // 최고 속도 (스텝/s) = 150 rpm
static const uint32_t ACCEL_SPS2 = 5000UL * MICROSTEP;            // 가속도 (스텝/s²) = 157 rad/s² → 큐브+컵 관성 토크 약 0.013 N·m
static const uint16_t MIN_US = 1000000UL / MAX_SPS;               // 등속 구간 스텝 간격 500 µs
static const uint16_t START_US = (uint16_t)(676000.0 * sqrt(2.0 / ACCEL_SPS2));   // 첫 스텝 간격 c0 = 6760 µs (delayMicroseconds 한계 16383 안)
static const bool CW_LEVEL = HIGH;         // DIR 이 이 레벨이면 컵이 위에서 봐서 시계 방향
