// mechanism.h — V4 Rev D: 이송 유닛 4개의 결합·후퇴, 상단 고정 운전, 장착/배출
//   규칙은 docs/HARDWARE_V4.md 3절과 같고 sim/mechanism.js 와 동작 순서·출력 줄·횟수(flips/regrips)가 같다.
//   논리 면(풀이기) → 물리 면: orient 0 = 항등, orient 1 = x축 180° 뒤집힘 (U↔D, F↔B). 회전 방향은 그대로.
//   Rev D는 흰색 U가 아래인 orient=1에서 논리D(물리상단)를 고정한다. 뒤집기는 거부한다.
//   각 모듈의 결합/후퇴 끝을74HC165 두 개로 독립 확인하며 센서12개를 사용한다.
//   1도/4ms 서보 지령은 접근 속도를 낮추지만 힘 피드백/과부하 제한 기능이 아니다.
#pragma once
#include <Arduino.h>
#include <Servo.h>
#include "motors.h"

enum Unit : uint8_t { UNIT_FB = 0, UNIT_RL = 1, UNIT_D = 2, UNIT_LOCK = 3 };

class Mechanism {
 public:
  void begin(Motors* m);
  bool prepare(uint8_t logicalMove, uint8_t& physMove);   // 끝 상태 확인·지지 전환 후 물리 수 번호
  bool flip();                                         // Rev D에서는 항상 거부, 펄스 없음
  bool load();                                             // LOAD 버튼 한 단계 (비어 있음→D 결합·큐브 대기 / 올려놓음→막대·F/B 결합 / 장착됨→배출)
  bool eject();
  bool isLoaded() const { return loaded; }
  bool waitingForCube() const { return !loaded && engaged[UNIT_D]; }
  void resetCounters() { flips = 0; regrips = 0; }
  void printStatus(Print& p);
  void printInputs(Print& p);
  bool atEnd(uint8_t unit, bool engaged) { return unit < 4 && confirmed(unit, engaged); } // diagnostic, reads both ends
  uint8_t orient = RobotContract::INITIAL_ORIENT;          // 장착은 흰색(U) 면을 아래로 → 논리 U 가 아래 D 헤드
  uint16_t flips = 0, regrips = 0;
  uint16_t sensorTimeoutMs = RobotContract::SENSOR_TIMEOUT_MS;   // 결합/해제 확인 대기 ms (시리얼 T 명령으로 조정; 0 = 최대 60 s 대기, 시운전·Wokwi 시나리오 지연용)

 private:
  Motors* motors = nullptr;
  Servo servo[4];
  uint8_t servoAngle[4] = {SERVO_RETRACTED_DEG,SERVO_RETRACTED_DEG,SERVO_RETRACTED_DEG,SERVO_RETRACTED_DEG};
  void moveServo(uint8_t unit, uint8_t target);
  bool engaged[4] = {INITIAL_ENGAGED[0], INITIAL_ENGAGED[1], INITIAL_ENGAGED[2], INITIAL_ENGAGED[3]};
  bool loaded = RobotContract::INITIAL_LOADED;
  bool virt() const { return !motors->isEnabled(); }
  bool engage(uint8_t unit);
  bool retract(uint8_t unit);
  bool waitSensor(uint8_t unit, bool wantEngaged);
  uint16_t readEndstops();
  bool confirmed(uint8_t unit, bool engaged);
  bool allConfirmed();
};

// Rev C: 6 mm 막대 끝−22.5, 핀 삽입4.8. 행정24/30과 서보각은 공통 계약을 쓴다.
