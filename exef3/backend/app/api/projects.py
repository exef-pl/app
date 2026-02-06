"""API endpoints - projekty."""
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.models.models import (
    Project, Entity, EntityMember, Task, Document,
    ProjectAuthorization, Identity, AuthorizationRole
)
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDetail, ProjectWithStats,
    ProjectAuthorizationCreate, ProjectAuthorizationResponse, TaskResponse
)

router = APIRouter(prefix="/projects", tags=["projects"])

def get_user_projects(db: Session, identity_id: str) -> List[Project]:
    """Pobiera wszystkie projekty dostępne dla użytkownika."""
    # Projekty z podmiotów użytkownika
    memberships = db.query(EntityMember).filter(EntityMember.identity_id == identity_id).all()
    entity_ids = [m.entity_id for m in memberships]
    
    own_projects = db.query(Project).filter(Project.entity_id.in_(entity_ids)).all() if entity_ids else []
    
    # Projekty z autoryzacji
    authorizations = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.identity_id == identity_id,
        ProjectAuthorization.can_view == True
    ).all()
    authorized_project_ids = [a.project_id for a in authorizations]
    
    authorized_projects = db.query(Project).filter(
        Project.id.in_(authorized_project_ids)
    ).all() if authorized_project_ids else []
    
    # Połącz
    all_projects = {p.id: p for p in own_projects + authorized_projects}
    return list(all_projects.values())

def check_project_access(db: Session, project_id: str, identity_id: str, require_edit: bool = False):
    """Sprawdza dostęp do projektu."""
    project = db.query(Project).options(joinedload(Project.entity)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nie znaleziony")
    
    # Sprawdź członkostwo w podmiocie
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if membership:
        if require_edit and not membership.can_manage_projects and membership.role != AuthorizationRole.OWNER:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji projektu")
        return project, "member", membership.role
    
    # Sprawdź autoryzację do projektu
    authorization = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == identity_id
    ).first()
    
    if authorization:
        if require_edit and not authorization.can_describe:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji")
        return project, "authorized", authorization.role
    
    raise HTTPException(status_code=403, detail="Brak dostępu do projektu")

@router.get("", response_model=List[ProjectWithStats])
def list_projects(
    entity_id: Optional[str] = Query(None),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Lista projektów użytkownika."""
    projects = get_user_projects(db, identity_id)
    
    if entity_id:
        projects = [p for p in projects if p.entity_id == entity_id]
    
    result = []
    for project in projects:
        # Pobierz statystyki
        stats = db.query(
            func.sum(Task.docs_total).label("total"),
            func.sum(Task.docs_described).label("described"),
            func.sum(Task.docs_approved).label("approved"),
            func.sum(Task.docs_exported).label("exported"),
        ).filter(Task.project_id == project.id).first()
        
        # Sprawdź rolę użytkownika
        membership = db.query(EntityMember).filter(
            EntityMember.entity_id == project.entity_id,
            EntityMember.identity_id == identity_id
        ).first()
        my_role = membership.role if membership else None
        
        if not my_role:
            auth = db.query(ProjectAuthorization).filter(
                ProjectAuthorization.project_id == project.id,
                ProjectAuthorization.identity_id == identity_id
            ).first()
            my_role = auth.role if auth else None
        
        entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
        
        result.append(ProjectWithStats(
            **{k: getattr(project, k) for k in ProjectResponse.model_fields.keys()},
            entity_name=entity.name if entity else "",
            docs_total=stats.total or 0,
            docs_described=stats.described or 0,
            docs_approved=stats.approved or 0,
            docs_exported=stats.exported or 0,
            my_role=my_role,
        ))
    
    return result

@router.post("", response_model=ProjectResponse)
def create_project(data: ProjectCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowy projekt."""
    # Sprawdź czy użytkownik ma dostęp do podmiotu
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == data.entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=403, detail="Brak dostępu do podmiotu")
    
    if not membership.can_manage_projects and membership.role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Brak uprawnień do tworzenia projektów")
    
    project = Project(
        id=str(uuid4()),
        **data.model_dump()
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera szczegóły projektu."""
    project, access_type, role = check_project_access(db, project_id, identity_id)
    
    entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
    authorizations = db.query(ProjectAuthorization).options(
        joinedload(ProjectAuthorization.identity)
    ).filter(ProjectAuthorization.project_id == project_id).all()
    
    tasks_count = db.query(Task).filter(Task.project_id == project_id).count()
    
    return ProjectDetail(
        **{k: getattr(project, k) for k in ProjectResponse.model_fields.keys()},
        entity=entity,
        tasks_count=tasks_count,
        authorizations=[ProjectAuthorizationResponse(
            id=a.id,
            identity=a.identity,
            role=a.role,
            can_view=a.can_view,
            can_describe=a.can_describe,
            can_approve=a.can_approve,
            can_export=a.can_export,
            valid_from=a.valid_from,
            valid_until=a.valid_until,
        ) for a in authorizations],
    )

@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, data: ProjectUpdate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Aktualizuje projekt."""
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True)
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    
    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}")
def delete_project(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa projekt."""
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True)
    
    db.delete(project)
    db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# AUTORYZACJE DO PROJEKTU
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{project_id}/authorizations", response_model=ProjectAuthorizationResponse)
def create_authorization(
    project_id: str,
    data: ProjectAuthorizationCreate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Tworzy autoryzację (dostęp) do projektu dla innej tożsamości."""
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True)
    
    # Tylko owner może dawać autoryzacje
    if role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Tylko właściciel może nadawać autoryzacje")
    
    # Sprawdź czy tożsamość istnieje
    target_identity = db.query(Identity).filter(Identity.id == data.identity_id).first()
    if not target_identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")
    
    # Sprawdź czy już ma autoryzację
    existing = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == data.identity_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tożsamość już ma autoryzację do tego projektu")
    
    authorization = ProjectAuthorization(
        id=str(uuid4()),
        project_id=project_id,
        granted_by_id=identity_id,
        **data.model_dump()
    )
    db.add(authorization)
    db.commit()
    db.refresh(authorization)
    
    return ProjectAuthorizationResponse(
        id=authorization.id,
        identity=target_identity,
        role=authorization.role,
        can_view=authorization.can_view,
        can_describe=authorization.can_describe,
        can_approve=authorization.can_approve,
        can_export=authorization.can_export,
        valid_from=authorization.valid_from,
        valid_until=authorization.valid_until,
    )

@router.delete("/{project_id}/authorizations/{auth_id}")
def delete_authorization(
    project_id: str,
    auth_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Usuwa autoryzację do projektu."""
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True)
    
    if role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Tylko właściciel może usuwać autoryzacje")
    
    authorization = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.id == auth_id,
        ProjectAuthorization.project_id == project_id
    ).first()
    
    if not authorization:
        raise HTTPException(status_code=404, detail="Autoryzacja nie znaleziona")
    
    db.delete(authorization)
    db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# ZADANIA W PROJEKCIE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/tasks", response_model=List[TaskResponse])
def list_tasks(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista zadań w projekcie."""
    project, _, _ = check_project_access(db, project_id, identity_id)
    tasks = db.query(Task).options(
        joinedload(Task.assigned_to)
    ).filter(Task.project_id == project_id).order_by(Task.period_start.desc()).all()
    return tasks


@router.get("/{project_id}/members")
def list_project_members(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista osób z dostępem do projektu (członkowie podmiotu + autoryzowani)."""
    project, _, _ = check_project_access(db, project_id, identity_id)

    members = []

    # Entity members
    entity_members = db.query(EntityMember).options(
        joinedload(EntityMember.identity)
    ).filter(EntityMember.entity_id == project.entity_id).all()
    for em in entity_members:
        ident = em.identity
        members.append({
            "id": ident.id,
            "email": ident.email,
            "first_name": ident.first_name,
            "last_name": ident.last_name,
            "role": em.role.value if em.role else "viewer",
            "source": "entity_member",
        })

    # Project authorizations
    auths = db.query(ProjectAuthorization).options(
        joinedload(ProjectAuthorization.identity)
    ).filter(ProjectAuthorization.project_id == project_id).all()
    seen_ids = {m["id"] for m in members}
    for a in auths:
        if a.identity_id not in seen_ids:
            ident = a.identity
            members.append({
                "id": ident.id,
                "email": ident.email,
                "first_name": ident.first_name,
                "last_name": ident.last_name,
                "role": a.role.value if a.role else "viewer",
                "source": "authorization",
            })

    return members
