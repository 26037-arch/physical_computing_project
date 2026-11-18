"""robot_v5h_params.py — V5H(3 mm 포맥스 수작업판) 치수 한 벌. 원본은 docs/V5H_DESIGN.md 7절.

V5 의 `P` 를 복사해 7.2~7.7절 값으로 덮어쓴 `PH` 를 만든다. 1.2절 커플링 스택 식으로 정해지는 값
(`coupler_top_z_mm`, `motor_face_z_mm`, `table_zw_mm` …)은 손으로 적지 않고 아래 `_derive()` 가 계산한다.
"가정" 이라 적힌 값은 실물을 잰 뒤 이 파일만 고치고 build/check 를 다시 돈다.
"""
import math
import os

from robot_v5_params import P

# 문서 숫자와 계산값 비교: 기본은 어긋나면 멈춘다. 실측값(가정 갱신)으로 다시 만들 때는
# V5H_ALLOW_DOC_DRIFT=1 로 실행하면 멈추지 않고 DOC_DRIFT 에 모아 pieces.json 에 남긴다.
ALLOW_DOC_DRIFT = os.environ.get('V5H_ALLOW_DOC_DRIFT') == '1'
DOC_DRIFT = []


def doc_check(what, value, expect, tol=2e-3):
    a = value if isinstance(value, (tuple, list)) else (value,)
    e = expect if isinstance(expect, (tuple, list)) else (expect,)
    if len(a) != len(e) or any(abs(x - y) > tol for x, y in zip(a, e)):
        DOC_DRIFT.append(dict(what=what, computed=[round(float(x), 4) for x in a], doc=list(e)))
        if not ALLOW_DOC_DRIFT:
            raise AssertionError(f'{what}: computed {value} != doc {expect} (실측값이면 V5H_ALLOW_DOC_DRIFT=1)')
    return value

PH = dict(P)

# 7.2 V5 값을 바꾼 것 (slider_bar_* 는 삭제 → lifter_bar_*)
for _gone in ('slider_bar_mm', 'slider_bar_half_x_mm'):
    PH.pop(_gone)
PH.update(
    plate_t_mm=3.0, hook_w_mm=15.0, arm_t_mm=3.0, hood_mass_kg=0.030,
    sg90_mount_outer_x_mm=-63.8,                       # B10 바깥면 = SG90 귀 윗면
    crank_x_mm=(-52.5, -49.5), crank_hub_x_mm=(-55.5, -52.5), link_x_mm=(-49.0, -46.0),
    mg996r_body_sign=-1,                               # D3: 몸통 −y
    tower_back_y_mm=-131.0, tower_corner='chamfer45x10',
)

# 7.1 V5 상수를 이름으로
PH.update(
    hood_roof_hole_mm=44.0,                            # V5 hood() 의 ±22 구멍
    tower_in_x_mm=39.5,                                # V5 base() 의 39.5
    sweep_r_mm=P['plate_mm'] / 2 * math.sqrt(2),
)

# 7.3 재료·공정
PH.update(
    sheet_t_mm=3.0,                                    # 가정 — 두 판 각 10점 평균
    sheet_w_mm=300.0, sheet_h_mm=450.0, sheet_count=2,
    sheet_border_mm=2.0, kerf_mm=2.0,
    blade_t_mm=0.40, glue_t_mm=0.05, tape_t_mm=0.08,   # 가정
    foam_density_g_cm3=0.60,                           # 가정
    washer_m3_t_mm=0.5, washer_m3_d_mm=7.0,            # 가정 (지름 7 = 문서 r 3.5)
    nut_m3_m_mm=2.4, nut_m3_af_mm=5.5, head_m3_k_mm=3.0,   # 가정
    nut_m3_r_mm=3.2,                                   # 문서 6.3 의 너트 반경 (5.5 AF 꼭짓점 3.18)
    head_m3_r_mm=3.5,                                  # 문서 6.3 의 핀 머리 반경 (머리 + 와셔)
    m3_shank_d_mm=3.0,
    jig_bed_mm=256.0, jig_max_mm=250.0, jig_bore_clear_mm=0.15, jig_xy_comp_mm=0.0,
)

# 7.4 커플링 스택
PH.update(
    coupler_len_mm=25.0, coupler_bore_mm=5.0,
    coupler_od_mm=18.0,                                # 가정
    coupler_setscrew_from_end_mm=5.0, coupler_setscrews_per_side=2,   # 가정
    m5_len_mm=16.0, m5_head_d_max_mm=10.0, m5_head_k_max_mm=6.0,
    m5_nut_af_mm=8.0, m5_nut_m_mm=4.0,                 # 가정
    stack_disc_af_mm=36.0, stack_disc_layers=4,
    head_pocket_mm=10.5, hd3_hole_mm=5.0, nut_pocket_af_mm=8.1,
    bolt_shaft_gap_mm=1.0,
    min_bolt_engage_mm=8.0, min_shaft_engage_mm=10.0, motor_desk_margin_mm=3.0,
    motor_boss_d_mm=22.0, motor_boss_h_mm=2.0,
    motor_hole_pitch_mm=31.0, motor_hole_mm=3.2, motor_plate_hole_mm=23.0,
    motor_connector_dir='+x',
    deck_layers=2, deck_x_half_mm=48.5, deck_yw_mm=(-110.0, 62.0),
)

# 7.5 기둥 · 후드
PH.update(
    post_relief_x_mm=P['cube_mm'] / 2 + 0.1,
    post_col_layers=5, post_ramp_layers=4,
    post_ramp_cut_y_mm=(29.5, 29.7, 31.1, 32.5),
    post_ramp_l0_tol_mm=(0.2, -0.0),
    hood_arm_front_y_mm=-3.0,
    horn_d_mm=21.0, horn_hole_r_mm=7.0, horn_hole_d_mm=2.0,           # 가정 (MG996R 원형 혼)
    horn_shim_mm=0.5, horn_disc_x_mm=(36.5, 39.0),                    # 가정
    t1r_hinge_square_mm=24.0,
)

# 7.6 리프터 · 구동
PH.update(
    lifter_layers=5,
    pad_t_mm=0.9,                                      # 가정 — 자전거 튜브
    follower_s_mm=-14.0, slot_len_mm=80.0,
    lifter_bar_s_mm=(-10.0, -4.0), lifter_bar_n_mm=(-2.0, 2.0), lifter_bar_half_x_mm=36.3,
    endplate_s_mm=(-17.5, 3.5), endplate_n_mm=(-4.0, 4.0), endplate_x_mm=(33.3, 36.3),
    tower_front_low_y_mm=-27.0, tower_step_z_mm=-5.0,
    crank_w_mm=10.0, link_w_mm=10.0, crank_hub_r_mm=7.0, crank_hub_len_mm=20.0,
    sg90_horn_face_offset_mm=0.5,                      # 가정
    sg90_ear_top_from_tip_mm=10.8,
    sg90_plate_x_mm=(-63.8, -57.8),
    sg90_leg_rear_y_mm=(-108.232, -105.232), sg90_leg_bottom_z_mm=(28.076, 31.076),
)

# 7.7 MG996R 장착 · 베이스 · 패널
PH.update(
    mg996r_case_top_x_mm=42.5,
    mg996r_ear_top_from_case_top_mm=7.7,               # 가정
    ear_pad_x_mm=(45.5, 48.5),
    mg996r_window_y_mm=(-121.0, -79.5), mg996r_window_z_mm=(29.6, 50.4),
    mg996r_ear_holes=((-75.5, 35.0), (-75.5, 45.0), (-125.0, 35.0), (-125.0, 45.0)),
    rear_wall_y_mm=(-131.0, -128.0), rear_wall_top_z_mm=30.0,
    front_brace_y_mm=(-33.0, -30.0), front_brace_top_z_mm=-35.0,
    panel_w_mm=100.0, panel_h_mm=70.0, panel_floor_d_mm=50.0, panel_tilt_deg=20.0,
    panel_lcd_window_mm=(72.0, 26.0), panel_lcd_window_c=(0.0, 45.0),
    panel_lcd_holes=((-37.5, 29.5), (37.5, 29.5), (-37.5, 60.5), (37.5, 60.5)),   # 가정 (LCD 75 × 31)
    panel_button_mm=12.2, panel_button_c=(0.0, 14.0),
    panel_gusset=((0.0, 0.0), (40.0, 0.0), (18.811, 51.683)), panel_gusset_x_mm=(44.0, 47.0),
    panel_button_back_mm=(30.0, 20.0),
)


def _derive(ph):
    """1.2절 식. 숫자를 박지 않고 판 두께·층 수·볼트·너트·모터 치수에서 계산한다."""
    t, s = ph['plate_t_mm'], ph['sheet_t_mm']
    tilt = math.radians(ph['tilt_deg'])
    d = {}
    d['head_seat_z_mm'] = -t - 2 * s                                   # HD3 윗면 = M5 머리 밑면 (−9)
    d['hd4_bottom_z_mm'] = -t - ph['stack_disc_layers'] * s            # −15
    d['coupler_top_z_mm'] = d['hd4_bottom_z_mm'] - (ph['m5_nut_m_mm'] - s)   # −16
    d['m5_nut_z_mm'] = (d['coupler_top_z_mm'], d['coupler_top_z_mm'] + ph['m5_nut_m_mm'])
    d['bolt_tip_z_mm'] = d['head_seat_z_mm'] - ph['m5_len_mm']         # −25
    d['e_bolt_mm'] = d['coupler_top_z_mm'] - d['bolt_tip_z_mm']         # 9
    d['shaft_tip_z_mm'] = d['bolt_tip_z_mm'] - ph['bolt_shaft_gap_mm']  # −26
    d['motor_face_z_mm'] = d['shaft_tip_z_mm'] - ph['motor_shaft_len_mm']   # −50
    d['coupler_bottom_z_mm'] = d['coupler_top_z_mm'] - ph['coupler_len_mm']  # −41
    d['e_shaft_mm'] = d['shaft_tip_z_mm'] - d['coupler_bottom_z_mm']    # 15
    d['boss_gap_mm'] = d['coupler_bottom_z_mm'] - (d['motor_face_z_mm'] + ph['motor_boss_h_mm'])   # 7
    d['motor_plate_t_mm'] = 2 * s
    d['motor_plate_gap_mm'] = d['coupler_bottom_z_mm'] - (d['motor_face_z_mm'] + d['motor_plate_t_mm'])   # 3
    d['motor_low_zw_mm'] = ((d['motor_face_z_mm'] - ph['motor_len_mm']) * math.cos(tilt)
                            - ph['motor_mm'] / 2 * math.sin(tilt))     # −91.806
    d['table_zw_mm'] = float(math.floor(d['motor_low_zw_mm'] - ph['motor_desk_margin_mm']))   # −95
    d['deck_top_zw_mm'] = d['table_zw_mm'] + ph['deck_layers'] * s     # −89
    d['coupler_setscrew_z_mm'] = (d['coupler_top_z_mm'] - ph['coupler_setscrew_from_end_mm'],
                                  d['coupler_bottom_z_mm'] + ph['coupler_setscrew_from_end_mm'])   # −21, −36
    d['stack_disc_r_mm'] = ph['stack_disc_af_mm'] / 2 / math.cos(math.radians(22.5))   # 19.483
    d['m5_nut_r_mm'] = ph['m5_nut_af_mm'] / math.sqrt(3)                # 4.62
    # 리프터·크랭크 (V5 와 같은 식)
    a = math.radians(ph['lift_dir_deg'])
    D = (-math.sin(a), math.cos(a))
    N = (math.cos(a), math.sin(a))
    q0 = (ph['lift_contact_y_mm'] - ph['lift_bottom_z_mm'] * math.tan(a), ph['lift_bottom_z_mm'])
    b0 = (q0[0] + ph['slider_bar_dy_mm'], q0[1] + ph['slider_bar_dz_mm'])
    d['lift_D'], d['lift_N'] = D, N
    d['lift_Q0'], d['lift_B0'] = q0, b0
    d['lift_F0'] = tuple(b0[i] + ph['follower_s_mm'] * D[i] for i in range(2))
    d['lift_B1'] = tuple(b0[i] + ph['lift_stroke_mm'] * D[i] for i in range(2))
    d['servo_yz'] = tuple(b0[i] + (ph['lift_stroke_mm'] + ph['link_mm'] - ph['crank_r_mm']) * D[i] for i in range(2))
    d['crank_pin0_yz'] = tuple(d['servo_yz'][i] - ph['crank_r_mm'] * D[i] for i in range(2))
    d['sg90_spline_tip_x_mm'] = ph['sg90_mount_outer_x_mm'] + ph['sg90_ear_top_from_tip_mm']   # −53.0
    d['mg996r_ear_top_x_mm'] = ph['mg996r_case_top_x_mm'] + ph['mg996r_ear_top_from_case_top_mm']   # 50.2
    d['ear_shim_mm'] = d['mg996r_ear_top_x_mm'] - ph['ear_pad_x_mm'][1]   # 1.7
    return d


PH.update(_derive(PH))

# 0.1절 고정 치수: V5 P 와 같아야 한다 (다르면 V5H 가 계약을 깬 것)
FIXED_KEYS = ('cube_mm', 'layer_mm', 'tilt_deg', 'post_clearance_mm', 'post_h_mm', 'post_t_mm', 'post_arm_mm',
              'post_chamfer_mm', 'post_flip_relief_deg', 'post_flip_pivot_y_mm', 'post_flip_margin_mm',
              'plate_mm', 'notch_w_mm', 'notch_y_mm', 'plate_corner_r_mm', 'hood_clearance_mm', 'hood_wall_mm',
              'hood_bottom_z_mm', 'hood_roof_clear_mm', 'hood_roof_t_mm', 'hood_back_wall', 'hinge_y_mm',
              'hinge_z_mm', 'hinge_hub_d_mm', 'hood_open_deg', 'hood_flip_deg', 'hood_load_deg',
              'lift_contact_y_mm', 'lift_bottom_z_mm', 'lift_stroke_mm', 'lift_dir_deg', 'shelf_len_mm',
              'shelf_t_mm', 'lip_h_mm', 'lip_t_mm', 'cube_edge_r_mm', 'slider_bar_dy_mm', 'slider_bar_dz_mm',
              'crank_r_mm', 'link_mm', 'motor_mm', 'motor_box_outer_mm', 'motor_len_mm', 'motor_shaft_len_mm',
              'motor_cable_slot_w_mm', 'motor_cable_slot_h_mm', 'sg90_body_l_mm', 'sg90_body_w_mm',
              'sg90_axis_to_end_mm', 'sg90_hole_pitch_mm', 'sg90_body_dir', 'sg90_fit_clear_mm',
              'mg996r_body_l_mm', 'mg996r_body_w_mm', 'mg996r_axis_to_end_mm', 'mg996r_fit_clear_mm',
              'mg996r_hole_pitch_l_mm', 'mg996r_hole_pitch_w_mm', 'cube_mass_kg', 'mu_floor', 'mu_ledge', 'g')
assert all(PH[k] == P[k] for k in FIXED_KEYS), [k for k in FIXED_KEYS if PH[k] != P[k]]

# 문서 0.1·1.2·7절 숫자와 계산값이 어긋나면 import 단계에서 멈춘다 (문서 오류 또는 파라미터 오타)
DOC_VALUES = dict(coupler_top_z_mm=-16.0, bolt_tip_z_mm=-25.0, e_bolt_mm=9.0, shaft_tip_z_mm=-26.0,
                  motor_face_z_mm=-50.0, e_shaft_mm=15.0, boss_gap_mm=7.0, motor_low_zw_mm=-91.806,
                  table_zw_mm=-95.0, deck_top_zw_mm=-89.0, motor_plate_t_mm=6.0, sweep_r_mm=49.497,
                  stack_disc_r_mm=19.483, m5_nut_r_mm=4.619, sg90_spline_tip_x_mm=-53.0,
                  mg996r_ear_top_x_mm=50.2, ear_shim_mm=1.7, post_relief_x_mm=28.6)
DOC_POINTS = dict(lift_Q0=(-23.830, -6.500), lift_B0=(-37.830, -11.500), lift_F0=(-31.693, -24.083),
                  lift_B1=(-66.762, 47.820), servo_yz=(-82.982, 81.076), crank_pin0_yz=(-68.516, 51.416))
for _k, _v in list(DOC_VALUES.items()) + list(DOC_POINTS.items()):
    doc_check(_k, PH[_k], _v)
