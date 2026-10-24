#include "mechanism.h"

static const char HOOD_NAME[3][6] = {"CLOSE", "OPEN", "LOAD"};
static const char SPIN_NAME[4][3] = {"", "y", "y2", "y'"};
static const char TURN_NAME[3][3] = {"D", "D2", "D'"};
static const uint8_t ORI_START[6] = {3, 4, 2, 0, 1, 5};   // 장착 = z2: 흰색(논리 U) 아래, 초록(논리 F) 앞
// 물리 위치별 재배향: 0 = 끝, 1..3 = SPIN y^k, 9 = FLIP (sim/mechanism.js REORIENT 와 같은 순서)
static const uint8_t REORIENT[6][3] = {
  {9, 9, 0},   // U: FLIP FLIP
  {1, 9, 0},   // R: SPIN y, FLIP
  {9, 0, 0},   // F: FLIP
  {0, 0, 0},   // D: 없음
  {3, 9, 0},   // L: SPIN y', FLIP
  {2, 9, 0},   // B: SPIN y2, FLIP
};

void Mechanism::resetOri() { for (uint8_t i = 0; i < 6; i++) ori[i] = ORI_START[i]; }

void Mechanism::begin(Motors* m) {
  motors = m;
  resetOri();
  hood.attach(HOOD_SERVO_PIN);
  lift.attach(LIFT_SERVO_PIN);
  hood.write(hoodDeg[HOOD_OPEN]);
  lift.write(LIFT_DOWN_DEG);
  hoodPos = HOOD_OPEN;
}

// 서보를 20 ms 간격으로 조금씩 옮겨 준정적으로 움직인다 (리프터가 큐브를 천천히 끌어올리도록)
void Mechanism::sweep(Servo& s, uint8_t from, uint8_t to, uint16_t ms) {
  uint8_t n = ms / 20; if (n == 0) n = 1;
  for (uint8_t i = 1; i <= n; i++) {
    s.write(from + ((int16_t)to - from) * i / n);
    delay(20);
  }
}

void Mechanism::setHood(uint8_t pos) {
  if (hoodPos == pos) return;
  Serial.print(F("HOOD ")); Serial.println(HOOD_NAME[pos]);
  hoods++;
  if (!virt()) { hood.write(hoodDeg[pos]); delay(HOOD_MS); }
  hoodPos = pos;
}

// 큐브 전체 y^k: 후드를 열고 컵을 위에서 봐서 시계 방향으로 k×90° (y' 는 반시계 1회)
bool Mechanism::spin(uint8_t k) {
  if (!virt() && !loaded) { Serial.println(F("ERR not loaded")); return false; }
  setHood(HOOD_OPEN);
  for (uint8_t i = 0; i < k; i++) {                      // y: F←R, L←F, B←L, R←B
    uint8_t r = ori[1], f = ori[2], l = ori[4], b = ori[5];
    ori[2] = r; ori[4] = f; ori[5] = l; ori[1] = b;
  }
  spins++;
  Serial.print(F("SPIN ")); Serial.println(SPIN_NAME[k]);
  if (k == 3) motors->rotate(STEPS_PER_QUARTER, false);
  else motors->rotate(STEPS_PER_QUARTER * k, true);
  return true;
}

// 뒤집기 x': 후드 70° → 리프터가 뒤쪽 아래 모서리를 끌어올려 큐브가 앞으로 넘어진다 → 리프터 내림 → 후드 60°
bool Mechanism::flip() {
  if (!virt() && !loaded) { Serial.println(F("ERR not loaded")); return false; }
  setHood(HOOD_OPEN);
  uint8_t u = ori[0], f = ori[2], d = ori[3], b = ori[5];
  ori[3] = f; ori[5] = d; ori[0] = b; ori[2] = u;
  flips++;
  Serial.println(F("FLIP"));
  if (!virt()) {
    hood.write(hoodFlipDeg); delay(HOOD_MS / 2);
    sweep(lift, LIFT_DOWN_DEG, liftUpDeg, LIFT_UP_MS);
    delay(FLIP_SETTLE_MS);                                 // 큐브가 자리에 떨어질 시간
    sweep(lift, liftUpDeg, LIFT_DOWN_DEG, LIFT_DOWN_MS);
    hood.write(hoodDeg[HOOD_OPEN]); delay(HOOD_MS / 2);
  }
  return true;
}

bool Mechanism::doMove(uint8_t m) {
  if (!virt() && !loaded) { Serial.println(F("ERR not loaded")); return false; }
  uint8_t f = m / 3, k = m % 3;
  uint8_t p = 0;
  while (p < 6 && ori[p] != f) p++;
  for (uint8_t i = 0; i < 3 && REORIENT[p][i]; i++) {
    uint8_t op = REORIENT[p][i];
    if (op == 9) { if (!flip()) return false; }
    else if (!spin(op)) return false;
  }
  setHood(HOOD_CLOSE);
  Serial.print(F("TURN ")); Serial.println(TURN_NAME[k]);
  // D = 아래에서 봐서 시계 = 컵을 위에서 봐서 반시계. k 0: 1/4 반시계, 1: 1/2, 2: 1/4 시계
  bool cw = (k == 2);
  uint16_t steps = (k == 1) ? 2 * STEPS_PER_QUARTER : STEPS_PER_QUARTER;
  if (!virt()) {
    motors->rotate(steps + overshootSteps, cw);
    if (overshootSteps) motors->rotate(overshootSteps, !cw);
  }
  return true;
}

// LOAD 버튼 한 단계. 후드를 뒤로 젖힌 LOAD 자세에서 큐브를 위에서 내려놓는다(흰색 아래, 초록 앞).
bool Mechanism::load() {
  if (loaded) return eject();
  if (hoodPos != HOOD_LOAD) {
    setHood(HOOD_LOAD);
    if (!virt()) lift.write(LIFT_DOWN_DEG);
    Serial.println(F("READY TO LOAD"));
    return true;
  }
  setHood(HOOD_OPEN);
  loaded = true; resetOri();
  Serial.println(F("LOADED"));
  return true;
}

bool Mechanism::eject() {
  Serial.println(F("EJECT"));
  setHood(HOOD_LOAD);
  loaded = false;
  Serial.println(F("EJECTED"));
  return true;
}

void Mechanism::printStatus(Print& p) {
  static const char FACE[6] = {'U', 'R', 'F', 'D', 'L', 'B'};
  p.print(F("MECH hood=")); p.print(HOOD_NAME[hoodPos]); p.print(F(" ori="));
  for (uint8_t i = 0; i < 6; i++) p.print(FACE[ori[i]]);
  p.print(F(" loaded=")); p.print(loaded);
  p.print(F(" flips=")); p.print(flips); p.print(F(" spins=")); p.print(spins); p.print(F(" hoods=")); p.println(hoods);
}
