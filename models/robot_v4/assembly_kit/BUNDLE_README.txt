robot_v4 조립 단순화 Rev B 배포 묶음

1. docs/BUILD_V4_상세제작설명서.pdf (40쪽)를 먼저 읽으세요.
   첫 장은 60개 번호가 있는 A2 가로 부품 지도, 이후는 A4입니다.
2. 이 묶음은 병합 커밋d8c21f4에 조립 단순화 Rev B를 통합한 제작 파일입니다.
   기존 저장소 루트와 같은 경로 구조로 적용하세요. 전체 펌웨어 저장소 사본은 아닙니다.
3. 프린터 출력: models/robot_v4/print (P01~P28), assembly_kit/print (P29), assembly_kit/jigs (J01~J03).
   총32종93개는 시험편/지그를 포함합니다. PDF의 수량과 출력 방향을 확인하세요.
4. 가공: models/robot_v4/assembly_kit/cut/*.dxf (mm,1:1). 판재는 구매 후 절단하는 부품입니다.
5. 전체 CAD: models/robot_v4/assembly_kit/robot_build_assembly.step
6. 부품표: assembly_kit/parts_BOM.csv, fastener_BOM.csv (Excel에서 열 수 있는 UTF-8 BOM).
7. 재생성은 tools/requirements-robot-v4.txt 의존성과 docs/assets/fonts 글꼴이 필요합니다.
   python tools/build_robot_v4.py --stl-tolerance 0.1 --stl-angular 0.3
   python tools/build_robot_v4_kit.py
   python tools/check_robot_v4.py
   python tools/check_robot_v4_kit.py
   python tools/check_robot_v4_meshes.py
   node tools/embed_models_v4.js
   python tools/make_robot_v4_manual.py
8. 실제 구매품 외형과 맞춤을 출력 전에 대조하세요. V4 Draft/V2/V3 출력물을 혼용하지 마세요.
9. 기하/메시/PDF 검사는 통과했으며 실물 강도·잠금 유격·뒤집기 마찰·자동풀이 성능은 아직 실측하지 않았습니다.
   PDF의 단계별 합격 시험을 먼저 수행하세요. Rev B 변경과 검토 기록은 docs/BUILD_V4_REVB.md입니다.

10. Rev B는 전산봉/간격관을 없앴습니다. P13/P14/P15/P23/P25/P26/P29는 새 파일을 사용하세요.
    F17/F18 수량은0이며 M5 직접 체결과 M3/M4 인서트 수량이 변경되었습니다.
    python tools/check_robot_v4_manual.py
    python tools/package_robot_v4.py
