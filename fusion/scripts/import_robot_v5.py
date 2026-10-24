"""Import V5 Rev B STEP in a NEW Fusion document; run only inside Fusion.

Numeric source values are a record, not a parametric timeline. Import does
not imply that the mechanical checks pass. Does not execute on import.
"""
import json
import os

import adsk.core
import adsk.fusion


def import_design():
    folder = globals().get('MODEL_DIR') or os.path.abspath(os.path.join(
        os.path.dirname(__file__), '..', '..', 'models', 'robot_v5'))
    source = os.path.join(folder, 'robot_assembly.step')
    if not os.path.isfile(source):
        raise FileNotFoundError(source)
    with open(os.path.join(folder, 'parameters.json'), encoding='utf-8') as f:
        params = json.load(f)
    expected = {'base', 'crank', 'cube_holder', 'hood', 'hub', 'lifter', 'link'}
    if set(params.get('print_offsets', {})) != expected:
        raise ValueError('Expected seven Rev B parts, including the separate hub')
    checks_path = os.path.join(folder, 'mechanical_checks.json')
    with open(checks_path, encoding='utf-8') as f:
        checks = json.load(f)
    app = adsk.core.Application.get()
    doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    design = adsk.fusion.Design.cast(app.activeProduct)
    if design is None:
        raise RuntimeError('Fusion Design required')
    doc.name = 'CubeRobotV5'
    design.designType = adsk.fusion.DesignTypes.DirectDesignType
    # 루트 컴포넌트 이름은 이 Fusion 버전(2705)에서 바꿀 수 없다 — 문서 이름만 바꾼다
    if not app.importManager.importToTarget(app.importManager.createSTEPImportOptions(source), design.rootComponent):
        raise RuntimeError('STEP import failed')

    def record(prefix, value, inherited_unit=''):
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            # Preserve units for angles, dimensionless values, and source mm.
            unit = 'deg' if prefix.endswith('_deg') else 'mm' if prefix.endswith('_mm') else inherited_unit
            expr = f'{value} {unit}'.strip()
            design.userParameters.add('source_'+prefix, adsk.core.ValueInput.createByString(expr), unit,
                                      'Source metadata; does not drive imported STEP geometry')
        elif isinstance(value, dict):
            for key, val in value.items():
                unit = ('deg' if key.endswith('_deg') else 'mm' if key.endswith('_mm') or key in
                        ('print_offsets', 'size', 'center', 'hinge', 'hood_in', 'hood_out', 'post_in',
                         'post_out', 'lift_Q0', 'lift_Q1', 'lift_B0', 'lift_B1', 'servo_axes') else inherited_unit)
                record(prefix+'_'+key if prefix else key, val, unit)
        elif isinstance(value, list):
            for i, val in enumerate(value):
                record(prefix+'_'+str(i), val, inherited_unit)

    # DirectDesignType 에는 사용자 매개변수가 없다 → 매개변수 JSON 을 루트 컴포넌트 속성으로 남긴다
    if design.designType == adsk.fusion.DesignTypes.ParametricDesignType:
        record('', params)
    else:
        design.rootComponent.attributes.add('cube_robot_v5', 'parameters_json', json.dumps(params))
    metadata = dict(revision='Rev B', source_parameters='parameters.json',
                    mechanical_checks='mechanical_checks.json',
                    cad_checks_passed=bool(checks.get('passed')), print_parts=sorted(expected),
                    geometry_units='mm', physical_operation_verified=False)
    design.rootComponent.attributes.add('V5_CAD', 'source_record', json.dumps(metadata, ensure_ascii=False))
    app.activeViewport.fit()
    app.activeViewport.refresh()
    output = os.path.join(folder, 'CubeRobotV5.f3d')
    if not design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(output)):
        raise RuntimeError('Fusion archive export failed')
    return dict(document=doc.name, archive=output, **metadata,
                status='Imported Rev B BRep; source parameters are records. CAD status is from mechanical_checks.json; physical operation unverified.')


def run(context):
    return import_design()
