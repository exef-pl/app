"""Shared access-check helpers used across API modules."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import (
    Project, Entity, EntityMember, ProjectAuthorization, AuthorizationRole,
)


def check_project_access(db: Session, project_id: str, identity_id: str,
                          require_edit: bool = False, edb: Session = None):
    """Sprawdza dostęp do projektu.

    db: main DB session (for EntityMember queries)
    edb: entity DB session (for Project/Authorization queries); defaults to db

    Returns (project, access_type, role).
    """
    _edb = edb or db
    project = _edb.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nie znaleziony")

    # Sprawdź członkostwo w podmiocie (main DB)
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id
    ).first()

    if membership:
        if require_edit and not membership.can_manage_projects and membership.role != AuthorizationRole.OWNER:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji projektu")
        return project, "member", membership.role

    # Sprawdź autoryzację do projektu (entity DB)
    authorization = _edb.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == identity_id
    ).first()

    if authorization:
        if require_edit and not authorization.can_describe:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji")
        return project, "authorized", authorization.role

    raise HTTPException(status_code=403, detail="Brak dostępu do projektu")


def check_entity_access(db: Session, entity_id: str, identity_id: str,
                         require_owner: bool = False):
    """Sprawdza dostęp do podmiotu.

    Returns (entity, membership).
    """
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == entity_id,
        EntityMember.identity_id == identity_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Brak dostępu do podmiotu")
    if require_owner and membership.role != AuthorizationRole.OWNER and entity.owner_id != identity_id:
        raise HTTPException(status_code=403, detail="Tylko właściciel może zmienić konfigurację DB")
    return entity, membership
