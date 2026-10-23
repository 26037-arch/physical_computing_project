#include "solver.h"

static const uint8_t MAX_DEPTH = 14;      // 안전 한계
static const uint8_t F2L_EASY_DEPTH = 8;  // 이 깊이 안에 풀리는 슬롯을 먼저 고른다
static const char SLOT_NAMES[4][3] = {"FR", "FL", "BL", "BR"};

// 코너 상태(위치*3+방향)의 위치. AVR에서 매번 /3, %3을 계산하지 않는다.
static const uint8_t CORNER_POS[24] PROGMEM = {
  0,0,0, 1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5, 6,6,6, 7,7,7
};

// 같은 수로 여러 조각을 갱신하므로 이동표의 행 주소는 한 번만 구한다.
static inline __attribute__((always_inline)) uint8_t eStep(uint8_t s, const uint8_t* to, const uint8_t* delta) {
  uint8_t p = s >> 1;
  return (pgm_read_byte(to + p) << 1) | ((s + pgm_read_byte(delta + p)) & 1);
}
static inline __attribute__((always_inline)) uint8_t cStep(uint8_t s, const uint8_t* to, const uint8_t* delta) {
  uint8_t p = pgm_read_byte(CORNER_POS + s);
  uint8_t ori = s - p * 3 + pgm_read_byte(delta + p);  // 0..4
  if (ori >= 3) ori -= 3;
  return pgm_read_byte(to + p) * 3 + ori;
}

static uint16_t ollKey(const Cube& c) {
  return ((((c.co[0] * 3 + c.co[1]) * 3 + c.co[2]) * 3 + c.co[3]) << 4) | (c.eo[0] << 3) | (c.eo[1] << 2) | (c.eo[2] << 1) | c.eo[3];
}
static uint16_t pllKey(const Cube& c) {
  return ((uint16_t)c.cp[0] << 14) | ((uint16_t)c.cp[1] << 12) | ((uint16_t)c.cp[2] << 10) | ((uint16_t)c.cp[3] << 8) | (c.ep[0] << 6) | (c.ep[1] << 4) | (c.ep[2] << 2) | c.ep[3];
}

void Solver::tracked(const Cube& c, uint8_t* es, uint8_t* cs) const {
  for (uint8_t i = 0; i < 4; i++) es[i] = c.edgeState(4 + i);  // DR DF DL DB
  for (uint8_t i = 0; i < nSlots; i++) { es[4 + i] = c.edgeState(8 + slots[i]); cs[i] = c.cornerState(4 + slots[i]); }
}

inline __attribute__((always_inline)) uint8_t Solver::hCross(const uint8_t* es, uint8_t limit) const {
  uint8_t h = 0;
  const uint8_t* table = &CROSS_PAIR[0][0];
  for (uint8_t i = 0; i < 6; i++) {
    uint8_t d = pgm_read_byte(table + es[crossA[i]] * 24 + es[crossB[i]]);
    if (d > limit) return d;
    if (d > h) h = d;
    table += 576;
  }
  return h;
}

uint8_t Solver::heuristic(const uint8_t* es, const uint8_t* cs) const {
  uint8_t h = hCross(es, 255);
  for (uint8_t i = 0; i < nPairs; i++) {
    uint8_t d = pgm_read_byte(pairTable[i] + cs[i] * 24 + es[4 + i]);
    if (d > h) h = d;
  }
  if (mode == MODE_EXTRACT) {  // 마지막 슬롯의 두 조각이 U층(위치 0..3)에 있어야 목표
    uint8_t l = nSlots - 1;
    if (cs[l] >= 12 || es[4 + l] >= 8) { if (h < 1) h = 1; }
  }
  return h;
}

uint8_t Solver::hSlot(const Cube& c, uint8_t s) const {
  return pgm_read_byte(&F2L_PAIR[s][c.cornerState(4 + s) * 24 + c.edgeState(8 + s)]);
}

// 거리표 중 하나라도 남은 깊이를 넘으면 최댓값도 넘는다. 나머지 조각은 갱신할 필요가 없다.
inline __attribute__((always_inline)) bool Solver::childFits(const uint8_t* es, const uint8_t* cs,
    uint8_t* es2, uint8_t* cs2, uint8_t m, uint8_t limit, uint8_t& h) const {
  const uint8_t* et = EDGE_TO[m];
  const uint8_t* ed = EDGE_DO[m];
  for (uint8_t i = 0; i < 4; i++) es2[i] = eStep(es[i], et, ed);
  h = hCross(es2, limit);
  if (h > limit) return false;
  const uint8_t* ct = CORNER_TO[m];
  const uint8_t* cd = CORNER_DO[m];
  for (uint8_t i = 0; i < nPairs; i++) {
    uint8_t e = eStep(es[4 + i], et, ed), c = cStep(cs[i], ct, cd);
    es2[4 + i] = e; cs2[i] = c;
    const uint8_t* row = pairTable[i] + c * 24;
    uint8_t d = pgm_read_byte(row + e);
    if (d > limit) return false;
    if (d > h) h = d;
  }
  if (mode == MODE_EXTRACT) {
    uint8_t l = nSlots - 1;
    es2[4 + l] = eStep(es[4 + l], et, ed);
    cs2[l] = cStep(cs[l], ct, cd);
    if (cs2[l] >= 12 || es2[4 + l] >= 8) {
      if (limit == 0) return false;
      if (h < 1) h = 1;
    }
  }
  return true;
}

// IDA*: 같은 면 연속 금지, 반대면 쌍은 면 번호가 작은 쪽을 먼저 (U D 허용, D U 금지)
// 진입 시 휴리스틱 검사는 끝난 상태. 탈락할 자식에 대한 재귀 호출을 생략한다.
bool Solver::search(const uint8_t* es, const uint8_t* cs, uint8_t g, uint8_t remaining, int8_t lastFace) {
  uint8_t es2[8], cs2[4];
  uint8_t limit = remaining - 1;
  for (int8_t f = 0; f < 6; f++) {
    if (!allowD && f == FACE_D) continue;
    if (f == lastFace) continue;
    if (lastFace >= 3 && f == lastFace - 3) continue;
    // f*3, f*3+1, f*3+2 순서이므로 원래 m=0..17 순서와 같다.
    uint8_t end = f * 3 + 3;
    for (uint8_t m = end - 3; m < end; m++) {
      nodes++;  // 생성한 자식마다 한 번, 반드시 그 자식의 휴리스틱 검사 전
      uint8_t h;
      if (!childFits(es, cs, es2, cs2, m, limit, h)) continue;
      path[g] = m;
      if (h == 0) { pathLen = g + 1; return true; }
      if (search(es2, cs2, g + 1, limit, f)) return true;
    }
  }
  return false;
}

bool Solver::ida(const uint8_t* es, const uint8_t* cs, uint8_t maxBound) {
  // 이번 IDA* 동안 변하지 않는 쌍 번호와 슬롯별 거리표 주소를 미리 읽는다.
  for (uint8_t i = 0; i < 6; i++) {
    crossA[i] = pgm_read_byte(&CROSS_PAIRS[i][0]) - 4;
    crossB[i] = pgm_read_byte(&CROSS_PAIRS[i][1]) - 4;
  }
  nPairs = (mode == MODE_EXTRACT) ? nSlots - 1 : nSlots;
  for (uint8_t i = 0; i < nPairs; i++) pairTable[i] = F2L_PAIR[slots[i]];
  uint8_t h = heuristic(es, cs);
  if (h == 0) { pathLen = 0; return true; }
  for (uint8_t bound = h; bound <= maxBound; bound++)
    if (search(es, cs, 0, bound, -1)) return true;
  return false;
}

bool Solver::lookupOLL(const Cube& c, uint8_t* out, uint8_t& n, char* name) {
  for (uint8_t r = 0; r < 4; r++) {
    Cube t = c;
    if (r) t.move(FACE_U * 3 + r - 1);
    uint16_t key = ollKey(t);
    n = 0;
    if (r) out[n++] = FACE_U * 3 + r - 1;
    if (key == 0) { strcpy(name, "OLL skip"); return true; }
    for (uint8_t i = 0; i < OLL_COUNT; i++) {
      if (pgm_read_word(&OLL_KEY[i]) != key) continue;
      uint16_t a = pgm_read_word(&OLL_OFF[i]), b = pgm_read_word(&OLL_OFF[i + 1]);
      for (uint16_t k = a; k < b; k++) out[n++] = pgm_read_byte(&OLL_MOVES[k]);
      sprintf(name, "OLL %u", pgm_read_byte(&OLL_NUM[i]));
      return true;
    }
  }
  return false;
}

bool Solver::lookupPLL(const Cube& c, uint8_t* out, uint8_t& n, char* name) {
  Cube solved;
  uint16_t solvedKey = pllKey(solved);
  for (uint8_t r = 0; r < 4; r++) {
    Cube t = c;
    if (r) t.move(FACE_U * 3 + r - 1);
    uint16_t key = pllKey(t);
    n = 0;
    if (r) out[n++] = FACE_U * 3 + r - 1;
    if (key == solvedKey) { strcpy(name, "PLL skip"); return true; }
    for (uint8_t i = 0; i < PLL_COUNT; i++) {
      if (pgm_read_word(&PLL_KEY[i]) != key) continue;
      uint16_t a = pgm_read_word(&PLL_OFF[i]), b = pgm_read_word(&PLL_OFF[i + 1]);
      for (uint16_t k = a; k < b; k++) out[n++] = pgm_read_byte(&PLL_MOVES[k]);
      uint8_t auf = pgm_read_byte(&PLL_AUF[i]);
      if (auf) out[n++] = FACE_U * 3 + auf - 1;
      strcpy(name, "PLL ");
      strcpy_P(name + 4, PLL_NAMES[pgm_read_byte(&PLL_NAME_IDX[i])]);
      return true;
    }
  }
  return false;
}

bool Solver::solve(const Cube& start, uint8_t* out, uint8_t& outLen, StageCallback cb) {
  Cube c = start;
  outLen = 0; nodes = 0;
  uint8_t es[8], cs[4];
  uint8_t stage[STAGE_MAX], stageLen;
  char name[12];

  // 1. Cross
  uint32_t t0 = millis(), n0 = nodes;
  mode = MODE_CROSS; nSlots = 0; allowD = true;
  tracked(c, es, cs);
  if (!ida(es, cs, MAX_DEPTH)) return false;
  memcpy(stage, path, pathLen); stageLen = pathLen;
  c.apply(stage, stageLen); memcpy(out + outLen, stage, stageLen); outLen += stageLen;
  if (cb) cb("CROSS", stage, stageLen, nodes - n0, millis() - t0);

  // 2. F2L
  uint8_t done[4], nDone = 0;
  allowD = false;
  for (uint8_t k = 0; k < 4; k++) {
    t0 = millis(); n0 = nodes;
    // 후보 슬롯: 거리표 값 오름차순, 같으면 번호 순 (삽입 정렬)
    uint8_t cand[4], candH[4], nc = 0;
    for (uint8_t s = 0; s < 4; s++) {
      bool isDone = false;
      for (uint8_t i = 0; i < nDone; i++) if (done[i] == s) isDone = true;
      if (isDone) continue;
      uint8_t h = hSlot(c, s), j = nc;
      while (j > 0 && candH[j - 1] > h) { cand[j] = cand[j - 1]; candH[j] = candH[j - 1]; j--; }
      cand[j] = s; candH[j] = h; nc++;
    }
    memcpy(slots, done, nDone); nSlots = nDone + 1;
    uint8_t chosen = cand[0];
    bool found = false;
    mode = MODE_F2L;
    for (uint8_t i = 0; i < nc && !found; i++) {
      slots[nDone] = cand[i];
      tracked(c, es, cs);
      if (ida(es, cs, F2L_EASY_DEPTH)) { found = true; chosen = cand[i]; }
    }
    if (found) {
      memcpy(stage, path, pathLen); stageLen = pathLen;
    } else {  // 모두 깊이 8 초과: 첫 후보의 두 조각을 U층으로 꺼낸 뒤 다시 끼운다
      slots[nDone] = chosen;
      mode = MODE_EXTRACT;
      tracked(c, es, cs);
      if (!ida(es, cs, MAX_DEPTH)) return false;
      memcpy(stage, path, pathLen); stageLen = pathLen;
      Cube t = c; t.apply(stage, stageLen);
      mode = MODE_F2L;
      tracked(t, es, cs);
      if (!ida(es, cs, MAX_DEPTH)) return false;
      memcpy(stage + stageLen, path, pathLen); stageLen += pathLen;
    }
    c.apply(stage, stageLen); memcpy(out + outLen, stage, stageLen); outLen += stageLen;
    done[nDone++] = chosen;
    strcpy(name, "F2L "); strcat(name, SLOT_NAMES[chosen]);
    if (cb) cb(name, stage, stageLen, nodes - n0, millis() - t0);
  }

  // 3. OLL
  t0 = millis(); n0 = nodes;
  if (!lookupOLL(c, stage, stageLen, name)) return false;
  c.apply(stage, stageLen); memcpy(out + outLen, stage, stageLen); outLen += stageLen;
  if (cb) cb(name, stage, stageLen, 0, millis() - t0);

  // 4. PLL
  t0 = millis();
  if (!lookupPLL(c, stage, stageLen, name)) return false;
  c.apply(stage, stageLen); memcpy(out + outLen, stage, stageLen); outLen += stageLen;
  if (cb) cb(name, stage, stageLen, 0, millis() - t0);

  if (!c.isSolved()) return false;
  outLen = simplifySeq(out, outLen);
  return true;
}
