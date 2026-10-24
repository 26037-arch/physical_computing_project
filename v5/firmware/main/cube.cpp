#include "cube.h"

void Cube::reset() {
  for (uint8_t i = 0; i < 8; i++) { cp[i] = i; co[i] = 0; }
  for (uint8_t i = 0; i < 12; i++) { ep[i] = i; eo[i] = 0; }
}

// s·M :  σ'(i) = σ(σ^M(i)),  o'(i) = o(σ^M(i)) + o^M(i)   (docs/MATH.md 2절)
void Cube::move(uint8_t m) {
  uint8_t ncp[8], nco[8], nep[12], neo[12];
  for (uint8_t i = 0; i < 8; i++) {
    uint8_t j = pgm_read_byte(&MOVE_CP[m][i]);
    ncp[i] = cp[j];
    nco[i] = (co[j] + pgm_read_byte(&MOVE_CO[m][i])) % 3;
  }
  for (uint8_t i = 0; i < 12; i++) {
    uint8_t j = pgm_read_byte(&MOVE_EP[m][i]);
    nep[i] = ep[j];
    neo[i] = (eo[j] + pgm_read_byte(&MOVE_EO[m][i])) & 1;
  }
  memcpy(cp, ncp, 8); memcpy(co, nco, 8); memcpy(ep, nep, 12); memcpy(eo, neo, 12);
}

void Cube::apply(const uint8_t* seq, uint8_t n) { for (uint8_t i = 0; i < n; i++) move(seq[i]); }

bool Cube::isSolved() const {
  for (uint8_t i = 0; i < 8; i++) if (cp[i] != i || co[i]) return false;
  for (uint8_t i = 0; i < 12; i++) if (ep[i] != i || eo[i]) return false;
  return true;
}

// 조각 x 하나의 사영 π_x(s) = (p, o),  p = σ^-1(x) (조각이 있는 위치), o = o(p).
//   엣지 상태 = 2p + o (24가지), 코너 상태 = 3p + o (24가지). 탐색은 이 값만 추적한다 (solver.cpp).
uint8_t Cube::edgeState(uint8_t cubie) const {
  for (uint8_t p = 0; p < 12; p++) if (ep[p] == cubie) return p * 2 + eo[p];
  return 0;
}
uint8_t Cube::cornerState(uint8_t cubie) const {
  for (uint8_t p = 0; p < 8; p++) if (cp[p] == cubie) return p * 3 + co[p];
  return 0;
}

// 스티커 위치표 (sim/cube.js 와 동일)
static const uint8_t CORNER_FACELET[8][3] PROGMEM = {{8, 9, 20}, {6, 18, 38}, {0, 36, 47}, {2, 45, 11}, {29, 26, 15}, {27, 44, 24}, {33, 53, 42}, {35, 17, 51}};
static const uint8_t EDGE_FACELET[12][2] PROGMEM = {{5, 10}, {7, 19}, {3, 37}, {1, 46}, {32, 16}, {28, 25}, {30, 43}, {34, 52}, {23, 12}, {21, 41}, {50, 39}, {48, 14}};
static const uint8_t CORNER_COLOR[8][3] PROGMEM = {{0, 1, 2}, {0, 2, 4}, {0, 4, 5}, {0, 5, 1}, {3, 2, 1}, {3, 4, 2}, {3, 5, 4}, {3, 1, 5}};
static const uint8_t EDGE_COLOR[12][2] PROGMEM = {{0, 1}, {0, 2}, {0, 4}, {0, 5}, {3, 1}, {3, 2}, {3, 4}, {3, 5}, {2, 1}, {2, 4}, {5, 4}, {5, 1}};
static const char FACE_CHARS[] = "URFDLB";

void Cube::facelets(char* out) const {
  for (uint8_t f = 0; f < 6; f++) out[f * 9 + 4] = FACE_CHARS[f];
  for (uint8_t i = 0; i < 8; i++)
    for (uint8_t n = 0; n < 3; n++)
      out[pgm_read_byte(&CORNER_FACELET[i][(n + co[i]) % 3])] = FACE_CHARS[pgm_read_byte(&CORNER_COLOR[cp[i]][n])];
  for (uint8_t i = 0; i < 12; i++)
    for (uint8_t n = 0; n < 2; n++)
      out[pgm_read_byte(&EDGE_FACELET[i][(n + eo[i]) % 2])] = FACE_CHARS[pgm_read_byte(&EDGE_COLOR[ep[i]][n])];
  out[54] = 0;
}

// ---- 표기 ----
void moveName(uint8_t m, char* out) {
  out[0] = FACE_CHARS[m / 3];
  uint8_t k = m % 3;
  out[1] = k == 0 ? 0 : (k == 1 ? '2' : '\'');
  out[2] = 0;
}

void printSeq(Print& p, const uint8_t* seq, uint8_t n) {
  char buf[3];
  for (uint8_t i = 0; i < n; i++) {
    if (i) p.print(' ');
    moveName(seq[i], buf);
    p.print(buf);
  }
}

int8_t parseMove(const char* tok) {
  const char* f = strchr(FACE_CHARS, tok[0]);
  if (!tok[0] || !f) return -1;
  uint8_t k;
  if (tok[1] == 0) k = 0;
  else if (tok[1] == '2' && tok[2] == 0) k = 1;
  else if ((tok[1] == '\'' || tok[1] == '3') && tok[2] == 0) k = 2;
  else return -1;
  return (f - FACE_CHARS) * 3 + k;
}

uint8_t parseSeq(const char* str, uint8_t* out, uint8_t maxN) {
  uint8_t n = 0;
  char tok[4];
  while (*str && n < maxN) {
    while (*str == ' ') str++;
    if (!*str) break;
    uint8_t len = 0;
    while (*str && *str != ' ' && len < 3) tok[len++] = *str++;
    tok[len] = 0;
    while (*str && *str != ' ') str++;  // 너무 긴 토큰 버림
    int8_t m = parseMove(tok);
    if (m < 0) return 0;
    out[n++] = m;
  }
  return n;
}

// 같은 면 연속은 한 수로 합친다: X^a · X^b = X^(a+b mod 4), 0 이면 소거.
uint8_t simplifySeq(uint8_t* seq, uint8_t n) {
  uint8_t out = 0;
  for (uint8_t i = 0; i < n; i++) {
    uint8_t m = seq[i];
    if (out && seq[out - 1] / 3 == m / 3) {
      uint8_t f = m / 3;
      uint8_t t = ((seq[out - 1] % 3) + 1 + (m % 3) + 1) % 4;
      out--;
      if (t) seq[out++] = f * 3 + t - 1;
    } else seq[out++] = m;
  }
  return out;
}

// xorshift32: x ^= x<<13; x ^= x>>17; x ^= x<<5 (주기 2^32-1, 시드 0 은 0x9E3779B9 로 대체).
// 면 f = x mod 6 (직전 면과 같으면 버림), 회전 k = x' mod 3. JS(sim/cube.js) 와 같은 32비트 산술이라
// 같은 시드 → 같은 수열. 이것이 "JS 기대 출력 = 보드 출력" 교차검증의 전제다 (docs/MATH.md 9절).
void scrambleSeq(uint32_t seed, uint8_t* out, uint8_t n) {
  uint32_t s = seed ? seed : 0x9E3779B9UL;
  int8_t last = -1;
  uint8_t i = 0;
  while (i < n) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    uint8_t f = s % 6;
    if ((int8_t)f == last) continue;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    out[i++] = f * 3 + s % 3;
    last = f;
  }
}
