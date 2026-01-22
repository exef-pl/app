import pytest
import requests


@pytest.mark.e2e
def test_exef_web_health(exef_web_process):
    r = requests.get('http://127.0.0.1:3000/health', timeout=2)
    assert r.status_code == 200
    data = r.json()
    assert data.get('status') == 'ok'


@pytest.mark.e2e
def test_exef_local_health(exef_local_process):
    base_url = getattr(exef_local_process, 'base_url', 'http://127.0.0.1:3030')
    r = requests.get(f'{base_url}/health', timeout=2)
    assert r.status_code == 200
    data = r.json()
    assert data.get('status') == 'ok'
