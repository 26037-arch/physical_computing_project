// tools/host_sketch_v5/host_main.cpp — 스케치의 setup()/loop() 를 PC 에서 돌린다.
// stdin 전체를 Serial 입력 버퍼로 읽어 두고, 입력이 다 소비된 뒤 loop 를 몇 번 더 돌고 끝낸다.
#include <string>
#include <Arduino.h>   // min/max 매크로가 있으므로 표준 헤더 뒤에

static std::string inBuf;
static size_t inPos = 0;
static uint64_t clockUs = 0;

void hostAdvance(uint64_t us) { clockUs += us; }
uint32_t millis() { return (uint32_t)(clockUs / 1000); }
uint32_t micros() { return (uint32_t)clockUs; }
HardwareSerial Serial;
int HardwareSerial::available() { return (int)(inBuf.size() - inPos); }
int HardwareSerial::read() { return inPos < inBuf.size() ? (unsigned char)inBuf[inPos++] : -1; }

void setup();
void loop();

int main() {
  int ch;
  while ((ch = getchar()) != EOF) inBuf.push_back((char)ch);
  setup();
  for (int i = 0; i < 1000 && inPos < inBuf.size(); i++) loop();
  loop();
  fflush(stdout);
  return 0;
}
