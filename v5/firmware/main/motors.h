// motors.h — V5 스텝모터 제어: 컵(홀더) 모터 1개(NEMA17 + A4988 직결). 후드 닫힘이면 아래 층, 열림이면 큐브 전체가 돈다.
//   90° = STEPS_PER_QUARTER 스텝(풀스텝 200 스텝/회전 기준 50). 사다리꼴 가감속: START_US 로 시작해 스텝마다 ACCEL_US 씩
//   빨라지고 MIN_US 에서 등속, 끝에서 대칭 감속. 층 회전은 Mechanism 이 오버슈트 스텝을 더 돌렸다 되돌려 컵·후드 여유(1.0/1.5 mm)를 흡수한다.
//   방향: CW_LEVEL 이면 컵이 위에서 봐서 시계 방향 (docs/HARDWARE_V5.md 3.2절). 실물 배선에 따라 한 줄로 반전.
#pragma once
#include <Arduino.h>

class Motors {
 public:
  void begin();
  void rotate(uint16_t steps, bool cwFromAbove);   // 가감속 회전 (가상 모드면 즉시 반환)
  void setEnabled(bool on) { enabled = on; }       // false 면 모터 신호 없이 즉시 반환 (가상 모드)
  bool isEnabled() const { return enabled; }
  void hold(bool on);                              // A4988 ENABLE (LOW = 켬). 대기 중 유지 전류를 끊을 때
  uint16_t lastMoveMs = 0;                         // 마지막 회전 시간(ms)

 private:
  bool enabled = true;
  void pulse(uint16_t gapUs);
  void setDir(bool cw);
};

// 핀 배치 (diagram.json, docs/HARDWARE_V5.md 4절과 함께 바꿀 것) — UNO R3/R4 공통 헤더
static const uint8_t STEP_PIN = 2, DIR_PIN = 7, EN_PIN = 6;
static const uint16_t STEPS_PER_QUARTER = 50;
static const uint16_t START_US = 4000, MIN_US = 1500, ACCEL_US = 100;   // 램프 25 스텝, 90° 약 0.15 s + 정착
static const uint8_t SETTLE_MS = 150;      // 컵이 멈춘 뒤 다음 동작까지 정착 시간
static const bool CW_LEVEL = HIGH;         // DIR 이 이 레벨이면 컵이 위에서 봐서 시계 방향
