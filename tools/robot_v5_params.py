"""robot_v5_params.py — V5 기구 치수 한 벌 (docs/HARDWARE_V5.md 2절). 검사기·CAD·임베드 스크립트가 import 한다."""
P = dict(
    cube_mm=57.0, layer_mm=19.0, tilt_deg=20.0,
    post_clearance_mm=1.0, post_h_mm=15.0, post_t_mm=5.0, post_arm_mm=17.0, post_chamfer_mm=4.0,   # Rev B: 두께 5·모따기 4 → 윗면 1 mm 유지
    post_flip_relief_deg=65.1, post_flip_pivot_y_mm=-28.3, post_flip_margin_mm=0.2,                # CAD 조정: 큐브 폭 안의 안쪽 팔만 전복 경사면으로 비움; 바깥 코너 높이 15 유지
    post_footprint_trim=True,                                                                  # 판 밖으로 뜨는 기둥 모서리를 판 외곽으로 자름
    plate_mm=70.0, plate_t_mm=4.0, notch_w_mm=20.0, notch_y_mm=23.0,                                 # Rev B: 기둥 바깥 34.5 를 덮도록 70
    plate_corner_r_mm=1.5,                                                                      # CAD 조정: R6 둥근 판 밖에 뜨던 기둥 코너를 받치고 높이 15·윗면 1 유지
    plate_shaft_relief_d_mm=5.4, plate_shaft_relief_depth_mm=4.0,                                 # 키트 보정(2026-11-15): 축 길이 24(끝 z−1)·25 도 받도록 판을 관통 (이전 1.5 는 길이 22 가정)
    horizontal_bore_roof_relief=True,                                                           # 원형 끼움 치수 유지 + 출력 위쪽 45° 물방울형 브리징 여유
    hub_d_mm=16.0, hub_h_mm=14.0, hub_flange_d_mm=30.0, hub_flange_t_mm=3.0,                          # Rev B: 허브는 별도 부품(플랜지 Ø30×3, M3 ×2 로 판 밑에 체결) → 두 부품 모두 서포트 없이 출력
    motor_mm=42.3, motor_box_outer_mm=50.0, motor_face_z_mm=-25.0, motor_len_mm=40.0, motor_plate_t_mm=5.0,
    motor_shaft_len_mm=24.0, motor_cable_slot_w_mm=18.0, motor_cable_slot_h_mm=14.0,                # 키트 보정: 17HS4401 축 24, 뒷벽에 커넥터·케이블 창(폭 18, 모터 밑에서 14)
      # Rev B: 윗판 z −25~−20 이 모터 면 위에 얹힘, 안치수 44
    table_zw_mm=-78.0,                                                                           # Rev B: 모터 최저 월드 −68.3 아래 베이스 바닥
    foot_boss_d_mm=12.0,                                                                        # CAD 조정: Ø10×1 고무 홈 둘레 1mm 링으로 천장 브리징 지지
    hood_clearance_mm=1.5, hood_wall_mm=3.0, hood_bottom_z_mm=21.0, hood_roof_clear_mm=1.5, hood_roof_t_mm=3.0, hood_back_wall=False,   # Rev B: 뒷벽 없음(ㄷ자) — 힌지를 올려도 뒷벽이 큐브로 들어오지 않게
    hinge_y_mm=-90.0, hinge_z_mm=40.0, hinge_hub_d_mm=20.0, arm_t_mm=6.0,                              # Rev B: 힌지 (−82, 14.4)→(−90, 40): 앞벽이 열리며 큐브로 들어오지 않고(z), FLIP 90° 에서 팔이 리프터 크로스바 뒤에 있다(y)
    hood_arm_roof_web=True, lifter_print_ramp=True,                                              # CAD 조정: 팔 윗변을 지붕 높이까지, 몸통 윗변은 입술 밑까지 연결해 출력 지지
    sg90_mount_outer_x_mm=-63.3, sg90_mount_bottom_offset_mm=50.0,                               # 키트 보정: 귀 윗면이 판 바깥면(x −66.3)에 앉을 때 축 끝이 크랭크 포켓 바닥(x −55.5)에 오도록 −61.5→−63.3 (TowerPro 표: 전체 30.3, 귀 밑 17 + 귀 두께 2.5)
    sg90_body_l_mm=22.7, sg90_body_w_mm=12.2, sg90_axis_to_end_mm=6.1, sg90_hole_pitch_mm=27.7, sg90_body_dir=-1.0,   # 키트 보정: SG90 출력축은 몸통 가운데가 아니라 한쪽 끝에서 6.1 — 포켓·구멍을 축 기준 뒤(−y)로 5.25 옮김 (앞으로 옮기면 거싯이 링크 경로에 든다)
    sg90_fit_clear_mm=0.3, crank_boss_len_mm=3.2, crank_boss_d_mm=7.0,                            # 키트 보정: 포켓 여유 0.3/면, 크랭크 보스가 스플라인 3.2 중 2.7 을 문다 (이전 1.6)
    mg996r_rear_lug_mm=3.0, mg996r_pocket_open_top=True,                                          # CAD 조정: 뒤 체결 구멍의 바깥 고리, 열린 위쪽 포켓으로 외팔 천장 제거
    mg996r_body_l_mm=40.9, mg996r_body_w_mm=20.0, mg996r_axis_to_end_mm=10.2, mg996r_fit_clear_mm=0.3,   # 키트 보정: TowerPro 표 B 40.9·D 20 — 포켓 40.5×20.5 → 41.5×20.8
    mg996r_hole_pitch_l_mm=49.5, mg996r_hole_pitch_w_mm=10.0, mg996r_hole_d_mm=2.8,                 # 키트 보정: 귀가 타워 바깥면에서 4.7 떠 있고(TowerPro 표: 케이스 윗면 37, 귀 밑 26.8 + 귀 두께 2.5) 안쪽은 후드 팔이라 너트를 못 쓴다 → Ø2.8 셀프탭
    hood_open_deg=60.0, hood_flip_deg=90.0, hood_load_deg=120.0,                                      # Rev B: FLIP 70→90 (팔이 리프터를 비킴), LOAD 150→120 (뒤로 덜 나감)
    lift_contact_y_mm=-27.0, lift_bottom_z_mm=-6.5, lift_stroke_mm=66.0, lift_dir_deg=26.0,   # 선반 앞끝 Q 가 z=0 을 지날 때 y=−27 (모서리 안쪽 1.5). 경로: 위로 가며 뒤(−y)로 26°
    shelf_len_mm=3.5, shelf_t_mm=2.5, lip_h_mm=1.5, lip_t_mm=3.0, hook_w_mm=16.0, cube_edge_r_mm=1.5,
    slider_bar_dy_mm=-14.0, slider_bar_dz_mm=-5.0, slider_bar_mm=4.0, slider_bar_half_x_mm=38.5,   # 크로스바(핀) 중심: Q 기준 상대 위치. 바는 |x|≤38.5(타워 안쪽 39.5 안), 슬롯은 M3 볼트 몸통만 지난다
    crank_r_mm=33.0, link_mm=70.0,                                                               # 위쪽 축의 실제 90° 행정 41.2667; 아래쪽 축의 참고값 24.7333과 구별
    cube_mass_kg=0.10, hood_mass_kg=0.05, mu_floor=0.35, mu_ledge=0.8, g=9.81,
)
