"""API endpoints - zadania i dokumenty."""
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.models.models import (
    Task, Document, DocumentMetadata, DocumentRelation,
    Project, EntityMember, ProjectAuthorization, AuthorizationRole,
    TaskStatus, DocumentStatus
)
from app.schemas.schemas import (
    TaskCreate, TaskUpdate, TaskResponse,
    DocumentCreate, DocumentResponse, DocumentMetadataUpdate, DocumentMetadataResponse,
    DocumentRelationCreate, DocumentRelationResponse
)

router = APIRouter(tags=["tasks"])

def check_task_access(db: Session, task_id: str, identity_id: str, require_edit: bool = False):
    """Sprawdza dostęp do zadania przez projekt."""
    task = db.query(Task).options(joinedload(Task.project)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    
    project = task.project
    
    # Sprawdź członkostwo w podmiocie
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if membership:
        return task, project, membership.role
    
    # Sprawdź autoryzację
    authorization = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project.id,
        ProjectAuthorization.identity_id == identity_id
    ).first()
    
    if authorization:
        if require_edit and not authorization.can_describe:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji")
        return task, project, authorization.role
    
    raise HTTPException(status_code=403, detail="Brak dostępu do zadania")

# ═══════════════════════════════════════════════════════════════════════════════
# ZADANIA
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/tasks", response_model=TaskResponse)
def create_task(data: TaskCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowe zadanie w projekcie."""
    # Sprawdź dostęp do projektu
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nie znaleziony")
    
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if not membership:
        auth = db.query(ProjectAuthorization).filter(
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
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera szczegóły zadania."""
    task, project, role = check_task_access(db, task_id, identity_id)
    return task

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: str, data: TaskUpdate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Aktualizuje zadanie."""
    task, project, role = check_task_access(db, task_id, identity_id, require_edit=True)
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    
    db.commit()
    db.refresh(task)
    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa zadanie."""
    task, project, role = check_task_access(db, task_id, identity_id, require_edit=True)
    
    db.delete(task)
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
    task, project, role = check_task_access(db, task_id, identity_id)
    
    query = db.query(Document).options(
        joinedload(Document.document_metadata)
    ).filter(Document.task_id == task_id)
    
    if status:
        query = query.filter(Document.status == status)
    
    documents = query.order_by(Document.document_date.desc()).all()
    return documents

@router.post("/documents", response_model=DocumentResponse)
def create_document(data: DocumentCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowy dokument."""
    task, project, role = check_task_access(db, data.task_id, identity_id, require_edit=True)
    
    document = Document(
        id=str(uuid4()),
        **data.model_dump()
    )
    db.add(document)
    
    # Aktualizuj statystyki zadania
    task.docs_total += 1
    
    db.commit()
    db.refresh(document)
    return document

@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera dokument."""
    document = db.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    # Sprawdź dostęp przez task
    check_task_access(db, document.task_id, identity_id)
    return document

@router.patch("/documents/{document_id}/metadata", response_model=DocumentResponse)
def update_document_metadata(
    document_id: str,
    data: DocumentMetadataUpdate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Aktualizuje metadane dokumentu."""
    document = db.query(Document).options(joinedload(Document.document_metadata)).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True)
    
    # Pobierz lub utwórz metadane
    if document.document_metadata:
        metadata = document.document_metadata
        old_status = document.status
    else:
        metadata = DocumentMetadata(
            id=str(uuid4()),
            document_id=document_id,
        )
        db.add(metadata)
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
        task = db.query(Task).filter(Task.id == document.task_id).first()
        task.docs_described += 1
    
    db.commit()
    db.refresh(document)
    return document

@router.post("/documents/{document_id}/approve", response_model=DocumentResponse)
def approve_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Zatwierdza dokument."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True)
    
    # Sprawdź uprawnienia do zatwierdzania
    auth = db.query(ProjectAuthorization).filter(
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
        task = db.query(Task).filter(Task.id == document.task_id).first()
        task.docs_approved += 1
    
    db.commit()
    db.refresh(document)
    return document

@router.delete("/documents/{document_id}")
def delete_document(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa dokument."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    task, project, role = check_task_access(db, document.task_id, identity_id, require_edit=True)
    
    # Aktualizuj statystyki zadania
    task = db.query(Task).filter(Task.id == document.task_id).first()
    task.docs_total -= 1
    if document.status in [DocumentStatus.DESCRIBED, DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
        task.docs_described -= 1
    if document.status in [DocumentStatus.APPROVED, DocumentStatus.EXPORTED]:
        task.docs_approved -= 1
    if document.status == DocumentStatus.EXPORTED:
        task.docs_exported -= 1
    
    db.delete(document)
    db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# RELACJE DOKUMENTÓW
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/documents/relations", response_model=DocumentRelationResponse)
def create_relation(data: DocumentRelationCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy relację między dokumentami."""
    parent = db.query(Document).filter(Document.id == data.parent_id).first()
    child = db.query(Document).filter(Document.id == data.child_id).first()
    
    if not parent or not child:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    # Sprawdź dostęp
    check_task_access(db, parent.task_id, identity_id, require_edit=True)
    
    # Sprawdź czy relacja już istnieje
    existing = db.query(DocumentRelation).filter(
        DocumentRelation.parent_id == data.parent_id,
        DocumentRelation.child_id == data.child_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Relacja już istnieje")
    
    relation = DocumentRelation(
        id=str(uuid4()),
        created_by_id=identity_id,
        **data.model_dump()
    )
    db.add(relation)
    db.commit()
    db.refresh(relation)
    return relation

@router.get("/documents/{document_id}/relations", response_model=List[DocumentRelationResponse])
def list_relations(document_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista relacji dokumentu."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    
    check_task_access(db, document.task_id, identity_id)
    
    relations = db.query(DocumentRelation).filter(
        (DocumentRelation.parent_id == document_id) | (DocumentRelation.child_id == document_id)
    ).all()
    return relations

@router.delete("/documents/relations/{relation_id}")
def delete_relation(relation_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa relację."""
    relation = db.query(DocumentRelation).filter(DocumentRelation.id == relation_id).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Relacja nie znaleziona")
    
    parent = db.query(Document).filter(Document.id == relation.parent_id).first()
    check_task_access(db, parent.task_id, identity_id, require_edit=True)
    
    db.delete(relation)
    db.commit()
    return {"status": "deleted"}
