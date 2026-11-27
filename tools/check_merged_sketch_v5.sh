#!/usr/bin/env bash
# 합친 제출용 .ino 를 g++ 호스트 빌드로 검증한다 (arduino-cli 없이).
#  b. Q 1 / S 1 / V 입력 → v5/tests/solve_seed1.test.yaml 의 wait-serial 이 같은 순서로 모두 출력되는지
#  c. 원본 10개 파일(합치기 전)을 같은 스텁으로 빌드한 출력과 글자 단위로 같은지
#  e. 장착 → 섞기 → 꺼내기 → 다시 장착 뒤 큐브 모델이 풀린 상태인지 (STATE 가 풀린 배열)
#  d. -Wall 경고 수
set -u
cd "$(dirname "$0")/.."
MERGED="submission/1반_6팀_1103김재혁_1105나준우_코드.ino"
SRC=v5/firmware/main
STUB=tools/host_sketch_v5
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
python3 tools/merge_sketch_v5.py >/dev/null || exit 1
INPUT=$'Q 1\nS 1\nV\n'

g++ -std=c++17 -O2 -Wall -isystem $STUB/stubs -x c++ "$MERGED" -x c++ $STUB/host_main.cpp -o "$TMP/merged" 2>"$TMP/merged.warn" || { cat "$TMP/merged.warn"; echo "FAIL: merged build"; exit 1; }
g++ -std=c++17 -O2 -Wall -isystem $STUB/stubs -I $SRC -x c++ $SRC/main.ino $SRC/cube.cpp $SRC/solver.cpp $SRC/motors.cpp $SRC/mechanism.cpp $STUB/host_main.cpp -o "$TMP/orig" 2>"$TMP/orig.warn" || { cat "$TMP/orig.warn"; echo "FAIL: original build"; exit 1; }

printf '%s' "$INPUT" | "$TMP/merged" > "$TMP/merged.out"
printf '%s' "$INPUT" | "$TMP/orig" > "$TMP/orig.out"

# b. wait-serial 문자열이 순서대로 나오는지
python3 - "$TMP/merged.out" v5/tests/solve_seed1.test.yaml <<'PY' || exit 1
import re, sys
out = open(sys.argv[1], encoding="utf-8").read()
pos = 0; n = 0
for l in open(sys.argv[2], encoding="utf-8"):
    m = re.match(r'\s*- wait-serial: "(.*)"\s*$', l)
    if not m: continue
    s = m.group(1)
    i = out.find(s, pos)
    if i < 0:
        print("FAIL b: missing/out of order:", s); sys.exit(1)
    pos = i + len(s); n += 1
print("PASS b: %d wait-serial strings found in order" % n)
PY

# c. 원본 빌드와 글자 단위 비교
if cmp -s "$TMP/merged.out" "$TMP/orig.out"; then
  echo "PASS c: merged output == original output ($(wc -c < "$TMP/orig.out") bytes)"
else
  echo "FAIL c: outputs differ"; diff "$TMP/merged.out" "$TMP/orig.out" | head; exit 1
fi

# e. 재장착 리셋: 섞인 채 꺼낸 뒤 다 맞춘 큐브를 다시 넣으면 모델이 풀린 상태여야 한다
SOLVED_FC="UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
for BIN in merged orig; do
  printf 'L\nL\nS 1\nP\nL\nL\nL\nP\n' | "$TMP/$BIN" > "$TMP/reload.$BIN.out"
  STATES=$(grep '^STATE ' "$TMP/reload.$BIN.out")
  FIRST=$(echo "$STATES" | sed -n 1p); SECOND=$(echo "$STATES" | sed -n 2p)
  if [ "$FIRST" = "STATE $SOLVED_FC" ] || [ "$SECOND" != "STATE $SOLVED_FC" ]; then
    echo "FAIL e ($BIN): 섞은 뒤 STATE 는 풀리지 않아야 하고, 재장착 뒤엔 풀려야 한다"; echo "$STATES"; exit 1
  fi
done
echo "PASS e: 재장착 후 모델 리셋 (섞인 상태 -> 재장착 -> 풀린 상태, merged/orig 모두)"

# d. 경고 수
echo "-Wall warnings: merged=$(grep -c 'warning:' "$TMP/merged.warn") original=$(grep -c 'warning:' "$TMP/orig.warn")"
exit 0
