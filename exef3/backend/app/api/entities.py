"""API endpoints - podmioty (entities)."""
from uuid import uuid4
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.models.models import Entity, EntityMember, Identity, AuthorizationRole
from app.schemas.schemas import (
    EntityCreate, EntityUpdate, EntityResponse, EntityDetail,
    EntityMemberCreate, EntityMemberResponse
)

router = APIRouter(prefix="/entities", tags=["entities"])

@router.get("", response_model=List[EntityResponse])
def list_entities(
    include_archived: bool = False,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Lista podmiotów użytkownika (własnych i jako członek)."""
    # Własne podmioty
    owned = db.query(Entity).filter(Entity.owner_id == identity_id).all()
    
    # Podmioty jako członek
    memberships = db.query(EntityMember).filter(EntityMember.identity_id == identity_id).all()
    member_entity_ids = [m.entity_id for m in memberships]
    member_entities = db.query(Entity).filter(Entity.id.in_(member_entity_ids)).all() if member_entity_ids else []
    
    # Połącz i usuń duplikaty
    all_entities = {e.id: e for e in owned + member_entities}
    result = list(all_entities.values())
    
    if not include_archived:
        result = [e for e in result if not e.is_archived]
    
    return result

@router.post("", response_model=EntityResponse)
def create_entity(data: EntityCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Tworzy nowy podmiot."""
    # Sprawdź czy NIP już istnieje
    if data.nip and db.query(Entity).filter(Entity.nip == data.nip).first():
        raise HTTPException(status_code=400, detail="Podmiot z tym NIP już istnieje")
    
    entity = Entity(
        id=str(uuid4()),
        owner_id=identity_id,
        **data.model_dump()
    )
    db.add(entity)
    
    # Dodaj właściciela jako członka z rolą OWNER
    member = EntityMember(
        id=str(uuid4()),
        entity_id=entity.id,
        identity_id=identity_id,
        role=AuthorizationRole.OWNER,
        can_manage_projects=True,
        can_invite_members=True,
        can_export=True,
    )
    db.add(member)
    
    db.commit()
    db.refresh(entity)
    return entity

@router.get("/{entity_id}", response_model=EntityDetail)
def get_entity(entity_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera szczegóły podmiotu."""
    entity = db.query(Entity).options(
        joinedload(Entity.members).joinedload(EntityMember.identity)
    ).filter(Entity.id == entity_id).first()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    # Sprawdź uprawnienia
    is_member = any(m.identity_id == identity_id for m in entity.members)
    if entity.owner_id != identity_id and not is_member:
        raise HTTPException(status_code=403, detail="Brak dostępu do podmiotu")
    
    # Dodaj liczbę projektów
    projects_count = len(entity.projects)
    
    return EntityDetail(
        **{k: getattr(entity, k) for k in EntityResponse.model_fields.keys()},
        members=[EntityMemberResponse(
            id=m.id,
            identity=m.identity,
            role=m.role,
            can_manage_projects=m.can_manage_projects,
            can_invite_members=m.can_invite_members,
            can_export=m.can_export,
            joined_at=m.joined_at,
        ) for m in entity.members],
        projects_count=projects_count,
    )

@router.patch("/{entity_id}", response_model=EntityResponse)
def update_entity(entity_id: str, data: EntityUpdate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Aktualizuje podmiot."""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    if entity.owner_id != identity_id:
        raise HTTPException(status_code=403, detail="Tylko właściciel może edytować podmiot")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entity, key, value)
    
    db.commit()
    db.refresh(entity)
    return entity

@router.delete("/{entity_id}")
def delete_entity(entity_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa podmiot."""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    if entity.owner_id != identity_id:
        raise HTTPException(status_code=403, detail="Tylko właściciel może usunąć podmiot")
    
    db.delete(entity)
    db.commit()
    return {"status": "deleted"}

@router.post("/{entity_id}/archive", response_model=EntityResponse)
def archive_entity(entity_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Archiwizuje podmiot (toggle)."""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    if entity.owner_id != identity_id:
        raise HTTPException(status_code=403, detail="Tylko właściciel może archiwizować podmiot")
    
    entity.is_archived = not entity.is_archived
    db.commit()
    db.refresh(entity)
    return entity

# ═══════════════════════════════════════════════════════════════════════════════
# CZŁONKOWIE PODMIOTU
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{entity_id}/members", response_model=EntityMemberResponse)
def add_member(entity_id: str, data: EntityMemberCreate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Dodaje członka do podmiotu."""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    # Sprawdź uprawnienia
    my_membership = db.query(EntityMember).filter(
        EntityMember.entity_id == entity_id,
        EntityMember.identity_id == identity_id
    ).first()
    
    if not my_membership or not my_membership.can_invite_members:
        raise HTTPException(status_code=403, detail="Brak uprawnień do zapraszania członków")
    
    # Sprawdź czy tożsamość istnieje
    target_identity = db.query(Identity).filter(Identity.id == data.identity_id).first()
    if not target_identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")
    
    # Sprawdź czy już jest członkiem
    existing = db.query(EntityMember).filter(
        EntityMember.entity_id == entity_id,
        EntityMember.identity_id == data.identity_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tożsamość jest już członkiem podmiotu")
    
    member = EntityMember(
        id=str(uuid4()),
        entity_id=entity_id,
        **data.model_dump()
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    
    return EntityMemberResponse(
        id=member.id,
        identity=target_identity,
        role=member.role,
        can_manage_projects=member.can_manage_projects,
        can_invite_members=member.can_invite_members,
        can_export=member.can_export,
        joined_at=member.joined_at,
    )

@router.delete("/{entity_id}/members/{member_id}")
def remove_member(entity_id: str, member_id: str, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Usuwa członka z podmiotu."""
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Podmiot nie znaleziony")
    
    member = db.query(EntityMember).filter(EntityMember.id == member_id, EntityMember.entity_id == entity_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Członek nie znaleziony")
    
    # Sprawdź uprawnienia
    if entity.owner_id != identity_id:
        my_membership = db.query(EntityMember).filter(
            EntityMember.entity_id == entity_id,
            EntityMember.identity_id == identity_id
        ).first()
        if not my_membership or not my_membership.can_invite_members:
            raise HTTPException(status_code=403, detail="Brak uprawnień do usuwania członków")
    
    # Nie można usunąć właściciela
    if member.identity_id == entity.owner_id:
        raise HTTPException(status_code=400, detail="Nie można usunąć właściciela podmiotu")
    
    db.delete(member)
    db.commit()
    return {"status": "removed"}
