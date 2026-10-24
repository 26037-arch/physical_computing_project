# 제작 설명서 PDF V5 작업 지시 (Codex 용)

`docs/BUILD_V5.md`(하루 제작 순서)와 `docs/HARDWARE_V5.md`(치수·절차·검사값), `models/robot_v5/`(STL·STEP·parameters.json·manufacturing.json·kinematic_checks.json·mechanical_checks.json)를 바탕으로
**한국어 제작 설명서 PDF `docs/BUILD_V5_제작설명서.pdf`** 를 만드는 `tools/make_robot_v5_manual.py` 를 작성·실행한다.
`tools/make_robot_v4_manual.py`(reportlab + matplotlib 렌더 + Nanum Gothic `docs/assets/fonts`)의 구조·글꼴 등록·표 스타일을 재사용한다. 파이썬은 `.venv-cad\Scripts\python.exe`.
건드리지 않는 것: `firmware/`, `sim/`, `tests/`, `tools/build_robot_v5.py`, `tools/check_robot_v5*.py`, `tools/robot_v5_params.py`, `docs/HARDWARE_V5.md`, `docs/BUILD_V5.md`(오탈자 외). 커밋하지 않는다.

## 분량·구성 (A4 세로 12~16쪽, 그림은 CAD 에서 직접 렌더 — AI 그림 금지)
1. 표지: 로봇 이름 "V5 큐브 로봇 — 하루에 만드는 3축 구조", 팀(김재혁·나준우), 날짜, 기준 커밋(`git rev-parse --short HEAD`), 조립 전체 렌더(월드 자세, 앞 비스듬히).
2. 한눈에 보기: 장치 3개(컵 모터·후드·리프터) 역할 그림 1장(단면 y–z, 후드 CLOSE/OPEN/LOAD 와 리프터 최하/최상을 색으로 겹쳐 그림) + 작동 원리 5줄(기울기 20°·아래 층만 잡기·위 두 층 감싸기·모서리 들어 넘기기·재배향 표).
3. 부품 지도: 출력 6종 카드(이름·수량·질량 g·출력 자세·예상 시간) + 구매 3종 + 키트 7종 + 나사 17개 표 (BUILD_V5.md 0절). 출력 자세 그림은 각 STL 을 베드 방향으로 렌더.
4. 아침 — 출력: 슬라이서 설정 표, 순서, 먼저 확인할 것(홀더에 큐브 끼워 보기).
5. 출력 중 — 배선: 배선표(HARDWARE_V5.md 4절)와 간단 배선도(블록 다이어그램, matplotlib), 펌웨어 업로드 명령, Vref 설정, `Q 1`/`Y 1` 확인.
6. 조립 7단계: 단계마다 그림 1장(관련 부품만 분해도처럼 띄워 렌더: 모터→베이스, 홀더→축, 후드 서보, 후드 걸기, 리프터, 리프터 서보·크랭크·링크, 고무발) + 나사 규격 + 합격 기준.
7. 조정 7단계 표(BUILD_V5.md 4절)와 LCD 문구.
8. 시연 순서와 관중 배치(가시성: 큐브 높이·열린 면), 실패 유형과 대처.
9. 설계 근거 한 쪽: `kinematic_checks.json` 의 검사값 표(HARDWARE_V5.md 2.5절)와 뒤집기 궤적 그림(`flip_trace` 를 y–z 에 5단계로 겹쳐 그림), 토크 계산 3줄, 실물에서 확인할 가정 4개.
10. 부록: 파일 목록(STL/STEP 경로), 재생성 명령(HARDWARE_V5.md 7절), 라이선스 한 줄(설계 원리 참고: Tilted Twister 2008, CUBOTino CC-BY-4.0; 본 CAD 는 자체 설계), Nanum Gothic OFL.

## 검증
- 생성 후 pypdf 로 쪽수·북마크·글꼴 포함을 확인하고 `models/robot_v5/pdf_checks.json` 에 기록. 한글이 깨지지 않는지 첫 쪽·조립 쪽을 PNG 로 렌더해(matplotlib 로 pdf 를 못 그리면 reportlab 생성 시 같은 그림을 `docs/images/v5_manual/*.png` 로도 저장) 눈으로 확인.
- 표의 숫자는 BUILD_V5.md/HARDWARE_V5.md/manufacturing.json 에서 읽어 넣고 손으로 베끼지 않는다.

## 보고
생성한 파일, 쪽수, 그림 목록, 숫자를 읽어 온 원본 파일, 남은 문제.
