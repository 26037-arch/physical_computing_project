// tools/host_solver/main.cpp — 펌웨어 풀이기를 PC 에서 돌려 tools/test_solver.js 와 같은 형식으로 출력한다.
//   g++ -O2 -I tools/host_solver -I firmware/main tools/host_solver/main.cpp firmware/main/cube.cpp firmware/main/solver.cpp -o build/host_solver
//   build/host_solver <시드 시작> <개수>
// 출력(시드마다): SCRAMBLE / 단계 줄 " <이름> (<수>): <수열>  nodes=<n>" / " TOTAL <수>: <수열>"
#include "cube.h"
#include "solver.h"

struct StdoutPrint : Print { size_t write(uint8_t c) override { putchar(c); return 1; } } out;

static void onStage(const char* name, const uint8_t* moves, uint8_t n, uint32_t nodes, uint32_t) {
  printf(" %s (%u): ", name, n);
  printSeq(out, moves, n);
  printf("  nodes=%lu\n", (unsigned long)nodes);
}

int main(int argc, char** argv) {
  uint32_t seed0 = argc > 1 ? strtoul(argv[1], 0, 10) : 1;
  uint32_t count = argc > 2 ? strtoul(argv[2], 0, 10) : 3;
  Solver solver;
  uint8_t scr[20], sol[SOL_MAX], solLen;
  for (uint32_t seed = seed0; seed < seed0 + count; seed++) {
    scrambleSeq(seed, scr, 20);
    Cube c;
    c.apply(scr, 20);
    printf("seed %lu\n SCRAMBLE ", (unsigned long)seed);
    printSeq(out, scr, 20);
    printf("\n");
    if (!solver.solve(c, sol, solLen, onStage)) { printf(" FAIL\n"); return 1; }
    Cube t = c;
    t.apply(sol, solLen);
    printf(" TOTAL %u: ", solLen);
    printSeq(out, sol, solLen);
    printf("\n SOLVED ok=%d nodes=%lu\n", t.isSolved() ? 1 : 0, (unsigned long)solver.nodes);
  }
  return 0;
}
