# 샘플: 아두이노 UNO용 상자형 하우징 (단위 cm). fusion_exec 로 실행하거나
# Fusion "Scripts and Add-Ins"에서 run() 으로 실행 가능.
import adsk.core, adsk.fusion

W, D, H, T = 9.0, 7.0, 4.0, 0.2  # 내부 폭/깊이/높이, 벽 두께 (UNO 6.9 x 5.3 cm + 여유)

def build(root):
    sk = root.sketches.add(root.xYConstructionPlane)
    sk.name = "enclosure_base"
    sk.sketchCurves.sketchLines.addTwoPointRectangle(
        adsk.core.Point3D.create(-(W / 2 + T), -(D / 2 + T), 0),
        adsk.core.Point3D.create(W / 2 + T, D / 2 + T, 0))
    ext = root.features.extrudeFeatures.addSimple(
        sk.profiles.item(0), adsk.core.ValueInput.createByReal(H + T),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    body = ext.bodies.item(0)
    body.name = "enclosure"
    top = max(ext.endFaces, key=lambda f: f.centroid.z)
    faces = adsk.core.ObjectCollection.create()
    faces.add(top)
    shell = root.features.shellFeatures.createInput(faces, False)
    shell.insideThickness = adsk.core.ValueInput.createByReal(T)
    root.features.shellFeatures.add(shell)
    return body.name

def run(context):
    app = adsk.core.Application.get()
    build(adsk.fusion.Design.cast(app.activeProduct).rootComponent)

if "root" in globals() and root is not None:  # fusion_exec 경로
    result = build(root)
