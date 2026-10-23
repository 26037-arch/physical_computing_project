"""Matplotlib previews of exported V4 STEP solids; +Y is shown vertically."""
import cadquery as cq
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

import build_robot_v4 as d
from check_robot_v4 import load_design


def add(ax, shape, color, alpha=1):
    if not shape.Solids():
        return
    vertices, faces = shape.tessellate(.25, .35)
    if not faces:
        return
    # Plot world X,Z,Y, so the robot's upward +Y reads naturally.
    points = np.array([v.toTuple() for v in vertices])[:, [0, 2, 1]]
    mesh = Poly3DCollection(points[np.array(faces)], facecolors=color, edgecolors=color,
                            linewidths=0, alpha=alpha, shade=True,
                            lightsource=matplotlib.colors.LightSource(azdeg=315, altdeg=50))
    ax.add_collection3d(mesh)


def setup(ax, x, y, z, elev=23, azim=36):
    ax.set_xlim(*x)
    ax.set_ylim(*z)
    ax.set_zlim(*y)
    ax.set_box_aspect((x[1]-x[0], z[1]-z[0], y[1]-y[0]))
    ax.view_init(elev=elev, azim=azim)
    ax.set_xlabel('X (mm)')
    ax.set_ylabel('Z (mm)')
    ax.set_zlabel('Y (mm), up')
    ax.set_facecolor('#f5f7fa')
    ax.tick_params(labelsize=8)


def main():
    _, _, instances, modules, lock, _ = load_design()
    images = d.ROOT/'docs'/'images'
    images.mkdir(parents=True, exist_ok=True)
    fig = plt.figure(figsize=(17, 10), facecolor='white')
    ax = fig.add_subplot(121, projection='3d')
    items = list(d.assembly_items(instances, modules, lock))
    for n, kind, s in items:
        add(ax, s, d.color(kind))
    setup(ax, (-270, 270), (-330, 105), (-270, 270))
    ax.set_title('Complete assembly\nF/B + D + LOCK engaged; R/L withdrawn 24 mm', fontsize=12)
    ax = fig.add_subplot(122, projection='3d')
    for n, kind, s in items:
        # Detail uses a genuine section of distant structure to expose the cube.
        clipped = s.intersect(d.box(180, 145, 180, (0, -25, 0)))
        add(ax, clipped, d.color(kind))
    setup(ax, (-90, 90), (-97.5, 47.5), (-90, 90), elev=25, azim=42)
    ax.set_title('Cube and five two-pin heads (structure sectioned)\nOpen top; side rail supports in pinwheel arrangement', fontsize=12)
    fig.suptitle('Cube robot V4 | CadQuery BRep prototype | not physically validated', fontsize=17)
    fig.subplots_adjust(top=.88, bottom=.06, left=.01, right=.98, wspace=.03)
    fig.savefig(images/'robot_v4_assembly.png', dpi=150)
    plt.close(fig)
    print('Rendered robot_v4_assembly.png', flush=True)

    fig = plt.figure(figsize=(16, 10), facecolor='white')
    half = d.box(100, 700, 150, (-50, -200, 0))  # x<=0 section
    loc = d.face_location_v4('D')
    ax = fig.add_subplot(121, projection='3d')
    for n, kind, s, _ in instances:
        add(ax, s.intersect(half), d.color(kind))
    close_clip = d.box(100, 87, 100, (0, -9.5, 0))
    add(ax, lock[1]['lock_bar'].moved(loc).intersect(close_clip), '#e07935')
    setup(ax, (-32, 18), (-53, 34), (-34, 34), elev=12, azim=18)
    fig.text(.265, .89, 'Cube section x <= 0; bar in recessed D centre\n8 x 8 bar; 8.4 socket; tip Y = -23.5 mm', ha='center', va='top', fontsize=12)
    ax.text2D(.02, .02, 'Orange: locking bar\nPurple: keyed U/D centre\nPlate Y = -26.5 .. -23.5 mm\nNominal wall clearance: 5.7 mm', transform=ax.transAxes, fontsize=10,
              bbox=dict(facecolor='white', alpha=.9, edgecolor='#d4d9e0'))
    ax = fig.add_subplot(122, projection='3d')
    for n, kind, s, _ in instances:
        if kind in ('cube_core', 'center_recessed'):
            add(ax, s.intersect(half), d.color(kind))
    for n, s in d.module_pose(modules[True], 0).items():
        if n in ('shaft_hub', 'bearing_housing', 'bearing_front_cap', 'bearing_rear_cap',
                  'spindle_hollow_17x12', 'bearing_6003_0', 'bearing_6003_1', 'drive_plate_2pin'):
            add(ax, s.moved(loc).intersect(half), d.color(n), .85)
    for n, s in d.lock_pose(lock, 0).items():
        add(ax, s.moved(loc), d.color(n))
    setup(ax, (-50, 50), (-330, 35), (-55, 70), elev=12, azim=15)
    ax.set_box_aspect((100, 125, 365), zoom=.88)
    ax.set_xticks((-30, 0, 30))
    ax.set_yticks((-40, 0, 40))
    fig.text(.755, .89, 'D spindle section and complete lock unit\nOD 17 / ID 12; crank r15; travel 30 mm', ha='center', va='top', fontsize=12)
    fig.suptitle('V4 locking path | actual STEP geometry, sectioned for visibility', fontsize=17)
    fig.subplots_adjust(top=.82, bottom=.06, left=.02, right=.98, wspace=.09)
    fig.savefig(images/'robot_v4_lock_bar.png', dpi=150)
    plt.close(fig)
    print('Rendered robot_v4_lock_bar.png', flush=True)


if __name__ == '__main__':
    main()
