// solver.h — CFOP 4단계 풀이기 (sim/solver.js 와 같은 알고리즘·같은 순서 → 같은 풀이 문자열)
//   Cross : IDA*, 휴리스틱 = 크로스 엣지 쌍 거리표 6개의 최댓값
//   F2L   : 쌍마다 IDA* (D 수 제외). 깊이 8 안에 안 풀리면 다른 슬롯부터, 모두 실패하면 꺼내기→끼우기
//   OLL/PLL : 플래시의 인식 키 조회 (사전 AUF 4가지), PLL 은 공식 뒤 AUF 포함
// 탐색 중에는 큐브 전체(40B)가 아니라 관심 조각(크로스 엣지 4 + 슬롯당 코너·엣지)의 상태만 추적한다.
//
// [수학적 근거 요약 — docs/MATH.md 3~7절]
//  사영   π_x(s) = (p, o) 는 등변: π_x(s·M) = T_M(π_x(s)),  T_M(p,o) = ((σ^M)^-1(p), o + o^M((σ^M)^-1(p)))
//          → 조각당 1바이트만 갱신해도 휴리스틱이 전체 상태로 계산한 것과 같다.
//  거리표 d_P(u) = 조각 집합 P 의 사영 그래프에서 목표까지의 BFS 거리. 실제 L수 해의 사영 경로도 길이 L 이므로
//          h_P(s) = d_P(π_P(s)) ≤ d*(s).  허용적 h 의 최댓값도 허용적: h = max_P h_P ≤ d*.  |h(s)-h(s·M)| ≤ 1.
//  IDA*   f = g + h ≤ bound. 같은 면 연속 금지(X^a X^b = X^(a+b)), 반대면은 가환(UD = DU)이라 한 순서만 →
//          분기 18 → 평균 ≈ 13.3, bound +1 마다 비용 ≈ 13배. 허용적 h 이므로 처음 찾는 해가 (허용 수 집합 안에서) 최단.
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
  enum Mode : uint8_t { MODE_CROSS, MODE_F2L, MODE_EXTRACT };
  Mode mode = MODE_CROSS;
  bool allowD = true;
  uint8_t slots[4], nSlots = 0;     // 추적 슬롯 (마지막이 지금 끼우는 쌍)
  uint8_t path[16], pathLen = 0;    // IDA* 결과
  uint8_t crossA[6], crossB[6], nPairs;
  const uint8_t* pairTable[4];     // 이번 탐색에서 유지할 슬롯의 거리표

  void tracked(const Cube& c, uint8_t* es, uint8_t* cs) const;
  uint8_t hCross(const uint8_t* es, uint8_t limit) const;
  uint8_t heuristic(const uint8_t* es, const uint8_t* cs) const;
  bool childFits(const uint8_t* es, const uint8_t* cs, uint8_t* es2, uint8_t* cs2,
                 uint8_t m, uint8_t limit, uint8_t& h) const;
  bool search(const uint8_t* es, const uint8_t* cs, uint8_t g, uint8_t remaining, int8_t lastFace);
  bool ida(const uint8_t* es, const uint8_t* cs, uint8_t maxBound);
  uint8_t hSlot(const Cube& c, uint8_t s) const;
  bool lookupOLL(const Cube& c, uint8_t* out, uint8_t& n, char* name);
  bool lookupPLL(const Cube& c, uint8_t* out, uint8_t& n, char* name);
};
