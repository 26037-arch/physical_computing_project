// tools/host_sketch_v5/stubs/Arduino.h — PC(g++) 에서 V5 스케치를 돌리기 위한 Arduino 스텁.
// 시간은 가상 시계(delay/delayMicroseconds 만 진행)라 출력이 결정적이고 실제로 기다리지 않는다.
#pragma once
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <math.h>
#include <algorithm>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
static const uint8_t A0 = 14, A1 = 15, A2 = 16, A3 = 17, A4 = 18, A5 = 19;
#define PROGMEM
#define min(a, b) ((a) < (b) ? (a) : (b))
#define max(a, b) ((a) > (b) ? (a) : (b))
#define constrain(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper*>(s))

class Print {
 public:
  virtual size_t write(uint8_t c) = 0;
  size_t print(char c) { return write((uint8_t)c); }
  size_t print(const char* s) { size_t n = 0; while (*s) n += write((uint8_t)*s++); return n; }
  size_t print(const __FlashStringHelper* s) { return print(reinterpret_cast<const char*>(s)); }
  size_t print(unsigned char v) { return print((unsigned long)v); }
  size_t print(int v) { return print((long)v); }
  size_t print(unsigned int v) { return print((unsigned long)v); }
  size_t print(long v) { char b[24]; snprintf(b, sizeof b, "%ld", v); return print(b); }
  size_t print(unsigned long v) { char b[24]; snprintf(b, sizeof b, "%lu", v); return print(b); }
  template <class T> size_t println(T v) { size_t n = print(v); return n + print('\n'); }
  size_t println() { return print('\n'); }
};

void hostAdvance(uint64_t us);
uint32_t millis();
uint32_t micros();
inline void delay(uint32_t ms) { hostAdvance((uint64_t)ms * 1000); }
inline void delayMicroseconds(uint32_t us) { hostAdvance(us); }
inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t, uint8_t) {}
inline int digitalRead(uint8_t) { return HIGH; }   // 버튼 안 눌림 (풀업)
inline void tone(uint8_t, unsigned int, unsigned long = 0) {}

class HardwareSerial : public Print {
 public:
  void begin(unsigned long) {}
  int available();
  int read();
  size_t write(uint8_t c) override { putchar(c); return 1; }
};
extern HardwareSerial Serial;
