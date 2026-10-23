#pragma once
#include <Arduino.h>
class Servo {
  int pin=-1;
 public:
  void attach(int p){pin=p;}
  void write(int angle){hostServo[pin]=angle;hostWrites.push_back({pin,angle});}
};
