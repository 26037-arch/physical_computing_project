# 핵심 알고리즘의 수학적 정리

코드에서 읽기 어려운 부분을 식으로 다시 쓴다. 각 절 끝에 해당 코드 위치를 적었다.
기호: 코너 위치 집합 $C=\{0,\dots,7\}$, 엣지 위치 집합 $E=\{0,\dots,11\}$, 면 $F=\{U,R,F,D,L,B\}=\{0,\dots,5\}$.

---

## 1. 큐브 상태 = 치환 + 방향 벡터

큐브 상태 $s$ 를 네 배열로 나타낸다.

$$
s = (\sigma_c,\ o_c,\ \sigma_e,\ o_e),\qquad
\sigma_c \in S_8,\ o_c \in \mathbb{Z}_3^{8},\ \sigma_e \in S_{12},\ o_e \in \mathbb{Z}_2^{12}
$$

- $\sigma_c(i)$ = 위치 $i$ 에 놓인 코너 조각의 번호 (`cp[i]`), $o_c(i)$ = 그 조각이 제자리 방향에서 시계 방향으로 몇 번 꼬였는지 (`co[i]`).
- 엣지도 같다 (`ep`, `eo`). 풀린 상태는 $\sigma=\mathrm{id},\ o=0$.

물리적으로 가능한 상태는 세 제약을 만족한다.

$$
\sum_i o_c(i) \equiv 0 \pmod 3,\qquad \sum_i o_e(i)\equiv 0 \pmod 2,\qquad \operatorname{sgn}\sigma_c=\operatorname{sgn}\sigma_e
$$

따라서 상태 수는 $\dfrac{8!\cdot 3^8\cdot 12!\cdot 2^{12}}{3\cdot 2\cdot 2} = 43{,}252{,}003{,}274{,}489{,}856{,}000 \approx 4.3\times10^{19}$ 이다.
(계획서의 "DFS·BFS가 막히는 지점"의 정확한 크기.)

> 코드: `sim/cube.js` `class Cube`, `firmware/main/cube.h` `struct Cube`.

## 2. 수(move)의 적용 = 군의 곱

한 수 $M$ 도 같은 꼴 $(\sigma^M_c, o^M_c, \sigma^M_e, o^M_e)$ 로 쓴다. 상태 $s$ 에 $M$ 을 적용한 결과 $s\cdot M$ 은

$$
(s\cdot M)_{\sigma}(i) = \sigma\big(\sigma^M(i)\big),\qquad
(s\cdot M)_{o}(i) = o\big(\sigma^M(i)\big) + o^M(i) \pmod{3\ \text{또는}\ 2}
$$

뜻: 수 $M$ 뒤에 위치 $i$ 로 오는 조각은 원래 위치 $\sigma^M(i)$ 에 있던 조각이고, 방향은 그 조각의 방향에 $M$ 이 그 위치에서 더하는 꼬임 $o^M(i)$ 를 더한 것이다.
이 연산은 결합법칙을 만족하므로 18수 전체는 군(루빅스 큐브 군)을 생성한다. $M^{-1}$ 은 $M$ 을 세 번 곱한 것이고 ($M^4=\mathrm{id}$), 수 번호는

$$
m = 3f + (k-1),\qquad f\in F,\ k\in\{1,2,3\}\ (\text{시계 } 90^\circ,\ 180^\circ,\ \text{반시계 } 90^\circ)
$$

$M_{3f+1}=M_{3f}^2,\ M_{3f+2}=M_{3f}^3$ 로 기본 6수에서 18수를 만든다.

> 코드: `cube.js` `mult`, `Cube.move`; `cube.cpp` `Cube::move` (`MOVE_CP/CO/EP/EO` 는 $\sigma^M, o^M$ 표).

## 3. 조각 하나의 상태와 군 작용의 사영

조각 $x$ 하나만 보면 그 상태는 (위치, 방향) 쌍이다.

$$
\pi_x(s) = (p, o),\quad p=\sigma^{-1}(x),\ o = o(p)\qquad
\Rightarrow\quad \text{엣지 } 12\times2=24 \text{가지},\ \text{코너 } 8\times3=24 \text{가지}
$$

(코드의 "엣지 상태 $=2p+o$, 코너 상태 $=3p+o$".)
수 $M$ 이 조각 상태에 미치는 영향은 전체 상태와 무관하게 결정된다:

$$
\pi_x(s\cdot M) = \big(q,\ o + o^M(q)\big),\qquad q = (\sigma^M)^{-1}(p)
$$

즉 $T_M(p,o) = \big((\sigma^M)^{-1}(p),\ o+o^M((\sigma^M)^{-1}(p))\big)$ 이고, 이것이 표 `EDGE_TO[m][p]` $=(\sigma^M)^{-1}(p)$, `EDGE_DO[m][p]` $=o^M(q)$ 이다.

**핵심 성질 (등변성)**: $\pi_x(s\cdot M)=T_M(\pi_x(s))$. 그래서 탐색 중에는 40 바이트의 $s$ 대신 관심 조각들의 $\pi_x(s)$ (조각당 1 바이트)만 갱신해도 휴리스틱이 정확히 같다. 조각 $k$ 개를 추적하면 한 수의 비용은 표 조회 $2k$ 번이다.

> 코드: `tools/gen_tables.js` `edgeTo/edgeDo/cornTo/cornDo`, `eStep/cStep`; `solver.cpp` `eStep/cStep`, `childFits`.

## 4. 거리표와 허용성(admissibility)

조각 집합 $P$ (예: 크로스 엣지 두 개, F2L 코너·엣지 쌍)에 대해 사영 상태 공간 $X_P=\prod_{x\in P}\{(p,o)\}$ 위에 그래프를 만든다: 허용 수 집합 $\mathcal{M}$ (크로스는 18수, F2L은 D 를 뺀 15수)에 대해 $u\to T_M(u)$ 간선. 거리표는 목표 $u^*$ (모두 제자리·방향 0) 로부터의 BFS 거리다.

$$
d_P(u) = \min\{\,\ell : \exists M_1..M_\ell\in\mathcal M,\ T_{M_\ell}\circ\cdots\circ T_{M_1}(u)=u^*\,\}
$$

**보조정리**: 실제 상태 $s$ 를 $L$ 수로 푸는 수열이 있으면, 같은 수열을 $\pi_P(s)$ 에 적용한 사영 경로의 길이도 $L$ 이고 끝점은 $u^*$ 이다 (등변성). 따라서 $d_P(\pi_P(s)) \le L$, 즉

$$
h_P(s) := d_P(\pi_P(s)) \le d^*(s)\quad(\text{실제 최단 거리}).
$$

허용적 휴리스틱들의 최댓값도 허용적이므로

$$
h(s) = \max_{P\in\mathcal P} h_P(s) \le d^*(s)
$$

가 성립한다. 크로스는 $\mathcal P$ = 크로스 엣지 쌍 6개 (각 $24\times24$), F2L 은 $\mathcal P$ = 크로스 쌍 6개 + 추적 슬롯의 코너·엣지 쌍들 (각 $24\times24$)이다. 한 수에 각 조각이 한 번만 움직이므로 $|h(s)-h(s\cdot M)|\le 1$ (일관성)도 성립해 IDA* 가 같은 상태를 다시 열어도 손해가 없다.

왜 한 조각 거리표보다 두 조각 쌍 표가 좋은가: $d_{\{a,b\}} \ge \max(d_a, d_b)$ 이고, 두 조각이 서로 길을 막는 상황을 반영하므로 보통 1~2 더 크다. 표의 최댓값은 크로스 쌍 5, F2L 쌍 6 이다.

> 코드: `gen_tables.js` `bfs`, `edgePair`, `cornEdgePair`; `solver.js` `hCross/hF2L`; `solver.cpp` `hCross/heuristic`.

## 5. IDA* 와 가지치기

$f(n)=g(n)+h(n)$. 한계 $B$ 를 $h(s_0)$ 에서 시작해 1씩 올리며, $f>B$ 인 노드는 자르는 깊이우선 탐색이다. 메모리는 경로 길이에 비례하고(계획서의 "DFS 의 메모리 + A* 의 방향 감각"), $h$ 가 허용적이므로 처음 찾는 해는 허용 수 집합 안에서 최단이다.

중복 수열 제거(같은 상태를 다른 순서로 만드는 수열을 하나만 남김):

1. 같은 면 연속 금지: $X^a X^b = X^{a+b}$ 이므로 한 수로 합쳐진다.
2. 반대면은 가환: $U D = D U$ 이므로 $(U,D)$ 순서만 허용하고 $(D,U)$ 는 버린다. 코드 규칙 "반대면이고 면 번호가 작은 쪽을 먼저" 가 이것이다.

분기 수는 첫 수 18, 이후 평균 $\approx 13.3$ 이고 깊이 $d$ 의 노드 수는 대략 $13.3^{\,d-h}$ 규모라, 한계 $B$ 가 1 늘 때마다 비용이 약 13배가 된다. 300개 섞기에서 F2L 깊이 8 → 9 로 갈 때 노드가 10만 → 200만으로 뛰는 관측과 맞는다.

**부모에서의 자식 판정** (Codex 최적화): 자식 $n'$ 의 조건 $g+1+h(n')\le B$ 는 $h(n') \le B-g-1 =: \text{limit}$ 과 같다. 거리표 중 하나라도 limit 를 넘으면 최댓값도 넘으므로 나머지 조각은 갱신할 필요가 없다 (조기 탈출). 노드 수 세기는 자식 생성 시 1회로 같다.

> 코드: `solver.js` `search/ida`; `solver.cpp` `search/ida/childFits`.

## 6. F2L 두 겹 전략의 정당화

슬롯 $s\in\{FR,FL,BL,BR\}$ 의 쌍 거리 $h_s$ 가 작은 순으로 깊이 $\le 8$ 탐색을 시도하고, 모두 실패하면 첫 후보에 대해

- **꺼내기**: 목표 $G'=\{\pi_c\in U\text{층},\ \pi_e\in U\text{층},\ \text{완성 슬롯·크로스 유지}\}$, 휴리스틱 $h' = \max(h_{\text{유지}},\ [\text{두 조각 중 하나라도 U 층 밖}])$. 조각이 U 층 밖이면 최소 1수가 필요하므로 허용적이다.
- **끼우기**: 꺼낸 상태에서 보통 깊이 $\le 8$ 탐색.

전체 길이는 최단보다 2~3수 길어질 수 있지만, 깊이 9 반복(13배)을 피한다. 결과: F2L 한 쌍 최대 노드 $2.9\times10^6 \to 5.5\times10^5$, 평균 수 54.6 → 54.7.

> 코드: `solver.js` `solve` (F2L 루프), `solver.cpp` `Solver::solve`, `MODE_EXTRACT`.

## 7. OLL·PLL 인식 키의 역연산 유도

F2L 이 끝난 상태 $s$ 는 D·E 층 조각이 모두 제자리다. 공식 $A$ (수열) 와 사전 조정 $r\in\{\mathrm{id},U,U^2,U^3\}$ 에 대해

**OLL**: 목표는 "U 층 방향이 모두 0". 2절의 식에서 $A$ 를 적용한 뒤의 방향은

$$
o'(i) = o\big(\sigma^A(i)\big) + o^A(i)
$$

로, **어느 조각이 어디 있는지($\sigma$)와 무관하게 방향 벡터만의 아핀 함수**다. 따라서 "$s\cdot r$ 의 방향 벡터가 $A^{-1}$ 의 방향 벡터와 같다" $\iff$ "$s\cdot r\cdot A$ 는 방향이 모두 0" 이다. 그래서 키는 방향만 쓴다:

$$
\mathrm{key}_{OLL}(s) = \Big(\sum_{i=0}^{3} o_c(i)\,3^{3-i}\Big)\cdot 2^4 + \sum_{i=0}^{3} o_e(i)\,2^{3-i} \in [0, 1295]
$$

표에는 $\mathrm{key}_{OLL}(I\cdot A^{-1})$, 즉 풀린 큐브에 $A^{-1}$ 을 적용한 상태의 키를 넣는다. 조회는 $r$ 네 가지에 대해 $\mathrm{key}_{OLL}(s\cdot r)$ 를 찾고, 찾으면 풀이는 $r$ 뒤에 $A$ 다.

**PLL**: 목표는 풀린 상태. 공식 뒤 조정 $u\in\{U^k\}$ 까지 허용하면

$$
s\cdot r\cdot A\cdot u = I \iff s\cdot r = u^{-1} A^{-1}
$$

이므로 표에는 $(A,u)$ 마다 $\mathrm{key}_{PLL}(I\cdot u^{-1}\cdot A^{-1})$ 를 넣는다 (21공식 × 4 = 84 항목 + $A$ 가 빈 "AUF 만" 3항목 = 87). 방향이 이미 0 이므로 키는 위치만:

$$
\mathrm{key}_{PLL}(s) = \sum_{i=0}^{3}\sigma_c(i)\,2^{14-2i} + \sum_{i=0}^{3}\sigma_e(i)\,2^{6-2i} \in [0, 2^{16})
$$

**경우의 수 검산**: OLL 상태는 $o_c\in\mathbb Z_3^4$ (합 $\equiv 0$: 27가지) × $o_e\in\mathbb Z_2^4$ (합 짝수: 8가지) = 216. U 회전 4개로 묶으면 57 경우 + 풀린 1 이다. PLL 상태는 $\sigma_c,\sigma_e\in S_4$ 에 부호 일치 조건 → $24\cdot24/2=288$. 사전·사후 U 조정으로 묶으면 21 경우 + 풀린 1. 생성기는 이 216·288 상태 전부에 대해 "조회됨 ∧ 적용 후 목표 달성" 을 검사한다.

> 코드: `gen_tables.js` `ollKey/pllKey`, OLL/PLL 생성과 커버리지 검사; `solver.js`/`solver.cpp` `lookupOLL/lookupPLL`.

## 8. 사람 공식 → 로봇 6면 수열 (회전의 켤레)

사람 공식에는 wide 수($r,f,\dots$), 슬라이스($M,E,S$), 전체 회전($x,y,z$)이 있지만 로봇은 겉면 6개만 돌릴 수 있다. 전체 회전 $\rho$ 와 면 수 $X$ 에 대해

$$
\rho\,X = X^{\rho}\,\rho\qquad (X^{\rho} = \rho \text{로 이름을 바꾼 면의 같은 방향 회전})
$$

이 성립한다 (회전을 먼저 하고 "원래 $X$ 였던 면"을 돌리는 것과 같다). 그러므로 회전이 섞인 수열 $S = X_1\rho_1 X_2\rho_2\cdots$ 에서 회전을 모두 오른쪽으로 밀면

$$
S = S'\cdot \rho_{\text{net}},\qquad S' = X_1\,X_2^{\rho_1}\,X_3^{\rho_1\rho_2}\cdots\ (\text{겉면 수만})
$$

코드의 `phys` 배열이 바로 누적 회전 $\rho_1\rho_2\cdots$ 에 의한 "표기 면 → 실제 모터 면" 이름표다. wide·슬라이스는 다음 항등식으로 면 수 + 회전으로 분해한다.

$$
r = L\,x,\quad l = R\,x^{-1},\quad u = D\,y,\quad d = U\,y^{-1},\quad f = B\,z,\quad b = F\,z^{-1}
$$
$$
M = R\,L^{-1}\,x^{-1},\qquad E = U\,D^{-1}\,y^{-1},\qquad S = F^{-1}\,B\,z
$$

(예: $r$ 은 R 층과 가운데 층을 R 방향으로 돌리는 것 = 큐브 전체를 $x$ 로 돌린 뒤 L 층만 되돌린 것.)

**왜 $\rho_{\text{net}}$ 를 버려도 되는가**: 큐브 상태는 "센터 기준 상대 위치"이므로 전체 회전은 상태를 $\rho^{-1}s\rho$ 로 켤레할 뿐이고, 풀린 상태 $I$ 는 $\rho^{-1} I \rho = I$ 로 불변이다. 따라서

$$
s\cdot S = I \iff s\cdot S' = I .
$$

OLL/PLL 은 "풀린 상태(또는 방향 0)" 가 목표이므로 $S'$ 가 $S$ 와 같은 경우를 푼다. 생성기는 변환된 $S'$ 가 F2L 을 보존하는지(가 아니면 변환 오류 또는 공식 오타) 검사한다.

> 코드: `cube.js` `expandAlg` (`rot.x/y/z` 가 $\rho$ 에 의한 이름표 갱신, `WIDE` 표가 위 항등식).

## 9. 섞기 수열의 결정성

xorshift32: $x \leftarrow x \oplus (x\ll 13),\ x\leftarrow x\oplus(x\gg 17),\ x\leftarrow x\oplus(x\ll 5)$ (32비트). 주기 $2^{32}-1$, 시드 0 은 $0x9E3779B9$ 로 대체. 면 $f = x \bmod 6$ (직전 면과 같으면 버림), 회전 $k = x' \bmod 3$. JS 는 `>>> 0` 으로, C++ 은 `uint32_t` 로 같은 32비트 산술을 쓰므로 같은 시드에서 같은 20수가 나온다. 이것이 "JS 기대 출력 = 보드 출력" 교차검증의 전제다.

> 코드: `cube.js` `scramble`, `cube.cpp` `scrambleSeq`.

## 10. 복잡도 요약

| 항목 | 식 | 값 |
|---|---|---|
| 탐색 노드 1개 비용 | 추적 조각 $k$ 개 × 표 조회 2 + 거리표 조회 $|\mathcal P|$ | 크로스 $k=4$, F2L $k\le 12$ |
| 재귀 한 단계 메모리 | $k$ 바이트 (+ 프레임) | 12 B (+약 55 B) |
| 거리표 | $6\cdot 576 + 4\cdot 576 + 24\cdot(12+12+8)$ | 6,528 B (플래시) |
| OLL/PLL 표 | 키 2 B × (57+87) + 수열 574+1184 B | ≈ 2.0 KB (플래시) |
| 깊이 $d$ 노드 수 | $\approx 13.3^{\,d-h_0}$ | 깊이 8 중앙값 8.5k, 깊이 9 ≈ 2M |
| 실측 속도 | 노드/초 | Uno 16 MHz: 22.9k (최적화 후), Node: 수백만 |
