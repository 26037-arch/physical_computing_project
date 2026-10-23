"""Import the generated V2 STEP BReps into a NEW Fusion design via fusion_exec.

Use tools/fusion-bridge/import-robot-v2.mjs from the local repository. This never
replaces the user's active design. Imported STEP geometry is not a parametric
feature history; regenerate CAD from build_robot_v2.py after changing dimensions.
"""
import json
import os

import adsk.core
import adsk.fusion


def import_design(which='cube'):
    if which not in ('cube', 'head', 'robot'):
        raise ValueError('Choose cube, head, or robot')
    model_dir = globals().get('MODEL_DIR')
    if not model_dir:
        model_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'models', 'robot_v2'))
    filename = dict(cube='printable_cube.step', head='one_face_module.step', robot='robot_assembly.step')[which]
    source = os.path.join(model_dir, filename)
    if not os.path.isfile(source):
        raise FileNotFoundError(source)
    application = adsk.core.Application.get()
    document = application.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    model = adsk.fusion.Design.cast(application.activeProduct)
    if model is None:
        raise RuntimeError('A Fusion Design document is required')
    document.name = 'CubeRobotV2_' + which
    model.designType = adsk.fusion.DesignTypes.DirectDesignType
    model.rootComponent.name = 'CubeRobotV2_' + which
    options = application.importManager.createSTEPImportOptions(source)
    if not application.importManager.importToTarget(options, model.rootComponent):
        raise RuntimeError('Fusion STEP import failed')
    with open(os.path.join(model_dir, 'parameters.json'), encoding='utf-8') as handle:
        dimensions = json.load(handle)
    # These record source dimensions; they do NOT drive the imported STEP bodies.
    for name, value in dimensions.items():
        if isinstance(value, (int, float)):
            model.userParameters.add('source_' + name, adsk.core.ValueInput.createByString(str(value) + ' mm'),
                                     'mm', 'Recorded CAD source dimension; regenerate to change geometry')
    model.attributes.add('CubeRobotV2', 'status', 'Prototype; printing and loaded operation unverified')
    application.activeViewport.fit()
    application.activeViewport.refresh()
    archive = os.path.join(model_dir, 'CubeRobotV2_' + which + '.f3d')
    export_options = model.exportManager.createFusionArchiveExportOptions(archive)
    if not model.exportManager.execute(export_options):
        raise RuntimeError('Fusion archive export failed')
    screenshot = os.path.join(model_dir, 'fusion_' + which + '.png')
    image_ok = application.activeViewport.saveAsImageFile(screenshot, 1600, 1000)
    bodies = list(model.rootComponent.bRepBodies)
    for occurrence in model.rootComponent.allOccurrences:
        bodies.extend(list(occurrence.component.bRepBodies))
    if not bodies or not all(body.isSolid for body in bodies):
        raise RuntimeError('Expected solid BRep bodies after import')
    return dict(document=document.name, solid_body_instances=len(bodies),
                source=source, archive=archive, screenshot=screenshot if image_ok else None,
                cad_status='Imported STEP solids; physical function remains unverified')


def run(context):
    import_design('cube')
