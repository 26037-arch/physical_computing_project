# 실제 제작은 V4 문서에서 시작하세요

- 기구·절차·핀 배치·장치 목록: [docs/HARDWARE_V4.md](docs/HARDWARE_V4.md) (0절에 장치마다 기능과 추가한 이유)
- CAD: `tools/build_robot_v4.py` → `models/robot_v4/` (출력 STL, 조립 STEP, parameters.json, 검사 결과)
- 펌웨어: `firmware/main/` (`mechanism.*` 가 이송·뒤집기·장착을 자동으로 수행, 결합 스위치 확인)
- 시뮬레이터: `node tools/serve.js` → http://localhost:8765/sim/ (V4 기구, LOAD/FLIP 버튼)

V4는 **위 헤드가 없고 중앙축 대신 승강 잠금 막대**를 쓰는 구조다: 측면 2핀 헤드 4개 + 아래 D 헤드(중공축·벨트) + 잠금 막대(8 mm 각재, 뒤집기 때만 내려감). 여섯 이송 유닛 모두 같은 서보 크랭크와 결합 스위치. 큐브는 위로 넣고 빼며 U 층은 뒤집어서 아래에서 돌린다. V3(고정 중앙축·수동 잠금, `docs/BUILD_V3.md`)와 V2·V1 은 이력으로 보존하며 혼용하지 않는다. 실물 출력·조립·토크/탈조·뒤집기 마찰 시험은 아직 수행하지 않았다.
