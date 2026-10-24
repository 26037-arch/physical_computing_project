// solver.h — CFOP 4단계 풀이기 (sim/solver.js 와 같은 알고리즘·같은 순서 → 같은 풀이 문자열)
//   Cross : IDA* 18수, 휴리스틱 = 크로스 엣지 쌍 거리표 6개의 최댓값. 크로스 엣지 4개의 상태만 추적.
//   F2L   : 사람의 직관 F2L 처럼 매크로 수만 쓴다 — U 회전 3가지 + 트리거 X U^k X' (슬롯마다 2종류 × k 3가지).
//           트리거는 정의상 크로스와 다른 슬롯을 보존하므로 탐색 상태는 끼우는 쌍 (코너, 엣지) 2바이트뿐이고
//           F2L_PAIR 는 그 매크로 그래프의 정확한 최단 거리(겉면 수)다. 완성된 슬롯의 트리거는 금지.
//           쌍 선택은 그리디: 거리표 값이 작은 슬롯부터, 한계를 1씩 올리며 후보를 번갈아 본다.
//   OLL/PLL : 플래시의 인식 키 조회 (사전 AUF 4가지), PLL 은 공식 뒤 AUF 포함
//
// [수학적 근거 요약 — docs/MATH.md 3~7절]
//  사영   π_x(s) = (p, o) 는 등변: π_x(s·M) = T_M(π_x(s)),  T_M(p,o) = ((σ^M)^-1(p), o + o^M((σ^M)^-1(p)))
//          → 조각당 1바이트만 갱신해도 휴리스틱이 전체 상태로 계산한 것과 같다.
//  크로스 거리표 d_P(u) = 조각 집합 P 의 사영 그래프에서 목표까지의 BFS 거리. 실제 L수 해의 사영 경로도 길이 L 이므로
//          h_P(s) = d_P(π_P(s)) ≤ d*(s).  허용적 h 의 최댓값도 허용적: h = max_P h_P ≤ d*.
//  IDA*   f = g + h ≤ bound. 같은 면 연속 금지(X^a X^b = X^(a+b)), 반대면은 가환(UD = DU)이라 한 순서만 →
//          분기 18 → 평균 ≈ 13.3, bound +1 마다 비용 ≈ 13배. 허용적 h 이므로 처음 찾는 해가 (허용 수 집합 안에서) 최단.
//  F2L    켤레 X U^k X^-1 은 X 가 U층으로 올린 조각(슬롯 하나의 코너·엣지)과 U층만 바꾼다 → 크로스·다른 슬롯 보존.
//          매크로 그래프(간선 비용 1·3) 의 최단 거리를 표로 두면 h 가 정확해 탐색이 거의 직진한다 (한 쌍 수백 노드).
//  OLL    A 적용 후 방향 o'(i) = o(σ^A(i)) + o^A(i) 는 위치와 무관한 방향 벡터의 아핀 함수 →
//          s·r·A 가 방향 0  ⇔  key_OLL(s·r) = key_OLL(I·A^-1).  표에는 풀린 큐브에 A^-1 을 적용한 키를 저장.
//  PLL    s·r·A·u = I  ⇔  s·r = u^-1·A^-1.  표에는 (A, u) 마다 key_PLL(I·u^-1·A^-1) 저장 (21×4 + AUF 3 = 87).
#pragma once
#include "cube.h"

#define SOL_MAX 128     // 전체 풀이 최대 수
#define STAGE_MAX 40    // 단계 하나의 최대 수

// 단계가 끝날 때마다 호출: 이름("CROSS","F2L FR","OLL 23","PLL Jb"), 수열, 탐색 노드 수, 소요 ms
typedef void (*StageCallback)(const char* name, const uint8_t* moves, uint8_t n, uint32_t nodes, uint32_t ms);

class Solver {
 public:
  uint32_t nodes = 0;
  // 성공하면 out[0..outLen) 에 전체 풀이(같은 면 연속 합침). 실패(비정상 상태)면 false
  bool solve(const Cube& start, uint8_t* out, uint8_t& outLen, StageCallback cb);

 private:
  // ---- Cross ----
  uint8_t path[16], pathLen = 0;    // IDA* 결과
  uint8_t crossA[6], crossB[6];
  uint8_t hCross(const uint8_t* es, uint8_t limit) const;
  bool childFits(const uint8_t* es, uint8_t* es2, uint8_t m, uint8_t limit, uint8_t& h) const;
  bool searchCross(const uint8_t* es, uint8_t g, uint8_t remaining, int8_t lastFace);
  bool idaCross(const uint8_t* es, uint8_t maxBound);
  // ---- F2L (매크로 수 27개: 0..2 = U U2 U', 3 + (slot*2+fam)*3 + k = 트리거 X U^(k+1) X') ----
  uint8_t mpath[12], mpathLen = 0;  // 매크로 번호열
  static uint8_t macroMoves(uint8_t i, uint8_t* out);           // 매크로의 겉면 수열, 길이(1 또는 3) 반환
  static uint8_t macroKind(uint8_t i);                           // 같은 종류(연속 금지) 판정용: U = 0xFF, 트리거 = slot*2+fam
  bool searchF2L(uint8_t cs, uint8_t es, uint8_t g, uint8_t depth, uint8_t bound, int8_t last, const uint8_t* table, uint8_t allowedMask);
  // ---- OLL / PLL ----
  bool lookupOLL(const Cube& c, uint8_t* out, uint8_t& n, char* name);
  bool lookupPLL(const Cube& c, uint8_t* out, uint8_t& n, char* name);
};
