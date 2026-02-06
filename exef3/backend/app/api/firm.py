"""API endpoints - widok biura rachunkowego (firma obsługująca wielu klientów)."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime, date

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.models.models import (
    Identity, Entity, EntityMember, Project, Task, Document,
    ProjectAuthorization, AuthorizationRole,
)

router = APIRouter(prefix="/firm", tags=["firm"])


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class FirmProjectStats(BaseModel):
    id: str
    name: str
    type: str
    icon: Optional[str]
    color: Optional[str]
    year: Optional[int]
    is_active: bool
    docs_total: int = 0
    docs_described: int = 0
    docs_approved: int = 0
    docs_exported: int = 0
    tasks_count: int = 0
    current_task: Optional[str] = None
    deadline: Optional[date] = None
    status: str = "in_progress"  # in_progress | warning | completed | exported

class FirmDelegationScope(BaseModel):
    can_view: bool = False
    can_describe: bool = False
    can_approve: bool = False
    can_export: bool = False
    can_manage_projects: bool = False

class FirmClientResponse(BaseModel):
    id: str
    name: str
    nip: Optional[str]
    type: str
    icon: Optional[str]
    color: Optional[str]
    address_city: Optional[str]
    owner_name: Optional[str]
    owner_email: Optional[str]
    member_role: str
    delegation_scope: FirmDelegationScope
    projects: List[FirmProjectStats]

    class Config:
        from_attributes = True

class FirmDashboardResponse(BaseModel):
    firm: Optional[dict] = None  # firm entity info (if user owns one)
    identity: dict
    clients: List[FirmClientResponse]
    totals: dict


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", response_model=FirmDashboardResponse)
def firm_dashboard(
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Dashboard for accounting firm: all client entities where user is ACCOUNTANT member."""
    identity = db.query(Identity).filter(Identity.id == identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")

    # Get all entity memberships for this user
    memberships = db.query(EntityMember).filter(
        EntityMember.identity_id == identity_id
    ).all()

    # Separate: firm entity (owned) vs client entities (accountant role)
    firm_entity = None
    client_entities = []

    for mem in memberships:
        entity = db.query(Entity).filter(Entity.id == mem.entity_id).first()
        if not entity:
            continue
        if mem.role == AuthorizationRole.OWNER and entity.owner_id == identity_id:
            firm_entity = entity
        if mem.role == AuthorizationRole.ACCOUNTANT:
            client_entities.append((entity, mem))

    # Build client responses
    clients = []
    totals = {"total": 0, "described": 0, "approved": 0, "exported": 0, "clients": 0, "projects": 0}

    for entity, membership in client_entities:
        # Get entity owner info
        owner = db.query(Identity).filter(Identity.id == entity.owner_id).first()

        # Get projects for this entity
        projects = db.query(Project).filter(
            Project.entity_id == entity.id,
            Project.is_active == True,
        ).all()

        project_stats_list = []
        for project in projects:
            # Aggregate task stats
            stats = db.query(
                func.coalesce(func.sum(Task.docs_total), 0).label("total"),
                func.coalesce(func.sum(Task.docs_described), 0).label("described"),
                func.coalesce(func.sum(Task.docs_approved), 0).label("approved"),
                func.coalesce(func.sum(Task.docs_exported), 0).label("exported"),
                func.count(Task.id).label("tasks_count"),
            ).filter(Task.project_id == project.id).first()

            # Find current task (most recent in_progress or pending with earliest deadline)
            current_task = db.query(Task).filter(
                Task.project_id == project.id,
                Task.status.in_(["in_progress", "pending"]),
            ).order_by(Task.deadline.asc()).first()

            # Determine project status
            doc_total = stats.total or 0
            doc_described = stats.described or 0
            doc_exported = stats.exported or 0

            if doc_total > 0 and doc_exported == doc_total:
                proj_status = "exported"
            elif doc_total > 0 and doc_described == doc_total:
                proj_status = "completed"
            elif current_task and current_task.deadline and current_task.deadline < date.today():
                proj_status = "warning"
            elif doc_total > 0 and doc_described < doc_total:
                # Check if behind schedule (less than 70% described with < 7 days to deadline)
                if current_task and current_task.deadline:
                    days_left = (current_task.deadline - date.today()).days
                    pct = doc_described / doc_total if doc_total else 1
                    if days_left < 7 and pct < 0.7:
                        proj_status = "warning"
                    else:
                        proj_status = "in_progress"
                else:
                    proj_status = "in_progress"
            else:
                proj_status = "in_progress"

            project_stats_list.append(FirmProjectStats(
                id=project.id,
                name=project.name,
                type=project.type.value if hasattr(project.type, 'value') else str(project.type),
                icon=project.icon,
                color=project.color,
                year=project.year,
                is_active=project.is_active,
                docs_total=doc_total,
                docs_described=doc_described,
                docs_approved=stats.approved or 0,
                docs_exported=doc_exported,
                tasks_count=stats.tasks_count or 0,
                current_task=current_task.name if current_task else None,
                deadline=current_task.deadline if current_task else None,
                status=proj_status,
            ))

            totals["total"] += doc_total
            totals["described"] += doc_described
            totals["approved"] += (stats.approved or 0)
            totals["exported"] += doc_exported
            totals["projects"] += 1

        # Build delegation scope from membership + project authorizations
        scope = FirmDelegationScope(
            can_manage_projects=membership.can_manage_projects,
            can_export=membership.can_export,
        )
        # Check project authorizations for view/describe/approve
        auths = db.query(ProjectAuthorization).filter(
            ProjectAuthorization.identity_id == identity_id,
            ProjectAuthorization.project_id.in_([p.id for p in projects]),
        ).all()
        if auths:
            scope.can_view = any(a.can_view for a in auths)
            scope.can_describe = any(a.can_describe for a in auths)
            scope.can_approve = any(a.can_approve for a in auths)
            scope.can_export = scope.can_export or any(a.can_export for a in auths)

        clients.append(FirmClientResponse(
            id=entity.id,
            name=entity.name,
            nip=entity.nip,
            type=entity.type.value if hasattr(entity.type, 'value') else str(entity.type),
            icon=entity.icon,
            color=entity.color,
            address_city=entity.address_city,
            owner_name=owner.full_name if owner else None,
            owner_email=owner.email if owner else None,
            member_role=membership.role.value if hasattr(membership.role, 'value') else str(membership.role),
            delegation_scope=scope,
            projects=project_stats_list,
        ))
        totals["clients"] += 1

    # Build firm info
    firm_info = None
    if firm_entity:
        firm_info = {
            "id": firm_entity.id,
            "name": firm_entity.name,
            "nip": firm_entity.nip,
            "icon": firm_entity.icon,
            "color": firm_entity.color,
            "type": firm_entity.type.value if hasattr(firm_entity.type, 'value') else str(firm_entity.type),
        }

    return FirmDashboardResponse(
        firm=firm_info,
        identity={
            "id": identity.id,
            "email": identity.email,
            "first_name": identity.first_name,
            "last_name": identity.last_name,
            "avatar": identity.avatar,
        },
        clients=clients,
        totals=totals,
    )
