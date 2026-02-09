"""API endpoints - relacje dokumentów, wyszukiwanie cross-project, auto-matching."""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.entity_db import resolve_entity_db
from app.api.access import check_project_access
from app.api.projects import get_user_projects

from app.models.models import (
    Task, Document, DocumentRelation, Project,
)
from app.schemas.schemas import (
    DocumentRelationCreate, DocumentRelationResponse,
    DocumentRelationDetail, LinkedDocumentInfo,
    DocumentSearchResult, MatchSuggestion,
)

log = logging.getLogger("exef.relations")

router = APIRouter(tags=["relations"])


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _doc_to_search_result(doc: Document, task: Task, project: Project) -> DocumentSearchResult:
    """Convert a Document ORM object to a DocumentSearchResult schema."""
    return DocumentSearchResult(
        id=doc.id,
        number=doc.number,
        contractor_name=doc.contractor_name,
        contractor_nip=doc.contractor_nip,
        amount_gross=doc.amount_gross,
        currency=doc.currency or "PLN",
        document_date=doc.document_date,
        status=doc.status.value if hasattr(doc.status, 'value') else str(doc.status),
        doc_type=doc.doc_type or "invoice",
        project_id=project.id,
        project_name=project.name,
        project_type=project.type or "ksiegowosc",
        task_name=task.name,
    )


def _doc_to_linked_info(doc: Document, task: Task, project: Project) -> LinkedDocumentInfo:
    """Convert a Document ORM object to a LinkedDocumentInfo schema."""
    return LinkedDocumentInfo(
        id=doc.id,
        number=doc.number,
        contractor_name=doc.contractor_name,
        contractor_nip=doc.contractor_nip,
        amount_gross=doc.amount_gross,
        currency=doc.currency or "PLN",
        document_date=doc.document_date,
        status=doc.status.value if hasattr(doc.status, 'value') else str(doc.status),
        doc_type=doc.doc_type or "invoice",
        project_id=project.id,
        project_name=project.name,
        project_type=project.type or "ksiegowosc",
        task_name=task.name,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-ENTITY DOCUMENT SEARCH
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/search/documents", response_model=List[DocumentSearchResult])
def search_documents(
    q: str = Query("", description="Search query (number, contractor, NIP)"),
    entity_id: Optional[str] = Query(None, description="Limit to entity"),
    exclude_project_id: Optional[str] = Query(None, description="Exclude docs from this project"),
    exclude_document_id: Optional[str] = Query(None, description="Exclude this document from results"),
    limit: int = Query(30, ge=1, le=100),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Search documents across all accessible projects.
    
    Searches by number, contractor_name, contractor_nip, amount_gross.
    Returns documents with project/task context for linking.
    """
    projects = get_user_projects(db, identity_id)
    if entity_id:
        projects = [p for p in projects if p.entity_id == entity_id]

    results = []
    q_lower = q.strip().lower()

    for project in projects:
        if exclude_project_id and project.id == exclude_project_id:
            continue

        edb = resolve_entity_db(db, project.id)
        query = edb.query(Document).join(Task).filter(Task.project_id == project.id)

        if q_lower:
            # Try as amount
            try:
                amount_val = float(q_lower.replace(",", ".").replace(" ", ""))
                query = query.filter(
                    or_(
                        Document.number.ilike(f"%{q_lower}%"),
                        Document.contractor_name.ilike(f"%{q_lower}%"),
                        Document.contractor_nip.ilike(f"%{q_lower}%"),
                        Document.amount_gross == amount_val,
                    )
                )
            except ValueError:
                query = query.filter(
                    or_(
                        Document.number.ilike(f"%{q_lower}%"),
                        Document.contractor_name.ilike(f"%{q_lower}%"),
                        Document.contractor_nip.ilike(f"%{q_lower}%"),
                    )
                )

        if exclude_document_id:
            query = query.filter(Document.id != exclude_document_id)

        docs = query.limit(limit).all()
        for doc in docs:
            task = edb.query(Task).filter(Task.id == doc.task_id).first()
            if task:
                results.append(_doc_to_search_result(doc, task, project))

        if len(results) >= limit:
            break

    return results[:limit]


# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-MATCH SUGGESTIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/match/documents/{document_id}", response_model=List[MatchSuggestion])
def get_match_suggestions(
    document_id: str,
    limit: int = Query(10, ge=1, le=50),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Auto-suggest matching documents for linking.
    
    Matches by:
    - amount_gross (exact or close match)
    - contractor_nip (exact match)
    - contractor_name (fuzzy)
    - document_date (within 30 days)
    
    Returns scored suggestions sorted by confidence.
    """
    edb = resolve_entity_db(db, document_id)
    doc = edb.query(Document).options(joinedload(Document.task)).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")

    task = doc.task
    check_project_access(db, task.project_id, identity_id, edb=edb)

    # Get existing relations to exclude already-linked docs
    existing_relations = edb.query(DocumentRelation).filter(
        or_(DocumentRelation.parent_id == document_id, DocumentRelation.child_id == document_id)
    ).all()
    linked_ids = set()
    for r in existing_relations:
        linked_ids.add(r.parent_id)
        linked_ids.add(r.child_id)
    linked_ids.discard(document_id)

    # Search across all accessible projects (excluding current project)
    projects = get_user_projects(db, identity_id)
    # Filter to same entity
    current_project = edb.query(Project).filter(Project.id == task.project_id).first()
    projects = [p for p in projects if p.entity_id == current_project.entity_id and p.id != current_project.id]

    candidates = []

    for project in projects:
        pedb = resolve_entity_db(db, project.id)
        docs_query = pedb.query(Document).join(Task).filter(Task.project_id == project.id)

        # Pre-filter: at least one matching criterion
        filters = []
        if doc.contractor_nip:
            filters.append(Document.contractor_nip == doc.contractor_nip)
        if doc.contractor_name:
            name_parts = doc.contractor_name.split()
            for part in name_parts[:2]:
                if len(part) > 2:
                    filters.append(Document.contractor_name.ilike(f"%{part}%"))
        if doc.amount_gross and doc.amount_gross > 0:
            tolerance = doc.amount_gross * 0.01  # 1% tolerance
            filters.append(Document.amount_gross.between(doc.amount_gross - tolerance, doc.amount_gross + tolerance))

        if not filters:
            continue

        docs_query = docs_query.filter(or_(*filters))
        matched_docs = docs_query.limit(50).all()

        for candidate in matched_docs:
            if candidate.id in linked_ids or candidate.id == document_id:
                continue

            score, reasons = _calculate_match_score(doc, candidate)
            if score > 0.1:
                ctask = pedb.query(Task).filter(Task.id == candidate.task_id).first()
                if ctask:
                    candidates.append(MatchSuggestion(
                        document=_doc_to_search_result(candidate, ctask, project),
                        score=round(score, 2),
                        match_reasons=reasons,
                    ))

    # Sort by score descending
    candidates.sort(key=lambda x: x.score, reverse=True)
    return candidates[:limit]


def _calculate_match_score(source: Document, candidate: Document) -> tuple:
    """Calculate match score between two documents.
    
    Returns (score: float 0-1, reasons: list[str]).
    """
    score = 0.0
    reasons = []

    # NIP match (strong signal)
    if source.contractor_nip and candidate.contractor_nip:
        if source.contractor_nip == candidate.contractor_nip:
            score += 0.35
            reasons.append("nip_match")

    # Amount match
    if source.amount_gross and candidate.amount_gross and source.amount_gross > 0:
        diff = abs(source.amount_gross - candidate.amount_gross)
        if diff < 0.01:
            score += 0.35
            reasons.append("amount_exact")
        elif diff / source.amount_gross < 0.01:
            score += 0.25
            reasons.append("amount_close")
        elif diff / source.amount_gross < 0.05:
            score += 0.10
            reasons.append("amount_similar")

    # Contractor name match (fuzzy)
    if source.contractor_name and candidate.contractor_name:
        s_name = source.contractor_name.lower()
        c_name = candidate.contractor_name.lower()
        if s_name == c_name:
            score += 0.20
            reasons.append("name_exact")
        elif s_name in c_name or c_name in s_name:
            score += 0.15
            reasons.append("name_partial")
        else:
            # Check word overlap
            s_words = set(s_name.split())
            c_words = set(c_name.split())
            common = s_words & c_words - {"sp.", "z", "o.o.", "s.a.", "sp", "zoo", "sa"}
            if len(common) >= 2:
                score += 0.10
                reasons.append("name_words")

    # Date proximity (within 30 days)
    if source.document_date and candidate.document_date:
        delta = abs((source.document_date - candidate.document_date).days)
        if delta <= 7:
            score += 0.10
            reasons.append("date_close")
        elif delta <= 30:
            score += 0.05
            reasons.append("date_month")

    return min(score, 1.0), reasons


# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED RELATIONS (with linked document details)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/relations/documents/{document_id}", response_model=List[DocumentRelationDetail])
def list_relations_detail(
    document_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Lista relacji dokumentu z pełnymi danymi powiązanych dokumentów."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).options(joinedload(Document.task)).filter(Document.id == document_id).first()
    if not document or not document.task:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")

    check_project_access(db, document.task.project_id, identity_id, edb=edb)

    relations = edb.query(DocumentRelation).filter(
        or_(DocumentRelation.parent_id == document_id, DocumentRelation.child_id == document_id)
    ).all()

    results = []
    for rel in relations:
        # Determine which side is the "other" document
        if rel.parent_id == document_id:
            other_id = rel.child_id
            direction = "child"
        else:
            other_id = rel.parent_id
            direction = "parent"

        # Resolve the other document (may be in a different entity DB)
        other_edb = resolve_entity_db(db, other_id)
        other_doc = other_edb.query(Document).options(joinedload(Document.task)).filter(Document.id == other_id).first()
        if not other_doc or not other_doc.task:
            continue

        other_task = other_doc.task
        other_project = other_edb.query(Project).filter(Project.id == other_task.project_id).first()
        if not other_project:
            continue

        results.append(DocumentRelationDetail(
            id=rel.id,
            relation_type=rel.relation_type or "related",
            description=rel.description,
            created_at=rel.created_at,
            direction=direction,
            linked_document=_doc_to_linked_info(other_doc, other_task, other_project),
        ))

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# RELATION TYPES
# ═══════════════════════════════════════════════════════════════════════════════

RELATION_TYPES = {
    "payment":            {"label": "Płatność",         "icon": "💰", "reverse_label": "Faktura"},
    "correction":         {"label": "Korekta",          "icon": "✏️", "reverse_label": "Dokument korygowany"},
    "contract_to_invoice":{"label": "Faktura do umowy", "icon": "📝", "reverse_label": "Umowa"},
    "attachment":         {"label": "Załącznik",        "icon": "📎", "reverse_label": "Dokument główny"},
    "duplicate":          {"label": "Duplikat",         "icon": "📋", "reverse_label": "Oryginał"},
    "related":            {"label": "Powiązany",        "icon": "🔗", "reverse_label": "Powiązany"},
}

@router.get("/relation-types")
def list_relation_types():
    """Lista dostępnych typów relacji."""
    return RELATION_TYPES
