"""API endpoints - szablony projektów i tworzenie projektów z szablonów."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import date, timedelta
from calendar import monthrange
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.config import settings
from app.core.entity_db import resolve_entity_db_by_entity, add_routing
from app.api.access import check_entity_access

log = logging.getLogger("exef.templates")
from app.models.models import (
    ProjectTemplate, Project, Task, Entity, EntityMember, EntityDatabase,
    DataSource, ProjectType, TaskRecurrence, TaskStatus, AuthorizationRole,
    SourceDirection, SourceType,
)

router = APIRouter(tags=["templates"])

POLISH_MONTHS = [
    "", "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
]

POLISH_QUARTERS = ["", "Q1", "Q2", "Q3", "Q4"]

# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class TemplateResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str]
    project_type: str
    task_recurrence: str
    task_name_template: Optional[str]
    task_icon: Optional[str]
    deadline_day: int
    default_icon: Optional[str]
    default_color: Optional[str]
    default_categories: Optional[list]
    is_system: bool

    class Config:
        from_attributes = True

class CreateProjectFromTemplate(BaseModel):
    entity_id: str
    template_id: str
    year: int
    name: Optional[str] = None          # override template name
    period_start: Optional[date] = None  # override: defaults to Jan 1
    period_end: Optional[date] = None    # override: defaults to Dec 31

class EntityDatabaseResponse(BaseModel):
    id: str
    entity_id: str
    local_db_url: Optional[str]
    local_db_path: Optional[str]
    remote_db_url: Optional[str]
    sync_enabled: bool
    sync_direction: Optional[str]
    sync_interval_minutes: int
    last_sync_at: Optional[str]
    last_sync_status: Optional[str]

    class Config:
        from_attributes = True

class EntityDatabaseUpdate(BaseModel):
    local_db_path: Optional[str] = None
    remote_db_url: Optional[str] = None
    sync_enabled: Optional[bool] = None
    sync_direction: Optional[str] = None
    sync_interval_minutes: Optional[int] = None


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT TEMPLATES ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/project-templates", response_model=List[TemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    """Lista dostępnych szablonów projektów."""
    templates = db.query(ProjectTemplate).order_by(ProjectTemplate.name).all()
    result = []
    for t in templates:
        result.append(TemplateResponse(
            id=t.id,
            code=t.code,
            name=t.name,
            description=t.description,
            project_type=t.project_type.value if hasattr(t.project_type, 'value') else str(t.project_type),
            task_recurrence=t.task_recurrence.value if hasattr(t.task_recurrence, 'value') else str(t.task_recurrence),
            task_name_template=t.task_name_template,
            task_icon=t.task_icon,
            deadline_day=t.deadline_day,
            default_icon=t.default_icon,
            default_color=t.default_color,
            default_categories=t.default_categories,
            is_system=t.is_system,
        ))
    return result


@router.post("/projects/from-template")
def create_project_from_template(
    data: CreateProjectFromTemplate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Tworzy projekt z szablonu i automatycznie generuje zadania (np. 12 miesięcy)."""
    # Check entity access
    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == data.entity_id,
        EntityMember.identity_id == identity_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Brak dostępu do podmiotu")
    if not membership.can_manage_projects and membership.role != AuthorizationRole.OWNER:
        raise HTTPException(status_code=403, detail="Brak uprawnień do tworzenia projektów")

    # Get template
    template = db.query(ProjectTemplate).filter(ProjectTemplate.id == data.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Szablon nie znaleziony")

    year = data.year
    period_start = data.period_start or date(year, 1, 1)
    period_end = data.period_end or date(year, 12, 31)

    project_name = data.name or f"{template.name} {year}"

    edb = resolve_entity_db_by_entity(db, data.entity_id)

    # Get entity NIP for routing
    entity = db.query(Entity).filter(Entity.id == data.entity_id).first()
    nip = entity.nip or entity.id[:10] if entity else data.entity_id[:10]

    # Create project
    project = Project(
        id=str(uuid4()),
        entity_id=data.entity_id,
        template_id=template.id,
        name=project_name,
        type=template.project_type,
        year=year,
        period_start=period_start,
        period_end=period_end,
        icon=template.default_icon,
        color=template.default_color,
        categories=template.default_categories or [],
        is_active=True,
    )
    edb.add(project)
    add_routing(db, project.id, data.entity_id, nip, "project")

    # Generate tasks based on recurrence
    tasks = _generate_tasks(template, project, year, period_start, period_end)
    for task in tasks:
        edb.add(task)
        add_routing(db, task.id, data.entity_id, nip, "task")

    # Auto-create default DataSources with Docker test configs
    default_sources = _generate_default_sources(project)
    for src in default_sources:
        edb.add(src)
        add_routing(db, src.id, data.entity_id, nip, "source")

    edb.commit()
    if edb is not db:
        db.commit()
    edb.refresh(project)

    log.info("CREATE PROJECT FROM TEMPLATE: project=%s name='%s' type=%s year=%d template='%s' by=%s",
             project.id[:8], project.name, project.type.value if hasattr(project.type, 'value') else project.type,
             year, template.name, identity_id[:8])
    log.info("  TASKS created: %d", len(tasks))
    for t in tasks:
        log.info("    TASK: id=%s name='%s' period=%s..%s deadline=%s",
                 t.id[:8], t.name, t.period_start, t.period_end, t.deadline)
    log.info("  SOURCES created: %d", len(default_sources))
    for s in default_sources:
        direction_val = s.direction.value if hasattr(s.direction, 'value') else str(s.direction)
        stype_val = s.source_type.value if hasattr(s.source_type, 'value') else str(s.source_type)
        log.info("    SOURCE: id=%s name='%s' type=%s direction=%s config_keys=%s → DB saved",
                 s.id[:8], s.name, stype_val, direction_val, list((s.config or {}).keys()))

    return {
        "ok": True,
        "project": {
            "id": project.id,
            "name": project.name,
            "type": project.type.value,
            "year": project.year,
            "tasks_created": len(tasks),
            "sources_created": len(default_sources),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENTITY DATABASE CONFIG ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/entities/{entity_id}/database", response_model=EntityDatabaseResponse)
def get_entity_database(
    entity_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Pobiera konfigurację bazy danych podmiotu."""
    check_entity_access(db, entity_id, identity_id)

    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    db_config = db.query(EntityDatabase).filter(EntityDatabase.entity_id == entity_id).first()

    if not db_config:
        # Auto-create config using defaults from .env
        nip = entity.nip or entity.id[:10]
        db_config = EntityDatabase(
            id=str(uuid4()),
            entity_id=entity_id,
            local_db_url=settings.ENTITY_DB_URL_TEMPLATE.format(nip=nip),
            local_db_path=settings.ENTITY_DB_PATH_TEMPLATE.format(nip=nip),
            remote_db_url=settings.ENTITY_REMOTE_DB_URL,
            sync_enabled=settings.ENTITY_SYNC_ENABLED,
            sync_direction=settings.ENTITY_SYNC_DIRECTION,
            sync_interval_minutes=settings.ENTITY_SYNC_INTERVAL_MINUTES,
        )
        db.add(db_config)
        db.commit()
        db.refresh(db_config)

    return db_config


@router.patch("/entities/{entity_id}/database", response_model=EntityDatabaseResponse)
def update_entity_database(
    entity_id: str,
    data: EntityDatabaseUpdate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Aktualizuje konfigurację bazy danych podmiotu."""
    check_entity_access(db, entity_id, identity_id, require_owner=True)

    db_config = db.query(EntityDatabase).filter(EntityDatabase.entity_id == entity_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Konfiguracja DB nie znaleziona — pobierz ją najpierw przez GET")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(db_config, key, value)

    # Rebuild local_db_url from path if path changed
    if data.local_db_path is not None:
        db_config.local_db_url = f"sqlite:///{data.local_db_path}"

    db.commit()
    db.refresh(db_config)
    return db_config


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

# _check_entity_access moved to app/api/access.py as check_entity_access


def _generate_tasks(template: ProjectTemplate, project: Project, year: int,
                    period_start: date, period_end: date) -> list:
    """Generate tasks based on template recurrence."""
    tasks = []

    if template.task_recurrence == TaskRecurrence.MONTHLY:
        start_month = period_start.month
        end_month = period_end.month if period_end.year == year else 12

        for month in range(start_month, end_month + 1):
            month_name = POLISH_MONTHS[month]
            task_name = (template.task_name_template or "{month_name} {year}").format(
                month_name=month_name, year=year, month=month,
            )
            _, last_day = monthrange(year, month)

            # Deadline: deadline_day of NEXT month
            if month < 12:
                deadline = date(year, month + 1, min(template.deadline_day, monthrange(year, month + 1)[1]))
            else:
                deadline = date(year + 1, 1, min(template.deadline_day, 31))

            tasks.append(Task(
                id=str(uuid4()),
                project_id=project.id,
                name=task_name,
                icon=template.task_icon or "📅",
                period_start=date(year, month, 1),
                period_end=date(year, month, last_day),
                deadline=deadline,
                status=TaskStatus.PENDING,
            ))

    elif template.task_recurrence == TaskRecurrence.QUARTERLY:
        for q in range(1, 5):
            q_start_month = (q - 1) * 3 + 1
            q_end_month = q * 3
            _, last_day = monthrange(year, q_end_month)

            task_name = (template.task_name_template or "{quarter} {year}").format(
                quarter=POLISH_QUARTERS[q], year=year, q=q,
            )

            # Deadline: deadline_day of month after quarter end
            next_month = q_end_month + 1 if q_end_month < 12 else 1
            next_year = year if q_end_month < 12 else year + 1
            deadline = date(next_year, next_month, min(template.deadline_day, monthrange(next_year, next_month)[1]))

            tasks.append(Task(
                id=str(uuid4()),
                project_id=project.id,
                name=task_name,
                icon=template.task_icon or "📅",
                period_start=date(year, q_start_month, 1),
                period_end=date(year, q_end_month, last_day),
                deadline=deadline,
                status=TaskStatus.PENDING,
            ))

    elif template.task_recurrence == TaskRecurrence.YEARLY:
        task_name = (template.task_name_template or "Rok {year}").format(year=year)
        tasks.append(Task(
            id=str(uuid4()),
            project_id=project.id,
            name=task_name,
            icon=template.task_icon or "📅",
            period_start=date(year, 1, 1),
            period_end=date(year, 12, 31),
            deadline=date(year + 1, 1, min(template.deadline_day, 31)),
            status=TaskStatus.PENDING,
        ))

    elif template.task_recurrence == TaskRecurrence.ONCE:
        task_name = (template.task_name_template or project.name).format(year=year)
        tasks.append(Task(
            id=str(uuid4()),
            project_id=project.id,
            name=task_name,
            icon=template.task_icon or "📋",
            period_start=period_start,
            period_end=period_end,
            deadline=period_end,
            status=TaskStatus.PENDING,
        ))

    return tasks


def _generate_default_sources(project: Project) -> list:
    """Create default DataSources for a new project with Docker test configs."""
    proj_type = project.type.value if hasattr(project.type, 'value') else str(project.type)

    if proj_type == "rekrutacja":
        return [
            DataSource(
                id=str(uuid4()),
                project_id=project.id,
                direction=SourceDirection.IMPORT,
                source_type=SourceType.EMAIL,
                name="Email — CV kandydatów",
                icon="📧",
                config={
                    "host": "test-imap",
                    "port": 143,
                    "username": "testuser",
                    "password": "testpass",
                    "folder": "INBOX",
                    "days_back": 90,
                    "doc_type": "cv",
                    "subject_pattern": "(?i)(CV|kandydat|aplikacja|rekrutacja|resume)",
                    "attachment_extensions": ["pdf", "docx", "doc", "odt", "rtf"],
                    "filename_pattern": "(?i)(CV|resume|życiorys|lebenslauf)",
                },
            ),
            DataSource(
                id=str(uuid4()),
                project_id=project.id,
                direction=SourceDirection.IMPORT,
                source_type=SourceType.UPLOAD,
                name="Upload CV (PDF/DOCX)",
                icon="📎",
                config={},
            ),
            DataSource(
                id=str(uuid4()),
                project_id=project.id,
                direction=SourceDirection.EXPORT,
                source_type=SourceType.CSV,
                name="Eksport kandydatów (CSV)",
                icon="📊",
                config={"delimiter": ";", "encoding": "utf-8-sig"},
            ),
        ]

    sources = [
        # Import sources
        DataSource(
            id=str(uuid4()),
            project_id=project.id,
            direction=SourceDirection.IMPORT,
            source_type=SourceType.EMAIL,
            name="Email (test IMAP)",
            icon="📧",
            config={
                "host": "test-imap",
                "port": 143,
                "username": "testuser",
                "password": "testpass",
                "folder": "INBOX",
                "days_back": 30,
            },
        ),
        DataSource(
            id=str(uuid4()),
            project_id=project.id,
            direction=SourceDirection.IMPORT,
            source_type=SourceType.KSEF,
            name="KSeF (mock)",
            icon="🏛️",
            config={
                "nip": "5213003700",
                "token": "test-token",
                "environment": "mock",
            },
        ),
        # Export sources
        DataSource(
            id=str(uuid4()),
            project_id=project.id,
            direction=SourceDirection.EXPORT,
            source_type=SourceType.WFIRMA,
            name="wFirma (CSV)",
            icon="📊",
            config={"encoding": "utf-8-sig", "date_format": "%Y-%m-%d"},
        ),
        DataSource(
            id=str(uuid4()),
            project_id=project.id,
            direction=SourceDirection.EXPORT,
            source_type=SourceType.JPK_PKPIR,
            name="JPK_PKPIR (XML)",
            icon="📋",
            config={"nip": "5213003700", "company_name": "Testowa Firma Sp. z o.o."},
        ),
        DataSource(
            id=str(uuid4()),
            project_id=project.id,
            direction=SourceDirection.EXPORT,
            source_type=SourceType.CSV,
            name="CSV ogólny",
            icon="📄",
            config={"delimiter": ";", "encoding": "utf-8-sig"},
        ),
    ]
    return sources
