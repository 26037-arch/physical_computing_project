// tools/host_solver/Arduino.h — PC(g++)에서 펌웨어 풀이기(cube.cpp, solver.cpp)를 그대로 컴파일하기 위한 최소 스텁.
// Wokwi 없이도 "JS 풀이기 == 펌웨어 풀이기" 를 확인한다 (node tools/host_check.js).
#pragma once
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

class Print {
 public:
  virtual size_t write(uint8_t c) = 0;
  size_t print(char c) { return write((uint8_t)c); }
  size_t print(const char* s) { size_t n = 0; while (*s) n += write((uint8_t)*s++); return n; }
  size_t print(unsigned long v) { char b[16]; snprintf(b, sizeof b, "%lu", v); return print(b); }
  size_t print(int v) { char b[16]; snprintf(b, sizeof b, "%d", v); return print(b); }
};

inline uint32_t millis() { return (uint32_t)(clock() * 1000ULL / CLOCKS_PER_SEC); }
