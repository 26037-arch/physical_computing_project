"""Finite geometric FDM screening, not a slicer or material certification.

Critical horizontal BRep sections are compared to the preceding 0.2 mm layer.
The permitted envelope is 45 degrees, with an explicitly separate 0.6 mm
short anchored ledge allowance. Remaining material needs two opposite anchors
for a bridge of at most 45 mm. Unsupported islands and larger cantilevers fail.
"""
import math

import cadquery as cq
from shapely import affinity
from shapely import set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon


def _polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    return [p for p in getattr(g, 'geoms', ()) if p.geom_type == 'Polygon']


def _section(shape, z):
    result = GeometryCollection()
    for wire in cq.Workplane('XY').newObject([shape]).section(z).wires().vals():
        edges = list(wire.Edges())
        if not edges:
            continue
        edge = edges.pop(0)
        points = edge.sample(.025)[0]
        if edge.geomType() == 'LINE':
            points = [edge.startPoint(), edge.endPoint()]
        xy = [(p.x, p.y) for p in points]
        end = edge.endPoint()
        while edges:
            idx, reverse, distance = min(
                ((i, rev, (end-(e.endPoint() if rev else e.startPoint())).Length)
                 for i, e in enumerate(edges) for rev in (False, True)), key=lambda v: v[2])
            if distance > .001:
                raise ValueError('Section wire could not be ordered')
            edge = edges.pop(idx)
            points = edge.sample(.025)[0]
            if edge.geomType() == 'LINE':
                points = [edge.startPoint(), edge.endPoint()]
            if reverse:
                points = list(reversed(points))
            xy.extend((p.x, p.y) for p in points)
            end = edge.startPoint() if reverse else edge.endPoint()
        if len(xy) >= 3:
            poly = Polygon(xy).buffer(0)
            result = result.symmetric_difference(poly)
    return set_precision(result.buffer(0), .0001)


def _intervals(g):
    if g.is_empty:
        return []
    if g.geom_type == 'LineString':
        return [(g.bounds[0], g.bounds[2])]
    return sorted(v for p in getattr(g, 'geoms', ()) for v in _intervals(p))


def _bridge(component, current, support, limit):
    """Find a consistent raster direction with two material anchors per line."""
    for angle in range(0, 180, 15):
        u = affinity.rotate(component, angle, origin=(0, 0))
        c = affinity.rotate(current, angle, origin=(0, 0))
        s = set_precision(affinity.rotate(support, angle, origin=(0, 0)).buffer(0), .0001)
        xmin, ymin, xmax, ymax = u.bounds
        samples = max(3, min(15, math.ceil((ymax-ymin)/.75)))
        max_span = 0.
        good = True
        for i in range(samples):
            y = ymin+(ymax-ymin)*(i+.5)/samples
            ray = LineString([(xmin-limit-1, y), (xmax+limit+1, y)])
            occupied = _intervals(u.intersection(ray))
            anchors = _intervals(s.intersection(ray))
            for left, right in occupied:
                a = max((b for a, b in anchors if b <= left+.001), default=None)
                b = min((a for a, b in anchors if a >= right-.001), default=None)
                if a is None or b is None or b-a > limit+.001:
                    good = False
                    break
                # A bridge strand cannot cross a hole in the intended layer.
                strand = LineString([(a, y), (b, y)])
                if strand.difference(c.buffer(.04)).length > .08:
                    good = False
                    break
                max_span = max(max_span, b-a)
            if not good:
                break
        if good and max_span > 0:
            return dict(angle_deg=angle, span_mm=round(max_span, 4))
    return None


def review_print(posed_shape, layer=.2, bridge_limit=45., short_ledge=.6):
    """Return JSON-ready evidence for an explicitly posed, bed-normalized solid."""
    bb = posed_shape.BoundingBox()
    bed = _section(posed_shape, bb.zmin+.025)
    heights = {bb.zmin+.025, bb.zmax-.025}
    # Topological and curved-face extrema catch first roofs, recesses, holes,
    # flange steps and ledges. Mid-face samples catch sloping undersides.
    for f in posed_shape.Faces():
        b = f.BoundingBox()
        for z in (b.zmin+.025, b.zmax-.025, (b.zmin+b.zmax)/2):
            if bb.zmin+layer < z < bb.zmax-.005:
                heights.add(round(z, 4))
    # Four-mm coarse coverage is deliberately NOT represented as every layer.
    for i in range(1, math.ceil(bb.zlen/4)):
        heights.add(round(bb.zmin+i*4+.025, 4))
    problems, bridges, short_ledges = [], [], []
    max_unsupported = 0.
    evaluated = 0
    for z in sorted(heights):
        if z <= bb.zmin+layer or z >= bb.zmax:
            continue
        now = _section(posed_shape, z)
        previous = _section(posed_shape, z-layer)
        envelope = previous.buffer(layer+.015, resolution=12)
        short_envelope = previous.buffer(short_ledge+.015, resolution=12)
        unsupported = now.difference(envelope).buffer(0)
        evaluated += 1
        for component in _polygons(unsupported):
            if component.area < .025:
                continue
            max_unsupported = max(max_unsupported, component.area)
            # A finite small anchored ledge is a separate explicit slicer
            # assumption, not silently called a 45-degree overhang. An island
            # lacking any preceding-layer material must still fail.
            parent = next((p for p in _polygons(now) if p.covers(component.representative_point())), None)
            anchored = parent is not None and parent.intersection(previous).area > .01
            if anchored and component.difference(short_envelope).area < .01:
                reach = max(Point(x, y).distance(previous) for x, y in component.exterior.coords)
                short_ledges.append(dict(z_mm=round(z, 4), area_mm2=round(component.area, 4),
                                         sampled_horizontal_reach_mm=round(reach, 4),
                                         horizontal_reach_limit_mm=short_ledge))
                continue
            evidence = _bridge(component, now, envelope.intersection(now), bridge_limit)
            if evidence is not None:
                bridges.append(dict(z_mm=round(z, 4), area_mm2=round(component.area, 4), **evidence))
            else:
                problems.append(dict(z_mm=round(z, 4), area_mm2=round(component.area, 4),
                                     bbox_xy_mm=list(component.bounds),
                                     reason='No two opposite anchors within bridge limit; island or single-sided overhang'))
    if bed.area < .1:
        problems.append(dict(reason='No substantial bed contact'))
    return dict(ok=not problems, bed_contact_mm2=round(bed.area, 3),
                layer_mm=layer, permitted_overhang_deg=45, bridge_limit_mm=bridge_limit,
                short_anchored_ledge_limit_mm=short_ledge,
                critical_sections=evaluated, maximum_tested_unsupported_area_mm2=round(max_unsupported, 3),
                bridges=bridges, short_ledges=short_ledges, problems=problems,
                limitations='Finite BRep sections, 0.025 mm curve deflection and 15-degree bridge raster search; not full layer slicing, toolpath, PETG cooling or strength validation.')
