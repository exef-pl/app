"""API endpoints - źródła danych (import/export) per projekt."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.entity_db import resolve_entity_db, resolve_entity_db_by_entity, add_routing, remove_routing
from app.api.access import check_project_access

log = logging.getLogger("exef.sources")
from app.models.models import (
    DataSource, ImportRun, ExportRun, Project, EntityMember, ProjectAuthorization,
    AuthorizationRole, SourceDirection, SourceType,
)

router = APIRouter(tags=["sources"])


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class DataSourceCreate(BaseModel):
    project_id: str
    direction: str          # import | export
    source_type: str        # email, ksef, wfirma, etc.
    name: str
    icon: Optional[str] = None
    config: Optional[dict] = None
    auto_pull: bool = False
    pull_interval_minutes: int = 60

class DataSourceUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None
    auto_pull: Optional[bool] = None
    pull_interval_minutes: Optional[int] = None

class DataSourceResponse(BaseModel):
    id: str
    project_id: str
    direction: str
    source_type: str
    name: str
    icon: Optional[str]
    config: Optional[dict]
    is_active: bool
    auto_pull: bool
    pull_interval_minutes: int
    last_run_at: Optional[str]
    last_run_status: Optional[str]
    last_run_count: int
    created_at: datetime

    class Config:
        from_attributes = True

class ImportRunResponse(BaseModel):
    id: str
    source_id: str
    task_id: str
    status: str
    docs_found: int
    docs_imported: int
    docs_skipped: int
    errors: Optional[list]
    started_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True

class ExportRunResponse(BaseModel):
    id: str
    source_id: str
    task_id: str
    status: str
    docs_exported: int
    docs_failed: int
    errors: Optional[list]
    output_format: Optional[str]
    output_filename: Optional[str]
    started_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True

class TriggerImportRequest(BaseModel):
    source_id: str
    task_id: str

class TriggerExportRequest(BaseModel):
    source_id: str
    task_id: str
    document_ids: Optional[List[str]] = None  # None = all described/approved


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

SOURCE_TYPE_ICONS = {
    "email": "📧", "ksef": "🏛️", "upload": "📤", "webhook": "🔗",
    "wfirma": "📊", "jpk_pkpir": "📋", "comarch": "🔷", "symfonia": "🎵",
    "enova": "🟢", "csv": "📄", "manual": "✏️",
}

EXPORT_FORMAT_INFO = {
    "wfirma": {"name": "wFirma (CSV)", "format": "csv"},
    "jpk_pkpir": {"name": "JPK_PKPIR (XML)", "format": "xml"},
    "comarch": {"name": "Comarch Optima (XML)", "format": "xml"},
    "symfonia": {"name": "Symfonia (CSV)", "format": "csv"},
    "enova": {"name": "enova365 (XML)", "format": "xml"},
    "csv": {"name": "CSV ogólny", "format": "csv"},
}


# check_project_access moved to app/api/access.py as check_project_access


def _source_to_response(s: DataSource) -> DataSourceResponse:
    return DataSourceResponse(
        id=s.id,
        project_id=s.project_id,
        direction=s.direction.value if hasattr(s.direction, 'value') else str(s.direction),
        source_type=s.source_type.value if hasattr(s.source_type, 'value') else str(s.source_type),
        name=s.name,
        icon=s.icon,
        config=s.config,
        is_active=s.is_active,
        auto_pull=s.auto_pull,
        pull_interval_minutes=s.pull_interval_minutes,
        last_run_at=s.last_run_at.isoformat() if s.last_run_at else None,
        last_run_status=s.last_run_status,
        last_run_count=s.last_run_count or 0,
        created_at=s.created_at,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# DATA SOURCES CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/sources", response_model=List[DataSourceResponse])
def list_sources(
    project_id: str,
    direction: Optional[str] = None,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Lista źródeł danych projektu."""
    edb = resolve_entity_db(db, project_id)
    check_project_access(db, project_id, identity_id, edb=edb)
    query = edb.query(DataSource).filter(DataSource.project_id == project_id)
    if direction:
        query = query.filter(DataSource.direction == direction)
    sources = query.order_by(DataSource.direction, DataSource.name).all()
    return [_source_to_response(s) for s in sources]


@router.post("/projects/{project_id}/sources", response_model=DataSourceResponse)
def create_source(
    project_id: str,
    data: DataSourceCreate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Tworzy nowe źródło danych."""
    edb = resolve_entity_db(db, project_id)
    check_project_access(db, project_id, identity_id, require_edit=True, edb=edb)

    icon = data.icon or SOURCE_TYPE_ICONS.get(data.source_type, "📥" if data.direction == "import" else "📤")

    source = DataSource(
        id=str(uuid4()),
        project_id=project_id,
        direction=data.direction,
        source_type=data.source_type,
        name=data.name,
        icon=icon,
        config=data.config or {},
        auto_pull=data.auto_pull,
        pull_interval_minutes=data.pull_interval_minutes,
    )
    edb.add(source)

    from app.models.models import Entity, Project as ProjectModel
    project = edb.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if project:
        entity = db.query(Entity).filter(Entity.id == project.entity_id).first()
        nip = entity.nip or entity.id[:10] if entity else project.entity_id[:10]
        add_routing(db, source.id, project.entity_id, nip, "source")

    edb.commit()
    if edb is not db:
        db.commit()
    edb.refresh(source)
    resp = _source_to_response(source)
    log.info("CREATE source: id=%s name='%s' type=%s direction=%s project=%s config_keys=%s → Pydantic: %s",
             source.id[:8], source.name, data.source_type, data.direction, project_id[:8],
             list((data.config or {}).keys()),
             resp.model_dump(include={'id','name','source_type','direction','is_active'}))
    return resp


@router.patch("/sources/{source_id}", response_model=DataSourceResponse)
def update_source(
    source_id: str,
    data: DataSourceUpdate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Aktualizuje źródło danych."""
    edb = resolve_entity_db(db, source_id)
    source = edb.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    check_project_access(db, source.project_id, identity_id, require_edit=True, edb=edb)

    updated_fields = list(data.model_dump(exclude_unset=True).keys())
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(source, key, value)

    edb.commit()
    log.info("UPDATE source: id=%s fields=%s by=%s", source_id[:8], updated_fields, identity_id[:8])
    return _source_to_response(source)


@router.delete("/sources/{source_id}")
def delete_source(
    source_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Usuwa źródło danych."""
    edb = resolve_entity_db(db, source_id)
    source = edb.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    check_project_access(db, source.project_id, identity_id, require_edit=True, edb=edb)

    log.warning("DELETE source: id=%s name='%s' type=%s project=%s by=%s",
                source_id[:8], source.name, source.source_type, source.project_id[:8], identity_id[:8])
    edb.delete(source)
    remove_routing(db, source_id)
    edb.commit()
    if edb is not db:
        db.commit()
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# AVAILABLE SOURCES / FORMATS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/source-types")
def list_source_types():
    """Lista dostępnych typów źródeł."""
    return {
        "import_types": [
            {"type": "email", "name": "Email (IMAP)", "icon": "📧", "config_fields": ["host", "port", "username", "password", "folder", "days_back"]},
            {"type": "ksef", "name": "KSeF", "icon": "🏛️", "config_fields": ["nip", "token", "environment"]},
            {"type": "upload", "name": "Upload plików", "icon": "📤", "config_fields": []},
            {"type": "webhook", "name": "Webhook", "icon": "🔗", "config_fields": ["url"]},
            {"type": "csv", "name": "Import CSV (faktury)", "icon": "📄", "config_fields": ["delimiter", "encoding"]},
            {"type": "manual", "name": "Ręczne dodawanie", "icon": "✏️", "config_fields": []},
            {"type": "bank", "name": "Raport bankowy (ogólny)", "icon": "🏦", "config_fields": []},
            {"type": "bank_ing", "name": "ING Bank Śląski", "icon": "🟠", "config_fields": []},
            {"type": "bank_mbank", "name": "mBank", "icon": "🔴", "config_fields": []},
            {"type": "bank_pko", "name": "PKO BP", "icon": "🔵", "config_fields": []},
            {"type": "bank_santander", "name": "Santander", "icon": "🔴", "config_fields": []},
            {"type": "bank_pekao", "name": "Bank Pekao", "icon": "🟡", "config_fields": []},
        ],
        "export_types": [
            {"type": "wfirma", "name": "wFirma (CSV)", "icon": "📊", "config_fields": ["encoding", "date_format"]},
            {"type": "jpk_pkpir", "name": "JPK_PKPIR (XML)", "icon": "📋", "config_fields": ["nip", "company_name"]},
            {"type": "comarch", "name": "Comarch Optima (XML)", "icon": "🔷", "config_fields": []},
            {"type": "symfonia", "name": "Symfonia (CSV)", "icon": "🎵", "config_fields": []},
            {"type": "enova", "name": "enova365 (XML)", "icon": "🟢", "config_fields": []},
            {"type": "csv", "name": "CSV ogólny", "icon": "📄", "config_fields": ["delimiter", "encoding"]},
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# TEST CONNECTION
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sources/{source_id}/test-connection")
def test_source_connection(
    source_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Test connection for a data source (email IMAP, KSeF, etc.)."""
    edb = resolve_entity_db(db, source_id)
    source = edb.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    check_project_access(db, source.project_id, identity_id, edb=edb)

    source_type = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)
    direction = source.direction.value if hasattr(source.direction, 'value') else str(source.direction)
    config = source.config or {}

    # Use real adapter for test_connection
    from app.adapters import get_import_adapter, get_export_adapter
    AdapterClass = get_import_adapter(source_type) if direction == "import" else get_export_adapter(source_type)
    log.info("TEST_CONNECTION: source=%s name='%s' type=%s direction=%s adapter=%s config_keys=%s",
             source_id[:8], source.name, source_type, direction,
             AdapterClass.__name__ if AdapterClass else "None", list(config.keys()))
    if AdapterClass:
        adapter = AdapterClass(config=config, source_name=source.name)
        result = adapter.test_connection()
        log.info("TEST_CONNECTION result: source=%s ok=%s message='%s'", source_id[:8], result.get("ok"), result.get("message", "")[:80])
        return result
    else:
        return {"ok": True, "message": f"Źródło typu '{source_type}' nie wymaga testu połączenia."}
