// cube.h — 3x3 큐브의 큐비(cubie) 모델과 회전 표기. sim/cube.js 와 같은 규약.
//   코너 8개: 위치 cp[i] (어느 코너 조각이 위치 i 에 있나), 방향 co[i] ∈ {0,1,2}
//   엣지 12개: 위치 ep[i], 방향 eo[i] ∈ {0,1}
//   수 번호 m = face*3 + (회전수-1).  face: U=0 R=1 F=2 D=3 L=4 B=5
#pragma once
#include <Arduino.h>
#include "tables.h"

enum Face : uint8_t { FACE_U = 0, FACE_R, FACE_F, FACE_D, FACE_L, FACE_B };

struct Cube {
  uint8_t cp[8], co[8], ep[12], eo[12];

  Cube() { reset(); }
  void reset();
  void move(uint8_t m);                              // 한 수 적용
  void apply(const uint8_t* seq, uint8_t n);         // 수열 적용
  bool isSolved() const;
  uint8_t edgeState(uint8_t cubie) const;            // 위치*2 + 방향 (0..23)
  uint8_t cornerState(uint8_t cubie) const;          // 위치*3 + 방향 (0..23)
  void facelets(char* out54) const;                  // 54 스티커 문자 'URFDLB' (시뮬레이터 동기화용)
};

// ---- 표기 ----
void moveName(uint8_t m, char* out);                 // out 에 "U", "U2", "U'" (널 포함 3바이트)
void printSeq(Print& p, const uint8_t* seq, uint8_t n);
int8_t parseMove(const char* tok);                   // "R'" → 수 번호, 실패 -1
uint8_t parseSeq(const char* str, uint8_t* out, uint8_t maxN);
uint8_t simplifySeq(uint8_t* seq, uint8_t n);        // 같은 면 연속 합치기, 새 길이 반환
void scrambleSeq(uint32_t seed, uint8_t* out, uint8_t n); // xorshift32 섞기 (sim/cube.js 와 동일 수열)
