# fusion/scripts/cube_robot_parts.py — 큐브 풀이 로봇의 3D 출력 부품 3종을 만들고 STL로 내보낸다.
#   1) center_coupler : NEMA17 D컷 축(5mm) ↔ 큐브 센터 캡을 잇는 커플러 (십자 키 + M3 세트스크류)
#   2) center_cap     : 큐브 센터 조각 위에 끼우는 캡 (십자 슬롯, 아래쪽 고정 핀) — 면마다 1개, 6개 출력
#   3) motor_mount    : NEMA17 L 브래킷 (31mm 피치 M3 구멍 4개, 22.5mm 보스 구멍, 프레임 고정 구멍 2개)
# 단위: Fusion API 내부 단위는 cm 이므로 mm 치수에 MM(0.1)을 곱한다.
# 실행: fusion_exec 로 exec(open(path).read()) 하거나 Fusion "Scripts and Add-Ins" 에서 run().
import adsk.core, adsk.fusion, os, math, traceback

MM = 0.1
OUT_DIR = os.environ.get("CUBE_ROBOT_MODELS", r"C:\program code\physical_computing_project\models")

# ---- 치수 (mm) ----
SHAFT_D, SHAFT_FLAT, SHAFT_DEPTH = 5.0, 4.5, 12.0      # NEMA17 축: 지름 5, D컷 평면까지 4.5
HOLE_CLR = 0.2                                        # 축 구멍 공차 (지름 기준)
COUPLER_D, COUPLER_L = 16.0, 22.0                     # 커플러 몸통 지름/길이
# 십자 키: Codex 설계 검토(docs/DESIGN_REVIEW.md) 반영 — 12×3×5 → 10×4×3.5.
#   키 높이 3.5 < 슬롯 깊이 4.0 이라 어깨가 캡 윗면에 닿고 바닥 여유 0.5 mm, 캡 외벽 최소 두께 1.4 → 2.2 mm
KEY_W, KEY_T, KEY_H = 10.0, 4.0, 3.5                  # 십자 키 폭/두께/높이
SLOT_CLR = 0.3                                        # 키-슬롯 공차 (폭 기준, 편측 0.15)
SETSCREW_D, SETSCREW_Z = 2.5, 6.0                     # M3 세트스크류: Ø2.5 로 뚫고 출력 후 탭 가공 (PLA)
CAP_D, CAP_H, CAP_SLOT_DEPTH = 15.6, 6.0, 4.0         # 센터 캡 (큐브 실물 센터 캡 자리 실측 후 조정)
CAP_PEG_D, CAP_PEG_H = 4.0, 3.0                       # 캡 아래 고정 핀 (센터 조각 구멍에 압입)
NEMA, NEMA_PITCH, NEMA_HOLE_D, NEMA_BOSS_D = 42.3, 31.0, 3.4, 22.5
MOUNT_W = 48.0                                        # 브래킷 판 폭: 발판 안쪽과 아래 모터 홀 사이 4.5 mm 확보 (42.3 이면 0.05 mm 간섭)
MOUNT_T, MOUNT_TAB, TAB_HOLE_D = 4.0, 14.0, 3.4       # 브래킷 두께, 바닥 길이, 프레임 고정 구멍

NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
JOIN = adsk.fusion.FeatureOperations.JoinFeatureOperation
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation


def P(x, y, z=0.0):
    return adsk.core.Point3D.create(x * MM, y * MM, z * MM)


def V(mm):
    return adsk.core.ValueInput.createByReal(mm * MM)


def coll(items):
    c = adsk.core.ObjectCollection.create()
    for i in items:
        c.add(i)
    return c


def all_profiles(sk):
    return coll([sk.profiles.item(i) for i in range(sk.profiles.count)])


def largest_profile(sk):
    return max((sk.profiles.item(i) for i in range(sk.profiles.count)), key=lambda p: p.areaProperties().area)


def circle(sk, cx, cy, d):
    return sk.sketchCurves.sketchCircles.addByCenterRadius(P(cx, cy), d / 2 * MM)


def rect(sk, x0, y0, x1, y1):
    return sk.sketchCurves.sketchLines.addTwoPointRectangle(P(x0, y0), P(x1, y1))


def offset_plane(comp, base, mm):
    inp = comp.constructionPlanes.createInput()
    inp.setByOffset(base, V(mm))
    return comp.constructionPlanes.add(inp)


def extrude(comp, profiles, mm, op):
    inp = comp.features.extrudeFeatures.createInput(profiles, op)
    inp.setDistanceExtent(False, V(mm))
    return comp.features.extrudeFeatures.add(inp)


def new_comp(root, name, dx_mm):
    m = adsk.core.Matrix3D.create()
    m.translation = adsk.core.Vector3D.create(dx_mm * MM, 0, 0)
    occ = root.occurrences.addNewComponent(m)
    occ.component.name = name
    return occ.component


def planar_face(body, normal_axis, sign, min_z_mm=None):
    """법선이 ±축 방향인 평면 중 (선택) 중심 z 가 min_z_mm 이상인 첫 면"""
    for f in body.faces:
        g = f.geometry
        if not isinstance(g, adsk.core.Plane):
            continue
        n = getattr(g.normal, normal_axis)
        if n * sign > 0.9 and (min_z_mm is None or f.centroid.z > min_z_mm * MM):
            return f
    return None


def build_coupler(comp):
    sk = comp.sketches.add(comp.xYConstructionPlane)
    circle(sk, 0, 0, COUPLER_D)
    body = extrude(comp, sk.profiles.item(0), COUPLER_L, NEW).bodies.item(0)
    body.name = "center_coupler"
    # D컷 축 구멍: 원 + 평면 선 → 두 프로파일 중 큰 쪽(D 모양)을 잘라낸다
    sk = comp.sketches.add(comp.xYConstructionPlane)
    circle(sk, 0, 0, SHAFT_D + HOLE_CLR)
    flat_y = SHAFT_FLAT - SHAFT_D / 2 + HOLE_CLR / 2
    sk.sketchCurves.sketchLines.addByTwoPoints(P(-SHAFT_D, flat_y), P(SHAFT_D, flat_y))
    extrude(comp, largest_profile(sk), SHAFT_DEPTH, CUT)
    # M3 세트스크류 구멍 (반경 방향, 평면 쪽을 누르도록 -Y 방향에서)
    sk = comp.sketches.add(comp.xZConstructionPlane)
    c = sk.modelToSketchSpace(P(0, 0, SETSCREW_Z))
    sk.sketchCurves.sketchCircles.addByCenterRadius(c, SETSCREW_D / 2 * MM)
    inp = comp.features.extrudeFeatures.createInput(sk.profiles.item(0), CUT)
    inp.setSymmetricExtent(V(COUPLER_D), True)
    comp.features.extrudeFeatures.add(inp)
    # 십자 키 (큐브 캡 쪽)
    pl = offset_plane(comp, comp.xYConstructionPlane, COUPLER_L)
    sk = comp.sketches.add(pl)
    rect(sk, -KEY_W / 2, -KEY_T / 2, KEY_W / 2, KEY_T / 2)
    rect(sk, -KEY_T / 2, -KEY_W / 2, KEY_T / 2, KEY_W / 2)
    extrude(comp, all_profiles(sk), KEY_H, JOIN)
    return body


def build_cap(comp):
    sk = comp.sketches.add(comp.xYConstructionPlane)
    circle(sk, 0, 0, CAP_D)
    body = extrude(comp, sk.profiles.item(0), CAP_H, NEW).bodies.item(0)
    body.name = "center_cap"
    # 십자 슬롯 (키 + 공차)
    pl = offset_plane(comp, comp.xYConstructionPlane, CAP_H)
    sk = comp.sketches.add(pl)
    w, t = KEY_W + SLOT_CLR, KEY_T + SLOT_CLR
    rect(sk, -w / 2, -t / 2, w / 2, t / 2)
    rect(sk, -t / 2, -w / 2, t / 2, w / 2)
    extrude(comp, all_profiles(sk), -CAP_SLOT_DEPTH, CUT)
    # 아래쪽 고정 핀
    sk = comp.sketches.add(comp.xYConstructionPlane)
    circle(sk, 0, 0, CAP_PEG_D)
    extrude(comp, sk.profiles.item(0), -CAP_PEG_H, JOIN)
    return body


def build_mount(comp):
    h = MOUNT_W / 2
    sk = comp.sketches.add(comp.xYConstructionPlane)
    rect(sk, -h, -h, h, h)
    circle(sk, 0, 0, NEMA_BOSS_D)
    p = NEMA_PITCH / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            circle(sk, sx * p, sy * p, NEMA_HOLE_D)
    body = extrude(comp, largest_profile(sk), MOUNT_T, NEW).bodies.item(0)
    body.name = "motor_mount"
    # 바닥(법선 -Y) 면에서 +Z 방향으로 뻗는 발판을 세우고 몸체 안쪽(+Y)으로 두께만큼 돌출
    # 면 위 스케치에는 그 면의 외곽이 자동 투영되어 프로파일로 섞이므로, 원하는 프로파일을 면적으로 고른다
    bottom = planar_face(body, "y", -1)
    sk = comp.sketches.add(bottom)
    a = sk.modelToSketchSpace(P(-h, -h, 0))
    b = sk.modelToSketchSpace(P(h, -h, MOUNT_T + MOUNT_TAB))
    sk.sketchCurves.sketchLines.addTwoPointRectangle(a, b)
    want = (2 * h) * (MOUNT_T + MOUNT_TAB) * MM * MM
    foot = min((sk.profiles.item(i) for i in range(sk.profiles.count)), key=lambda q: abs(q.areaProperties().area - want))
    extrude(comp, foot, -MOUNT_T, JOIN)
    # 발판 윗면(법선 +Y, 판 위쪽 z)에 프레임 고정 구멍 2개 — 양방향 절단이라 면 법선 방향과 무관
    top = planar_face(body, "y", +1, min_z_mm=MOUNT_T + 1)
    sk = comp.sketches.add(top)
    zc = MOUNT_T + MOUNT_TAB / 2 + 1.0
    for x in (-12.0, 12.0):
        c = sk.modelToSketchSpace(P(x, -h + MOUNT_T, zc))
        sk.sketchCurves.sketchCircles.addByCenterRadius(c, TAB_HOLE_D / 2 * MM)
    hole_area = math.pi * (TAB_HOLE_D / 2 * MM) ** 2
    holes = [sk.profiles.item(i) for i in range(sk.profiles.count) if abs(sk.profiles.item(i).areaProperties().area - hole_area) < hole_area * 0.2]
    inp = comp.features.extrudeFeatures.createInput(coll(holes), CUT)
    inp.setSymmetricExtent(V(MOUNT_T * 2), True)
    comp.features.extrudeFeatures.add(inp)
    return body


def export_stl(design, body, path):
    em = design.exportManager
    opts = em.createSTLExportOptions(body, path)
    opts.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementMedium
    opts.isBinaryFormat = True
    em.execute(opts)


def clear_parts(root):
    """같은 이름의 이전 부품이 있으면 지운다 (재실행용)"""
    for name in ("center_coupler", "center_cap", "motor_mount"):
        occ = root.occurrences.itemByName(name + ":1")
        if occ:
            occ.deleteMe()


def build(design, root):
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_parts(root)
    parts = [
        ("center_coupler", build_coupler, 0.0),
        ("center_cap", build_cap, 35.0),
        ("motor_mount", build_mount, 90.0),
    ]
    out = {}
    for name, fn, dx in parts:
        comp = new_comp(root, name, dx)
        body = fn(comp)
        path = os.path.join(OUT_DIR, name + ".stl")
        export_stl(design, body, path)
        bb = body.boundingBox
        out[name] = {
            "stl": path,
            "size_mm": [round((bb.maxPoint.x - bb.minPoint.x) / MM, 2), round((bb.maxPoint.y - bb.minPoint.y) / MM, 2), round((bb.maxPoint.z - bb.minPoint.z) / MM, 2)],
            "volume_cm3": round(body.physicalProperties.volume, 3),
            "faces": body.faces.count,
        }
    # 전체 디자인도 .f3d 로 보관 (Fusion 없이도 저장소에 설계 원본이 남도록)
    try:
        arch = design.exportManager.createFusionArchiveExportOptions(os.path.join(OUT_DIR, "CubeRobotParts.f3d"))
        design.exportManager.execute(arch)
        out["f3d"] = os.path.join(OUT_DIR, "CubeRobotParts.f3d")
    except Exception as e:  # 클라우드 미로그인 등
        out["f3d_error"] = str(e)
    try:
        adsk.core.Application.get().activeViewport.fit()
    except Exception:
        pass
    return out


def run(context):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    build(design, design.rootComponent)


if "root" in globals() and root is not None:  # fusion_exec 경로 (adsk, app, design, root 미리 정의)
    try:
        result = build(design, root)
    except Exception:
        result = {"error": traceback.format_exc()}
