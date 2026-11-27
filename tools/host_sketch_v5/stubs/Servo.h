#pragma once
#include <Arduino.h>
class Servo {
 public:
  uint8_t attach(int) { return 1; }
  void write(int) {}
  void detach() {}
};
