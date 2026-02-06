"""API endpoints - źródła danych (import/export) per projekt."""
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.models.models import (
    DataSource, ImportRun, ExportRun, Document, DocumentMetadata, DocumentStatus,
    Task, TaskStatus, Project, EntityMember, ProjectAuthorization,
    AuthorizationRole, SourceDirection, SourceType, PhaseStatus,
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


def _check_project_access(db: Session, project_id: str, identity_id: str, require_edit: bool = False):
    """Check user has access to project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nie znaleziony")

    membership = db.query(EntityMember).filter(
        EntityMember.entity_id == project.entity_id,
        EntityMember.identity_id == identity_id,
    ).first()
    if membership:
        return project

    auth = db.query(ProjectAuthorization).filter(
        ProjectAuthorization.project_id == project_id,
        ProjectAuthorization.identity_id == identity_id,
    ).first()
    if auth:
        if require_edit and not auth.can_describe:
            raise HTTPException(status_code=403, detail="Brak uprawnień do edycji")
        return project

    raise HTTPException(status_code=403, detail="Brak dostępu do projektu")


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
    _check_project_access(db, project_id, identity_id)
    query = db.query(DataSource).filter(DataSource.project_id == project_id)
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
    _check_project_access(db, project_id, identity_id, require_edit=True)

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
    db.add(source)
    db.commit()
    db.refresh(source)
    return _source_to_response(source)


@router.patch("/sources/{source_id}", response_model=DataSourceResponse)
def update_source(
    source_id: str,
    data: DataSourceUpdate,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Aktualizuje źródło danych."""
    source = db.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    _check_project_access(db, source.project_id, identity_id, require_edit=True)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(source, key, value)

    db.commit()
    db.refresh(source)
    return _source_to_response(source)


@router.delete("/sources/{source_id}")
def delete_source(
    source_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Usuwa źródło danych."""
    source = db.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    _check_project_access(db, source.project_id, identity_id, require_edit=True)

    db.delete(source)
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
            {"type": "manual", "name": "Ręczne dodawanie", "icon": "✏️", "config_fields": []},
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
# IMPORT / EXPORT TRIGGERS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/flow/import", response_model=ImportRunResponse)
def trigger_import(
    data: TriggerImportRequest,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Uruchamia import z wybranego źródła do wybranego zadania.
    
    W demo/MVP: generuje mock dokumenty. W produkcji: wywołuje adapter.
    """
    source = db.query(DataSource).filter(DataSource.id == data.source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    if source.direction != SourceDirection.IMPORT:
        raise HTTPException(status_code=400, detail="To źródło nie jest importem")

    task = db.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")

    _check_project_access(db, source.project_id, identity_id, require_edit=True)

    # Create import run
    run = ImportRun(
        id=str(uuid4()),
        source_id=source.id,
        task_id=task.id,
        triggered_by_id=identity_id,
    )

    # Mock import — generate sample documents based on source type
    import random
    mock_docs = _generate_mock_import(source, task)

    created_count = 0
    for doc_data in mock_docs:
        doc = Document(
            id=str(uuid4()),
            task_id=task.id,
            **doc_data,
        )
        db.add(doc)
        created_count += 1

    # Update task stats
    task.docs_total += created_count
    if task.import_status == PhaseStatus.NOT_STARTED:
        task.import_status = PhaseStatus.IN_PROGRESS
    if task.status == TaskStatus.PENDING:
        task.status = TaskStatus.IN_PROGRESS

    # Update run
    run.status = "success"
    run.docs_found = len(mock_docs)
    run.docs_imported = created_count
    run.finished_at = datetime.utcnow()
    db.add(run)

    # Update source last_run
    source.last_run_at = datetime.utcnow()
    source.last_run_status = "success"
    source.last_run_count = created_count

    db.commit()
    db.refresh(run)
    return run


@router.post("/flow/export", response_model=ExportRunResponse)
def trigger_export(
    data: TriggerExportRequest,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Uruchamia eksport opisanych dokumentów do wybranego celu."""
    source = db.query(DataSource).filter(DataSource.id == data.source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    if source.direction != SourceDirection.EXPORT:
        raise HTTPException(status_code=400, detail="To źródło nie jest eksportem")

    task = db.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")

    _check_project_access(db, source.project_id, identity_id, require_edit=True)

    # Get documents to export
    doc_query = db.query(Document).filter(Document.task_id == task.id)
    if data.document_ids:
        doc_query = doc_query.filter(Document.id.in_(data.document_ids))
    else:
        # Export all described/approved (not yet exported)
        doc_query = doc_query.filter(Document.status.in_([
            DocumentStatus.DESCRIBED, DocumentStatus.APPROVED
        ]))

    docs = doc_query.all()
    if not docs:
        raise HTTPException(status_code=400, detail="Brak dokumentów do eksportu")

    # Generate export content (mock)
    format_info = EXPORT_FORMAT_INFO.get(
        source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type),
        {"name": "CSV", "format": "csv"}
    )
    output_content, output_filename = _generate_mock_export(source, docs, task)

    # Mark documents as exported
    exported_count = 0
    for doc in docs:
        doc.status = DocumentStatus.EXPORTED
        exported_count += 1

    # Update task stats
    task.docs_exported += exported_count
    if task.export_status == PhaseStatus.NOT_STARTED:
        task.export_status = PhaseStatus.IN_PROGRESS
    if task.docs_exported >= task.docs_total and task.docs_total > 0:
        task.export_status = PhaseStatus.COMPLETED
        task.status = TaskStatus.EXPORTED

    # Create export run
    run = ExportRun(
        id=str(uuid4()),
        source_id=source.id,
        task_id=task.id,
        status="success",
        docs_exported=exported_count,
        output_format=format_info["format"],
        output_filename=output_filename,
        output_content=output_content,
        finished_at=datetime.utcnow(),
        triggered_by_id=identity_id,
    )
    db.add(run)

    # Update source
    source.last_run_at = datetime.utcnow()
    source.last_run_status = "success"
    source.last_run_count = exported_count

    db.commit()
    db.refresh(run)
    return run


@router.get("/tasks/{task_id}/import-runs", response_model=List[ImportRunResponse])
def list_import_runs(
    task_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Historia importów dla zadania."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    _check_project_access(db, task.project_id, identity_id)
    runs = db.query(ImportRun).filter(ImportRun.task_id == task_id).order_by(ImportRun.started_at.desc()).all()
    return runs


@router.get("/tasks/{task_id}/export-runs", response_model=List[ExportRunResponse])
def list_export_runs(
    task_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Historia eksportów dla zadania."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    _check_project_access(db, task.project_id, identity_id)
    runs = db.query(ExportRun).filter(ExportRun.task_id == task_id).order_by(ExportRun.started_at.desc()).all()
    return runs


@router.get("/export-runs/{run_id}/download")
def download_export(
    run_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Pobiera plik eksportu."""
    run = db.query(ExportRun).filter(ExportRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Eksport nie znaleziony")
    _check_project_access(db, run.source.project_id, identity_id)
    return {
        "filename": run.output_filename,
        "format": run.output_format,
        "content": run.output_content,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK DATA GENERATORS (to be replaced by real adapters later)
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_mock_import(source: DataSource, task: Task) -> list:
    """Generate mock documents for import demo."""
    import random
    from datetime import date, timedelta

    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)

    contractors = [
        ("OVH Sp. z o.o.", "5213003700", "Hosting serwera"),
        ("Google Ireland Ltd", None, "Google Workspace"),
        ("Hetzner Online GmbH", None, "Serwer VPS"),
        ("Allegro.pl Sp. z o.o.", "5272525995", "Materiały biurowe"),
        ("MediaMarkt Sp. z o.o.", "5213406938", "Sprzęt IT"),
        ("Shell Polska Sp. z o.o.", "5270008597", "Paliwo"),
        ("PGE Obrót S.A.", "6110202860", "Energia elektryczna"),
        ("Orange Polska S.A.", "5260250995", "Telefon i internet"),
        ("Comarch S.A.", "6770065406", "Licencja oprogramowania"),
        ("IKEA Retail Sp. z o.o.", "5262548458", "Wyposażenie biura"),
    ]

    num_docs = random.randint(3, 8)
    docs = []

    period_start = task.period_start or date.today().replace(day=1)
    period_end = task.period_end or date.today()

    for i in range(num_docs):
        contractor = random.choice(contractors)
        amount_net = round(random.uniform(50, 5000), 2)
        vat = round(amount_net * 0.23, 2)
        doc_date = period_start + timedelta(days=random.randint(0, max(0, (period_end - period_start).days)))

        doc_num_prefix = {"email": "FV", "ksef": "KSEF", "upload": "FV", "manual": "FV"}.get(source_type_str, "FV")

        docs.append({
            "doc_type": "invoice",
            "number": f"{doc_num_prefix}/{random.randint(1,999):03d}/{doc_date.month:02d}/{doc_date.year}",
            "contractor_name": contractor[0],
            "contractor_nip": contractor[1],
            "amount_net": amount_net,
            "amount_vat": vat,
            "amount_gross": round(amount_net + vat, 2),
            "currency": "PLN",
            "document_date": doc_date,
            "source": source_type_str,
            "source_id": f"{source_type_str}-{uuid4().hex[:8]}",
            "status": DocumentStatus.NEW,
        })

    return docs


def _generate_mock_export(source: DataSource, docs: list, task: Task) -> tuple:
    """Generate mock export file content. Returns (content, filename)."""
    import csv
    import io
    from datetime import datetime as dt

    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)
    timestamp = dt.utcnow().strftime("%Y%m%d_%H%M%S")

    if source_type_str in ("wfirma", "csv", "symfonia"):
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        writer.writerow(["Lp", "Data", "Numer", "Kontrahent", "NIP", "Netto", "VAT", "Brutto", "Kategoria"])
        for idx, doc in enumerate(docs, 1):
            meta = doc.document_metadata
            writer.writerow([
                idx,
                str(doc.document_date or ""),
                doc.number or "",
                doc.contractor_name or "",
                doc.contractor_nip or "",
                f"{doc.amount_net or 0:.2f}",
                f"{doc.amount_vat or 0:.2f}",
                f"{doc.amount_gross or 0:.2f}",
                meta.category if meta else "",
            ])
        content = output.getvalue()
        filename = f"export_{source_type_str}_{timestamp}.csv"
    else:
        # XML format
        entries = []
        for doc in docs:
            meta = doc.document_metadata
            entries.append(f"""    <Dokument>
        <Numer>{doc.number or ''}</Numer>
        <Data>{doc.document_date or ''}</Data>
        <Kontrahent>{doc.contractor_name or ''}</Kontrahent>
        <NIP>{doc.contractor_nip or ''}</NIP>
        <Netto>{doc.amount_net or 0:.2f}</Netto>
        <VAT>{doc.amount_vat or 0:.2f}</VAT>
        <Brutto>{doc.amount_gross or 0:.2f}</Brutto>
        <Kategoria>{meta.category if meta else ''}</Kategoria>
    </Dokument>""")
        content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Eksport system="EXEF" data="{timestamp}">
    <Dokumenty>
{"".join(entries)}
    </Dokumenty>
</Eksport>"""
        filename = f"export_{source_type_str}_{timestamp}.xml"

    return content, filename
