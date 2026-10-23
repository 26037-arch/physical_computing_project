# robot_v4 통합 제작 Rev C

원격83ade39 + 조립 단순화a7f8bcd를 결합한 파일입니다.
현재 기준은 docs/BUILD_V4_MERGE_REVIEW.md와 상세 PDF(41쪽)입니다.
첫 장은61개 번호가 있는 A2 부품 지도이며 이후는 A4입니다.

- ../print/: P01~P28 및 P30, 본체89개 출력. 측면 P30 네 개, D P07 한 개.
- print/: P29 스위치 받침1개. jigs/: J01~J03 세 개. 전체33종93개.
- cut/: 패널/잠금 금속판 DXF(mm,1:1)와 금속 구매품 참고 STEP.
- robot_build_assembly.step: 최신 전체 프레임 조립 모델.
- parts_BOM.csv / fastener_BOM.csv: 조달/체결표. F17/F18은0, M3 인서트69/M4 인서트14.
- kit_checks.json / mesh_checks.json / pdf_checks.json: 검사 결과.

6 mm 막대,6.4 소켓, 원뿔 끝 핀, 측면16×50 띠 판을 사용합니다.
이전8 mm 막대·J02/J03·측면50×50 판과 혼용하지 마세요.
서보 받침은 프로파일에3점 체결하며 전산봉·간격관은 쓰지 않습니다.
실물 강도/마찰/반복 정밀도는 시험 전입니다. 구매품 실제 외형을 대조하세요.

재생성(저장소 루트):
python tools/build_robot_v4.py --stl-tolerance 0.1 --stl-angular 0.3
python tools/build_robot_v4_kit.py
python tools/check_robot_v4.py
python tools/check_robot_v4_kit.py
python tools/check_robot_v4_meshes.py
node tools/embed_models_v4.js
python tools/make_robot_v4_manual.py
python tools/check_robot_v4_manual.py
python tools/package_robot_v4.py
