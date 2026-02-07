"""API endpoints - projekty."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.config import settings
from app.core.entity_db import (
    resolve_entity_db, resolve_entity_db_by_entity, add_routing, remove_routing,
    sync_identity_to_entity_db,
)
from app.api.access import check_project_access

log = logging.getLogger("exef.projects")
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
    memberships = db.query(EntityMember).filter(EntityMember.identity_id == identity_id).all()
    entity_ids = [m.entity_id for m in memberships]

    all_projects = {}

    if settings.USE_ENTITY_DB:
        # Query each entity's DB
        for entity_id in entity_ids:
            edb = resolve_entity_db_by_entity(db, entity_id)
            for p in edb.query(Project).filter(Project.entity_id == entity_id).all():
                all_projects[p.id] = p
    else:
        own_projects = db.query(Project).filter(Project.entity_id.in_(entity_ids)).all() if entity_ids else []
        for p in own_projects:
            all_projects[p.id] = p

        # Projekty z autoryzacji (single-DB mode only; in entity DB mode, handled per-project)
        authorizations = db.query(ProjectAuthorization).filter(
            ProjectAuthorization.identity_id == identity_id,
            ProjectAuthorization.can_view == True
        ).all()
        authorized_project_ids = [a.project_id for a in authorizations]
        authorized_projects = db.query(Project).filter(
            Project.id.in_(authorized_project_ids)
        ).all() if authorized_project_ids else []
        for p in authorized_projects:
            all_projects[p.id] = p

    return list(all_projects.values())

@router.get("", response_model=List[ProjectWithStats])
def list_projects(
    entity_id: Optional[str] = Query(None),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Lista projektów użytkownika."""
    if entity_id:
        edb = resolve_entity_db_by_entity(db, entity_id)
        projects = edb.query(Project).filter(Project.entity_id == entity_id).all()
    else:
        projects = get_user_projects(db, identity_id)
    
    result = []
    for project in projects:
        # Resolve entity DB per project (handles multi-entity case)
        proj_edb = resolve_entity_db(db, project.id) if settings.USE_ENTITY_DB else db

        # Pobierz statystyki
        stats = proj_edb.query(
            func.sum(Task.docs_total).label("total"),
            func.sum(Task.docs_described).label("described"),
            func.sum(Task.docs_approved).label("approved"),
            func.sum(Task.docs_exported).label("exported"),
        ).filter(Task.project_id == project.id).first()
        
        # Sprawdź rolę użytkownika (main DB)
        membership = db.query(EntityMember).filter(
            EntityMember.entity_id == project.entity_id,
            EntityMember.identity_id == identity_id
        ).first()
        my_role = membership.role if membership else None
        
        if not my_role:
            auth = proj_edb.query(ProjectAuthorization).filter(
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
    
    edb = resolve_entity_db_by_entity(db, data.entity_id)

    project = Project(
        id=str(uuid4()),
        **data.model_dump()
    )
    edb.add(project)

    # Add routing entry to main DB
    entity = db.query(Entity).filter(Entity.id == data.entity_id).first()
    nip = entity.nip or entity.id[:10] if entity else data.entity_id[:10]
    add_routing(db, project.id, data.entity_id, nip, "project")

    edb.commit()
    if edb is not db:
        db.commit()
    edb.refresh(project)
    log.info("CREATE project: id=%s name='%s' type=%s entity=%s by=%s → Pydantic: %s",
             project.id[:8], project.name, project.type, data.entity_id[:8], identity_id[:8],
             ProjectResponse.model_validate(project, from_attributes=True).model_dump(include={'id','name','type','year'}))
    return project

@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera szczegóły projektu."""
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, edb=edb)
    
    entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
    authorizations = edb.query(ProjectAuthorization).options(
        joinedload(ProjectAuthorization.identity)
    ).filter(ProjectAuthorization.project_id == project_id).all()
    
    tasks_count = edb.query(Task).filter(Task.project_id == project_id).count()
    
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
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    
    edb.commit()
    log.info("UPDATE project: id=%s fields=%s by=%s", project_id[:8], list(data.model_dump(exclude_unset=True).keys()), identity_id[:8])
    return project

@router.delete("/{project_id}")
def delete_project(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa projekt."""
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)
    
    log.warning("DELETE project: id=%s name='%s' by=%s", project_id[:8], project.name, identity_id[:8])
    edb.delete(project)
    remove_routing(db, project_id)
    edb.commit()
    if edb is not db:
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
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)
    
    # Tylko owner może dawać autoryzacje
    if role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Tylko właściciel może nadawać autoryzacje")
    
    # Sprawdź czy tożsamość istnieje (main DB)
    target_identity = db.query(Identity).filter(Identity.id == data.identity_id).first()
    if not target_identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")
    
    # Sprawdź czy już ma autoryzację (entity DB)
    existing = edb.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == data.identity_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tożsamość już ma autoryzację do tego projektu")
    
    # Sync identity stub to entity DB for FK relationships
    if settings.USE_ENTITY_DB and edb is not db:
        sync_identity_to_entity_db(edb, target_identity)
    
    authorization = ProjectAuthorization(
        id=str(uuid4()),
        project_id=project_id,
        granted_by_id=identity_id,
        **data.model_dump()
    )
    edb.add(authorization)
    edb.commit()
    
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

@router.post("/{project_id}/invite")
def invite_to_project(
    project_id: str,
    data: dict,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Zaprasza osobę do projektu po adresie email.
    
    Body: { email, role?, can_describe?, can_approve?, can_export? }
    """
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)

    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id,
    ).first()
    if not membership or (membership.role != AuthorizationRole.OWNER and not membership.can_manage_projects):
        raise HTTPException(status_code=403, detail="Brak uprawnień do zapraszania osób")

    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Podaj adres email")

    target = db.query(Identity).filter(Identity.email == email).first()
    if not target:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono użytkownika z adresem {email}")

    if target.id == identity_id:
        raise HTTPException(status_code=400, detail="Nie możesz zaprosić siebie")

    # Check if already has access (entity member or authorization)
    is_member = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == target.id,
    ).first()
    if is_member:
        raise HTTPException(status_code=400, detail="Ta osoba jest już członkiem podmiotu")

    existing_auth = edb.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == target.id,
    ).first()
    if existing_auth:
        raise HTTPException(status_code=400, detail="Ta osoba ma już dostęp do tego projektu")

    invite_role = data.get("role", "accountant")
    if invite_role not in ("accountant", "assistant", "viewer"):
        invite_role = "accountant"

    if settings.USE_ENTITY_DB and edb is not db:
        sync_identity_to_entity_db(edb, target)

    authorization = ProjectAuthorization(
        id=str(uuid4()),
        project_id=project_id,
        identity_id=target.id,
        granted_by_id=identity_id,
        role=invite_role,
        can_view=True,
        can_describe=data.get("can_describe", invite_role in ("accountant", "assistant")),
        can_approve=data.get("can_approve", invite_role == "accountant"),
        can_export=data.get("can_export", invite_role == "accountant"),
    )
    edb.add(authorization)
    edb.commit()

    log.info("INVITE: project=%s email=%s role=%s by=%s", project_id[:8], email, invite_role, identity_id[:8])

    return {
        "id": authorization.id,
        "identity": {
            "id": target.id,
            "email": target.email,
            "first_name": target.first_name,
            "last_name": target.last_name,
        },
        "role": authorization.role.value if hasattr(authorization.role, 'value') else authorization.role,
        "can_view": authorization.can_view,
        "can_describe": authorization.can_describe,
        "can_approve": authorization.can_approve,
        "can_export": authorization.can_export,
    }


@router.delete("/{project_id}/authorizations/{auth_id}")
def delete_authorization(
    project_id: str,
    auth_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db)
):
    """Usuwa autoryzację do projektu."""
    edb = resolve_entity_db(db, project_id)
    project, access_type, role = check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)
    
    if role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Tylko właściciel może usuwać autoryzacje")
    
    authorization = edb.query(ProjectAuthorization).filter(
        ProjectAuthorization.id == auth_id,
        ProjectAuthorization.project_id == project_id
    ).first()
    
    if not authorization:
        raise HTTPException(status_code=404, detail="Autoryzacja nie znaleziona")
    
    edb.delete(authorization)
    edb.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# ZADANIA W PROJEKCIE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/tasks", response_model=List[TaskResponse])
def list_tasks(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista zadań w projekcie."""
    edb = resolve_entity_db(db, project_id)
    project, _, _ = check_project_access(db, project_id, identity_id, edb=edb)
    tasks = edb.query(Task).options(
        joinedload(Task.assigned_to)
    ).filter(Task.project_id == project_id).order_by(Task.period_start.desc()).all()
    return tasks


@router.get("/{project_id}/members")
def list_project_members(project_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Lista osób z dostępem do projektu (członkowie podmiotu + autoryzowani)."""
    edb = resolve_entity_db(db, project_id)
    project, _, _ = check_project_access(db, project_id, identity_id, edb=edb)

    members = []

    # Entity members (always from main DB)
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

    # Project authorizations (entity DB)
    auths = edb.query(ProjectAuthorization).options(
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
