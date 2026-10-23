"""Render engineering previews from the actual STEP solids (no generated art)."""
import json
import itertools

import cadquery as cq
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

import build_robot_v2 as d


def add(ax, shape, color, alpha=1):
    verts, indices = shape.tessellate(0.22, 0.30)
    vertices = np.array([v.toTuple() for v in verts])
    triangles = vertices[np.array(indices)]
    p = Poly3DCollection(triangles, facecolors=color, edgecolors=color, linewidths=0, alpha=alpha,
                         shade=True, lightsource=matplotlib.colors.LightSource(azdeg=315, altdeg=50))
    ax.add_collection3d(p)


def setup(ax, limits):
    ax.set_xlim(*limits[0]); ax.set_ylim(*limits[1]); ax.set_zlim(*limits[2])
    ax.set_box_aspect([hi-lo for lo, hi in limits])
    ax.view_init(elev=24, azim=-52)
    ax.set_xlabel('X (mm)'); ax.set_ylabel('Y (mm)'); ax.set_zlabel('Z (mm)')
    ax.set_facecolor('#f4f6f8')


def main():
    params = json.loads((d.OUT / 'parameters.json').read_text())
    d.P.update({k: params[k] for k in d.P})
    cubes = {name: cq.importers.importStep(str(d.OUT / 'cube' / (name + '.step'))).val()
             for name in ('cube_core', 'cube_center', 'cube_edge', 'cube_corner')}
    parts = d.cube_instances(cubes)
    heads, hardware = d.head_parts(params['pitch_mm'])
    images = d.ROOT / 'docs' / 'images'
    images.mkdir(exist_ok=True)
    fig = plt.figure(figsize=(16, 8), facecolor='white')
    ax = fig.add_subplot(121, projection='3d')
    for name, kind, shape, _ in parts:
        add(ax, shape, d.COLORS[kind])
    for name in ('drive_plate',):
        add(ax, heads[name].translate((0, 0, 48.5)), d.COLORS[name])
    for name, shape in hardware.items():
        if name.startswith('pin_'):
            add(ax, shape.translate((0, 0, 48.5)), '#d65c47')
    setup(ax, ((-40, 40), (-40, 40), (-32, 68)))
    ax.set_title('Positive drive: 4 steel pins -> 4 edge sockets\nPlate shown withdrawn for visibility', fontsize=13)
    ax = fig.add_subplot(122, projection='3d')
    for name, kind, shape, pos in parts:
        add(ax, shape.translate(tuple(v * 12 for v in pos)), d.COLORS[kind])
    setup(ax, ((-49, 49), (-49, 49), (-49, 49)))
    ax.set_title('Printable cube: 1 core + 6 centers + 12 edges + 8 corners\nSpherical retention tracks; exploded view', fontsize=13)
    fig.suptitle('Cube robot V2 - CAD prototype (not yet print-tested)', fontsize=17, y=0.97)
    fig.subplots_adjust(top=0.84, bottom=0.08, wspace=0.05)
    fig.savefig(images / 'robot_v2_design.png', dpi=150)
    plt.close(fig)
    fig = plt.figure(figsize=(11, 9), facecolor='white')
    ax = fig.add_subplot(111, projection='3d')
    for name, shape in {**heads, **hardware}.items():
        c = '#d65c47' if name.startswith('pin_') else d.COLORS.get(name, '#c1c6cc')
        add(ax, shape, c)
    setup(ax, ((-38, 38), (-64, 32), (-8, 222)))
    ax.view_init(elev=20, azim=48)
    ax.set_title('One-face module: pin plate, supported spindle, retracting carriage\nMGN12 guide + M5 manual feed (24 mm working stroke)', fontsize=13)
    fig.savefig(images / 'robot_v2_module.png', dpi=150)
    plt.close(fig)
    print('Rendered docs/images/robot_v2_design.png and robot_v2_module.png')


if __name__ == '__main__':
    main()
