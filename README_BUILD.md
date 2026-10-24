# ROBOT V4 Rev D 제작·검증 자료

- [상세 제작 안내서 PDF · 42쪽](docs/BUILD_V4_상세제작설명서.pdf): 첫 장에 출력·구매·사진 속 키트 재사용·가공품63개 번호를3D로 표시하고 조립·배선·시험 순서를 설명한다.
- [프로젝트 보고서](docs/REPORT.md) · [보고서 PDF](docs/PROJECT_REPORT_V4_프로젝트보고서.pdf): 현재 구조·알고리즘·코드 점검·검증 결과와 한계.
- [물리 검토와 Rev D 변경](docs/PHYSICS_V4.md): 뒤집기 폐지, 스위치 간섭 수정, 강성 계산과 남은 하중 시험.
- [아두이노 코드 점검](docs/ARDUINO_REVIEW_V4.md): 실제 스케치·핀·접점·오류 처리·메모리 확인.
- [하드웨어 기준](docs/HARDWARE_V4.md) · [제작 설명 원문](docs/BUILD_V4.md) · [환경/재현 명령](docs/SETUP.md).
- [이전 커밋 비교·병합 판단](docs/BUILD_V4_MERGE_REVIEW.md), [Rev B 조립 단순화](docs/BUILD_V4_REVB.md), [Rev C 공통 제어 점검 이력](docs/CONSISTENCY_V4.md).

현재 구조는 측면2핀 헤드4개, 아래 중공축 D헤드1개, 6mm 강재 승강 잠금 막대다. 흰색 U를 아래로 놓고 논리D인 상단을 고정한5면 알고리즘을 사용한다. 자동 뒤집기는 금지한다. 6개 이송 모듈을4개 서보 신호로 제어하며, 결합/후퇴 스위치12개를74HC165 두 개로 독립 확인한다.

출력물은33종93개다. **P13/P29는 Rev D 바깥 스위치 받침으로 출력**하고 새12접점 회로를 사용한다. Rev C의 직렬 스위치 배선과 혼용하지 않는다. CAD·가공도·CSV·검사 JSON은 `models/robot_v4/`, 전체 묶음은 `artifacts/robot_v4_build_manual_bundle.zip`에 있다.

`node tools/serve.js` 후 http://localhost:8765/sim/ 에서 같은 구조와 절차를 볼 수 있다. 제어 설정 원본은 `config/robot_v4.json`이고 CAD 치수는 `models/robot_v4/parameters.json`이다.

CAD 이산 간섭·알고리즘·호스트 코드 검증은 통과했다. 실물 출력·조립·부하 시험과 이번 세션의 Wokwi 실행은 하지 않았다. 특히 서보 사점의 끼임 힘, 출력물 강도·크리프와 탈조는 아직 검증되지 않았다. 제작 PDF의 시험 순서를 따라야 한다.
