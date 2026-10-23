#include "mechanism.h"

void Mechanism::begin(Motors* m) {
  motors = m;
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(SENS_PINS[i], INPUT_PULLUP);
    servo[i].attach(SERVO_PINS[i]);
    servo[i].write(SERVO_RETRACTED_DEG);
  }
}

bool Mechanism::waitSensor(uint8_t pin, bool wantLow) {
  uint32_t t0 = millis();
  uint32_t limit = sensorTimeoutMs ? sensorTimeoutMs : SENSOR_LONG_TIMEOUT_MS;   // T 0 = 시운전용 긴 대기 (최대 60 s)
  while (millis() - t0 < limit) {
    if ((digitalRead(pin) == LOW) == wantLow) return true;
    delay(SENSOR_POLL_MS);
  }
  return false;
}

// 결합: 서보 크랭크 0° → 캐리지 전진 → 스위치가 눌려야 성공. 핀/막대가 소켓에 안 들어가면 스위치가 안 눌린다.
bool Mechanism::engage(uint8_t u) {
  if (engaged[u]) return true;
  Serial.print(F("ENGAGE ")); Serial.println(UNIT_NAME[u]);
  regrips++;
  if (!virt()) {
    servo[u].write(SERVO_ENGAGED_DEG);
    delay(SERVO_TRAVEL_MS);
    if (!waitSensor(SENS_PINS[u], true)) {
      Serial.print(F("ERR ENGAGE ")); Serial.print(UNIT_NAME[u]); Serial.println(F(" timeout"));
      servo[u].write(SERVO_RETRACTED_DEG);               // 안 들어갔다 → 물러나서 상태(후퇴)와 맞춘다
      delay(SERVO_TRAVEL_MS);
      return false;
    }
  }
  engaged[u] = true;
  return true;
}

bool Mechanism::retract(uint8_t u) {
  if (!engaged[u]) return true;
  Serial.print(F("RETRACT ")); Serial.println(UNIT_NAME[u]);
  if (!virt()) {
    servo[u].write(SERVO_RETRACTED_DEG);
    delay(SERVO_TRAVEL_MS);
    if (!waitSensor(SENS_PINS[u], false)) {
      Serial.print(F("ERR RETRACT ")); Serial.print(UNIT_NAME[u]); Serial.println(F(" timeout"));
      return false;
    }
  }
  engaged[u] = false;
  return true;
}

// 뒤집기: R/L 만 결합한 채 D 헤드와 잠금 막대를 내리고 두 헤드를 같은 월드 방향으로 180°
bool Mechanism::flip() {
  Serial.println(F("FLIP"));
  if (!engage(UNIT_RL) || !retract(UNIT_FB) || !retract(UNIT_D) || !retract(UNIT_LOCK)) return false;
  motors->flip();
  orient ^= 1; flips++;
  Serial.print(F("FLIPPED orient=")); Serial.println(orient);
  return true;
}

bool Mechanism::prepare(uint8_t m, uint8_t& physMove) {
  if (!virt() && !loaded) { Serial.println(F("ERR not loaded")); return false; }
  uint8_t f = m / 3, k = m % 3;
  uint8_t p = PHYS[orient][f];
  if (p == 0) { if (!flip()) return false; p = PHYS[orient][f]; }   // 위 면 → 뒤집어 아래 D 헤드로
  bool ok;
  if (p == 2 || p == 5) ok = engage(UNIT_FB) && retract(UNIT_D) && retract(UNIT_RL) && engage(UNIT_LOCK);   // 새 지지 먼저, 그다음 해제, 막대는 항상 위
  else if (p == 1 || p == 4) ok = engage(UNIT_RL) && retract(UNIT_D) && retract(UNIT_FB) && engage(UNIT_LOCK);
  else ok = engage(UNIT_LOCK) && engage(UNIT_D);                     // 막대가 코어를 잡고, 적도 핀은 D 층을 막지 않는다
  if (!ok) return false;
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
