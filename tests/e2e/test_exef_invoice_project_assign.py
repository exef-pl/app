import pytest
import requests


@pytest.mark.e2e
def test_invoice_can_be_assigned_to_project(exef_local_process):
    base_url = getattr(exef_local_process, 'base_url', 'http://127.0.0.1:3030')

    project_id = 'PRJ-E2E-001'

    r_proj = requests.post(
        f'{base_url}/projects',
        json={
            'id': project_id,
            'nazwa': 'Projekt E2E',
            'status': 'aktywny',
        },
        timeout=5,
    )
    assert r_proj.status_code in (200, 201), r_proj.text

    r_inv = requests.post(
        f'{base_url}/inbox/invoices',
        json={
            'source': 'scanner',
            'metadata': {
                'invoiceNumber': 'FV/E2E/001',
                'contractorName': 'Kontrahent E2E',
                'contractorNip': '1234567890',
                'grossAmount': 123.45,
                'issueDate': '2026-01-22',
            },
        },
        timeout=5,
    )
    assert r_inv.status_code == 201, r_inv.text
    inv = r_inv.json()
    assert inv.get('id')

    invoice_id = inv['id']

    r_assign = requests.post(
        f'{base_url}/inbox/invoices/{invoice_id}/assign',
        json={'projectId': project_id},
        timeout=5,
    )
    assert r_assign.status_code == 200, r_assign.text

    r_get = requests.get(f'{base_url}/inbox/invoices/{invoice_id}', timeout=5)
    assert r_get.status_code == 200, r_get.text
    got = r_get.json()
    assert got.get('projectId') == project_id
