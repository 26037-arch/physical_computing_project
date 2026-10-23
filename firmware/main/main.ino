// main.ino — 3x3 큐브 풀이 로봇 V4 (컴퓨터과학2 피지컬 컴퓨팅)
//
// 보드: Arduino UNO R4 WiFi (실물) / UNO R3 (Wokwi 시뮬레이션, 헤더 핀 배치 동일)
// 기구 (docs/HARDWARE_V4.md): 측면 헤드 4개(F R B L, 적도 엣지 2핀 구동) + 아래 D 헤드(중공축·비킨 모터·벨트, DF/DB 2핀)
//       + 잠금 막대(8 mm 각재, 중공 D 축을 지나 큐브 중심 센터 판 소켓까지 올라와 코어 고정 — V3 중앙축 대신, 뒤집기 때만 내림).
//       이송 유닛 4개(F/B 쌍·R/L 쌍·D·막대)는 서보 크랭크로 결합/후퇴하고 스위치로 확인한다. 위 헤드는 없다.
//       U 면은 큐브를 뒤집어(R/L 180°) 아래 D 헤드로 돌린다.
// 회로: A4988 ×5 (STEP F D2, R D3, B D4, L D5, D D6; DIR 공용 D7), 서보 F/B D8, R/L D9, D D10, 막대 D11,
//       결합 스위치 F/B D12, R/L D13, D A0, 막대 A1, 버튼 1개 A2 (풀업; 짧게 = START, 1.2 s 이상 = LOAD), 부저(A3), LCD1602 I2C(A4/A5)
//
// 동작: [LOAD 길게]  D 헤드를 결합 위치로 올려 큐브를 핀 위에 받고(흰색 면 아래, 손으로 올려놓음), 다시 길게 누르면 막대·F/B 로 잡는다. 장착된 상태에서 길게 누르면 배출.
//       [START 짧게] 모델이 풀린 상태면 섞기, 아니면 풀기 (한 버튼으로 섞기 → 풀기 → 섞기 … 반복).
//       [SCRAMBLE] 로봇이 20수 무작위 섞기를 직접 돌리며 그 수열을 기록한다 → 큐브 상태를 센서 없이 정확히 안다.
//       [SOLVE]    보드 안에서 CFOP(크로스·F2L IDA*, OLL·PLL 표 조회)로 풀이를 계산하고 모터로 실행한다.
//       매 수 앞에서 Mechanism 이 지지 헤드를 바꾸고(새 쌍 결합 → 센서 확인 → 기존 쌍 해제) 필요하면 뒤집는다.
//       결합이 확인되지 않으면 그 수를 돌리지 않고 중단한다 (완료한 수까지의 모델은 보존).
// 시리얼(115200) 접점 규칙 — 모든 명령은 한 줄, 수열은 "R U R' U2" 표기:
//   S [seed]   섞기 (seed 생략 시 micros 기반). 출력: SCRAMBLE seed=<n> (20): <수열>
//   V          풀기. 단계마다 "<이름> (<수>): <수열> | nodes=.. ms=.." 출력 후 TOTAL, 실행, SOLVED ok=1
//   M <수열>   임의 수열 실행 (PC 시뮬레이터·스마트큐브 입력용)
//   L / E / F  장착 한 단계(LOAD 버튼과 같음) / 배출 / 뒤집기(시연용)
//   P          현재 상태 54 스티커 출력 (STATE URRF...) + MECH 상태      R  모델을 풀린 상태로 리셋
//   Q 0|1      가상 모드(1=모터·서보·센서 생략, 절차는 출력)
//   T <ms>     결합/해제 센서 확인 대기 시간 (기본 1500; 시운전·시뮬레이션 지연용)
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "cube.h"
#include "solver.h"
#include "motors.h"
#include "mechanism.h"

static const uint8_t BTN_PIN = A2, BUZZER = A3;      // 버튼 1개 (풀업, GND). 핀이 모자라 짧게/길게로 두 기능
static const unsigned long LONG_PRESS_MS = 1200;
static const uint8_t SCRAMBLE_LEN = 20;
static const unsigned long DEBOUNCE_MS = 30;

LiquidCrystal_I2C lcd(0x27, 16, 2);
Cube cube;
Solver solver;
Motors motors;
Mechanism mech;
uint8_t solution[SOL_MAX];
uint8_t solutionLen = 0;
uint32_t lastSeed = 0;
char line[96];
uint8_t lineLen = 0;

// ---- LCD ----
void lcdShow(const char* row0, const char* row1) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(row0);
  lcd.setCursor(0, 1); lcd.print(row1);
}
void lcdShowF(const __FlashStringHelper* row0, const char* row1) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(row0);
  lcd.setCursor(0, 1); lcd.print(row1);
}

void beep(uint16_t hz, uint16_t ms) { tone(BUZZER, hz, ms); delay(ms); }

// ---- 수열 실행: 지지 전환(+뒤집기) → 물리 수 회전 → 모델 갱신 ----
bool execute(const uint8_t* seq, uint8_t n, const __FlashStringHelper* label) {
  char row1[17];
  for (uint8_t i = 0; i < n; i++) {
    uint8_t phys;
    if (!mech.prepare(seq[i], phys)) {
      Serial.print(F("ABORTED completed=")); Serial.println(i);
      lcdShowF(F("ABORTED"), "state retained");
      beep(220, 400);
      return false;
    }
    motors.turn(phys);
    cube.move(seq[i]);
    if ((i & 3) == 0 || i == n - 1) {
      snprintf(row1, sizeof(row1), "%u/%u", i + 1, n);
      lcdShowF(label, row1);
    }
  }
  return true;
}

void printMechStats() {
  Serial.print(F(" flips=")); Serial.print(mech.flips); Serial.print(F(" regrips=")); Serial.print(mech.regrips);
}

// ---- 섞기 ----
void doScramble(uint32_t seed) {
  uint8_t seq[SCRAMBLE_LEN];
  lastSeed = seed;
  scrambleSeq(seed, seq, SCRAMBLE_LEN);
  Serial.print(F("SCRAMBLE seed=")); Serial.print(seed);
  Serial.print(F(" (")); Serial.print(SCRAMBLE_LEN); Serial.print(F("): "));
  printSeq(Serial, seq, SCRAMBLE_LEN); Serial.println();
  mech.resetCounters();
  uint32_t t0 = millis();
  if (!execute(seq, SCRAMBLE_LEN, F("SCRAMBLING"))) return;
  char row1[17];
  snprintf(row1, sizeof(row1), "seed %lu", (unsigned long)seed);
  lcdShowF(F("SCRAMBLED 20mv"), row1);
  Serial.print(F("SCRAMBLED exec=")); Serial.print(millis() - t0); Serial.print(F("ms"));
  printMechStats(); Serial.println();
  beep(880, 80);
}

// ---- 풀기 ----
void onStage(const char* name, const uint8_t* moves, uint8_t n, uint32_t nodes, uint32_t ms) {
  Serial.print(name); Serial.print(F(" (")); Serial.print(n); Serial.print(F("): "));
  printSeq(Serial, moves, n);
  Serial.print(F(" | nodes=")); Serial.print(nodes); Serial.print(F(" ms=")); Serial.println(ms);
  char row1[17];
  snprintf(row1, sizeof(row1), "%u mv %lu ms", n, (unsigned long)ms);
  lcdShow(name, row1);
}

void doSolve() {
  if (cube.isSolved()) { Serial.println(F("ALREADY SOLVED")); lcdShowF(F("ALREADY SOLVED"), ""); return; }
  Serial.println(F("SOLVING"));  // "SOLVED" 의 접두사가 되지 않도록 (시나리오 매칭)
  lcdShowF(F("SOLVING..."), "cross");
  uint32_t t0 = millis();
  bool ok = solver.solve(cube, solution, solutionLen, onStage);
  uint32_t calcMs = millis() - t0;
  if (!ok) {
    Serial.println(F("SOLVE FAILED (invalid state)"));
    lcdShowF(F("SOLVE FAILED"), "check cube");
    beep(220, 400);
    return;
  }
  Serial.print(F("TOTAL ")); Serial.print(solutionLen); Serial.print(F(": "));
  printSeq(Serial, solution, solutionLen); Serial.println();
  Serial.print(F("CALC nodes=")); Serial.print(solver.nodes); Serial.print(F(" ms=")); Serial.println(calcMs);
  mech.resetCounters();
  t0 = millis();
  if (!execute(solution, solutionLen, F("EXECUTING"))) return;
  uint32_t execMs = millis() - t0;
  bool solved = cube.isSolved();
  Serial.print(F("SOLVED ok=")); Serial.print(solved ? 1 : 0);
  Serial.print(F(" moves=")); Serial.print(solutionLen);
  printMechStats();
  Serial.print(F(" calc=")); Serial.print(calcMs); Serial.print(F("ms exec=")); Serial.print(execMs); Serial.println(F("ms"));
  char row1[17];
  snprintf(row1, sizeof(row1), "%umv %lu.%lus", solutionLen, (unsigned long)((calcMs + execMs) / 1000), (unsigned long)(((calcMs + execMs) % 1000) / 100));
  lcdShowF(solved ? F("SOLVED!") : F("MISMATCH"), row1);
  beep(1047, 100); beep(1319, 100); beep(1568, 160);
}

void printState() {
  char fc[55];
  cube.facelets(fc);
  Serial.print(F("STATE ")); Serial.println(fc);
  mech.printStatus(Serial);
}

// ---- 장착 / 배출 (LOAD 버튼 = 'L') ----
void doLoad() {
  bool wasLoaded = mech.isLoaded();
  if (!mech.load()) { lcdShowF(F("LOAD FAILED"), "check heads"); beep(220, 400); return; }
  if (wasLoaded) lcdShowF(F("REMOVE CUBE"), "LOAD: next cube");
  else if (mech.waitingForCube()) lcdShowF(F("PLACE CUBE: PINS"), "WHITE DOWN > LOAD");
  else { lcdShowF(F("CUBE LOADED"), "SCRAMBLE / SOLVE"); beep(880, 80); }
}
void doEject() {
  if (!mech.isLoaded()) { Serial.println(F("ERR not loaded")); return; }
  if (!mech.eject()) { lcdShowF(F("EJECT FAILED"), "check heads"); beep(220, 400); return; }
  lcdShowF(F("REMOVE CUBE"), "LOAD: next cube");
}

// ---- 시리얼 명령 ----
void handleLine(char* s) {
  while (*s == ' ') s++;
  char cmd = s[0];
  char* arg = s + 1;
  while (*arg == ' ') arg++;
  switch (cmd) {
    case 'S': case 's': doScramble(*arg ? strtoul(arg, nullptr, 10) : (micros() ^ millis())); break;
    case 'V': case 'v': doSolve(); break;
    case 'M': case 'm': {
      uint8_t seq[64];
      uint8_t n = parseSeq(arg, seq, sizeof(seq));
      if (!n) { Serial.println(F("ERR bad moves")); break; }
      mech.resetCounters();
      if (!execute(seq, n, F("MOVING"))) break;
      Serial.print(F("MOVED ")); Serial.print(n); printMechStats(); Serial.println();
      break;
    }
    case 'L': case 'l': doLoad(); break;
    case 'E': case 'e': doEject(); break;
    case 'F': case 'f': if (mech.flip()) lcdShowF(F("FLIPPED"), mech.orient ? "white down" : "white up"); else lcdShowF(F("FLIP FAILED"), "check heads"); break;
    case 'P': case 'p': printState(); break;
    case 'R': case 'r': cube.reset(); Serial.println(F("RESET")); lcdShowF(F("CUBE ROBOT"), "reset"); break;
    case 'Q': case 'q': motors.setEnabled(*arg != '1'); Serial.print(F("MOTORS ")); Serial.println(motors.isEnabled() ? F("ON") : F("OFF")); break;
    case 'T': case 't': mech.sensorTimeoutMs = strtoul(arg, nullptr, 10); Serial.print(F("TIMEOUT ")); Serial.println(mech.sensorTimeoutMs); break;
    case 0: break;
    default: Serial.println(F("ERR unknown command (S V M L E F P R Q T)"));
  }
}

void pollSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (lineLen) { line[lineLen] = 0; handleLine(line); lineLen = 0; }
    } else if (lineLen < sizeof(line) - 1) line[lineLen++] = ch;
  }
}

// ---- 버튼 1개: millis 디바운스. 누른 채 1.2 s 가 지나면 LOAD (누른 동안 1회), 그 전에 떼면 START ----
enum BtnEvent : uint8_t { BTN_NONE = 0, BTN_START = 1, BTN_LOAD = 2 };
bool btnLast = false, btnStable = false, btnFired = false; unsigned long btnChange = 0, btnDown = 0;
uint8_t buttonEvent() {
  bool reading = digitalRead(BTN_PIN) == LOW;
  if (reading != btnLast) { btnChange = millis(); btnLast = reading; }
  if (millis() - btnChange >= DEBOUNCE_MS && reading != btnStable) {
    btnStable = reading;
    if (reading) { btnDown = millis(); btnFired = false; }
    else if (!btnFired) return BTN_START;                       // 짧게 눌렀다 뗌
  }
  if (btnStable && !btnFired && millis() - btnDown >= LONG_PRESS_MS) { btnFired = true; return BTN_LOAD; }
  return BTN_NONE;
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);
  motors.begin();
  mech.begin(&motors);
  lcd.init();
  lcd.backlight();
  lcdShowF(F("CUBE ROBOT V4"), "hold=LOAD tap=GO");
  Serial.println(F("READY cube-robot v4 (S [seed] | V | M <moves> | L | E | F | P | R | Q 0|1)"));
}

void loop() {
  pollSerial();
  switch (buttonEvent()) {
    case BTN_LOAD: doLoad(); break;
    case BTN_START: if (cube.isSolved()) doScramble(micros() ^ millis()); else doSolve(); break;
    default: break;
  }
}
