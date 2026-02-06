"""API endpoints - źródła danych (import/export) per projekt."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_identity_id

log = logging.getLogger("exef.sources")
from app.core.docid import generate_doc_id
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
    source = db.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    _check_project_access(db, source.project_id, identity_id, require_edit=True)

    updated_fields = list(data.model_dump(exclude_unset=True).keys())
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(source, key, value)

    db.commit()
    db.refresh(source)
    log.info("UPDATE source: id=%s fields=%s by=%s", source_id[:8], updated_fields, identity_id[:8])
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

    log.warning("DELETE source: id=%s name='%s' type=%s project=%s by=%s",
                source_id[:8], source.name, source.source_type, source.project_id[:8], identity_id[:8])
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
    source = db.query(DataSource).filter(DataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    _check_project_access(db, source.project_id, identity_id)

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


def _test_email_connection(config: dict) -> dict:
    """Test IMAP email connection."""
    import imaplib
    import socket

    host = config.get("host", "")
    port = int(config.get("port", 993))
    username = config.get("username", "")
    password = config.get("password", "")
    folder = config.get("folder", "INBOX")

    if not host:
        return {"ok": False, "message": "Brak adresu serwera IMAP (host)."}
    if not username:
        return {"ok": False, "message": "Brak nazwy użytkownika (username)."}

    try:
        # Try connecting to IMAP server
        if port == 993:
            mail = imaplib.IMAP4_SSL(host, port, timeout=10)
        else:
            mail = imaplib.IMAP4(host, port, timeout=10)

        # Try login if password provided
        if password:
            mail.login(username, password)
            # Try selecting folder
            status, data = mail.select(folder, readonly=True)
            if status == "OK":
                msg_count = int(data[0])
                mail.logout()
                return {"ok": True, "message": f"Połączenie OK. Folder '{folder}' zawiera {msg_count} wiadomości."}
            else:
                mail.logout()
                return {"ok": False, "message": f"Połączenie OK, ale folder '{folder}' nie istnieje."}
        else:
            mail.logout()
            return {"ok": True, "message": f"Połączenie z serwerem {host}:{port} OK (brak hasła — nie zalogowano)."}

    except imaplib.IMAP4.error as e:
        return {"ok": False, "message": f"Błąd IMAP: {str(e)}"}
    except socket.timeout:
        return {"ok": False, "message": f"Timeout — serwer {host}:{port} nie odpowiada."}
    except socket.gaierror:
        return {"ok": False, "message": f"Nie można rozwiązać adresu: {host}"}
    except ConnectionRefusedError:
        return {"ok": False, "message": f"Połączenie odrzucone: {host}:{port}"}
    except Exception as e:
        return {"ok": False, "message": f"Błąd: {str(e)}"}


def _test_ksef_connection(config: dict) -> dict:
    """Test KSeF connection (NIP validation + API ping)."""
    import re
    import urllib.request
    import urllib.error

    nip = config.get("nip", "")
    environment = config.get("environment", "test")

    if not nip:
        return {"ok": False, "message": "Brak NIP-u."}

    # Validate NIP format
    clean_nip = re.sub(r'[\s\-]', '', nip)
    if len(clean_nip) != 10 or not clean_nip.isdigit():
        return {"ok": False, "message": f"Nieprawidłowy format NIP: '{nip}'. NIP powinien mieć 10 cyfr."}

    # NIP checksum validation
    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(int(clean_nip[i]) * weights[i] for i in range(9)) % 11
    if checksum != int(clean_nip[9]):
        return {"ok": False, "message": f"NIP '{clean_nip}' ma nieprawidłową sumę kontrolną."}

    # Try pinging KSeF API
    env_urls = {
        "test": "https://ksef-test.mf.gov.pl/api",
        "demo": "https://ksef-demo.mf.gov.pl/api",
        "prod": "https://ksef.mf.gov.pl/api",
    }
    base_url = env_urls.get(environment, env_urls["test"])

    try:
        req = urllib.request.Request(f"{base_url}/online/Session/Status/Credentials", method="GET")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "message": f"NIP {clean_nip} prawidłowy. Serwer KSeF ({environment}) odpowiada (HTTP {resp.status})."}
    except urllib.error.HTTPError as e:
        # KSeF returns 4xx/5xx but server is reachable
        return {"ok": True, "message": f"NIP {clean_nip} prawidłowy. Serwer KSeF ({environment}) dostępny (HTTP {e.code})."}
    except urllib.error.URLError as e:
        return {"ok": False, "message": f"NIP {clean_nip} prawidłowy, ale serwer KSeF ({environment}) niedostępny: {e.reason}"}
    except Exception as e:
        return {"ok": False, "message": f"NIP {clean_nip} prawidłowy, ale błąd połączenia: {str(e)}"}


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

    # Use real adapter to fetch documents
    from app.adapters import get_import_adapter
    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)
    AdapterClass = get_import_adapter(source_type_str)

    log.info("IMPORT START: source=%s name='%s' type=%s adapter=%s task=%s period=%s..%s config_keys=%s by=%s",
             source.id[:8], source.name, source_type_str,
             AdapterClass.__name__ if AdapterClass else "MOCK_FALLBACK",
             task.id[:8], task.period_start, task.period_end,
             list((source.config or {}).keys()), identity_id[:8])

    if AdapterClass:
        adapter = AdapterClass(config=source.config or {}, source_name=source.name)
        import_results = adapter.fetch(
            period_start=task.period_start,
            period_end=task.period_end,
        )
        log.info("IMPORT FETCH: adapter=%s returned %d results", AdapterClass.__name__, len(import_results))
    else:
        # Fallback to mock for unknown source types
        log.warning("IMPORT FALLBACK: no adapter for type='%s', using mock generator", source_type_str)
        import_results = []
        for d in _generate_mock_import(source, task):
            from app.adapters.base import ImportResult
            import_results.append(ImportResult(**{k: v for k, v in d.items() if k != 'status'}))

    created_count = 0
    for result in import_results:
        doc_dict = result.to_dict() if hasattr(result, 'to_dict') else result
        # Remove non-Document fields
        description = doc_dict.pop('description', None)
        category = doc_dict.pop('category', None)
        original_filename = doc_dict.pop('original_filename', None)
        status_val = doc_dict.pop('status', None)

        doc = Document(
            id=str(uuid4()),
            task_id=task.id,
            status=DocumentStatus.NEW,
            **doc_dict,
        )
        if original_filename:
            doc.file_path = original_filename
        doc.doc_id = generate_doc_id(
            contractor_nip=doc.contractor_nip,
            number=doc.number,
            document_date=doc.document_date,
            amount_gross=doc.amount_gross,
            doc_type=doc.doc_type or 'invoice',
        )
        db.add(doc)
        log.debug("IMPORT DOC: id=%s number='%s' contractor='%s' gross=%s date=%s source_id=%s doc_id=%s",
                  doc.id[:8], doc.number, doc.contractor_name, doc.amount_gross, doc.document_date, doc.source_id, doc.doc_id)

        # Always create metadata row so tags/category are available in UI
        meta = DocumentMetadata(
            id=str(uuid4()),
            document_id=doc.id,
            description=description,
            category=category,
            tags=[],
            edited_by_id=identity_id,
            edited_at=datetime.utcnow(),
        )
        db.add(meta)
        log.debug("IMPORT META: doc=%s category='%s' description='%s'", doc.id[:8], category, (description or "")[:50])

        created_count += 1

    # Update task stats
    task.docs_total += created_count
    if task.import_status == PhaseStatus.NOT_STARTED:
        task.import_status = PhaseStatus.IN_PROGRESS
    if task.status == TaskStatus.PENDING:
        task.status = TaskStatus.IN_PROGRESS

    # Update run
    run.status = "success"
    run.docs_found = len(import_results)
    run.docs_imported = created_count
    run.finished_at = datetime.utcnow()
    db.add(run)

    # Update source last_run
    source.last_run_at = datetime.utcnow()
    source.last_run_status = "success"
    source.last_run_count = created_count

    db.commit()
    db.refresh(run)
    log.info("IMPORT DONE: source=%s task=%s found=%d imported=%d run=%s status=%s",
             source.id[:8], task.id[:8], run.docs_found, run.docs_imported, run.id[:8], run.status)
    return run


@router.post("/flow/upload-csv")
def upload_csv(
    task_id: str = Query(...),
    file: UploadFile = File(...),
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Import documents from an uploaded CSV file.
    
    Expected CSV columns (flexible - uses first matching header):
    - number/numer/nr: invoice number
    - contractor_name/kontrahent/nazwa: contractor name
    - contractor_nip/nip: contractor NIP
    - amount_net/netto: net amount
    - amount_vat/vat: VAT amount
    - amount_gross/brutto/kwota: gross amount
    - document_date/data/date: document date
    - doc_type/typ: document type (default: invoice)
    - description/opis: description (saved as metadata)
    - category/kategoria: category (saved as metadata)
    """
    import csv
    import io

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    _check_project_access(db, task.project_id, identity_id, require_edit=True)

    # Read CSV content
    try:
        content = file.file.read().decode('utf-8-sig')  # Handle BOM
    except UnicodeDecodeError:
        file.file.seek(0)
        content = file.file.read().decode('cp1250')  # Polish Windows encoding fallback

    reader = csv.DictReader(io.StringIO(content), delimiter=_detect_delimiter(content))
    
    # Column name mapping (flexible headers)
    COL_MAP = {
        'number': ['number', 'numer', 'nr', 'nr_dokumentu', 'numer_faktury', 'invoice_number'],
        'contractor_name': ['contractor_name', 'kontrahent', 'nazwa', 'nazwa_kontrahenta', 'dostawca', 'odbiorca', 'name'],
        'contractor_nip': ['contractor_nip', 'nip', 'nip_kontrahenta'],
        'amount_net': ['amount_net', 'netto', 'kwota_netto', 'net'],
        'amount_vat': ['amount_vat', 'vat', 'kwota_vat'],
        'amount_gross': ['amount_gross', 'brutto', 'kwota_brutto', 'kwota', 'gross', 'amount'],
        'document_date': ['document_date', 'data', 'date', 'data_dokumentu', 'data_faktury', 'data_wystawienia'],
        'doc_type': ['doc_type', 'typ', 'type', 'typ_dokumentu'],
        'description': ['description', 'opis'],
        'category': ['category', 'kategoria'],
        'currency': ['currency', 'waluta'],
    }

    created_count = 0
    errors = []

    for row_idx, row in enumerate(reader, 1):
        try:
            mapped = _map_csv_row(row, COL_MAP)
            if not mapped.get('number') and not mapped.get('amount_gross') and not mapped.get('contractor_name'):
                continue  # Skip empty rows

            doc = Document(
                id=str(uuid4()),
                task_id=task_id,
                doc_type=mapped.get('doc_type', 'invoice'),
                number=mapped.get('number'),
                contractor_name=mapped.get('contractor_name'),
                contractor_nip=_clean_nip(mapped.get('contractor_nip')),
                amount_net=_parse_amount(mapped.get('amount_net')),
                amount_vat=_parse_amount(mapped.get('amount_vat')),
                amount_gross=_parse_amount(mapped.get('amount_gross')),
                currency=mapped.get('currency', 'PLN'),
                document_date=_parse_date(mapped.get('document_date')),
                source='csv_upload',
                source_id=f"csv-{file.filename}-row{row_idx}",
                status=DocumentStatus.NEW,
            )
            doc.doc_id = generate_doc_id(
                contractor_nip=doc.contractor_nip,
                number=doc.number,
                document_date=doc.document_date,
                amount_gross=doc.amount_gross,
                doc_type=doc.doc_type or 'invoice',
            )
            db.add(doc)

            # Add metadata if description or category present
            desc = mapped.get('description')
            cat = mapped.get('category')
            if desc or cat:
                meta = DocumentMetadata(
                    id=str(uuid4()),
                    document_id=doc.id,
                    description=desc,
                    category=cat,
                    tags=[],
                    edited_by_id=identity_id,
                    edited_at=datetime.utcnow(),
                )
                db.add(meta)

            created_count += 1
        except Exception as e:
            errors.append(f"Wiersz {row_idx}: {str(e)}")

    # Update task stats
    task.docs_total += created_count
    if task.import_status == PhaseStatus.NOT_STARTED:
        task.import_status = PhaseStatus.IN_PROGRESS
    if task.status == TaskStatus.PENDING:
        task.status = TaskStatus.IN_PROGRESS

    db.commit()

    return {
        "ok": True,
        "imported": created_count,
        "errors": errors[:10],  # Limit error list
        "filename": file.filename,
    }


def _detect_delimiter(content: str) -> str:
    """Detect CSV delimiter (semicolon vs comma)."""
    first_line = content.split('\n')[0] if content else ''
    if first_line.count(';') > first_line.count(','):
        return ';'
    return ','


def _map_csv_row(row: dict, col_map: dict) -> dict:
    """Map CSV row to document fields using flexible column names."""
    result = {}
    row_lower = {k.lower().strip(): v for k, v in row.items() if k}
    for field, aliases in col_map.items():
        for alias in aliases:
            if alias in row_lower and row_lower[alias]:
                result[field] = row_lower[alias].strip()
                break
    return result


def _clean_nip(nip: str | None) -> str | None:
    """Clean NIP - remove separators."""
    if not nip:
        return None
    import re
    cleaned = re.sub(r'[\s\-\.]', '', nip)
    cleaned = re.sub(r'^PL', '', cleaned, flags=re.IGNORECASE)
    return cleaned[:10] if cleaned else None


def _parse_amount(val: str | None) -> float | None:
    """Parse Polish amount format (1 234,56 or 1234.56)."""
    if not val:
        return None
    import re
    cleaned = re.sub(r'[^\d,.\-]', '', val)
    cleaned = cleaned.replace(',', '.')
    # Handle case where . is thousands separator: 1.234.56
    parts = cleaned.split('.')
    if len(parts) > 2:
        cleaned = ''.join(parts[:-1]) + '.' + parts[-1]
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _parse_date(val: str | None):
    """Parse Polish date formats."""
    if not val:
        return None
    from datetime import datetime as dt
    for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%Y', '%Y/%m/%d']:
        try:
            return dt.strptime(val.strip(), fmt).date()
        except ValueError:
            continue
    return None


@router.post("/flow/export")
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
        return {
            "ok": False,
            "message": "Brak opisanych dokumentów do eksportu. Najpierw opisz dokumenty.",
            "docs_exported": 0,
        }

    # Generate export content using real adapter
    from app.adapters import get_export_adapter
    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)
    ExportAdapterClass = get_export_adapter(source_type_str)

    log.info("EXPORT START: source=%s name='%s' type=%s adapter=%s task=%s docs_count=%d config_keys=%s by=%s",
             source.id[:8], source.name, source_type_str,
             ExportAdapterClass.__name__ if ExportAdapterClass else "MOCK_FALLBACK",
             task.id[:8], len(docs), list((source.config or {}).keys()), identity_id[:8])

    if ExportAdapterClass:
        adapter = ExportAdapterClass(config=source.config or {}, source_name=source.name)
        export_result = adapter.export(docs, task_name=task.name)
        output_content = export_result.content
        output_filename = export_result.filename
        output_format = export_result.format
        log.info("EXPORT GENERATED: adapter=%s filename='%s' format=%s content_size=%d bytes",
                 ExportAdapterClass.__name__, output_filename, output_format, len(output_content))
    else:
        # Fallback to mock
        log.warning("EXPORT FALLBACK: no adapter for type='%s', using mock generator", source_type_str)
        format_info = EXPORT_FORMAT_INFO.get(source_type_str, {"name": "CSV", "format": "csv"})
        output_content, output_filename = _generate_mock_export(source, docs, task)
        output_format = format_info["format"]

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
        output_format=output_format,
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
    log.info("EXPORT DONE: source=%s task=%s exported=%d filename='%s' format=%s run=%s",
             source.id[:8], task.id[:8], exported_count, output_filename, output_format, run.id[:8])
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
    """Pobiera plik eksportu jako plik do pobrania."""
    from fastapi.responses import Response

    run = db.query(ExportRun).filter(ExportRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Eksport nie znaleziony")
    _check_project_access(db, run.source.project_id, identity_id)

    if not run.output_content:
        raise HTTPException(status_code=404, detail="Brak treści eksportu")

    content_type = "text/xml; charset=utf-8" if run.output_format == "xml" else "text/csv; charset=utf-8"
    filename = run.output_filename or f"export.{run.output_format or 'csv'}"

    return Response(
        content=run.output_content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


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
