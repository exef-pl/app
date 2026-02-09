#!/usr/bin/env python3
"""
E2E tests for Document Relations API — cross-project search, auto-match, linking.

Tests run against live docker-compose services (backend + DB with seeded demo data).

Run: cd exef3 && docker compose exec backend python -m pytest tests/test_relations.py -v
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import json
import urllib.request
import urllib.parse
import urllib.error

API = "http://backend:8000/api/v1"
LOGIN_EMAIL = "biuro@exef.pl"
LOGIN_PASSWORD = "demo123"


class _Response:
    """Minimal response wrapper around urllib."""
    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
    def json(self):
        return self._data


def _request(method, url, *, headers=None, json_body=None, params=None):
    """Simple HTTP helper using urllib."""
    if params:
        url += "?" + urllib.parse.urlencode(params)
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body is not None and not any(k.lower() == "content-type" for k in (headers or {})):
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = raw
            return _Response(resp.status, data)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = raw
        return _Response(e.code, data)


def _get(url, **kw):    return _request("GET", url, **kw)
def _post(url, **kw):   return _request("POST", url, **kw)
def _delete(url, **kw): return _request("DELETE", url, **kw)
def _post_form(url, data, **kw):
    """POST with application/x-www-form-urlencoded."""
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    headers = kw.get("headers", {})
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return _Response(resp.status, json.loads(raw))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        return _Response(e.code, json.loads(raw))


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def token():
    """Get auth token for the firm account."""
    r = _post_form(f"{API}/auth/login", {"username": LOGIN_EMAIL, "password": LOGIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def auth_headers(token):
    """Headers without Content-Type (for GET requests)."""
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def all_docs(auth_headers):
    """Fetch a sample of documents across all projects."""
    r = _get(f"{API}/search/documents", params={"q": "", "limit": 50}, headers=auth_headers)
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) > 0, "No documents found in demo data"
    return docs


@pytest.fixture(scope="module")
def two_docs_different_projects(all_docs):
    """Find two documents from different projects for linking tests."""
    by_project = {}
    for d in all_docs:
        by_project.setdefault(d["project_id"], []).append(d)

    project_ids = list(by_project.keys())
    assert len(project_ids) >= 2, f"Need docs in >=2 projects, found {len(project_ids)}"

    doc_a = by_project[project_ids[0]][0]
    doc_b = by_project[project_ids[1]][0]
    return doc_a, doc_b


# ═══════════════════════════════════════════════════════════════════════════════
# RELATION TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationTypes:
    def test_list_relation_types(self):
        """GET /relation-types returns all defined types."""
        r = _get(f"{API}/relation-types")
        assert r.status_code == 200
        data = r.json()
        assert "payment" in data
        assert "correction" in data
        assert "related" in data
        assert "attachment" in data
        assert "contract_to_invoice" in data
        assert "duplicate" in data

    def test_relation_type_structure(self):
        """Each relation type has label, icon, reverse_label."""
        r = _get(f"{API}/relation-types")
        data = r.json()
        for key, val in data.items():
            assert "label" in val, f"{key} missing label"
            assert "icon" in val, f"{key} missing icon"
            assert "reverse_label" in val, f"{key} missing reverse_label"


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-PROJECT DOCUMENT SEARCH
# ═══════════════════════════════════════════════════════════════════════════════

class TestDocumentSearch:
    def test_search_empty_query_returns_docs(self, auth_headers):
        """Empty query returns all accessible documents (up to limit)."""
        r = _get(f"{API}/search/documents", params={"q": "", "limit": 5}, headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) > 0
        assert len(docs) <= 5

    def test_search_by_number(self, auth_headers):
        """Search by invoice number."""
        r = _get(f"{API}/search/documents", params={"q": "FV/2026", "limit": 10}, headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) > 0
        for d in docs:
            assert "FV/2026" in (d["number"] or "")

    def test_search_by_nip(self, auth_headers):
        """Search by contractor NIP."""
        r = _get(f"{API}/search/documents", params={"q": "1234567890", "limit": 10}, headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) > 0
        for d in docs:
            assert d["contractor_nip"] == "1234567890"

    def test_search_by_amount(self, auth_headers):
        """Search by amount (numeric query)."""
        r = _get(f"{API}/search/documents", params={"q": "1230", "limit": 10}, headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        # Should find docs with amount_gross=1230.0 OR matching text
        assert len(docs) > 0

    def test_search_by_contractor_name(self, auth_headers):
        """Search by contractor name substring."""
        r = _get(f"{API}/search/documents", params={"q": "Test", "limit": 10}, headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) > 0

    def test_search_result_structure(self, auth_headers):
        """Each result has all required fields."""
        r = _get(f"{API}/search/documents", params={"q": "", "limit": 1}, headers=auth_headers)
        docs = r.json()
        assert len(docs) >= 1
        d = docs[0]
        for field in ["id", "number", "status", "doc_type", "project_id", "project_name", "project_type", "task_name", "currency"]:
            assert field in d, f"Missing field: {field}"

    def test_search_exclude_document(self, auth_headers, all_docs):
        """exclude_document_id removes that doc from results."""
        exclude_id = all_docs[0]["id"]
        r = _get(f"{API}/search/documents",
                 params={"q": "", "limit": 50, "exclude_document_id": exclude_id},
                 headers=auth_headers)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert exclude_id not in ids

    def test_search_limit_respected(self, auth_headers):
        """Limit parameter is respected."""
        r = _get(f"{API}/search/documents", params={"q": "", "limit": 2}, headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) <= 2

    def test_search_no_auth_fails(self):
        """Search without auth returns 401/403."""
        r = _get(f"{API}/search/documents", params={"q": ""})
        assert r.status_code in (401, 403)

    def test_search_no_results(self, auth_headers):
        """Nonsense query returns empty list."""
        r = _get(f"{API}/search/documents",
                 params={"q": "xyznonexistent999", "limit": 10},
                 headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-MATCH SUGGESTIONS
# ═══════════════════════════════════════════════════════════════════════════════

class TestMatchSuggestions:
    def test_match_returns_list(self, auth_headers, all_docs):
        """Match endpoint returns a list of suggestions."""
        doc_id = all_docs[0]["id"]
        r = _get(f"{API}/match/documents/{doc_id}", params={"limit": 10}, headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_match_suggestion_structure(self, auth_headers, all_docs):
        """Each suggestion has document, score, match_reasons."""
        doc_id = all_docs[0]["id"]
        r = _get(f"{API}/match/documents/{doc_id}", params={"limit": 10}, headers=auth_headers)
        suggestions = r.json()
        for s in suggestions:
            assert "document" in s
            assert "score" in s
            assert "match_reasons" in s
            assert isinstance(s["score"], (int, float))
            assert 0 <= s["score"] <= 1.0
            assert isinstance(s["match_reasons"], list)
            assert len(s["match_reasons"]) > 0
            # Document has required fields
            d = s["document"]
            for field in ["id", "project_id", "project_name", "status"]:
                assert field in d, f"Missing field in suggestion document: {field}"

    def test_match_sorted_by_score(self, auth_headers, all_docs):
        """Suggestions are sorted by score descending."""
        doc_id = all_docs[0]["id"]
        r = _get(f"{API}/match/documents/{doc_id}", params={"limit": 10}, headers=auth_headers)
        suggestions = r.json()
        if len(suggestions) >= 2:
            scores = [s["score"] for s in suggestions]
            assert scores == sorted(scores, reverse=True)

    def test_match_nonexistent_doc(self, auth_headers):
        """Match on nonexistent document returns 404."""
        r = _get(f"{API}/match/documents/00000000-0000-0000-0000-000000000000",
                 params={"limit": 5}, headers=auth_headers)
        assert r.status_code == 404

    def test_match_no_auth_fails(self, all_docs):
        """Match without auth returns 401/403."""
        doc_id = all_docs[0]["id"]
        r = _get(f"{API}/match/documents/{doc_id}", params={"limit": 5})
        assert r.status_code in (401, 403)

    def test_match_excludes_same_project(self, auth_headers, all_docs):
        """Suggestions should not include docs from the same project."""
        doc = all_docs[0]
        doc_id = doc["id"]
        project_id = doc["project_id"]
        r = _get(f"{API}/match/documents/{doc_id}", params={"limit": 50}, headers=auth_headers)
        suggestions = r.json()
        for s in suggestions:
            assert s["document"]["project_id"] != project_id, \
                f"Suggestion from same project: {s['document']['id']}"


# ═══════════════════════════════════════════════════════════════════════════════
# CREATE / LIST / DELETE RELATIONS (full lifecycle)
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationLifecycle:
    """Tests the full create → list → detail → delete lifecycle."""

    def test_full_lifecycle(self, headers, auth_headers, two_docs_different_projects):
        """Create relation → verify in detail → delete → verify gone."""
        doc_a, doc_b = two_docs_different_projects

        # 1. Create relation
        payload = {
            "parent_id": doc_a["id"],
            "child_id": doc_b["id"],
            "relation_type": "payment",
            "description": "E2E test relation",
        }
        r = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
        assert r.status_code == 200, f"Create failed: {r.text}"
        relation = r.json()
        relation_id = relation["id"]
        assert relation["parent_id"] == doc_a["id"]
        assert relation["child_id"] == doc_b["id"]
        assert relation["relation_type"] == "payment"
        assert relation["description"] == "E2E test relation"

        # 2. List relations (basic) for parent
        r = _get(f"{API}/documents/{doc_a['id']}/relations", headers=auth_headers)
        assert r.status_code == 200
        rels = r.json()
        assert any(rel["id"] == relation_id for rel in rels)

        # 3. List relations (basic) for child
        r = _get(f"{API}/documents/{doc_b['id']}/relations", headers=auth_headers)
        assert r.status_code == 200
        rels = r.json()
        assert any(rel["id"] == relation_id for rel in rels)

        # 4. Detail endpoint for parent — should show child with direction
        r = _get(f"{API}/relations/documents/{doc_a['id']}", headers=auth_headers)
        assert r.status_code == 200
        details = r.json()
        found = [d for d in details if d["id"] == relation_id]
        assert len(found) == 1
        detail = found[0]
        assert detail["direction"] == "child"
        assert detail["relation_type"] == "payment"
        assert detail["linked_document"]["id"] == doc_b["id"]
        assert "project_name" in detail["linked_document"]
        assert "task_name" in detail["linked_document"]

        # 5. Detail endpoint for child — should show parent with direction
        r = _get(f"{API}/relations/documents/{doc_b['id']}", headers=auth_headers)
        assert r.status_code == 200
        details = r.json()
        found = [d for d in details if d["id"] == relation_id]
        assert len(found) == 1
        detail = found[0]
        assert detail["direction"] == "parent"
        assert detail["linked_document"]["id"] == doc_a["id"]

        # 6. Delete relation
        r = _delete(f"{API}/documents/relations/{relation_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "deleted"

        # 7. Verify gone from detail
        r = _get(f"{API}/relations/documents/{doc_a['id']}", headers=auth_headers)
        assert r.status_code == 200
        details = r.json()
        assert not any(d["id"] == relation_id for d in details)

    def test_duplicate_relation_rejected(self, headers, auth_headers, two_docs_different_projects):
        """Creating the same relation twice returns 400."""
        doc_a, doc_b = two_docs_different_projects
        payload = {
            "parent_id": doc_a["id"],
            "child_id": doc_b["id"],
            "relation_type": "related",
        }
        # Create first
        r1 = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
        assert r1.status_code == 200
        rel_id = r1.json()["id"]

        try:
            # Create duplicate
            r2 = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
            assert r2.status_code == 400
            assert "istnieje" in r2.json().get("detail", "").lower()
        finally:
            # Cleanup
            _delete(f"{API}/documents/relations/{rel_id}", headers=auth_headers)

    def test_create_with_all_relation_types(self, headers, auth_headers, two_docs_different_projects):
        """Can create relations with each defined type."""
        doc_a, doc_b = two_docs_different_projects
        types_to_test = ["payment", "correction", "contract_to_invoice", "attachment", "duplicate", "related"]

        # Use reversed direction (b→a) to avoid collision with other tests that use a→b
        parent_id = doc_b["id"]
        child_id = doc_a["id"]

        # Clean up any pre-existing relations between these docs
        r = _get(f"{API}/documents/{parent_id}/relations", headers=auth_headers)
        if r.status_code == 200:
            for rel in r.json():
                if (rel["parent_id"] == parent_id and rel["child_id"] == child_id) or \
                   (rel["parent_id"] == child_id and rel["child_id"] == parent_id):
                    _delete(f"{API}/documents/relations/{rel['id']}", headers=auth_headers)

        created_ids = []
        try:
            for rtype in types_to_test:
                payload = {
                    "parent_id": parent_id,
                    "child_id": child_id,
                    "relation_type": rtype,
                }
                r = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
                assert r.status_code == 200, f"Failed for type '{rtype}': {r.text}"
                created_ids.append(r.json()["id"])
                assert r.json()["relation_type"] == rtype
        finally:
            for rid in created_ids:
                _delete(f"{API}/documents/relations/{rid}", headers=auth_headers)

    def test_create_nonexistent_parent(self, headers):
        """Creating relation with nonexistent parent returns 404."""
        payload = {
            "parent_id": "00000000-0000-0000-0000-000000000000",
            "child_id": "00000000-0000-0000-0000-000000000001",
            "relation_type": "related",
        }
        r = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
        assert r.status_code == 404

    def test_delete_nonexistent_relation(self, auth_headers):
        """Deleting nonexistent relation returns 404."""
        r = _delete(f"{API}/documents/relations/00000000-0000-0000-0000-000000000000",
                    headers=auth_headers)
        assert r.status_code == 404

    def test_no_auth_create_fails(self):
        """Create without auth returns 401/403."""
        payload = {"parent_id": "x", "child_id": "y", "relation_type": "related"}
        r = _post(f"{API}/documents/relations", json_body=payload)
        assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# DETAIL ENDPOINT EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationDetail:
    def test_detail_empty_for_unlinked_doc(self, auth_headers, all_docs):
        """Document with no relations returns empty list."""
        doc_id = all_docs[-1]["id"]
        r = _get(f"{API}/relations/documents/{doc_id}", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_detail_nonexistent_doc(self, auth_headers):
        """Detail for nonexistent document returns 404."""
        r = _get(f"{API}/relations/documents/00000000-0000-0000-0000-000000000000",
                 headers=auth_headers)
        assert r.status_code == 404

    def test_detail_no_auth_fails(self, all_docs):
        """Detail without auth returns 401/403."""
        doc_id = all_docs[0]["id"]
        r = _get(f"{API}/relations/documents/{doc_id}")
        assert r.status_code in (401, 403)

    def test_detail_linked_document_has_full_info(self, headers, auth_headers, two_docs_different_projects):
        """Linked document info includes project/task context."""
        doc_a, doc_b = two_docs_different_projects
        payload = {
            "parent_id": doc_a["id"],
            "child_id": doc_b["id"],
            "relation_type": "payment",
        }
        r = _post(f"{API}/documents/relations", json_body=payload, headers=headers)
        assert r.status_code == 200
        rel_id = r.json()["id"]

        try:
            r = _get(f"{API}/relations/documents/{doc_a['id']}", headers=auth_headers)
            details = r.json()
            found = [d for d in details if d["id"] == rel_id]
            assert len(found) == 1
            linked = found[0]["linked_document"]
            assert linked["id"] == doc_b["id"]
            assert linked["project_name"]  # non-empty
            assert linked["project_type"]  # non-empty
            assert linked["task_name"]     # non-empty
            assert "status" in linked
            assert "doc_type" in linked
            assert "currency" in linked
        finally:
            _delete(f"{API}/documents/relations/{rel_id}", headers=auth_headers)


# ═══════════════════════════════════════════════════════════════════════════════
# MATCH SCORE UNIT TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestMatchScoreAlgorithm:
    """Unit tests for the _calculate_match_score function."""

    def _score(self, **kwargs):
        from app.api.relations import _calculate_match_score
        from unittest.mock import MagicMock
        from datetime import date

        source = MagicMock()
        candidate = MagicMock()

        source.contractor_nip = kwargs.get("s_nip")
        source.contractor_name = kwargs.get("s_name")
        source.amount_gross = kwargs.get("s_amount")
        source.document_date = kwargs.get("s_date")

        candidate.contractor_nip = kwargs.get("c_nip")
        candidate.contractor_name = kwargs.get("c_name")
        candidate.amount_gross = kwargs.get("c_amount")
        candidate.document_date = kwargs.get("c_date")

        return _calculate_match_score(source, candidate)

    def test_nip_exact_match(self):
        score, reasons = self._score(s_nip="1234567890", c_nip="1234567890")
        assert score >= 0.35
        assert "nip_match" in reasons

    def test_nip_no_match(self):
        score, reasons = self._score(s_nip="1234567890", c_nip="0000000000")
        assert "nip_match" not in reasons

    def test_amount_exact_match(self):
        score, reasons = self._score(s_amount=1230.0, c_amount=1230.0)
        assert score >= 0.35
        assert "amount_exact" in reasons

    def test_amount_close_match(self):
        score, reasons = self._score(s_amount=1000.0, c_amount=1005.0)
        assert "amount_close" in reasons

    def test_amount_similar_match(self):
        score, reasons = self._score(s_amount=1000.0, c_amount=1040.0)
        assert "amount_similar" in reasons

    def test_amount_no_match(self):
        score, reasons = self._score(s_amount=1000.0, c_amount=5000.0)
        assert "amount_exact" not in reasons
        assert "amount_close" not in reasons

    def test_name_exact_match(self):
        score, reasons = self._score(s_name="Test Sp. z o.o.", c_name="Test Sp. z o.o.")
        assert "name_exact" in reasons

    def test_name_partial_match(self):
        score, reasons = self._score(s_name="Test", c_name="Test Sp. z o.o.")
        assert "name_partial" in reasons

    def test_name_no_match(self):
        score, reasons = self._score(s_name="Alfa", c_name="Beta")
        assert "name_exact" not in reasons
        assert "name_partial" not in reasons

    def test_date_close(self):
        from datetime import date
        score, reasons = self._score(s_date=date(2026, 1, 15), c_date=date(2026, 1, 18))
        assert "date_close" in reasons

    def test_date_month(self):
        from datetime import date
        score, reasons = self._score(s_date=date(2026, 1, 1), c_date=date(2026, 1, 25))
        assert "date_month" in reasons

    def test_date_far(self):
        from datetime import date
        score, reasons = self._score(s_date=date(2026, 1, 1), c_date=date(2026, 6, 1))
        assert "date_close" not in reasons
        assert "date_month" not in reasons

    def test_full_match_capped_at_1(self):
        from datetime import date
        score, reasons = self._score(
            s_nip="1234567890", c_nip="1234567890",
            s_amount=1230.0, c_amount=1230.0,
            s_name="Test Sp. z o.o.", c_name="Test Sp. z o.o.",
            s_date=date(2026, 1, 15), c_date=date(2026, 1, 15),
        )
        assert score <= 1.0
        assert len(reasons) >= 3

    def test_no_data_returns_zero(self):
        score, reasons = self._score()
        assert score == 0.0
        assert len(reasons) == 0
