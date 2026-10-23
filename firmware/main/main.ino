// main.ino — 3x3 큐브 풀이 로봇 (컴퓨터과학2 피지컬 컴퓨팅)
//
// 보드: Arduino UNO R4 WiFi (실물) / UNO R3 (Wokwi 시뮬레이션, 헤더 핀 배치 동일)
// 회로: A4988 ×6 (STEP D2~D7, DIR D8~D13) → NEMA17 ×6 (U R F D L B V3 핀 구동; F/B 중공축 벨트 1:1)
//       LCD1602 I2C (A4/A5, 0x27), 버튼 SCRAMBLE(A0)·SOLVE(A1) 풀업, 부저(A2)
//
// 동작: [SCRAMBLE] 로봇이 20수 무작위 섞기를 직접 돌리며 그 수열을 기록한다 → 큐브 상태를 센서 없이 정확히 안다.
//       [SOLVE]    보드 안에서 CFOP(크로스·F2L IDA*, OLL·PLL 표 조회)로 풀이를 계산하고 모터로 실행한다.
// 시리얼(115200) 접점 규칙 — 모든 명령은 한 줄, 수열은 "R U R' U2" 표기:
//   S [seed]   섞기 (seed 생략 시 micros 기반). 출력: SCRAMBLE seed=<n> (20): <수열>
//   V          풀기. 단계마다 "<이름> (<수>): <수열> | nodes=.. ms=.." 출력 후 TOTAL, 실행, SOLVED ok=1
//   M <수열>   임의 수열 실행 (PC 시뮬레이터·스마트큐브 입력용)
//   P          현재 상태 54 스티커 출력 (STATE URRF...)      R  모델을 풀린 상태로 리셋
//   Q 0|1      모터 생략 모드(1=계산만, 벤치마크용)
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "cube.h"
#include "solver.h"
#include "motors.h"

static const uint8_t BTN_SCRAMBLE = A0, BTN_SOLVE = A1, BUZZER = A2;
static const uint8_t SCRAMBLE_LEN = 20;
static const unsigned long DEBOUNCE_MS = 30;

LiquidCrystal_I2C lcd(0x27, 16, 2);
Cube cube;
Solver solver;
Motors motors;
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

// V3 manual commissioning. Confirmation is operator evidence, not a sensor.
// Q 1 is explicitly virtual: no motor pulse and no mechanical acknowledgement.
bool prepareMove(uint8_t m) {
  if (!motors.isEnabled()) return true;
  static const char faces[] = "URFDLB";
  static const uint8_t opposite[] = {3,4,5,0,1,2};
  const uint8_t f = m / 3, o = opposite[f];
  while (Serial.available()) Serial.read(); // reject stale confirmations
  Serial.print(F("PREPARE ")); Serial.print(faces[f]);
  if (m % 3 == 1) Serial.print('2');
  if (m % 3 == 2) Serial.print('\'');
  Serial.print(F(": ENGAGE ")); Serial.print(faces[f]); Serial.print(faces[o]);
  Serial.print(F("; LOCK ")); Serial.print(faces[o]);
  Serial.print(F("; PARK ")); Serial.print(faces[f]);
  Serial.println(F("; RETRACT others >=24mm; H=confirm X=abort (180s)"));
  lcdShowF(F("MANUAL PREPARE"), "H:run X:abort");
  uint32_t started = millis();
  char ack = 0; bool bad = false;
  while (millis() - started < 180000UL) {
    if (!Serial.available()) { delay(1); continue; }
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (!bad && (ack == 'H' || ack == 'h')) return true;
      if (!bad && (ack == 'X' || ack == 'x')) return false;
      ack = 0; bad = false;
    } else if (c != ' ' && c != '\t') {
      if (ack) bad = true; else ack = c;
    }
  }
  Serial.println(F("ERR manual confirmation timeout"));
  return false;
}

// ---- 수열 실행: 승인한 한 수만 돌리고 모델 갱신 ----
bool execute(const uint8_t* seq, uint8_t n, const __FlashStringHelper* label) {
  char row1[17];
  for (uint8_t i = 0; i < n; i++) {
    if (!prepareMove(seq[i])) {
      Serial.print(F("ABORTED completed=")); Serial.println(i);
      lcdShowF(F("ABORTED"), "state retained");
      return false;
    }
    motors.turn(seq[i]);
    cube.move(seq[i]);
    if ((i & 3) == 0 || i == n - 1) {
      snprintf(row1, sizeof(row1), "%u/%u", i + 1, n);
      lcdShowF(label, row1);
    }
  }
  return true;
}

// ---- 섞기 ----
void doScramble(uint32_t seed) {
  uint8_t seq[SCRAMBLE_LEN];
  lastSeed = seed;
  scrambleSeq(seed, seq, SCRAMBLE_LEN);
  Serial.print(F("SCRAMBLE seed=")); Serial.print(seed);
  Serial.print(F(" (")); Serial.print(SCRAMBLE_LEN); Serial.print(F("): "));
  printSeq(Serial, seq, SCRAMBLE_LEN); Serial.println();
  uint32_t t0 = millis();
  if (!execute(seq, SCRAMBLE_LEN, F("SCRAMBLING"))) return;
  char row1[17];
  snprintf(row1, sizeof(row1), "seed %lu", (unsigned long)seed);
  lcdShowF(F("SCRAMBLED 20mv"), row1);
  Serial.print(F("SCRAMBLED exec=")); Serial.print(millis() - t0); Serial.println(F("ms"));
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
  t0 = millis();
  if (!execute(solution, solutionLen, F("EXECUTING"))) return;
  uint32_t execMs = millis() - t0;
  bool solved = cube.isSolved();
  Serial.print(F("SOLVED ok=")); Serial.print(solved ? 1 : 0);
  Serial.print(F(" moves=")); Serial.print(solutionLen);
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
      if (!execute(seq, n, F("MOVING"))) break;
      Serial.print(F("MOVED ")); Serial.println(n);
      break;
    }
    case 'P': case 'p': printState(); break;
    case 'R': case 'r': cube.reset(); Serial.println(F("RESET")); lcdShowF(F("CUBE ROBOT"), "reset"); break;
    case 'Q': case 'q': motors.setEnabled(*arg != '1'); Serial.print(F("MOTORS ")); Serial.println(motors.isEnabled() ? F("ON") : F("OFF")); break;
    case 0: break;
    default: Serial.println(F("ERR unknown command (S V M P R Q)"));
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

// ---- 버튼 (millis 디바운스, 누르는 순간 1회) ----
struct Button {
  uint8_t pin; bool lastReading; bool stable; unsigned long lastChange;
  explicit Button(uint8_t p) : pin(p), lastReading(false), stable(false), lastChange(0) {}
  bool pressed() {
    bool reading = digitalRead(pin) == LOW;
    if (reading != lastReading) { lastChange = millis(); lastReading = reading; }
    if (millis() - lastChange >= DEBOUNCE_MS && reading != stable) { stable = reading; return stable; }
    return false;
  }
};
Button btnScramble(BTN_SCRAMBLE), btnSolve(BTN_SOLVE);

void setup() {
  Serial.begin(115200);
  pinMode(BTN_SCRAMBLE, INPUT_PULLUP);
  pinMode(BTN_SOLVE, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);
  motors.begin();
  lcd.init();
  lcd.backlight();
  lcdShowF(F("CUBE ROBOT"), "SCRAMBLE / SOLVE");
  Serial.println(F("READY cube-robot v3 MANUAL H=confirm X=abort (S [seed] | V | M <moves> | P | R | Q 0|1)"));
}

void loop() {
  pollSerial();
  if (btnScramble.pressed()) doScramble(micros() ^ millis());
  if (btnSolve.pressed()) doSolve();
}
