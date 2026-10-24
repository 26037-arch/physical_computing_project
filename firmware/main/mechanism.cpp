#include "mechanism.h"

void Mechanism::begin(Motors* m) {
  motors = m;
  pinMode(SENSOR_DATA_PIN, INPUT);
  pinMode(SENSOR_CLOCK_PIN, OUTPUT); digitalWrite(SENSOR_CLOCK_PIN, LOW);
  pinMode(SENSOR_LOAD_PIN, OUTPUT); digitalWrite(SENSOR_LOAD_PIN, HIGH);
  for (uint8_t i = 0; i < 4; i++) {
    servo[i].attach(SERVO_PINS[i]);
    servo[i].write(SERVO_RETRACTED_DEG);
    servoAngle[i] = SERVO_RETRACTED_DEG;
  }
}

// Near 74HC165: engaged D0..D5. Far chip: retracted D0..D5.
// Read Q7 BEFORE its rising clock. /CE low, DS of far chip high, /PL shared.
uint16_t Mechanism::readEndstops() {
  digitalWrite(SENSOR_LOAD_PIN, LOW); digitalWrite(SENSOR_LOAD_PIN, HIGH);
  uint16_t bits = 0;
  for (uint8_t i = 0; i < 16; i++) {
    bits = (bits << 1) | (digitalRead(SENSOR_DATA_PIN) == HIGH);
    digitalWrite(SENSOR_CLOCK_PIN, HIGH); digitalWrite(SENSOR_CLOCK_PIN, LOW);
  }
  return bits;
}

// Slew commanded angle at 250 deg/s. This reduces approach speed; it is NOT a force limiter.
void Mechanism::moveServo(uint8_t u, uint8_t target) {
  if (servoAngle[u] == target) { servo[u].write(target); return; }
  while (servoAngle[u] != target) {
    servoAngle[u] += servoAngle[u] < target ? 1 : -1;
    servo[u].write(servoAngle[u]);
    delay(SERVO_STEP_MS);
  }
}

bool Mechanism::confirmed(uint8_t unit, bool wantEngaged) {
  uint16_t bits = readEndstops();
  if ((bits & 0xC0C0) != 0xC0C0) return false; // unused parallel inputs must stay pulled HIGH
  uint8_t mask = UNIT_HEAD_MASKS[unit];
  uint8_t en = bits >> 8, rt = bits;
  return wantEngaged ? (!(en & mask) && (rt & mask) == mask)
                     : (!(rt & mask) && (en & mask) == mask);
}

bool Mechanism::allConfirmed() {
  if (virt()) return true;
  for (uint8_t u=0; u<4; u++) if (!confirmed(u, engaged[u])) {
    Serial.println(F("ERR endstop state")); return false;
  }
  return true;
}

bool Mechanism::waitSensor(uint8_t unit, bool wantEngaged) {
  uint32_t t0 = millis();
  uint32_t limit = sensorTimeoutMs ? sensorTimeoutMs : SENSOR_LONG_TIMEOUT_MS;   // T 0 = 시운전용 긴 대기 (최대 60 s)
  while (millis() - t0 < limit) {
    if (confirmed(unit, wantEngaged)) return true;
    delay(SENSOR_POLL_MS);
  }
  return false;
}

// 결합: 서보 크랭크 0° → 캐리지 전진 → 스위치가 눌려야 성공. 핀/막대가 소켓에 안 들어가면 스위치가 안 눌린다.
bool Mechanism::engage(uint8_t u) {
  if (engaged[u] && (virt() || confirmed(u, true))) return true;
  Serial.print(F("ENGAGE ")); Serial.println(UNIT_NAME[u]);
  regrips++;
  if (!virt()) {
    moveServo(u, SERVO_ENGAGED_DEG);
    if (!waitSensor(u, true)) {
      Serial.print(F("ERR ENGAGE ")); Serial.print(UNIT_NAME[u]); Serial.println(F(" timeout"));
      moveServo(u, SERVO_RETRACTED_DEG);               // 안 들어갔다 → 물러나서 상태(후퇴)와 맞춘다
      return false;
    }
  }
  engaged[u] = true;
  return true;
}

bool Mechanism::retract(uint8_t u) {
  if (!engaged[u] && (virt() || confirmed(u, false))) return true;
  Serial.print(F("RETRACT ")); Serial.println(UNIT_NAME[u]);
  if (!virt()) {
    moveServo(u, SERVO_RETRACTED_DEG);
    if (!waitSensor(u, false)) {
      Serial.print(F("ERR RETRACT ")); Serial.print(UNIT_NAME[u]); Serial.println(F(" timeout"));
      return false;
    }
  }
  engaged[u] = false;
  return true;
}

// Rev D는 코어를 직접 구동하지 못하는 뒤집기를 금지한다.
bool Mechanism::flip() {
  // R/L drive layers, not the core. Never certify a friction-only whole-cube flip.
  Serial.println(F("ERR flip disabled: core not coupled"));
  return false;
}

bool Mechanism::prepare(uint8_t m, uint8_t& physMove) {
  if (!virt() && !loaded) { Serial.println(F("ERR not loaded")); return false; }
  if (!allConfirmed()) return false;
  uint8_t f = m / 3, k = m % 3;
  if (f == FIXED_LOGICAL_FACE) { Serial.println(F("ERR fixed face D")); return false; }
  uint8_t p = PHYS[orient][f];
  if (p == 0) { Serial.println(F("ERR fixed face D")); return false; }   // 헤드 없는 상단
  bool ok;
  if (p == 2 || p == 5) ok = engage(UNIT_FB) && retract(UNIT_D) && retract(UNIT_RL) && engage(UNIT_LOCK);   // 새 지지 먼저, 그다음 해제, 막대는 항상 위
  else if (p == 1 || p == 4) ok = engage(UNIT_RL) && retract(UNIT_D) && retract(UNIT_FB) && engage(UNIT_LOCK);
  else ok = engage(UNIT_LOCK) && engage(UNIT_D);                     // 막대가 코어를 잡고, 적도 핀은 D 층을 막지 않는다
  if (!ok) return false;
  if (!allConfirmed()) return false;
  physMove = p * 3 + k;
  return true;
}

// LOAD 버튼 한 단계. 위가 열려 있으므로 큐브는 손으로 D 헤드의 핀 2개 위에 올려놓는다(흰색 아래).
bool Mechanism::load() {
  if (loaded) return eject();
  if (!engaged[UNIT_D] || engaged[UNIT_FB] || engaged[UNIT_RL] || engaged[UNIT_LOCK]) {   // D 헤드만 결합 위치로
    if (!retract(UNIT_FB) || !retract(UNIT_RL) || !retract(UNIT_LOCK) || !engage(UNIT_D)) return false;
    Serial.println(F("READY TO LOAD"));
    return true;
  }
  if (!engage(UNIT_LOCK) || !engage(UNIT_FB)) return false;          // 막대로 코어를 잡고 F/B 로 층을 잡는다
  loaded = true; orient = INITIAL_ORIENT;
  Serial.print(F("LOADED orient=")); Serial.println(orient);
  return true;
}

bool Mechanism::eject() {
  Serial.println(F("EJECT"));
  if (!engage(UNIT_D) || !retract(UNIT_LOCK) || !retract(UNIT_FB) || !retract(UNIT_RL)) return false;   // 큐브는 D 핀 위에 남는다
  loaded = false;
  Serial.println(F("EJECTED"));
  return true;
}

void Mechanism::printStatus(Print& p) {
  p.print(F("MECH fb=")); p.print(engaged[0]); p.print(F(" rl=")); p.print(engaged[1]);
  p.print(F(" d=")); p.print(engaged[2]); p.print(F(" lock=")); p.print(engaged[3]);
  p.print(F(" orient=")); p.print(orient); p.print(F(" loaded=")); p.print(loaded);
  p.print(F(" flips=")); p.print(flips); p.print(F(" regrips=")); p.println(regrips);
}

// Commissioning: physical closed contacts, independent of cached mechanism state.
void Mechanism::printInputs(Print& p) {
  uint16_t bits=readEndstops();
  p.print(F("SENS order=FBRLDK en="));
  for(uint8_t h=0;h<6;h++)p.print((bits&(uint16_t(1)<<(8+h)))?'0':'1');
  p.print(F(" rt="));
  for(uint8_t h=0;h<6;h++)p.print((bits&(uint16_t(1)<<h))?'0':'1');
  p.print(F(" frame="));p.println((bits&0xC0C0)==0xC0C0?1:0);
}
