// solver.h — CFOP 4단계 풀이기 (sim/solver.js 와 같은 알고리즘·같은 순서 → 같은 풀이 문자열)
//   Cross : IDA*, 휴리스틱 = 크로스 엣지 쌍 거리표 6개의 최댓값
//   F2L   : 쌍마다 IDA* (D 수 제외). 깊이 8 안에 안 풀리면 다른 슬롯부터, 모두 실패하면 꺼내기→끼우기
//   OLL/PLL : 플래시의 인식 키 조회 (사전 AUF 4가지), PLL 은 공식 뒤 AUF 포함
// 탐색 중에는 큐브 전체(40B)가 아니라 관심 조각(크로스 엣지 4 + 슬롯당 코너·엣지)의 상태만 추적한다.
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
