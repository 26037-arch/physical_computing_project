// tools/host_solver/avr/pgmspace.h — PROGMEM 스텁 (PC 에서는 일반 메모리)
#pragma once
#include <stdint.h>
#include <string.h>
#define PROGMEM
#define pgm_read_byte(p) (*(const uint8_t*)(p))
#define pgm_read_word(p) (*(const uint16_t*)(p))
#define strcpy_P strcpy
