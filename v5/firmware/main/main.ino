// main.ino — 3x3 큐브 풀이 로봇 V5 (컴퓨터과학2 피지컬 컴퓨팅)
//
// 보드: Arduino UNO R4 WiFi (실물) / UNO R3 (Wokwi 시뮬레이션, 헤더 핀 배치 동일)
// 기구 (docs/HARDWARE_V5.md): 시중 57 mm 큐브를 20° 기울어진 컵(홀더)에 넣는다. 컵은 NEMA17 직결 —
//       후드(MG996R)가 닫혀 위 두 층을 잡으면 아래 층이 돌고(TURN), 열려 있으면 큐브 전체가 돈다(SPIN y).
//       리프터(SG90, 직선 슬롯 크랭크)가 뒤쪽 아래 모서리를 끌어올려 큐브를 앞으로 넘긴다(FLIP = x').
//       모든 층 회전은 아래에서만 하므로 논리 면을 아래로 가져오는 재배향(스핀·뒤집기)을 Mechanism 이 끼워 넣는다.
// 회로: A4988 ×1 (STEP D2, DIR D7, EN D6), 후드 서보 D8, 리프터 서보 D9,
//       버튼 1개 A2 (풀업; 짧게 = START, 1.2 s 이상 = LOAD), 부저 A3, LCD1602 I2C(A4/A5). 센서 없음.
//
// 동작: [LOAD 길게]  후드를 뒤로 젖힌다(READY TO LOAD) → 큐브를 흰색 아래·초록 앞으로 넣고 다시 길게 누르면 후드가 열린 자세로 돌아오며 장착(LOADED).
//                    장착된 상태에서 길게 누르면 배출(후드 LOAD 자세, 손으로 꺼냄).
//       [START 짧게] 모델이 풀린 상태면 섞기, 아니면 풀기 (한 버튼으로 섞기 → 풀기 → 섞기 … 반복).
//       [SCRAMBLE] 로봇이 20수 무작위 섞기를 직접 돌리며 그 수열을 기록한다 → 큐브 상태를 센서 없이 정확히 안다.
//       [SOLVE]    보드 안에서 CFOP(크로스·F2L IDA*, OLL·PLL 표 조회)로 풀이를 계산하고 모터로 실행한다.
// 시리얼(115200) 접점 규칙 — 모든 명령은 한 줄, 수열은 "R U R' U2" 표기:
//   S [seed]   섞기 (seed 생략 시 micros 기반). 출력: SCRAMBLE seed=<n> (20): <수열>
//   V          풀기. 단계마다 "<이름> (<수>): <수열> | nodes=.. ms=.." 출력 후 TOTAL, 실행, SOLVED ok=1
//   M <수열>   임의 수열 실행 (PC 시뮬레이터·스마트큐브 입력용)
//   L / E      장착 한 단계(LOAD 버튼과 같음) / 배출
//   F / Y <k>  시연용 뒤집기 / 스핀 y^k (k 1..3)
//   P          현재 상태 54 스티커 출력 (STATE URRF...) + MECH 상태      R  모델을 풀린 상태로 리셋
//   Q 0|1      가상 모드(1=모터·서보 생략, 절차는 출력)
//   H c o l    후드 서보 각 CLOSE/OPEN/LOAD 조정 (기본 15 75 165)   K <각> 리프터 최상 각 (기본 180)   O <스텝> 층 오버슈트 (기본 2)
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
    if (!mech.doMove(seq[i])) {
      Serial.print(F("ABORTED completed=")); Serial.println(i);
      lcdShowF(F("ABORTED"), "state retained");
      beep(220, 400);
      return false;
    }
    cube.move(seq[i]);
    if ((i & 3) == 0 || i == n - 1) {
      snprintf(row1, sizeof(row1), "%u/%u", i + 1, n);
      lcdShowF(label, row1);
    }
  }
  return true;
}

void printMechStats() {
  Serial.print(F(" flips=")); Serial.print(mech.flips); Serial.print(F(" spins=")); Serial.print(mech.spins);
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
  if (!mech.load()) { lcdShowF(F("LOAD FAILED"), "check hood"); beep(220, 400); return; }
  if (wasLoaded) lcdShowF(F("REMOVE CUBE"), "LOAD: next cube");
  else if (mech.waitingForCube()) lcdShowF(F("PLACE CUBE SOLVED"), "WHITE DOWN GRN FRONT");
  else { lcdShowF(F("CUBE LOADED"), "SCRAMBLE / SOLVE"); beep(880, 80); }
}
void doEject() {
  if (!mech.isLoaded()) { Serial.println(F("ERR not loaded")); return; }
  if (!mech.eject()) { lcdShowF(F("EJECT FAILED"), "check hood"); beep(220, 400); return; }
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
    case 'F': case 'f':
      if (mech.flip()) lcdShowF(F("FLIPPED"), "x'"); break;
    case 'Y': case 'y': {
      uint8_t k = (uint8_t)strtoul(arg, nullptr, 10); if (k < 1 || k > 3) k = 1;
      if (mech.spin(k)) lcdShowF(F("SPIN"), k == 1 ? "y" : (k == 2 ? "y2" : "y'")); break;
    }
    case 'H': case 'h': {
      char* e; long c = strtol(arg, &e, 10), o = strtol(e, &e, 10), l = strtol(e, &e, 10);
      if (c > 0) mech.hoodDeg[0] = c; if (o > 0) mech.hoodDeg[1] = o; if (l > 0) mech.hoodDeg[2] = l;
      Serial.print(F("HOOD DEG ")); Serial.print(mech.hoodDeg[0]); Serial.print(' '); Serial.print(mech.hoodDeg[1]); Serial.print(' '); Serial.println(mech.hoodDeg[2]);
      break;
    }
    case 'K': case 'k': mech.liftUpDeg = strtoul(arg, nullptr, 10); Serial.print(F("LIFT DEG ")); Serial.println(mech.liftUpDeg); break;
    case 'O': case 'o': mech.overshootSteps = strtoul(arg, nullptr, 10); Serial.print(F("OVERSHOOT ")); Serial.println(mech.overshootSteps); break;
    case 'P': case 'p': printState(); break;
    case 'R': case 'r': cube.reset(); Serial.println(F("RESET")); lcdShowF(F("CUBE ROBOT"), "reset"); break;
    case 'Q': case 'q': motors.setEnabled(*arg != '1'); Serial.print(F("MOTORS ")); Serial.println(motors.isEnabled() ? F("ON") : F("OFF")); break;
    case 0: break;
    default: Serial.println(F("ERR unknown command (S V M L E F Y P R Q H K O)"));
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
  lcdShowF(F("CUBE ROBOT V5"), "hold=LOAD tap=GO");
  Serial.println(F("READY cube-robot v5 (S [seed] | V | M <moves> | L | E | F | Y k | P | R | Q 0|1 | H | K | O)"));
}

void loop() {
  pollSerial();
  switch (buttonEvent()) {
    case BTN_LOAD: doLoad(); break;
    case BTN_START: if (cube.isSolved()) doScramble(micros() ^ millis()); else doSolve(); break;
    default: break;
  }
}
