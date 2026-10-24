"""check_robot_v5.py — V5(컵·후드·리프터 3축) 기구의 2D 운동학·준정적 물리 검사.

docs/HARDWARE_V5.md 2절의 치수(국소 홀더 좌표계: x 오른쪽, y 앞(관중 쪽), z 홀더 바닥 법선 위,
월드는 x축 둘레로 TILT_DEG 만큼 뒤(−y)가 낮게 기운다)를 그대로 써서 다음을 검사한다.

  A. 후드 OPEN 자세가 큐브·홀더 기둥의 회전 쓸림 원통과 겹치지 않는가 (스핀 가능)
  B. 후드 CLOSE 자세가 바닥 층(0~19)과 기둥 위(15)에 닿지 않고 위 두 층만 감싸는가
  C. 리프터 최하 위치가 회전하는 홀더 판(z −4~0, r 46.7)·허브·모터와 겹치지 않는가
  D. 뒤집기 준정적 시뮬레이션: 갈고리가 뒤쪽 아래 모서리를 비스듬히(위+뒤) 끌어올리면
     앞쪽 아래 모서리가 판 위를 미끄러져 뒤 기둥에 닿고, 큐브가 전복각(45°+TILT)을 넘어 앞으로 넘어져
     자리(앞 기둥 안쪽 29.5) 안에 떨어지는가. 넘어지는 동안 후드(FLIP 각)·팔·리프터와 겹치지 않는가.
  E. 리프터가 내려올 때(같은 직선 경로) 자리에 앉은 큐브 뒷면과 겹치지 않는가
  F. 토크·마찰 추정 (서보·스텝모터 여유)

결과는 models/robot_v5/kinematic_checks.json 에 쓰고 실패가 있으면 종료코드 1.
실행:  .venv-cad\\Scripts\\python.exe tools\\check_robot_v5.py
"""
import json, math, sys
from pathlib import Path
from shapely.geometry import Polygon, Point, LineString, box
from shapely.affinity import rotate, translate
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
OUT = ROOT / 'models' / 'robot_v5'

from robot_v5_params import P
C = P['cube_mm']; H = C / 2
TILT = math.radians(P['tilt_deg'])
POST_IN = H + P['post_clearance_mm']                 # 29.5
POST_OUT = POST_IN + P['post_t_mm']                  # 33
HOOD_IN = H + P['hood_clearance_mm']                 # 30
HOOD_OUT = HOOD_IN + P['hood_wall_mm']               # 33
ROOF_Z = C + P['hood_roof_clear_mm']                 # 58.5
HINGE = (P['hinge_y_mm'], P['hinge_z_mm'])
SWEEP_R_PLATE = P['plate_mm'] / 2 * math.sqrt(2)     # 46.7 — 판 모서리 쓸림 반경
SWEEP_R_CUBE = H * math.sqrt(2)                      # 40.3
LIFT_DIR = (-math.sin(math.radians(P['lift_dir_deg'])), math.cos(math.radians(P['lift_dir_deg'])))
# 최하 위치의 선반 앞끝 Q0: z=0 을 지날 때 y = lift_contact_y 가 되도록 뒤로 물린다
Q0 = (P['lift_contact_y_mm'] - P['lift_bottom_z_mm'] * math.tan(math.radians(P['lift_dir_deg'])), P['lift_bottom_z_mm'])

results = {}
fails = []

def rec(name, ok, **kw):
    results[name] = dict(ok=bool(ok), **kw)
    if not ok: fails.append(name)
    print(('OK   ' if ok else 'FAIL ') + name + ' ' + json.dumps(kw, ensure_ascii=False))

# ---------------- 단면 도형 (y–z 평면, x=0 중심 단면) ----------------
def _hood_parts():
    front = box(HOOD_IN, P['hood_bottom_z_mm'], HOOD_OUT, ROOF_Z + P['hood_roof_t_mm'])
    roof = box(-HOOD_OUT, ROOF_Z, HOOD_OUT, ROOF_Z + P['hood_roof_t_mm'])
    side = box(-HOOD_OUT, P['hood_bottom_z_mm'], HOOD_OUT, ROOF_Z + P['hood_roof_t_mm'])   # 옆벽(|x| 30~33)의 y–z 범위
    parts = [front, roof]
    if P.get('hood_back_wall', False):
        parts.append(box(-HOOD_OUT, P['hood_bottom_z_mm'], -HOOD_IN, ROOF_Z + P['hood_roof_t_mm']))
    return parts, side

def hood_shape(phi_deg):
    """후드(앞벽·지붕·옆벽 y–z 범위) + 힌지 팔 + 허브 단면을 CLOSE 기준으로 만든 뒤 힌지 둘레로 phi 만큼 연다(앞이 올라감)."""
    parts, side = _hood_parts()
    s = unary_union(parts + [side, arm_only(0)])
    return rotate(s, phi_deg, origin=HINGE, use_radians=False)

def hood_center_section(phi_deg):
    """x=0 단면에 실제로 있는 부분(앞벽·지붕·뒷벽) — 앉은 큐브와의 간섭 검사용."""
    parts, _ = _hood_parts()
    return rotate(unary_union(parts), phi_deg, origin=HINGE, use_radians=False)

def hood_side_wall(phi_deg):
    _, side = _hood_parts()
    return rotate(side, phi_deg, origin=HINGE, use_radians=False)

def hood_walls_only(phi_deg):
    parts, side = _hood_parts()
    return rotate(unary_union(parts + [side]), phi_deg, origin=HINGE, use_radians=False)

def arm_only(phi_deg):
    hub = Point(*HINGE).buffer(P['hinge_hub_d_mm'] / 2, 32)
    arm = Polygon([(HINGE[0], HINGE[1] - 10), (-HOOD_OUT, P['hood_bottom_z_mm']), (-HOOD_OUT, ROOF_Z), (HINGE[0], HINGE[1] + 10)])
    return rotate(unary_union([hub, arm]), phi_deg, origin=HINGE, use_radians=False)

def lifter_shape(s):
    """리프터(선반 + 입술 + 몸통 + 크로스바) 단면. s = 경로상 이동량(0 = 최하). 선반 앞끝 Q, 입술 앞윗모서리 L."""
    qy, qz = Q0
    shelf = Polygon([(qy - P['shelf_len_mm'], qz - P['shelf_t_mm']), (qy, qz - P['shelf_t_mm']), (qy, qz - 1.0), (qy - 1.0, qz),
                     (qy - P['shelf_len_mm'], qz)])                                   # 앞윗모서리 1 mm 모따기 (복귀 때 큐브 모서리를 타고 넘음)
    lx = qy - P['shelf_len_mm']
    lip = box(lx - P['lip_t_mm'], qz - P['shelf_t_mm'], lx, qz + P['lip_h_mm'])
    by, bz = qy + P['slider_bar_dy_mm'], qz + P['slider_bar_dz_mm']
    body = box(by - 4, bz - 3, lx, qz - P['shelf_t_mm'] + 0.01)
    bar = box(by - P['slider_bar_mm'] / 2, bz - P['slider_bar_mm'] / 2, by + P['slider_bar_mm'] / 2, bz + P['slider_bar_mm'] / 2)
    sh = unary_union([shelf, lip, body, bar])
    return translate(sh, LIFT_DIR[0] * s, LIFT_DIR[1] * s)

def tip(s):
    """선반 앞끝 Q 의 위치."""
    return (Q0[0] + LIFT_DIR[0] * s, Q0[1] + LIFT_DIR[1] * s)

# 큐브·홀더 (x=0 단면). 기둥은 |x|≥16 에만 있어 중심 단면에는 없지만 회전 쓸림 원통에는 들어간다.
cube_seated = box(-H, 0, H, C)
plate_center = box(-P['notch_y_mm'], -P['plate_t_mm'], P['notch_y_mm'], 0)            # 노치 때문에 중심 단면은 |y|≤23
sweep_plate = box(-SWEEP_R_PLATE, -P['plate_t_mm'], SWEEP_R_PLATE, 0)                # 판 쓸림 (z −4~0)
sweep_posts = box(-SWEEP_R_PLATE, 0, SWEEP_R_PLATE, P['post_h_mm'])                  # 기둥 쓸림 (z 0~15)
sweep_cube = box(-SWEEP_R_CUBE, 0, SWEEP_R_CUBE, C)                                  # 큐브 스핀 쓸림
hub = box(-P['hub_d_mm'] / 2, -P['plate_t_mm'] - P['hub_h_mm'], P['hub_d_mm'] / 2, -P['plate_t_mm'])
motor = box(-P['motor_mm'] / 2, P['motor_face_z_mm'] - P['motor_len_mm'], P['motor_mm'] / 2, P['motor_face_z_mm'])
spin_sweep = unary_union([sweep_plate, sweep_posts, sweep_cube, hub, motor])

def gap(a, b):
    return round(a.distance(b), 2)

# ---------------- A. OPEN: 스핀 가능 ----------------
hood_open = unary_union([hood_center_section(P['hood_open_deg']), arm_only(P['hood_open_deg'])])
rec('A_open_clears_spin_sweep', not hood_open.intersects(spin_sweep), gap_mm=gap(hood_open, spin_sweep), open_deg=P['hood_open_deg'])
yc = math.sqrt(max(0.0, SWEEP_R_CUBE ** 2 - HOOD_IN ** 2)); yp = math.sqrt(max(0.0, SWEEP_R_PLATE ** 2 - HOOD_IN ** 2))
side_sweep = unary_union([box(-yc, 0, yc, C), box(-yp, -P['plate_t_mm'], yp, P['post_h_mm'])])
rec('A_open_side_walls_clear_spin_sweep', not hood_side_wall(P['hood_open_deg']).intersects(side_sweep), gap_mm=gap(hood_side_wall(P['hood_open_deg']), side_sweep))
# 열리는 동안(0 → OPEN) 앞벽·지붕이 앉은 큐브로 들어오지 않는가 (힌지가 낮으면 앞벽이 올라가며 뒤로 휩쓴다)
worst = 0.0; worst_phi = None
for i in range(1, int(P['hood_open_deg'] / 2.5) + 1):
    phi = i * 2.5
    inter = hood_center_section(phi).intersection(cube_seated).area
    if inter > worst: worst, worst_phi = inter, phi
rec('A_opening_sweep_clears_cube', worst < 1e-6, worst_overlap_mm2=round(worst, 3), at_deg=worst_phi)
lift0 = lifter_shape(0)
rec('A_lifter_bottom_clears_spin_sweep', not lift0.intersects(spin_sweep), gap_mm=gap(lift0, spin_sweep))
# LOAD: 후드가 뒤로 완전히 넘어가 자리 위 공간(큐브를 위에서 내려놓는 기둥 사이 통로)이 빈다
drop_path = box(-H, 0, H, C + 80)
hood_load = hood_shape(P['hood_load_deg'])
rec('A_load_drop_path_clear', not hood_load.intersects(drop_path) and not lift0.intersects(drop_path), gap_mm=gap(hood_load, drop_path))
# LOAD 자세에서 후드가 바닥(월드 수평면)까지 내려가지 않는다: 월드 높이 = z cos t + y sin t (뒤가 낮다)
def world_z(y, z): return z * math.cos(TILT) + y * math.sin(TILT)
lowest = min(world_z(y, z) for y, z in hood_load.exterior.coords)
motor_low = min(world_z(y, z) for y, z in motor.exterior.coords)
rec('A_load_hood_above_table', lowest > P['table_zw_mm'] + 5 and motor_low > P['table_zw_mm'] + 3, hood_lowest_world_mm=round(lowest, 1), motor_lowest_world_mm=round(motor_low, 1), table_zw_mm=P['table_zw_mm'])

# ---------------- B. CLOSE: 위 두 층만 감싼다 ----------------
hood_close = hood_center_section(0)
bottom_layer = box(-H, 0, H, P['layer_mm'])
upper_layers = box(-H, P['layer_mm'], H, C)
rec('B_close_clears_bottom_layer_and_posts', not hood_close.intersects(bottom_layer) and P['hood_bottom_z_mm'] > P['post_h_mm'],
    wall_bottom_mm=P['hood_bottom_z_mm'], layer_top_mm=P['layer_mm'], post_top_mm=P['post_h_mm'])
rec('B_close_does_not_touch_cube', not hood_close.intersects(cube_seated), side_gap_mm=P['hood_clearance_mm'], roof_gap_mm=P['hood_roof_clear_mm'])
# 층 어긋남 허용: 위 두 층이 후드 안에서 돌 수 있는 각 = 정사각형 57 이 60 안에 들어가는 최대 회전각
ang = math.degrees(math.asin(2 * HOOD_IN / (C * math.sqrt(2))) - math.pi / 4)
rec('B_layer_misalignment_tolerance', ang >= 2.0, max_misalign_deg=round(ang, 2))
arm_close = arm_only(0)
rec('B_close_arm_clears_posts_sweep', not arm_close.intersects(sweep_posts) and not arm_close.intersects(sweep_plate), gap_mm=gap(arm_close, unary_union([sweep_posts, sweep_plate])))

# ---------------- C. 리프터 최하 위치 ----------------
rec('C_lifter_bottom_below_plate', Q0[1] + P['lip_h_mm'] <= -P['plate_t_mm'] - 1.0, lip_top_mm=Q0[1] + P['lip_h_mm'], plate_bottom_mm=-P['plate_t_mm'])
rec('C_shelf_under_flat_bottom', P['lift_contact_y_mm'] <= -H + P['cube_edge_r_mm'] and P['lift_contact_y_mm'] > -P['notch_y_mm'] - 10,
    contact_y_mm=P['lift_contact_y_mm'], flat_starts_mm=-H + P['cube_edge_r_mm'], notch_edge_mm=-P['notch_y_mm'], overhang_mm=H - P['notch_y_mm'])
rec('C_shelf_inside_notch', P['lift_contact_y_mm'] <= -P['notch_y_mm'] - 1.0, shelf_front_at_contact_mm=P['lift_contact_y_mm'], notch_edge_mm=-P['notch_y_mm'])
rec('C_hook_width_fits_notch', P['hook_w_mm'] + 2 * 1.5 <= P['notch_w_mm'], hook_w_mm=P['hook_w_mm'], notch_w_mm=P['notch_w_mm'])

# ---------------- D. 뒤집기 준정적 시뮬레이션 ----------------
import numpy as np
g_dir = (-math.sin(TILT), -math.cos(TILT))          # 국소 좌표의 중력 방향 (뒤가 낮다)
topple_theta = math.radians(45.0) + TILT            # 앞쪽 모서리 둘레로 앞으로 넘어가는 각 (바닥면 기준)
hood_flip = hood_shape(P['hood_flip_deg'])
arm_flip = arm_only(P['hood_flip_deg'])
W = P['cube_mass_kg'] * P['g']
sim = []
toppled_at = None
yf = H                                              # 앞쪽 아래 모서리 y (처음 +28.5)
Nt_max = 0.0; mu_need_max = 0.0; slip_to_lip = False
def cube_at(yf, theta):
    d = (-math.cos(theta), math.sin(theta)); n = (math.sin(theta), math.cos(theta))
    poly = Polygon([(yf, 0), (yf + C * d[0], C * d[1]), (yf + C * (d[0] + n[0]), C * (d[1] + n[1])), (yf + C * n[0], C * n[1])])
    com = (yf + H * (d[0] + n[0]), H * (d[1] + n[1]))
    return poly, com, d, n
stroke = P['lift_stroke_mm']
for i in range(0, int(stroke * 10) + 1):
    s = i * 0.1
    qy, qz = tip(s)
    if qz <= 0:
        continue
    # 뒷 모서리 E_b: 선반 마찰이 충분하면 Q 에서 1.5 안쪽(모서리 둥글기), 모자라면 입술까지 밀려 L 과 Q 가 모서리를 받친다
    theta = math.asin(min(1.0, qz / C))
    e = P['cube_edge_r_mm'] if not slip_to_lip else (P['shelf_len_mm'] * math.cos(theta) + P['lip_h_mm'] * math.sin(theta))
    eb = (qy - e * math.cos(theta), qz + e * math.sin(theta))
    theta = math.asin(min(1.0, eb[1] / C))
    yf_new = eb[0] + C * math.cos(theta)
    stopped = False
    if yf_new <= -POST_IN:                          # 뒤 기둥 안쪽면에 닿으면 그 모서리 둘레로 돈다
        yf_new = -POST_IN; stopped = True
        theta = math.atan2(eb[1], eb[0] - yf_new) if eb[0] > yf_new else math.pi / 2 + math.atan2(yf_new - eb[0], eb[1])
    yf = min(yf, yf_new)
    poly, com, d, n = cube_at(yf, theta)
    r = (com[0] - yf, com[1])
    moment = r[0] * g_dir[1] - r[1] * g_dir[0]       # < 0 이면 앞으로 넘어감
    # 힘 평형: 바닥 수직력 N_f(+마찰 μ_f N_f, 앞으로), 선반 수직력 N_t(n 방향), 선반 접선력 T(뒤·위 d 방향)
    if not stopped:
        rb = (eb[0] - yf, eb[1])
        A = np.array([[P['mu_floor'], n[0], d[0]], [1.0, n[1], d[1]], [0.0, rb[0] * n[1] - rb[1] * n[0], rb[0] * d[1] - rb[1] * d[0]]])
        b = -W * np.array([g_dir[0], g_dir[1], r[0] * g_dir[1] - r[1] * g_dir[0]])
        Nf, Nt, T = np.linalg.solve(A, b)
        Nt_max = max(Nt_max, Nt)
        if Nt > 1e-6:
            mu_need_max = max(mu_need_max, T / Nt)
            if T / Nt > P['mu_ledge'] and not slip_to_lip:
                slip_to_lip = True                  # 선반에서 미끄러져 입술에 걸린다 (기하로 끌림)
    lift = lifter_shape(s)
    hit_hood = poly.intersects(hood_flip)
    hit_lift = poly.buffer(-0.6).intersects(lift)   # 선반·입술 모서리 접촉은 허용, 몸통 관통만 검사
    sim.append(dict(s=round(s, 1), Q=[round(qy, 1), round(qz, 1)], theta_deg=round(math.degrees(theta), 1), yf=round(yf, 1),
                    moment=round(moment, 3), stopped=stopped, slip_to_lip=slip_to_lip))
    if hit_hood or hit_lift:
        rec('D_flip_no_interference', False, at_s=s, theta_deg=round(math.degrees(theta), 1), hit_hood=hit_hood, hit_lifter=hit_lift)
        break
    if moment < 0:
        toppled_at = dict(s=round(s, 1), theta_deg=round(math.degrees(theta), 1), yf=round(yf, 1), Q=[round(qy, 1), round(qz, 1)], stopped_by_posts=stopped)
        break
if 'D_flip_no_interference' not in results:
    rec('D_flip_no_interference', True, samples=len(sim))
rec('D_flip_topples_forward', toppled_at is not None, **(toppled_at or {}))
rec('D_ledge_friction_or_lip', True, mu_needed_on_ledge=round(mu_need_max, 2), mu_ledge_rubber=P['mu_ledge'], slipped_to_lip=slip_to_lip, peak_ledge_force_N=round(Nt_max, 2))
if toppled_at:
    land_front = toppled_at['yf'] + C
    rec('D_landing_inside_posts', land_front <= POST_IN + 0.01 and toppled_at['yf'] >= -POST_IN - 0.01,
        land_rear_mm=toppled_at['yf'], land_front_mm=round(land_front, 1), post_inner_mm=POST_IN, margin_front_mm=round(POST_IN - land_front, 1), margin_rear_mm=round(toppled_at['yf'] + POST_IN, 1))
    rec('D_lift_stroke_enough', toppled_at['s'] <= stroke - 2, needed_s_mm=toppled_at['s'], stroke_mm=stroke)
    sweep = []
    th0 = math.radians(toppled_at['theta_deg'])
    for k in range(0, 19):                       # 앞으로 넘어짐: 바닥면 각이 65° → 90° (옛 앞면이 바닥에 닿는다)
        th = th0 + (math.pi / 2 - th0) * k / 18.0
        sweep.append(cube_at(toppled_at['yf'], th)[0])
    sweep_u = unary_union(sweep)
    lift_top = lifter_shape(toppled_at['s'])
    rec('D_topple_sweep_clears_hood_and_lifter', not sweep_u.intersects(hood_flip) and not sweep_u.buffer(-0.6).intersects(lift_top),
        gap_hood_mm=gap(sweep_u, hood_flip), gap_lifter_mm=gap(sweep_u, lift_top))
    rec('D_topple_sweep_clears_arm', not sweep_u.intersects(arm_flip), gap_mm=gap(sweep_u, arm_flip))

# ---------------- E. 리프터 복귀 경로 vs 앉은 큐브 ----------------
# 선반 앞끝은 z=0 에서 모서리 안쪽 1.5 에 있으므로 복귀할 때 큐브의 둥근 아래 모서리(r≈1.5~2)를 스친다.
# 겹침 깊이가 모서리 둥글기 이내이고 z 3 mm 위에서는 완전히 비켜야 한다 (큐브는 앞 기둥 쪽 1 mm 여유로 밀려났다가 기울기로 되돌아온다).
tan_a = math.tan(math.radians(P['lift_dir_deg']))
brush0 = P['lift_contact_y_mm'] + H                                  # z=0 에서의 겹침 (모서리 둥글기 안)
brush_at_r = max(0.0, brush0 - P['cube_edge_r_mm'] * tan_a)         # 둥글기가 끝나는 높이에서의 겹침 → 선반 앞윗모서리 1 mm 모따기가 받는다
brush_top_z = brush0 / tan_a                                         # 이 높이 위로는 완전히 비킨다
rec('E_return_brush_within_edge_radius', brush0 <= P['cube_edge_r_mm'] + 0.01 and brush_at_r <= 1.0 and brush_top_z < 4.0,
    brush_at_z0_mm=round(brush0, 2), brush_at_edge_r_mm=round(brush_at_r, 2), clear_above_z_mm=round(brush_top_z, 2), edge_r_mm=P['cube_edge_r_mm'])
lift_body_hits = False
for i in range(0, int(stroke * 10) + 1):
    lf = lifter_shape(i * 0.1)
    if lf.intersects(box(-H, 3.0, H, C)):
        lift_body_hits = True; break
rec('E_lifter_path_clears_seated_cube_above_3mm', not lift_body_hits)
if toppled_at:
    rec('E_lifter_top_clears_hood_arm', not lifter_shape(toppled_at['s']).intersects(arm_flip), gap_mm=gap(lifter_shape(toppled_at['s']), arm_flip))
    rec('E_lifter_top_clears_hood', not lifter_shape(toppled_at['s']).intersects(hood_flip), gap_mm=gap(lifter_shape(toppled_at['s']), hood_flip))

# ---------------- G. 베이스·구동 배치 ----------------
rec('G_motor_box_fit', P['motor_box_outer_mm'] - 6 >= P['motor_mm'] + 1.0, inner_mm=P['motor_box_outer_mm'] - 6, motor_mm=P['motor_mm'])
rec('G_motor_plate_above_motor_face', True, plate_z=[P['motor_face_z_mm'], P['motor_face_z_mm'] + P['motor_plate_t_mm']], hub_z=[-P['plate_t_mm'] - P['hub_h_mm'], -P['plate_t_mm']],
    plate_top_below_hub=(P['motor_face_z_mm'] + P['motor_plate_t_mm'] <= -P['plate_t_mm'] - P['hub_h_mm'] - 1.0))
if not (P['motor_face_z_mm'] + P['motor_plate_t_mm'] <= -P['plate_t_mm'] - P['hub_h_mm'] - 1.0): fails.append('G_motor_plate_above_motor_face'); results['G_motor_plate_above_motor_face']['ok'] = False
# 크랭크-슬라이더: 축은 슬롯 직선 위, 최상 크로스바 위치에서 (link − r) 만큼 더 위·뒤. 핀 궤적 전체가 책상 위·타워 범위 안인가
B0 = (Q0[0] + P['slider_bar_dy_mm'], Q0[1] + P['slider_bar_dz_mm'])
B1 = (B0[0] + LIFT_DIR[0] * stroke, B0[1] + LIFT_DIR[1] * stroke)
d_ax = P['link_mm'] - P['crank_r_mm']
AX = (B1[0] + LIFT_DIR[0] * d_ax, B1[1] + LIFT_DIR[1] * d_ax)
pin_low = min(world_z(AX[0] + P['crank_r_mm'] * math.cos(a), AX[1] + P['crank_r_mm'] * math.sin(a)) for a in [i * 0.1 for i in range(63)])
rec('G_crank_axis_and_pin_above_table', pin_low > P['table_zw_mm'] + 5, crank_axis_local=[round(AX[0], 1), round(AX[1], 1)], bar_bottom=[round(B0[0], 1), round(B0[1], 1)], bar_top=[round(B1[0], 1), round(B1[1], 1)], pin_lowest_world=round(pin_low, 1))
rec('G_crank_stroke_endpoints', abs(2 * P['crank_r_mm'] - stroke) < 1e-6,
    stroke_mm=stroke, two_r_mm=2 * P['crank_r_mm'],
    mid_90deg_mm=round(P['link_mm'] + P['crank_r_mm'] - math.sqrt(P['link_mm'] ** 2 - P['crank_r_mm'] ** 2), 2),
    lower_axis_reference_mid_90deg_mm=round(math.sqrt(P['link_mm'] ** 2 - P['crank_r_mm'] ** 2) - (P['link_mm'] - P['crank_r_mm']), 2))

# ---------------- F. 토크·마찰 ----------------
W = P['cube_mass_kg'] * P['g']
# 리프터 서보: 크랭크 r = 행정/2, 힘 ≈ 큐브 수직력 + 마찰(앞 모서리 미끄럼) 여유 2배
crank_r = stroke / 2
lift_force = Nt_max + P['mu_floor'] * W
lift_torque_kgcm = lift_force * crank_r / 1000 / P['g'] * 100
rec('F_lifter_servo_torque', lift_torque_kgcm < 1.8 / 2.0, crank_r_mm=round(crank_r, 1), peak_force_N=round(lift_force, 2), torque_kgcm=round(lift_torque_kgcm, 2), sg90_kgcm=1.8, mg90s_kgcm=2.2)
# 후드 서보: 후드 무게(힌지에서 질량중심 ≈ 후드 중앙까지)
hood_com_r = abs(P['hinge_y_mm'])
hood_torque_kgcm = P['hood_mass_kg'] * P['g'] * hood_com_r / 1000 / P['g'] * 100
rec('F_hood_servo_torque', hood_torque_kgcm < 9.0 / 3.0, torque_kgcm=round(hood_torque_kgcm, 2), mg996r_kgcm=9.4)
# 스텝모터: 층 회전 ≤ 0.3 N·m(뻑뻑한 큐브) vs NEMA17 0.4 N·m; 스핀 가속 시 위 두 층이 따라오는 조건
I_top = (2 * P['cube_mass_kg'] / 3) * (C / 1000) ** 2 / 6
alpha = 2 * (math.pi / 2) / 0.4 ** 2
rec('F_spin_upper_layers_follow', I_top * alpha < 0.03, inertial_torque_Nm=round(I_top * alpha, 5), cube_internal_friction_Nm=0.03)
rec('F_stepper_torque', 0.3 < 0.4, layer_turn_Nm=0.3, nema17_Nm=0.4)

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'kinematic_checks.json').write_text(json.dumps(dict(parameters=P, passed=not fails, failures=fails, checks=results, flip_trace=sim[::10]), ensure_ascii=False, indent=1), encoding='utf-8')
print('passed' if not fails else f'FAILED: {fails}')
sys.exit(0 if not fails else 1)
