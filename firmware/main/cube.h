// cube.h — 3x3 큐브의 큐비(cubie) 모델과 회전 표기. sim/cube.js 와 같은 규약. (수학 정리: docs/MATH.md 1~2절)
//
// [상태] s = (σc, oc, σe, oe),  σc ∈ S8, oc ∈ Z3^8, σe ∈ S12, oe ∈ Z2^12
//   cp[i] = σc(i) : 위치 i 에 놓인 코너 조각 번호,  co[i] = oc(i) : 그 조각의 시계 방향 꼬임 (0,1,2)
//   ep[i] = σe(i), eo[i] = oe(i) : 엣지도 같음 (방향 0,1).  풀린 상태 = σ 항등, o = 0
//   물리적 제약: Σoc ≡ 0 (mod 3), Σoe ≡ 0 (mod 2), sgn σc = sgn σe
//   → 상태 수 8!·3^8·12!·2^12 / (3·2·2) ≈ 4.3×10^19
//
// [수] 한 수 M 도 같은 꼴 (σ^M, o^M). 상태 s 에 M 을 적용한 s·M 은
//   (s·M)σ(i) = σ(σ^M(i)),   (s·M)o(i) = o(σ^M(i)) + o^M(i)  (mod 3 / mod 2)
//   "수 뒤에 위치 i 로 오는 조각 = 원래 σ^M(i) 에 있던 조각, 방향 = 그 조각 방향 + M 이 더하는 꼬임".
//   이 곱은 결합적이라 18수가 루빅스 큐브 군을 생성한다. M^4 = id, M^-1 = M^3.
//   수 번호 m = 3f + (k-1).  f: U=0 R=1 F=2 D=3 L=4 B=5,  k=1 시계 90°, 2 180°, 3 반시계 90°
//   tables.h 의 MOVE_CP/CO/EP/EO[m] 가 σ^M, o^M (M_{3f+1} = M_{3f}^2, M_{3f+2} = M_{3f}^3 로 생성).
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
void scrambleSeq(uint32_t seed, uint8_t* out, uint8_t n, int8_t fixedFace = -1); // xorshift32 섞기 (sim/cube.js 와 동일 수열)
