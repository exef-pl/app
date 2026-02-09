"""API endpoints - zadania i dokumenty."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.entity_db import resolve_entity_db, add_routing, remove_routing
from app.api.access import check_project_access

log = logging.getLogger("exef.tasks")
from app.core.docid import generate_doc_id
from app.models.models import (
    Task, Document, DocumentMetadata, DocumentRelation,
    Project, EntityMember, ProjectAuthorization, AuthorizationRole,
    TaskStatus, DocumentStatus
)
from app.schemas.schemas import (
    TaskCreate, TaskUpdate, TaskResponse,
    DocumentCreate, DocumentResponse, DuplicateDocumentResponse, DocumentMetadataUpdate, DocumentMetadataResponse,
    DocumentRelationCreate, DocumentRelationResponse
)

router = APIRouter(tags=["tasks"])

def check_task_access(db: Session, task_id: str, identity_id: str,
                       require_edit: bool = False, edb: Session = None):
    """Sprawdza dostęp do zadania przez projekt.
    
    Delegates project-level access check to shared check_project_access.
    Returns (task, project, role).
    """
    _edb = edb or db
    task = _edb.query(Task).options(joinedload(Task.project)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    project, _access_type, role = check_project_access(
        db, task.project.id, identity_id, require_edit=require_edit, edb=_edb,
    )
    return task, project, role

# ═══════════════════════════════════════════════════════════════════════════════
# ZADANIA
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/tasks", response_model=TaskResponse)
def create_task(data: TaskCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowe zadanie w projekcie."""
    edb = resolve_entity_db(db, data.project_id)
    # Sprawdź dostęp do projektu
    project = edb.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nie znaleziony")
    
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if not membership:
        auth = edb.query(ProjectAuthorization).filter(
            ProjectAuthorization.project_id == project.id,
            ProjectAuthorization.identity_id == identity_id,
            ProjectAuthorization.can_describe == True
        ).first()
        if not auth:
            raise HTTPException(status_code=403, detail="Brak uprawnień do tworzenia zadań")
    
    task = Task(
        id=str(uuid4()),
        **data.model_dump()
    )
    edb.add(task)

    from app.models.models import Entity
    entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
    nip = entity.nip or entity.id[:10] if entity else project.entity_id[:10]
    add_routing(db, task.id, project.entity_id, nip, "task")

    edb.commit()
    if edb is not db:
        db.commit()
    edb.refresh(task)
    log.info("CREATE task: id=%s name='%s' project=%s by=%s → Pydantic: %s",
             task.id[:8], task.name, data.project_id[:8], identity_id[:8],
             TaskResponse.model_validate(task, from_attributes=True).model_dump(include={'id','name','status','period_start','period_end'}))
    return task

@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera szczegóły zadania."""
    edb = resolve_entity_db(db, task_id)
    task, project, role = check_task_access(db, task_id, identity_id, edb=edb)
    return task

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: str, data: TaskUpdate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Aktualizuje zadanie."""
    edb = resolve_entity_db(db, task_id)
    task, project, role = check_task_access(db, task_id, identity_id, require_edit=True, edb=edb)
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    
    edb.commit()
    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa zadanie."""
    edb = resolve_entity_db(db, task_id)
    task, project, role = check_task_access(db, task_id, identity_id, require_edit=True, edb=edb)
    
    log.warning("DELETE task: id=%s name='%s' project=%s by=%s", task_id[:8], task.name, project.id[:8], identity_id[:8])
    edb.delete(task)
    remove_routing(db, task_id)
    edb.commit()
    if edb is not db:
        db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# DOKUMENTY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/tasks/{task_id}/documents", response_model=List[DocumentResponse])
def list_documents(
    task_id: str,
    status: Optional[str] = Query(None),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Lista dokumentów w zadaniu."""
    edb = resolve_entity_db(db, task_id)
    task, project, role = check_task_access(db, task_id, identity_id, edb=edb)
    
    query = edb.query(Document).options(
        joinedload(Document.document_metadata)
    ).filter(Document.task_id == task_id)
    
    if status:
        query = query.filter(Document.status == status)
    
    documents = query.order_by(Document.document_date.desc()).all()
    return documents

@router.get("/tasks/{task_id}/duplicates")
def list_task_duplicates(
    task_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Returns duplicate groups for a task — documents sharing the same doc_id."""
    edb = resolve_entity_db(db, task_id)
    task, project, role = check_task_access(db, task_id, identity_id, edb=edb)

    # Find doc_ids that appear more than once in this task
    dup_ids = (
        edb.query(Document.doc_id)
        .filter(Document.task_id == task_id, Document.doc_id.isnot(None))
        .group_by(Document.doc_id)
        .having(func.count(Document.id) > 1)
        .all()
    )
    dup_doc_ids = [row[0] for row in dup_ids]
    if not dup_doc_ids:
        return {"groups": [], "total_duplicates": 0}

    docs = (
        edb.query(Document)
        .options(joinedload(Document.document_metadata))
        .filter(Document.task_id == task_id, Document.doc_id.in_(dup_doc_ids))
        .order_by(Document.doc_id, Document.created_at.asc())
        .all()
    )

    from app.schemas.schemas import DocumentResponse as DR
    groups = {}
    for doc in docs:
        grp = groups.setdefault(doc.doc_id, [])
        grp.append(DR.model_validate(doc, from_attributes=True).model_dump(by_alias=True))

    return {
        "groups": [
            {"doc_id": did, "documents": grp_docs}
            for did, grp_docs in groups.items()
        ],
        "total_duplicates": sum(len(g) - 1 for g in groups.values()),
    }


@router.get("/documents/{document_id}/duplicates", response_model=List[DuplicateDocumentResponse])
def find_duplicates(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Finds documents with the same doc_id (potential duplicates) across the entity."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    check_task_access(db, document.task_id, identity_id, edb=edb)
    
    if not document.doc_id:
        return []
    
    # Find all documents with the same doc_id in the same entity
    task = edb.query(Task).filter(Task.id == document.task_id).first()
    project = edb.query(Project).filter(Project.id == task.project_id).first()
    
    duplicates = (
        edb.query(Document, Task.project_id)
        .options(joinedload(Document.document_metadata))
        .join(Task, Document.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .filter(
            Document.doc_id == document.doc_id,
            Document.id != document.id,
            Project.entity_id == project.entity_id,
        )
        .order_by(Document.created_at.desc())
        .all()
    )
    results = []
    for dup_doc, proj_id in duplicates:
        data = {c.key: getattr(dup_doc, c.key) for c in dup_doc.__table__.columns}
        data['document_metadata'] = dup_doc.document_metadata
        data['project_id'] = proj_id
        results.append(DuplicateDocumentResponse.model_validate(data, from_attributes=True))
    return results

@router.post("/documents", response_model=DocumentResponse)
def create_document(data: DocumentCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowy dokument."""
    edb = resolve_entity_db(db, data.task_id)
    task, project, role = check_task_access(db, data.task_id, identity_id, require_edit=True, edb=edb)
    
    document = Document(
        id=str(uuid4()),
        **data.model_dump()
    )
    # Generate deterministic document ID
    document.doc_id = generate_doc_id(
        contractor_nip=document.contractor_nip,
        number=document.number,
        document_date=document.document_date,
        amount_gross=document.amount_gross,
        doc_type=document.doc_type or 'invoice',
    )
    edb.add(document)
    
    # Always create metadata row so tags/category are available in UI
    meta = DocumentMetadata(
        id=str(uuid4()),
        document_id=document.id,
        tags=[],
        edited_by_id=identity_id,
        edited_at=datetime.utcnow(),
    )
    edb.add(meta)

    from app.models.models import Entity
    entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
    nip = entity.nip or entity.id[:10] if entity else project.entity_id[:10]
    add_routing(db, document.id, project.entity_id, nip, "document")
    
    # Aktualizuj statystyki zadania
    task.docs_total += 1
    
    edb.commit()
    if edb is not db:
        db.commit()
    edb.refresh(document)
    log.info("CREATE document: id=%s number='%s' contractor='%s' gross=%s date=%s task=%s doc_id=%s by=%s \u2192 Pydantic: %s",
             document.id[:8], document.number, document.contractor_name, document.amount_gross,
             document.document_date, data.task_id[:8], document.doc_id, identity_id[:8],
             DocumentResponse.model_validate(document, from_attributes=True).model_dump(include={'id','number','status','doc_type'}))
    return document

@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera dokument."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    # Sprawdź dostęp przez task
    check_task_access(db, document.task_id, identity_id, edb=edb)
    return document

@router.patch("/documents/{document_id}/metadata", response_model=DocumentResponse)
def update_document_metadata(
    document_id: str,
    data: DocumentMetadataUpdate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Aktualizuje metadane dokumentu."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True, edb=edb)
    
    # Pobierz lub utwórz metadane
    if document.document_metadata:
        metadata = document.document_metadata
        old_status = document.status
    else:
        metadata = DocumentMetadata(
            id=str(uuid4()),
            document_id=document_id,
        )
        edb.add(metadata)
        old_status = DocumentStatus.NEW
    
    # Aktualizuj metadane
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(metadata, key, value)
    
    metadata.edited_by_id = identity_id
    metadata.edited_at = datetime.utcnow()
    metadata.version += 1
    
    # Zmień status na described jeśli był new
    if document.status == DocumentStatus.NEW:
        document.status = DocumentStatus.DESCRIBED
        # Aktualizuj statystyki zadania
        task = edb.query(Task).filter(Task.id == document.task_id).first()
        task.docs_described += 1
    
    edb.commit()
    edb.refresh(document)
    log.info("UPDATE metadata: doc=%s fields=%s version=%d status=%s by=%s",
             document_id[:8], list(data.model_dump(exclude_unset=True).keys()),
             metadata.version, document.status, identity_id[:8])
    return document

@router.patch("/documents/bulk-metadata")
def bulk_update_metadata(
    data: dict,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Aktualizuje metadane wielu dokumentów naraz.
    
    Body: { document_ids: [...], category?, tags?, description? }
    Ustawia podane pola we WSZYSTKICH podanych dokumentach.
    """
    doc_ids = data.get("document_ids", [])
    if not doc_ids:
        raise HTTPException(status_code=400, detail="Brak document_ids")

    fields = {}
    if "category" in data: fields["category"] = data["category"]
    if "tags" in data: fields["tags"] = data["tags"]
    if "description" in data: fields["description"] = data["description"]
    if not fields:
        raise HTTPException(status_code=400, detail="Brak pól do aktualizacji")

    updated = 0
    edbs = set()
    for doc_id in doc_ids:
        edb = resolve_entity_db(db, doc_id)
        document = edb.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == doc_id).first()
        if not document:
            continue

        task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True, edb=edb)

        if document.document_metadata:
            metadata = document.document_metadata
        else:
            metadata = DocumentMetadata(id=str(uuid4()), document_id=doc_id)
            edb.add(metadata)
            edb.flush()

        for key, value in fields.items():
            if key == "tags" and isinstance(value, list):
                existing = metadata.tags or []
                merged = list(dict.fromkeys(existing + value))
                metadata.tags = merged
            else:
                setattr(metadata, key, value)

        metadata.edited_by_id = identity_id
        metadata.edited_at = datetime.utcnow()
        metadata.version = (metadata.version or 0) + 1

        if document.status == DocumentStatus.NEW:
            document.status = DocumentStatus.DESCRIBED
            task_obj = edb.query(Task).filter(Task.id == document.task_id).first()
            if task_obj:
                task_obj.docs_described += 1

        edbs.add(id(edb))
        updated += 1

    edb.commit()
    if edb is not db:
        db.commit()

    log.info("BULK metadata: %d/%d docs updated fields=%s by=%s",
             updated, len(doc_ids), list(fields.keys()), identity_id[:8])
    return {"updated": updated, "total": len(doc_ids)}


@router.post("/documents/{document_id}/approve", response_model=DocumentResponse)
def approve_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Zatwierdza dokument."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True, edb=edb)
    
    # Sprawdź uprawnienia do zatwierdzania (entity DB for auth, main DB for membership)
    auth = edb.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project.id,
        ProjectAuthorization.identity_id == identity_id
    ).first()
    
    if auth and not auth.can_approve:
        membership = db.query(EntityMember).filter(
            EntityMember.entity_id == project.entity_id,
            EntityMember.identity_id == identity_id
        ).first()
        if not membership or membership.role not in [AuthorizationRole.OWNER, AuthorizationRole.ACCOUNTANT]:
            raise HTTPException(status_code=403, detail="Brak uprawnień do zatwierdzania")
    
    if document.status == DocumentStatus.DESCRIBED:
        document.status = DocumentStatus.APPROVED
        task = edb.query(Task).filter(Task.id == document.task_id).first()
        task.docs_approved += 1
    
    edb.commit()
    edb.refresh(document)
    return document

@router.delete("/documents/{document_id}")
def delete_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa dokument."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True, edb=edb)
    
    # Aktualizuj statystyki zadania
    task = edb.query(Task).filter(Task.id == document.task_id).first()
    task.docs_total -= 1
    if document.status in [DocumentStatus.DESCRIBED, DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
        task.docs_described -= 1
    if document.status in [DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
        task.docs_approved -= 1
    if document.status == DocumentStatus.EXPORTED:
        task.docs_exported -= 1
    
    edb.delete(document)
    remove_routing(db, document_id)
    edb.commit()
    if edb is not db:
        db.commit()
    return {"status": "deleted"}

@router.post("/documents/bulk-delete")
def bulk_delete_documents(data: dict, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa wiele dokumentów na raz."""
    doc_ids = data.get("document_ids", [])
    if not doc_ids:
        raise HTTPException(status_code=400, detail="Brak document_ids")

    deleted = 0
    for document_id in doc_ids:
        edb = resolve_entity_db(db, document_id)
        document = edb.query(Document).filter(Document.id == document_id).first()
        if not document:
            continue
        task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True, edb=edb)

        task_obj = edb.query(Task).filter(Task.id == document.task_id).first()
        task_obj.docs_total -= 1
        if document.status in [DocumentStatus.DESCRIBED, DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
            task_obj.docs_described -= 1
        if document.status in [DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
            task_obj.docs_approved -= 1
        if document.status == DocumentStatus.EXPORTED:
            task_obj.docs_exported -= 1

        edb.delete(document)
        remove_routing(db, document_id)
        deleted += 1

    edb.commit()
    if edb is not db:
        db.commit()
    return {"status": "deleted", "count": deleted}

# ═══════════════════════════════════════════════════════════════════════════════
# RELACJE DOKUMENTÓW
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/documents/relations", response_model=DocumentRelationResponse)
def create_relation(data: DocumentRelationCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy relację między dokumentami."""
    edb = resolve_entity_db(db, data.parent_id)
    parent = edb.query(Document).filter(Document.id == data.parent_id).first()
    child = edb.query(Document).filter(Document.id == data.child_id).first()
    
    if not parent or not child:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    # Sprawdź dostęp
    check_task_access(db, parent.task_id, identity_id, require_edit=True, edb=edb)
    
    # Sprawdź czy relacja już istnieje (per relation_type)
    existing = edb.query(DocumentRelation).filter(
        DocumentRelation.parent_id == data.parent_id,
        DocumentRelation.child_id == data.child_id,
        DocumentRelation.relation_type == data.relation_type
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Relacja już istnieje")
    
    relation = DocumentRelation(
        id=str(uuid4()),
        created_by_id=identity_id,
        **data.model_dump()
    )
    edb.add(relation)
    edb.commit()
    edb.refresh(relation)
    return relation

@router.get("/documents/{document_id}/relations", response_model=List[DocumentRelationResponse])
def list_relations(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista relacji dokumentu."""
    edb = resolve_entity_db(db, document_id)
    document = edb.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    check_task_access(db, document.task_id, identity_id, edb=edb)
    
    relations = edb.query(DocumentRelation).filter(
        (DocumentRelation.parent_id == document_id) | (DocumentRelation.child_id == document_id)
    ).all()
    return relations

@router.delete("/documents/relations/{relation_id}")
def delete_relation(relation_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa relację."""
    # relation_id isn't in routing table; resolve via parent document
    edb_candidates = db  # fallback
    from app.core.config import settings as _settings
    if _settings.USE_ENTITY_DB:
        from app.models.models import ResourceRouting
        # Try to find any routing entry for this relation's parent
        # We need to query all entity DBs or use a different approach
        # For simplicity, try main DB first
        pass
    edb = edb_candidates
    relation = edb.query(DocumentRelation).filter(DocumentRelation.id == relation_id).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Relacja nie znaleziona")
    
    parent = edb.query(Document).filter(Document.id == relation.parent_id).first()
    # Now we can resolve the correct entity DB from parent document
    edb = resolve_entity_db(db, parent.id) if parent else edb
    check_task_access(db, parent.task_id, identity_id, require_edit=True, edb=edb)
    
    edb.delete(relation)
    edb.commit()
    return {"status": "deleted"}
