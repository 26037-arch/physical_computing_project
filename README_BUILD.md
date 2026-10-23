# 실제 제작은 V3 문서에서 시작하세요

- 설계도: [docs/BUILD_V3_제작설계도.pdf](docs/BUILD_V3_제작설계도.pdf)
- 제작 순서/남은 검증: [docs/BUILD_V3.md](docs/BUILD_V3.md)
- 전체 조립: `models/robot_v3/robot_assembly.step`
- 출력 부품: `models/robot_v3/print/` (23종, 시험편 포함84개)
- 패널/금속 가공: `models/robot_v3/purchase_and_cut/`
- 구매 목록: `models/robot_v3/purchase_BOM.csv`, `fastener_BOM.csv`

V3는 고정 중앙축, F/B 중공 구동, 반대 면 잠금, 프레임을 포함한 **수동 시운전 제작안**입니다. 실제 펌웨어는 매 수 준비 후 H 승인이 있어야 돌아갑니다. Q 1은 모터 출력이 없는 가상 모드입니다. 자동 이송/잠금은 아직 구현하지 않았습니다.

기존 `sim/` 3D 화면은 V2 표시를 유지합니다. V3의 실제 형태는 STEP/GLB/PDF를 보세요. V1/V2 모델은 이력으로 보존하며 혼용하지 않습니다. 실물 출력·조립·토크/탈조 시험은 아직 수행하지 않았습니다.
