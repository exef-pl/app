#!/usr/bin/env python3
"""
E2E tests for EXEF3 - Document Flow Engine.

Tests run against live docker-compose services:
  - Backend: http://localhost:8003
  - Frontend: http://localhost:3003

Run: cd exef3 && python -m pytest tests/test_e2e.py -v
"""

import pytest
import requests
import time

API = "http://localhost:8003/api/v1"
FRONTEND = "http://localhost:3003"


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def api_url():
    """Verify backend is reachable."""
    for _ in range(5):
        try:
            r = requests.get(f"{API.replace('/api/v1', '')}/health", timeout=3)
            if r.status_code == 200:
                return API
        except requests.ConnectionError:
            time.sleep(1)
    pytest.skip("Backend not running at localhost:8003")


@pytest.fixture(scope="session")
def demo_token(api_url):
    """Login as demo user (biuro@exef.pl / demo123) and return token."""
    r = requests.post(f"{api_url}/auth/login", data={
        "username": "biuro@exef.pl",
        "password": "demo123",
    })
    if r.status_code != 200:
        pytest.skip("Demo user not seeded — run seed_demo.py first")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(demo_token):
    """Return auth headers dict."""
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="session")
def jan_token(api_url):
    """Login as Jan Kowalski (jan.kowalski@example.pl / demo123)."""
    r = requests.post(f"{api_url}/auth/login", data={
        "username": "jan.kowalski@example.pl",
        "password": "demo123",
    })
    if r.status_code != 200:
        pytest.skip("Jan Kowalski demo user not seeded")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def jan_auth(jan_token):
    return {"Authorization": f"Bearer {jan_token}"}


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH & FRONTEND
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealth:
    def test_backend_health(self, api_url):
        r = requests.get(f"{api_url.replace('/api/v1', '')}/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok" or "status" in data

    def test_frontend_serves(self):
        try:
            r = requests.get(FRONTEND, timeout=3)
            assert r.status_code == 200
            assert "EXEF" in r.text or "<div" in r.text
        except requests.ConnectionError:
            pytest.skip("Frontend not running at localhost:3003")


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuth:
    def test_login_success(self, api_url):
        r = requests.post(f"{api_url}/auth/login", data={
            "username": "biuro@exef.pl",
            "password": "demo123",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, api_url):
        r = requests.post(f"{api_url}/auth/login", data={
            "username": "biuro@exef.pl",
            "password": "wrong",
        })
        assert r.status_code in (401, 400, 422)

    def test_me_endpoint(self, api_url, auth):
        r = requests.get(f"{api_url}/auth/me", headers=auth)
        assert r.status_code == 200
        data = r.json()
        assert "email" in data
        assert data["email"] == "biuro@exef.pl"

    def test_me_no_token(self, api_url):
        r = requests.get(f"{api_url}/auth/me")
        assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# ENTITIES
# ═══════════════════════════════════════════════════════════════════════════════

class TestEntities:
    def test_list_entities(self, api_url, auth):
        r = requests.get(f"{api_url}/entities", headers=auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_entity_has_required_fields(self, api_url, auth):
        r = requests.get(f"{api_url}/entities", headers=auth)
        entities = r.json()
        for entity in entities:
            assert "id" in entity
            assert "name" in entity
            assert "type" in entity

    def test_create_entity(self, api_url, auth):
        unique_nip = str(int(time.time()))[-10:].zfill(10)
        r = requests.post(f"{api_url}/entities", headers=auth, json={
            "name": f"Test E2E {unique_nip}",
            "type": "spolka",
            "nip": unique_nip,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "spolka"
        assert "id" in data


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestProjects:
    def test_list_projects(self, api_url, auth):
        entities = requests.get(f"{api_url}/entities", headers=auth).json()
        assert len(entities) > 0
        entity_id = entities[0]["id"]

        r = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_project_has_fields(self, api_url, auth):
        entities = requests.get(f"{api_url}/entities", headers=auth).json()
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=auth).json()
        if len(projects) == 0:
            pytest.skip("No projects to test")
        p = projects[0]
        assert "id" in p
        assert "name" in p
        assert "type" in p


# ═══════════════════════════════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════════════════════════════

class TestTasks:
    @pytest.fixture
    def project_id(self, api_url, jan_auth):
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities for Jan")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects for Jan")
        return projects[0]["id"]

    def test_list_tasks(self, api_url, jan_auth, project_id):
        r = requests.get(f"{api_url}/projects/{project_id}/tasks", headers=jan_auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_task_has_fields(self, api_url, jan_auth, project_id):
        tasks = requests.get(f"{api_url}/projects/{project_id}/tasks", headers=jan_auth).json()
        if not tasks:
            pytest.skip("No tasks")
        t = tasks[0]
        assert "id" in t
        assert "name" in t
        assert "status" in t
        assert "docs_total" in t


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestDocuments:
    @pytest.fixture
    def task_id(self, api_url, jan_auth):
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects")
        tasks = requests.get(f"{api_url}/projects/{projects[0]['id']}/tasks", headers=jan_auth).json()
        if not tasks:
            pytest.skip("No tasks")
        return tasks[0]["id"]

    def test_list_documents(self, api_url, jan_auth, task_id):
        r = requests.get(f"{api_url}/tasks/{task_id}/documents", headers=jan_auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_document_has_fields(self, api_url, jan_auth, task_id):
        docs = requests.get(f"{api_url}/tasks/{task_id}/documents", headers=jan_auth).json()
        if not docs:
            pytest.skip("No documents")
        d = docs[0]
        assert "id" in d
        assert "status" in d
        for field in ("number", "contractor_name", "amount_gross", "currency"):
            assert field in d


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCES
# ═══════════════════════════════════════════════════════════════════════════════

class TestSources:
    @pytest.fixture
    def project_id(self, api_url, jan_auth):
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects")
        return projects[0]["id"]

    def test_list_sources(self, api_url, jan_auth, project_id):
        r = requests.get(f"{api_url}/projects/{project_id}/sources", headers=jan_auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_source_types(self, api_url, jan_auth):
        r = requests.get(f"{api_url}/source-types", headers=jan_auth)
        assert r.status_code == 200
        data = r.json()
        assert "import_types" in data
        assert "export_types" in data
        assert len(data["import_types"]) > 0
        assert len(data["export_types"]) > 0

    def test_source_has_direction(self, api_url, jan_auth, project_id):
        sources = requests.get(f"{api_url}/projects/{project_id}/sources", headers=jan_auth).json()
        if not sources:
            pytest.skip("No sources")
        for src in sources:
            assert src["direction"] in ("import", "export")
            assert "name" in src
            assert "source_type" in src


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT MEMBERS + TASK ASSIGNMENT
# ═══════════════════════════════════════════════════════════════════════════════

class TestMembers:
    @pytest.fixture
    def project_id(self, api_url, jan_auth):
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects")
        return projects[0]["id"]

    def test_list_members(self, api_url, jan_auth, project_id):
        r = requests.get(f"{api_url}/projects/{project_id}/members", headers=jan_auth)
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        assert len(members) >= 1

    def test_member_has_fields(self, api_url, jan_auth, project_id):
        members = requests.get(f"{api_url}/projects/{project_id}/members", headers=jan_auth).json()
        for m in members:
            assert "id" in m
            assert "email" in m
            assert "role" in m
            assert "source" in m
            assert m["source"] in ("entity_member", "authorization")

    def test_assign_task(self, api_url, jan_auth, project_id):
        tasks = requests.get(f"{api_url}/projects/{project_id}/tasks", headers=jan_auth).json()
        if not tasks:
            pytest.skip("No tasks")
        members = requests.get(f"{api_url}/projects/{project_id}/members", headers=jan_auth).json()
        if not members:
            pytest.skip("No members")

        task_id = tasks[0]["id"]
        member_id = members[0]["id"]

        # Assign
        r = requests.patch(f"{api_url}/tasks/{task_id}", headers=jan_auth, json={
            "assigned_to_id": member_id,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["assigned_to_id"] == member_id
        assert data["assigned_to"] is not None
        assert data["assigned_to"]["id"] == member_id

    def test_unassign_task(self, api_url, jan_auth, project_id):
        tasks = requests.get(f"{api_url}/projects/{project_id}/tasks", headers=jan_auth).json()
        if not tasks:
            pytest.skip("No tasks")

        task_id = tasks[0]["id"]

        # Unassign
        r = requests.patch(f"{api_url}/tasks/{task_id}", headers=jan_auth, json={
            "assigned_to_id": None,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["assigned_to_id"] is None


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT / EXPORT FLOW
# ═══════════════════════════════════════════════════════════════════════════════

class TestFlow:
    @pytest.fixture
    def flow_context(self, api_url, jan_auth):
        """Get a task + import source for flow testing."""
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects")
        project_id = projects[0]["id"]

        tasks = requests.get(f"{api_url}/projects/{project_id}/tasks", headers=jan_auth).json()
        sources = requests.get(f"{api_url}/projects/{project_id}/sources", headers=jan_auth).json()

        import_sources = [s for s in sources if s["direction"] == "import"]
        export_sources = [s for s in sources if s["direction"] == "export"]

        if not tasks or not import_sources:
            pytest.skip("No tasks or import sources")

        return {
            "task_id": tasks[0]["id"],
            "import_source_id": import_sources[0]["id"],
            "export_source_id": export_sources[0]["id"] if export_sources else None,
            "project_id": project_id,
        }

    def test_import_creates_documents(self, api_url, jan_auth, flow_context):
        r = requests.post(f"{api_url}/flow/import", headers=jan_auth, json={
            "source_id": flow_context["import_source_id"],
            "task_id": flow_context["task_id"],
        })
        assert r.status_code == 200
        data = r.json()
        assert "docs_imported" in data
        assert data["status"] in ("success", "partial")

        # Verify documents were created
        docs = requests.get(
            f"{api_url}/tasks/{flow_context['task_id']}/documents",
            headers=jan_auth,
        ).json()
        assert len(docs) > 0

    def test_export_no_described_docs_returns_message(self, api_url, jan_auth, flow_context):
        """Export should return 200 with ok=false when no described/approved documents exist."""
        if not flow_context["export_source_id"]:
            pytest.skip("No export source")

        # First check if there are described docs
        docs = requests.get(
            f"{api_url}/tasks/{flow_context['task_id']}/documents",
            headers=jan_auth,
        ).json()
        described = [d for d in docs if d["status"] in ("described", "approved")]

        if described:
            pytest.skip("There are described docs — cannot test empty export")

        r = requests.post(f"{api_url}/flow/export", headers=jan_auth, json={
            "source_id": flow_context["export_source_id"],
            "task_id": flow_context["task_id"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert body["docs_exported"] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# CSV UPLOAD
# ═══════════════════════════════════════════════════════════════════════════════

class TestCsvUpload:
    @pytest.fixture
    def upload_context(self, api_url, jan_auth):
        """Get a task for CSV upload testing."""
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()
        if not projects:
            pytest.skip("No projects")
        tasks = requests.get(f"{api_url}/projects/{projects[0]['id']}/tasks", headers=jan_auth).json()
        if not tasks:
            pytest.skip("No tasks")
        return {"task_id": tasks[0]["id"]}

    def test_csv_upload_creates_documents(self, api_url, jan_auth, upload_context):
        """Upload a CSV file and verify documents are created."""
        csv_content = (
            "numer;kontrahent;nip;brutto;data;kategoria\n"
            "FV/2026/001;Test Sp. z o.o.;1234567890;1230.00;2026-01-15;IT\n"
            "FV/2026/002;Demo SA;9876543210;456.78;2026-01-20;Biuro\n"
        )
        files = {"file": ("test.csv", csv_content.encode("utf-8"), "text/csv")}
        r = requests.post(
            f"{api_url}/flow/upload-csv?task_id={upload_context['task_id']}",
            headers={"Authorization": jan_auth["Authorization"]},
            files=files,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["imported"] == 2
        assert data["filename"] == "test.csv"

    def test_csv_upload_empty_file(self, api_url, jan_auth, upload_context):
        """Upload an empty CSV — should import 0 documents."""
        csv_content = "numer;kontrahent;brutto\n"
        files = {"file": ("empty.csv", csv_content.encode("utf-8"), "text/csv")}
        r = requests.post(
            f"{api_url}/flow/upload-csv?task_id={upload_context['task_id']}",
            headers={"Authorization": jan_auth["Authorization"]},
            files=files,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["imported"] == 0

    def test_csv_upload_no_task(self, api_url, jan_auth):
        """Upload CSV with invalid task_id should return 404."""
        csv_content = "numer;kontrahent;brutto\nFV/001;Test;100\n"
        files = {"file": ("test.csv", csv_content.encode("utf-8"), "text/csv")}
        r = requests.post(
            f"{api_url}/flow/upload-csv?task_id=nonexistent-id",
            headers={"Authorization": jan_auth["Authorization"]},
            files=files,
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

class TestTemplates:
    def test_list_templates(self, api_url, auth):
        r = requests.get(f"{api_url}/project-templates", headers=auth)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_template_has_fields(self, api_url, auth):
        templates = requests.get(f"{api_url}/project-templates", headers=auth).json()
        if not templates:
            pytest.skip("No templates")
        t = templates[0]
        for field in ("id", "name", "project_type", "task_recurrence"):
            assert field in t, f"Missing field: {field}"

    def test_all_project_types_have_templates(self, api_url, auth):
        """Ensure each project type has at least one system template."""
        templates = requests.get(f"{api_url}/project-templates", headers=auth).json()
        template_types = {t["project_type"] for t in templates}
        expected_types = {
            "ksiegowosc", "jpk", "zus", "vat_ue", "rd_ipbox",
            "kpir", "wplaty", "dowody_platnosci", "druki_przesylki",
        }
        for pt in expected_types:
            assert pt in template_types, f"Missing template for project type: {pt}"

    def test_dowody_platnosci_template(self, api_url, auth):
        """Verify dowody_platnosci template details."""
        templates = requests.get(f"{api_url}/project-templates", headers=auth).json()
        dp = [t for t in templates if t["project_type"] == "dowody_platnosci"]
        assert len(dp) >= 1, "No dowody_platnosci template found"
        t = dp[0]
        assert "płatności" in t["name"].lower() or "dowody" in t["name"].lower()
        assert t["task_recurrence"] == "monthly"

    def test_druki_przesylki_template(self, api_url, auth):
        """Verify druki_przesylki template details."""
        templates = requests.get(f"{api_url}/project-templates", headers=auth).json()
        dp = [t for t in templates if t["project_type"] == "druki_przesylki"]
        assert len(dp) >= 1, "No druki_przesylki template found"
        t = dp[0]
        assert "przesyłek" in t["name"].lower() or "druki" in t["name"].lower()
        assert t["task_recurrence"] == "monthly"


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT CREATION FROM TEMPLATE (new project types)
# ═══════════════════════════════════════════════════════════════════════════════

class TestProjectCreation:
    @pytest.fixture
    def entity_id(self, api_url, jan_auth):
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        return entities[0]["id"]

    def test_create_dowody_platnosci_project(self, api_url, jan_auth, entity_id):
        """Create a project with type dowody_platnosci."""
        r = requests.post(f"{api_url}/projects", headers=jan_auth, json={
            "entity_id": entity_id,
            "name": "E2E Dowody płatności 2026",
            "type": "dowody_platnosci",
            "year": 2026,
            "icon": "💳",
            "color": "#06b6d4",
            "categories": ["Przelew", "Gotówka", "Karta"],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "dowody_platnosci"
        assert data["name"] == "E2E Dowody płatności 2026"
        assert data["icon"] == "💳"

    def test_create_druki_przesylki_project(self, api_url, jan_auth, entity_id):
        """Create a project with type druki_przesylki."""
        r = requests.post(f"{api_url}/projects", headers=jan_auth, json={
            "entity_id": entity_id,
            "name": "E2E Przesyłki 2026",
            "type": "druki_przesylki",
            "year": 2026,
            "icon": "📦",
            "color": "#f97316",
            "categories": ["InPost", "DPD", "DHL"],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "druki_przesylki"
        assert data["name"] == "E2E Przesyłki 2026"

    def test_create_project_from_template(self, api_url, jan_auth, entity_id):
        """Create a project using a template (dowody_platnosci)."""
        templates = requests.get(f"{api_url}/project-templates", headers=jan_auth).json()
        dp_templates = [t for t in templates if t["project_type"] == "dowody_platnosci"]
        if not dp_templates:
            pytest.skip("No dowody_platnosci template")
        template = dp_templates[0]

        r = requests.post(
            f"{api_url}/projects/from-template",
            headers=jan_auth,
            json={"entity_id": entity_id, "template_id": template["id"], "year": 2026},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["project"]["type"] == "dowody_platnosci"
        assert data["project"]["tasks_created"] > 0


# ═══════════════════════════════════════════════════════════════════════════════
# EXPORT GRACEFUL HANDLING
# ═══════════════════════════════════════════════════════════════════════════════

class TestExportGraceful:
    @pytest.fixture
    def export_context(self, api_url, jan_auth):
        """Get a project with export source for testing."""
        entities = requests.get(f"{api_url}/entities", headers=jan_auth).json()
        if not entities:
            pytest.skip("No entities")
        entity_id = entities[0]["id"]
        projects = requests.get(f"{api_url}/projects?entity_id={entity_id}", headers=jan_auth).json()

        for p in projects:
            sources = requests.get(f"{api_url}/projects/{p['id']}/sources", headers=jan_auth).json()
            export_sources = [s for s in sources if s["direction"] == "export"]
            if export_sources:
                tasks = requests.get(f"{api_url}/projects/{p['id']}/tasks", headers=jan_auth).json()
                if tasks:
                    return {
                        "task_id": tasks[0]["id"],
                        "export_source_id": export_sources[0]["id"],
                    }
        pytest.skip("No project with export source and tasks found")

    def test_export_empty_returns_200_with_message(self, api_url, jan_auth, export_context):
        """Export with no described docs should return 200, not 400."""
        # Ensure no described docs by checking first
        docs = requests.get(
            f"{api_url}/tasks/{export_context['task_id']}/documents",
            headers=jan_auth,
        ).json()
        described = [d for d in docs if d["status"] in ("described", "approved")]
        if described:
            pytest.skip("Task has described docs")

        r = requests.post(f"{api_url}/flow/export", headers=jan_auth, json={
            "source_id": export_context["export_source_id"],
            "task_id": export_context["task_id"],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert body["docs_exported"] == 0
        assert "message" in body

    def test_export_invalid_source_returns_404(self, api_url, jan_auth, export_context):
        """Export with non-existent source should return 404."""
        r = requests.post(f"{api_url}/flow/export", headers=jan_auth, json={
            "source_id": "nonexistent-source-id",
            "task_id": export_context["task_id"],
        })
        assert r.status_code == 404

    def test_export_invalid_task_returns_404(self, api_url, jan_auth, export_context):
        """Export with non-existent task should return 404."""
        r = requests.post(f"{api_url}/flow/export", headers=jan_auth, json={
            "source_id": export_context["export_source_id"],
            "task_id": "nonexistent-task-id",
        })
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-USER ACCESS CONTROL
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccessControl:
    def test_unauthenticated_access_denied(self, api_url):
        r = requests.get(f"{api_url}/entities")
        assert r.status_code in (401, 403)

    def test_invalid_token_rejected(self, api_url):
        r = requests.get(f"{api_url}/entities", headers={
            "Authorization": "Bearer invalid_token_here"
        })
        assert r.status_code in (401, 403)
