import os
import signal
import subprocess
import time
from contextlib import contextmanager

import pytest
import requests


def _wait_http_ok(url: str, timeout_seconds: float = 15.0) -> None:
    start = time.time()
    last_exc: Exception | None = None
    while time.time() - start < timeout_seconds:
        try:
            r = requests.get(url, timeout=1)
            if r.status_code < 500:
                return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
        time.sleep(0.2)
    raise RuntimeError(f"Service did not become ready: {url}. Last error: {last_exc}")


def _wait_file_nonempty(path: str, timeout_seconds: float = 15.0) -> str:
    start = time.time()
    while time.time() - start < timeout_seconds:
        try:
            if os.path.isfile(path):
                raw = open(path, encoding='utf-8').read().strip()
                if raw:
                    return raw
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.2)
    raise RuntimeError(f"File did not become ready: {path}")


@contextmanager
def run_process(cmd: list[str], cwd: str, env: dict[str, str] | None = None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=merged_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        yield proc
    finally:
        if proc.poll() is None:
            try:
                proc.send_signal(signal.SIGTERM)
            except Exception:  # noqa: BLE001
                pass

        try:
            proc.wait(timeout=10)
        except Exception:  # noqa: BLE001
            try:
                proc.kill()
            except Exception:  # noqa: BLE001
                pass


@pytest.fixture
def exef_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'exef'))


@pytest.fixture
def exef_web_process(exef_root: str):
    with run_process(
        ['node', 'src/web/server.js'],
        cwd=exef_root,
        env={'PORT': '3000', 'NODE_ENV': 'test'},
    ) as proc:
        _wait_http_ok('http://127.0.0.1:3000/health')
        yield proc


@pytest.fixture
def exef_local_process(exef_root: str, tmp_path):
    port_file = os.path.join(str(tmp_path), 'exef-local-service.port')
    invoices_store = os.path.join(str(tmp_path), 'invoices.json')
    projects_store = os.path.join(str(tmp_path), 'projects.csv')
    with run_process(
        ['node', 'src/local-service/server.js'],
        cwd=exef_root,
        env={
            'LOCAL_SERVICE_HOST': '127.0.0.1',
            'LOCAL_SERVICE_PORT': '0',
            'EXEF_LOCAL_SERVICE_PORT_FILE': port_file,
            'EXEF_INVOICE_STORE_PATH': invoices_store,
            'EXEF_PROJECTS_FILE_PATH': projects_store,
            'NODE_ENV': 'test',
        },
    ) as proc:
        port = _wait_file_nonempty(port_file)
        base_url = f"http://127.0.0.1:{port}"
        _wait_http_ok(f"{base_url}/health")
        proc.base_url = base_url
        proc.port = int(port)
        yield proc
