import os
import sys
import time

import pytest


@pytest.mark.e2e
def test_exef_desktop_starts_smoke():
    if sys.platform.startswith('linux') and not os.environ.get('DISPLAY'):
        pytest.skip('Desktop smoke test requires DISPLAY on Linux')

    exef_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'exef'))
    node_modules = os.path.join(exef_root, 'node_modules')
    if not os.path.isdir(node_modules):
        pytest.skip('Missing exef/node_modules. Run: npm --prefix exef install')

    # We start the Electron app via npm. The test passes if the process stays alive for a short time.
    # This is intentionally a smoke-test; full UI E2E would require additional tooling.
    import subprocess  # noqa: PLC0415

    proc = subprocess.Popen(
        ['npm', 'run', 'desktop'],
        cwd=exef_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        time.sleep(5)
        if proc.poll() is not None:
            out = ''
            try:
                out = (proc.stdout.read() if proc.stdout else '')
            except Exception:  # noqa: BLE001
                pass
            raise AssertionError(f"Desktop process exited too early with code {proc.returncode}. Output:\n{out}")
    finally:
        if proc.poll() is None:
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                pass
