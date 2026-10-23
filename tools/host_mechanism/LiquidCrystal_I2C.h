#pragma once
#include <Arduino.h>
class LiquidCrystal_I2C:public Print {
 public:
  LiquidCrystal_I2C(int,int,int){}
  size_t write(uint8_t)override{return 1;}
  void init(){} void backlight(){} void clear(){} void setCursor(int,int){}
};
