// mechanism.h — V4 기구 절차: 이송 유닛 4개(F/B 쌍, R/L 쌍, 아래 D 헤드, 잠금 막대)의 서보 크랭크 결합·후퇴, 뒤집기, 장착/배출
//   규칙은 docs/HARDWARE_V4.md 3절과 같고 sim/mechanism.js 와 동작 순서·출력 줄·횟수(flips/regrips)가 같다.
//   논리 면(풀이기) → 물리 면: orient 0 = 항등, orient 1 = x축 180° 뒤집힘 (U↔D, F↔B). 회전 방향은 그대로.
//   위(U)에는 모터가 없으므로 물리 U 가 필요한 수 앞에는 FLIP 을 끼워 넣어 그 면을 아래 D 헤드로 가져온다.
//   잠금 막대(LOCK)는 아래에서 중공 D 축을 지나 큐브 중심의 센터 판 소켓에 들어가 코어를 고정한다(V3 중앙축 대신).
//   면을 돌리는 동안 항상 올라가 있고 뒤집기 때만 내린다.
//   결합은 유닛마다 마이크로스위치로 확인하며, 확인되지 않으면 그 수를 실행하지 않고 false 를 돌려준다.
//   가상 모드(Motors::isEnabled()==false)에서는 절차를 계획·출력만 하고 서보·센서·스텝은 건너뛴다.
#pragma once
#include <Arduino.h>
#include <Servo.h>
#include "motors.h"

enum Unit : uint8_t { UNIT_FB = 0, UNIT_RL = 1, UNIT_D = 2, UNIT_LOCK = 3 };

class Mechanism {
 public:
  void begin(Motors* m);
  bool prepare(uint8_t logicalMove, uint8_t& physMove);   // 지지 전환(+뒤집기) 후 돌릴 물리 수 번호
  bool flip();                                             // 큐브 x축 180° (R/L 결합, 나머지 해제, 막대 내림)
  bool load();                                             // LOAD 버튼 한 단계 (비어 있음→D 결합·큐브 대기 / 올려놓음→막대·F/B 결합 / 장착됨→배출)
  bool eject();
  bool isLoaded() const { return loaded; }
  bool waitingForCube() const { return !loaded && engaged[UNIT_D]; }
  void resetCounters() { flips = 0; regrips = 0; }
  void printStatus(Print& p);
  uint8_t orient = 1;          // 장착은 흰색(U) 면을 아래로 → 논리 U 가 아래 D 헤드
  uint16_t flips = 0, regrips = 0;
  uint16_t sensorTimeoutMs = 1500;   // 결합/해제 확인 대기 ms (시리얼 T 명령으로 조정; 0 = 최대 60 s 대기, 시운전·Wokwi 시나리오 지연용)

 private:
  Motors* motors = nullptr;
  Servo servo[4];
  bool engaged[4] = {false, false, false, false};
  bool loaded = false;
  bool virt() const { return !motors->isEnabled(); }
  bool engage(uint8_t unit);
  bool retract(uint8_t unit);
  bool waitSensor(uint8_t pin, bool wantLow);
};

// 핀 배치 (diagram.json, docs/HARDWARE_V4.md 4절) — UNO R3/R4 공통 헤더
static const uint8_t SERVO_PINS[4] = {8, 9, 10, 11};     // F·B 서보 2개 같은 신호, R·L 2개 같은 신호, D 서보, 막대 서보
static const uint8_t SENS_PINS[4] = {12, 13, A0, A1};    // F·B / R·L 결합 스위치 직렬 (둘 다 눌림 = LOW), D 스위치, 막대 스위치. 풀업
static const uint8_t SERVO_ENGAGED_DEG = 0, SERVO_RETRACTED_DEG = 180;   // 크랭크 r12 → 24 mm (막대는 r15 → 30 mm)
// 제작 보강 Rev A: 프레임/체결/가이드 보강, 막대 끝 -23.8 mm·중공 ID12.5.
// 캐리지 행정24/30과 위 서보 각도는 동일(막대의 캐리지 내 고정 위치로 끝을 조절).
static const uint16_t SERVO_TRAVEL_MS = 400;      // 이송 명목 시간
