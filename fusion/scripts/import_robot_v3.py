"""Open V3 STEP in a NEW Fusion document, preserving the active document."""
import json,os
import adsk.core
import adsk.fusion

def import_design(which='robot'):
    names={'robot':'robot_assembly.step','cube':'cube_with_fixed_axle.step',
           'hollow':'module_hollow.step','direct':'module_direct.step'}
    if which not in names:raise ValueError('Choose robot, cube, hollow or direct')
    folder=globals().get('MODEL_DIR') or os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..','models','robot_v3'))
    source=os.path.join(folder,names[which])
    if not os.path.isfile(source):raise FileNotFoundError(source)
    app=adsk.core.Application.get()
    doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    design=adsk.fusion.Design.cast(app.activeProduct)
    if design is None:raise RuntimeError('Fusion Design required')
    doc.name='CubeRobotV3_'+which
    design.designType=adsk.fusion.DesignTypes.DirectDesignType
    design.rootComponent.name=doc.name
    if not app.importManager.importToTarget(app.importManager.createSTEPImportOptions(source),design.rootComponent):
        raise RuntimeError('STEP import failed')
    with open(os.path.join(folder,'manufacturing.json'),encoding='utf-8') as f:params=json.load(f)['parameters']
    for key,val in params.items():
        if isinstance(val,(int,float)):
            design.userParameters.add('source_'+key,adsk.core.ValueInput.createByString(str(val)+' mm'),'mm','Source record; does not drive STEP bodies')
    app.activeViewport.fit();app.activeViewport.refresh()
    output=os.path.join(folder,doc.name+'.f3d')
    if not design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(output)):
        raise RuntimeError('Fusion archive export failed')
    return {'document':doc.name,'archive':output,'status':'Imported BRep; no parametric timeline or motion joints. Physical operation unverified.'}

def run(context):return import_design('robot')
