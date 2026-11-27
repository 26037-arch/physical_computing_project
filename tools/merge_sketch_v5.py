#!/usr/bin/env python3
"""V5 펌웨어(v5/firmware/main 10개 파일)를 제출용 단일 .ino 로 합친다.
사용: python3 tools/merge_sketch_v5.py   (결과: submission/1반_6팀_1103김재혁_1105나준우_코드.ino)
함수 본문·상수는 바꾸지 않는다. 로컬 #include "x.h" 와 #pragma once 줄만 지우고,
<...> include 는 맨 위로 중복 없이 모은다."""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "v5", "firmware", "main")
OUT = os.path.join(ROOT, "submission", "1반_6팀_1103김재혁_1105나준우_코드.ino")

ORDER = ["tables.h", "cube.h", "solver.h", "motors.h", "mechanism.h",
         "cube.cpp", "solver.cpp", "motors.cpp", "mechanism.cpp", "main.ino"]
ROLES = {
    "tables.h": "자동 생성 표(이동 순열, 크로스·F2L 거리표, OLL/PLL 공식 조회표)",
    "cube.h": "큐브 상태 모델 선언 (코너·에지 순열/방향, 18수)",
    "solver.h": "CFOP 풀이기 선언 (크로스·F2L IDA*, OLL·PLL 조회)",
    "motors.h": "A4988 스텝 모터(컵) 핀·마이크로스텝·가속 상수와 Motors 선언",
    "mechanism.h": "기구 절차 선언 (후드 서보·리프터 서보, 스핀·뒤집기·층 회전)",
    "cube.cpp": "큐브 상태 모델 구현 (수 적용, 54 스티커 출력, 섞기 수열·수열 파싱)",
    "solver.cpp": "풀이기 구현 (크로스 IDA*, F2L 트리거 매크로 IDA*, OLL/PLL 표 조회)",
    "motors.cpp": "스텝 모터 구동 구현 (등가속 사다리꼴 램프)",
    "mechanism.cpp": "기구 절차 구현 (장착·배출, 후드, 스핀, 뒤집기, 재배향)",
    "main.ino": "setup/loop, 시리얼 명령 처리, 버튼(짧게/길게), LCD, 부저",
}
LOCAL = re.compile(r'^\s*#\s*include\s*"[^"]+"\s*$')
SYSINC = re.compile(r'^\s*#\s*include\s*<[^>]+>\s*(//.*)?$')
PRAGMA = re.compile(r'^\s*#\s*pragma\s+once\s*$')


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8", newline="") as f:
        return f.read().replace("\r\n", "\n").split("\n")


def main():
    sys_inc, bodies = [], []
    for name in ORDER:
        lines = read(name)
        if lines and lines[-1] == "":
            lines.pop()
        kept = []
        for ln in lines:
            if LOCAL.match(ln) or PRAGMA.match(ln):
                continue
            if SYSINC.match(ln):
                key = re.search(r'<([^>]+)>', ln).group(1)
                if key not in [k for k, _ in sys_inc]:
                    sys_inc.append((key, ln.strip()))
                continue
            kept.append(ln)
        bodies.append((name, kept))
    # <Arduino.h> 를 맨 앞으로
    sys_inc.sort(key=lambda kv: kv[0] != "Arduino.h")

    main_lines = read("main.ino")
    start = next(i for i, l in enumerate(main_lines) if l.startswith("// 시리얼(115200)"))
    end = start
    while main_lines[end].startswith("//"):
        end += 1
    cmd_lines = main_lines[start:end]

    h = []
    h.append("// ====================================================================")
    h.append("// 아두이노 큐브 풀이 로봇 V5H — 제출용 단일 스케치")
    h.append("// 팀: 1반 6팀 (1103 김재혁 · 1105 나준우)    컴퓨터과학2 피지컬 컴퓨팅 수행평가")
    h.append("// 보드: Arduino UNO R4 WiFi (UNO R3 호환 — 헤더 핀 배치 동일)")
    h.append("// 필요 라이브러리: Servo (내장), Wire (내장), LiquidCrystal I2C (LiquidCrystal_I2C.h, 라이브러리 관리자에서 설치)")
    h.append("// 사용법: Arduino IDE 에서 이 파일 하나만 열어 그대로 컴파일·업로드한다 (파일 하나로 합친 것이며 로직은 원본과 같다).")
    h.append("//")
    h.append("// 합치기 전 원본 파일 (v5/firmware/main/) — 이 파일 안에서 아래 순서로 이어 붙였다:")
    for n in ORDER:
        h.append("//   %-14s %s" % (n, ROLES[n]))
    h.append("//")
    h.append("// 버튼 사용법 (A2 버튼 1개): 짧게 누름 = START (풀린 상태면 섞기, 아니면 풀기),")
    h.append("//                           1.2 s 이상 길게 누름 = LOAD (장착 / 장착 중이면 배출).")
    h.append("//")
    h.extend(cmd_lines)
    h.append("// ====================================================================")
    h.append("")
    h.extend(i for _, i in sys_inc)
    h.append("")
    out = h
    for name, kept in bodies:
        out.append("// ===== 원본: %s =====" % name)
        while kept and kept[0] == "":
            kept.pop(0)
        out.extend(kept)
        out.append("")
    text = "\n".join(out).rstrip("\n") + "\n"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote", os.path.relpath(OUT, ROOT), "(%d lines)" % text.count("\n"))


if __name__ == "__main__":
    sys.exit(main())
