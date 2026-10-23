// Deterministic GPIO/clock/serial adapter. Production firmware is compiled unchanged.
#pragma once
#include <stdint.h>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
class __FlashStringHelper;
#define F(s) reinterpret_cast<const __FlashStringHelper*>(s)
extern uint64_t hostUs;
extern int hostPins[32], hostServo[32], faultUnit, faultWant;
struct HostPulse { int pin, dir; uint64_t at; };
extern std::vector<HostPulse> hostPulses;
extern std::vector<std::pair<int,int>> hostWrites;
class Print {
 public:
  virtual size_t write(uint8_t c)=0;
  size_t print(char c){return write(c);}
  size_t print(char* s){return print(static_cast<const char*>(s));}
  size_t print(const char* s){size_t n=0;while(*s)n+=write(*s++);return n;}
  size_t print(const __FlashStringHelper* s){return print(reinterpret_cast<const char*>(s));}
  template<class T> size_t print(T v){return print(std::to_string(v).c_str());}
  size_t println(){return write('\n');}
  template<class T> size_t println(T v){return print(v)+println();}
};
class HostSerial:public Print {
 public:
  std::string output, input;
  void begin(int){}
  size_t write(uint8_t c)override{output+=char(c);return 1;}
  int available(){return input.size();}
  char read(){char c=input[0];input.erase(0,1);return c;}
};
extern HostSerial Serial;
inline uint32_t millis(){return hostUs/1000;}
inline uint32_t micros(){return hostUs;}
inline void delay(unsigned long ms){hostUs+=uint64_t(ms)*1000;}
inline void delayMicroseconds(unsigned int us){hostUs+=us;}
inline void pinMode(int,int){}
void digitalWrite(int pin,int value);
int digitalRead(int pin);
inline void tone(int,int,int){}
