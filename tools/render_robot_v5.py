"""Render exported Rev B STEP geometry and seven explicit printing poses."""
import json

import cadquery as cq
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Polygon
from matplotlib.ticker import MaxNLocator
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

import build_robot_v5 as d


def add(ax, shape, color):
    if not shape.Solids():
        return
    vertices, faces = shape.tessellate(.25, .35)
    if not faces:
        return
    points = np.array([v.toTuple() for v in vertices])
    triangles = points[np.array(faces)]
    normals = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-12)
    light = np.array([.4, .3, .85]); light /= np.linalg.norm(light)
    # OCC triangle windings can differ on coplanar BRep faces. Two-sided
    # lighting avoids false triangular seams across a single planar surface.
    rgba = np.tile(matplotlib.colors.to_rgba(color), (len(faces), 1))
    rgba[:, :3] *= (.58+.42*np.abs(normals @ light))[:, None]
    ax.add_collection3d(Poly3DCollection(triangles, facecolors=rgba,
                                        edgecolors='none', linewidths=0))


def setup(ax, shapes, elev=25, azim=55):
    bounds = [s.BoundingBox() for s in shapes]
    ranges = [(min(getattr(b, k+'min') for b in bounds)-5,
               max(getattr(b, k+'max') for b in bounds)+5) for k in 'xyz']
    ax.set_xlim(*ranges[0]); ax.set_ylim(*ranges[1]); ax.set_zlim(*ranges[2])
    ax.set_box_aspect([hi-lo for lo, hi in ranges])
    ax.view_init(elev=elev, azim=azim)
    ax.set_xlabel('X (mm)'); ax.set_ylabel('Y, front (mm)'); ax.set_zlabel('Z, up (mm)')
    ax.tick_params(labelsize=7)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.set_major_locator(MaxNLocator(nbins=4))
    ax.set_facecolor('#f4f6f8')


def section_rings(shape):
    """Actual x=0 BRep section, converted to sampled closed wire polygons."""
    plane = cq.Face.makePlane(500, 500, (0, 0, 0), (1, 0, 0))
    section = shape.intersect(plane)
    for face in section.Faces():
        for i, wire in enumerate([face.outerWire(), *face.innerWires()]):
            points = wire.sample(max(24, int(wire.Length()*1.5)))[0]
            yield i == 0, np.array([[v.y, v.z] for v in points])


def main():
    parts, bought = d.load_parts(), d.purchased()
    images = d.ROOT/'docs'/'images'
    images.mkdir(parents=True, exist_ok=True)
    checks_path = d.OUT/'mechanical_checks.json'
    passed = checks_path.exists() and json.loads(checks_path.read_text(encoding='utf-8'))['passed']
    status = 'CAD checks PASS; physical prototype unverified' if passed else 'CAD checks FAILED - interference review prototype'

    fig = plt.figure(figsize=(12, 10), facecolor='white')
    ax = fig.add_subplot(111, projection='3d')
    items = [(n, s.rotate((0, 0, 0), (1, 0, 0), d.P['tilt_deg']))
             for n, s in d.assembly_items(parts, bought)]
    for name, shape in items:
        add(ax, shape, d.COLORS[name])
    setup(ax, [s for _, s in items])
    ax.set_title(f"V5 Rev B | OPEN {d.P['hood_open_deg']:g} deg | lifter DOWN | world coordinates\n"+status, pad=20)
    fig.tight_layout()
    fig.savefig(images/'robot_v5_assembly.png', dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(12, 9), facecolor='white')
    flip = dict(d.assembly_items(parts, bought, 'flip'))
    for name in ('base', 'nema17', 'cube_holder', 'hub', 'hood', 'cube', 'lifter'):
        for outer, points in section_rings(flip[name]):
            ax.add_patch(Polygon(points, closed=True, facecolor=d.COLORS[name] if outer else '#f4f6f8',
                                 edgecolor='#344355', linewidth=.7, alpha=.9))
    # The actual side arm/tower profiles are outside the central section.
    # A slab at x=36 exposes the arm; x=42 exposes the tower and slot.
    for name, x, col in (('hood', 36, '#bc8f35'), ('base', -42, '#8e9eaf')):
        shifted = flip[name].translate((-x, 0, 0))
        for outer, points in section_rings(shifted):
            ax.add_patch(Polygon(points, closed=True, facecolor=col if outer else '#f4f6f8',
                                 edgecolor=col, linewidth=.6, alpha=.22 if outer else .8))
    b0, b1 = d.B0, [d.B0[i]+d.P['lift_stroke_mm']*d.D[i] for i in range(2)]
    ax.plot([b0[0], b1[0]], [b0[1], b1[1]], '--', color='#dd5436', label='66 mm slider path')
    for name in ('crank', 'link', 'sg90', 'mg996r'):
        vertices, faces = flip[name].tessellate(.3, .4)
        # Projection is explicitly distinguished from the true central section.
        points = np.array([[v.y, v.z] for v in vertices])
        from shapely.geometry import MultiPoint
        hull = np.array(MultiPoint(points).convex_hull.exterior.coords)
        ax.add_patch(Polygon(hull, facecolor=d.COLORS[name], edgecolor=d.COLORS[name], alpha=.25))
    bounds = [s.BoundingBox() for s in flip.values()]
    ymin, ymax = min(b.ymin for b in bounds)-10, max(b.ymax for b in bounds)+15
    zmin, zmax = min(b.zmin for b in bounds)-10, max(b.zmax for b in bounds)+15
    yy = np.array([ymin, ymax])
    ax.plot(yy, [d.floor_z(y) for y in yy], color='#333333', label=f"Desk: world Z = {d.P['table_zw_mm']:g} mm")
    ax.scatter([-28.3], [0], color='#cc3b2d', s=30, zorder=10)
    ax.annotate('Pivot (-28.3, 0)\nCube 65.1 deg', (-28.3, 0), (0, 20), arrowprops=dict(arrowstyle='->'))
    ax.set(xlim=(ymin, ymax), ylim=(zmin, zmax), xlabel='Local Y, front -> (mm)', ylabel='Local Z (mm)',
           title=f"V5 Rev B FLIP | hood {d.P['hood_flip_deg']:g} deg | lifter UP | cube 65.1 deg\n"+status+'\nSolid: x=0 section; faded: side arm/tower sections and linkage/servo projections')
    ax.set_aspect('equal'); ax.set_facecolor('#f4f6f8'); ax.grid(alpha=.2); ax.legend(loc='upper right')
    fig.tight_layout(); fig.savefig(images/'robot_v5_flip.png', dpi=160); plt.close(fig)

    report = json.loads((d.OUT/'manufacturing.json').read_text(encoding='utf-8'))
    fig = plt.figure(figsize=(18, 10), facecolor='white')
    for i, (name, shape) in enumerate(parts.items(), 1):
        ax = fig.add_subplot(2, 4, i, projection='3d')
        posed = d.print_pose(name, shape)
        add(ax, posed, d.COLORS[name]); setup(ax, [posed], elev=27, azim=45)
        row = report['print_parts'][name]
        ax.set_title(f"{name} x1 | {row['grams_total']:.1f} g | {row['estimated_hours']:.2f} h estimate", fontsize=10)
    summary = fig.add_subplot(2, 4, 8)
    summary.axis('off')
    summary.text(.04, .9, 'Rev B printing poses', fontsize=14, weight='bold', va='top')
    summary.text(.04, .78, 'Holder: plate down, posts up\nHub: flange down\nHood: roof / arm top webs down\nBase: world-horizontal deck down\nLifter: rear crossbar face down (X +90 deg)\nCrank / link: flat broad face down\n\nPETG; 0.2 mm; 20% infill; 3 walls\nCAD overhang / bounded-bridge checks\nSlicer settings and physical print unverified.\nMass and time are geometric estimates.\nSTLs retain translation-only normalization.', fontsize=10, va='top', linespacing=1.6)
    fig.suptitle('V5 Rev B | seven exported BRep parts | explicit bed poses\n'+status, fontsize=16)
    fig.tight_layout(rect=(0, 0, 1, .95))
    fig.savefig(images/'robot_v5_parts.png', dpi=160); plt.close(fig)
    print('Rendered robot_v5_assembly.png, robot_v5_flip.png, robot_v5_parts.png')


if __name__ == '__main__':
    main()
