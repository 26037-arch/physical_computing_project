"""Export the kit reference models (NEMA17, MG996R, SG90) at their mounting datums.

build_robot_v5.purchased() is the single source of the placement, so the 3D build
manual (v5/sim/build.html) and the overlap check show the same solids the CAD
check tests. Output: models/robot_v5/purchased/<name>.stl in the robot's local
holder frame (mm), then `node tools/embed_kit_v5.js` -> v5/sim/kit_models.js.
"""
import json
import sys

import cadquery as cq
import build_robot_v5 as d


def main():
    out = d.OUT/'purchased'
    out.mkdir(exist_ok=True)
    info = {}
    for name, shape in d.purchased().items():
        cq.exporters.export(cq.Workplane(obj=shape), str(out/(name+'.stl')), tolerance=.05, angularTolerance=.2)
        bb = shape.BoundingBox()
        info[name] = dict(bbox_min_mm=[round(v, 4) for v in (bb.xmin, bb.ymin, bb.zmin)],
                          bbox_max_mm=[round(v, 4) for v in (bb.xmax, bb.ymax, bb.zmax)],
                          volume_mm3=round(shape.Volume(), 2))
        print('OK  ', name, info[name]['bbox_min_mm'], info[name]['bbox_max_mm'], flush=True)
    (out/'purchased.json').write_text(json.dumps(dict(
        note='Kit reference models placed by build_robot_v5.purchased(); robot local frame, mm. Cables omitted.',
        parts=info), indent=2), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
