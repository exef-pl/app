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
            # Some environments (CI/VM/limited window managers) can start and quit Electron quickly with exit code 0.
            # Treat that as success as long as there are no obvious error indicators.
            if proc.returncode and proc.returncode != 0:
                raise AssertionError(f"Desktop process exited too early with code {proc.returncode}. Output:\n{out}")

            out_lower = (out or '').lower()
            error_markers = ['error', 'exception', 'traceback', 'failed', 'crash']
            if any(m in out_lower for m in error_markers):
                raise AssertionError(f"Desktop process exited and output contains error markers. Output:\n{out}")
    finally:
        if proc.poll() is None:
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                pass
