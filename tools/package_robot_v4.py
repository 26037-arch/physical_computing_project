"""Package the current verified V4 fabrication files with a SHA256 manifest."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / 'models/robot_v4/assembly_kit'


def main():
    for path in [ROOT / 'models/robot_v4/mechanical_checks.json'] + [KIT / (n + '_checks.json') for n in ('kit', 'mesh', 'pdf')]:
        assert json.loads(path.read_text())['passed'], f'Failed verification: {path}'
    assert json.loads((KIT / 'five_face_checks.json').read_text())['passed']
    assert json.loads((KIT / 'physics_checks.json').read_text())['analytical_checks_passed']
    paths = [ROOT / 'README_BUILD.md', ROOT / 'config/robot_v4.json', ROOT / 'diagram.json', ROOT / 'wokwi.toml']
    for pattern in ['firmware/main/*', 'sim/*.js', 'sim/index.html', 'scripts/*.ps1',
                    'tools/gen_robot_contract.js', 'tools/check_robot_contract.js', 'tools/host_mechanism_check.js',
                    'tools/host_mechanism/*', 'tools/host_check.js', 'tools/host_solver/*', 'tools/host_solver/avr/*',
                    'tools/test_sim_v4.js', 'tools/serve.js', 'tests/*.test.yaml', 'docs/SETUP.md', 'tools/gen_mechanism_test.js', 'tools/gen_wokwi_test.js',
                    'tools/gen_tables.js', 'tools/algs.js', 'docs/CONSISTENCY_V4.md', 'docs/PHYSICS_V4.md', 'docs/ARDUINO_REVIEW_V4.md', 'docs/REPORT.md', 'docs/PROJECT_REPORT_V4*', 'tools/make_robot_v4_report.py', 'tools/check_five_face_solver.js', 'tools/check_robot_v4_physics.py', 'docs/BUILD_V4*', 'docs/HARDWARE_V4.md', 'docs/assets/fonts/*', 'docs/images/v4_manual/*.png',
                    'tools/build_robot_v[234].py', 'tools/build_robot_v4_kit.py', 'tools/check_robot_v2.py',
                    'tools/check_robot_v4*.py', 'tools/embed_models_v4.js', 'tools/make_robot_v4_manual.py',
                    'tools/robot_v4_manual_data.py', 'tools/requirements-robot-v4.txt', 'tools/package_robot_v4.py']:
        paths.extend(ROOT.glob(pattern))
    paths.extend((ROOT / 'models/robot_v4').rglob('*'))
    manifest_path = KIT / 'bundle_manifest.json'
    paths = sorted({p for p in paths if p.is_file() and p != manifest_path and '__pycache__' not in p.parts})
    manifest = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    target = ROOT / 'artifacts/robot_v4_build_manual_bundle.zip'
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in paths + [manifest_path]:
            archive.write(path, path.relative_to(ROOT))
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert all(hashlib.sha256(archive.read(name)).hexdigest() == digest for name, digest in manifest.items())
    print(f'PASS: {len(paths) + 1} files, {target.stat().st_size:,} bytes, all archived SHA256 values match')


if __name__ == '__main__':
    main()
