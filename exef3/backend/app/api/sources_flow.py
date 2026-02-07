"""API endpoints - import/export flow triggers, CSV upload, run history."""
import logging
from uuid import uuid4
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_identity_id
from app.core.entity_db import resolve_entity_db
from app.core.docid import generate_doc_id
from app.api.access import check_project_access
from app.api.sources_helpers import (
    CSV_COL_MAP, detect_delimiter, map_csv_row, clean_nip, parse_amount, parse_date,
    generate_mock_import, generate_mock_export,
)
from app.api.sources import (
    ImportRunResponse, ExportRunResponse, TriggerImportRequest, TriggerExportRequest,
    EXPORT_FORMAT_INFO,
)
from app.models.models import (
    DataSource, ImportRun, ExportRun, Document, DocumentMetadata, DocumentStatus,
    Task, TaskStatus, SourceDirection, PhaseStatus,
)

log = logging.getLogger("exef.sources")

router = APIRouter(tags=["sources"])


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT / EXPORT TRIGGERS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/flow/import", response_model=ImportRunResponse)
def trigger_import(
    data: TriggerImportRequest,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Uruchamia import z wybranego źródła do wybranego zadania."""
    edb = resolve_entity_db(db, data.source_id)
    source = edb.query(DataSource).filter(DataSource.id == data.source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    if source.direction != SourceDirection.IMPORT:
        raise HTTPException(status_code=400, detail="To źródło nie jest importem")

    task = edb.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")

    check_project_access(db, source.project_id, identity_id, require_edit=True, edb=edb)

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
        for d in generate_mock_import(source, task):
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
        edb.add(doc)
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
        edb.add(meta)
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
    edb.add(run)

    # Update source last_run
    source.last_run_at = datetime.utcnow()
    source.last_run_status = "success"
    source.last_run_count = created_count

    edb.commit()
    edb.refresh(run)
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
    """Import documents from an uploaded CSV file."""
    import csv
    import io

    edb = resolve_entity_db(db, task_id)
    task = edb.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    check_project_access(db, task.project_id, identity_id, require_edit=True, edb=edb)

    # Read CSV content
    try:
        content = file.file.read().decode('utf-8-sig')  # Handle BOM
    except UnicodeDecodeError:
        file.file.seek(0)
        content = file.file.read().decode('cp1250')  # Polish Windows encoding fallback

    reader = csv.DictReader(io.StringIO(content), delimiter=detect_delimiter(content))

    created_count = 0
    errors = []

    for row_idx, row in enumerate(reader, 1):
        try:
            mapped = map_csv_row(row, CSV_COL_MAP)
            if not mapped.get('number') and not mapped.get('amount_gross') and not mapped.get('contractor_name'):
                continue  # Skip empty rows

            doc = Document(
                id=str(uuid4()),
                task_id=task_id,
                doc_type=mapped.get('doc_type', 'invoice'),
                number=mapped.get('number'),
                contractor_name=mapped.get('contractor_name'),
                contractor_nip=clean_nip(mapped.get('contractor_nip')),
                amount_net=parse_amount(mapped.get('amount_net')),
                amount_vat=parse_amount(mapped.get('amount_vat')),
                amount_gross=parse_amount(mapped.get('amount_gross')),
                currency=mapped.get('currency', 'PLN'),
                document_date=parse_date(mapped.get('document_date')),
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
            edb.add(doc)

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
                edb.add(meta)

            created_count += 1
        except Exception as e:
            errors.append(f"Wiersz {row_idx}: {str(e)}")

    # Update task stats
    task.docs_total += created_count
    if task.import_status == PhaseStatus.NOT_STARTED:
        task.import_status = PhaseStatus.IN_PROGRESS
    if task.status == TaskStatus.PENDING:
        task.status = TaskStatus.IN_PROGRESS

    edb.commit()

    return {
        "ok": True,
        "imported": created_count,
        "errors": errors[:10],  # Limit error list
        "filename": file.filename,
    }


@router.post("/flow/export")
def trigger_export(
    data: TriggerExportRequest,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Uruchamia eksport opisanych dokumentów do wybranego celu."""
    edb = resolve_entity_db(db, data.source_id)
    source = edb.query(DataSource).filter(DataSource.id == data.source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Źródło nie znalezione")
    if source.direction != SourceDirection.EXPORT:
        raise HTTPException(status_code=400, detail="To źródło nie jest eksportem")

    task = edb.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")

    check_project_access(db, source.project_id, identity_id, require_edit=True, edb=edb)

    # Get documents to export
    doc_query = edb.query(Document).filter(Document.task_id == task.id)
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
        output_content, output_filename = generate_mock_export(source, docs, task)
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
    edb.add(run)

    # Update source
    source.last_run_at = datetime.utcnow()
    source.last_run_status = "success"
    source.last_run_count = exported_count

    edb.commit()
    edb.refresh(run)
    log.info("EXPORT DONE: source=%s task=%s exported=%d filename='%s' format=%s run=%s",
             source.id[:8], task.id[:8], exported_count, output_filename, output_format, run.id[:8])
    return run


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT / EXPORT RUN HISTORY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/tasks/{task_id}/import-runs", response_model=List[ImportRunResponse])
def list_import_runs(
    task_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Historia importów dla zadania."""
    edb = resolve_entity_db(db, task_id)
    task = edb.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    check_project_access(db, task.project_id, identity_id, edb=edb)
    runs = edb.query(ImportRun).filter(ImportRun.task_id == task_id).order_by(ImportRun.started_at.desc()).all()
    return runs


@router.get("/tasks/{task_id}/export-runs", response_model=List[ExportRunResponse])
def list_export_runs(
    task_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Historia eksportów dla zadania."""
    edb = resolve_entity_db(db, task_id)
    task = edb.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Zadanie nie znalezione")
    check_project_access(db, task.project_id, identity_id, edb=edb)
    runs = edb.query(ExportRun).filter(ExportRun.task_id == task_id).order_by(ExportRun.started_at.desc()).all()
    return runs


@router.get("/export-runs/{run_id}/download")
def download_export(
    run_id: str,
    identity_id: str = Depends(get_current_identity_id),
    db: Session = Depends(get_db),
):
    """Pobiera plik eksportu jako plik do pobrania."""
    from fastapi.responses import Response

    # ExportRun ID is not in routing table; find it via source
    # Try main DB first (backward compat), then entity DBs
    run = db.query(ExportRun).filter(ExportRun.id == run_id).first()
    edb = db
    if not run:
        from app.core.config import settings as _settings
        if _settings.USE_ENTITY_DB:
            pass  # fallback — run should be found in main DB or via relationship
    if not run:
        raise HTTPException(status_code=404, detail="Eksport nie znaleziony")
    if hasattr(run, '_sa_instance_state') and run._sa_instance_state.session:
        edb = run._sa_instance_state.session
    check_project_access(db, run.source.project_id, identity_id, edb=edb)

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
