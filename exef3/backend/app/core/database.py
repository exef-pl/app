"""Konfiguracja bazy danych."""
import logging
from uuid import uuid4
from datetime import datetime
from sqlalchemy import create_engine, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import settings
from app.models.models import Base
from app.models.magic_link import MagicLink

log = logging.getLogger("exef.database")

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Inicjalizacja bazy danych - tworzenie tabel."""
    # MagicLink is imported above to ensure it registers with Base.metadata
    Base.metadata.create_all(bind=engine)
    _backfill_metadata()
    if settings.USE_ENTITY_DB:
        _migrate_to_entity_dbs()

def _backfill_metadata():
    """Create DocumentMetadata rows for documents that don't have one."""
    from app.models.models import Document, DocumentMetadata
    db = SessionLocal()
    try:
        orphans = (
            db.query(Document)
            .outerjoin(DocumentMetadata, Document.id == DocumentMetadata.document_id)
            .filter(DocumentMetadata.id.is_(None))
            .all()
        )
        if not orphans:
            return
        for doc in orphans:
            meta = DocumentMetadata(
                id=str(uuid4()),
                document_id=doc.id,
                tags=[],
                edited_at=datetime.utcnow(),
            )
            db.add(meta)
        db.commit()
        log.info("BACKFILL: created metadata for %d documents without metadata rows", len(orphans))
    except Exception as e:
        db.rollback()
        log.warning("BACKFILL failed: %s", e)
    finally:
        db.close()

def _migrate_to_entity_dbs():
    """Migrate existing data from shared DB to per-entity SQLite files.

    Runs once on startup when USE_ENTITY_DB=True.
    Detected by checking if resource_routing table has entries.
    """
    from app.core.entity_db import (
        entity_db_manager, add_routing,
        sync_identity_to_entity_db, sync_entity_to_entity_db,
    )
    from app.models.models import (
        Entity, EntityMember, Identity, ResourceRouting,
        Project, ProjectAuthorization, Task, Document, DocumentMetadata,
        DocumentRelation, DataSource, ImportRun, ExportRun,
    )

    db = SessionLocal()
    try:
        # Skip if already migrated
        if db.query(ResourceRouting).first():
            log.info("ENTITY_DB: routing table already populated, skipping migration")
            return

        entities = db.query(Entity).all()
        if not entities:
            log.info("ENTITY_DB: no entities to migrate")
            return

        entity_db_manager.ensure_dir()
        total_projects = 0
        total_tasks = 0
        total_docs = 0

        for entity in entities:
            nip = entity.nip or entity.id[:10]
            entity_db_manager.init_entity_db(nip)
            edb = entity_db_manager.get_session(nip)

            try:
                # 1. Sync entity stub
                sync_entity_to_entity_db(edb, entity)

                # 2. Collect & sync all referenced identity IDs
                members = db.query(EntityMember).filter(
                    EntityMember.entity_id == entity.id
                ).all()
                identity_ids = {m.identity_id for m in members}

                # Also collect identity IDs referenced by entity's data
                projects = db.query(Project).filter(
                    Project.entity_id == entity.id
                ).all()
                project_ids = [p.id for p in projects]

                if project_ids:
                    # Task assignees
                    tasks = db.query(Task).filter(
                        Task.project_id.in_(project_ids)
                    ).all()
                    identity_ids.update(
                        t.assigned_to_id for t in tasks if t.assigned_to_id
                    )

                    # ProjectAuthorization identities
                    auths = db.query(ProjectAuthorization).filter(
                        ProjectAuthorization.project_id.in_(project_ids)
                    ).all()
                    identity_ids.update(a.identity_id for a in auths)
                    identity_ids.update(
                        a.granted_by_id for a in auths if a.granted_by_id
                    )

                # Sync identity stubs
                identities = db.query(Identity).filter(
                    Identity.id.in_(identity_ids)
                ).all() if identity_ids else []
                for ident in identities:
                    sync_identity_to_entity_db(edb, ident)

                # 3. Copy projects + routing
                for project in projects:
                    _copy_row(edb, Project, project)
                    add_routing(db, project.id, entity.id, nip, "project")
                    total_projects += 1

                    # Copy project authorizations
                    proj_auths = [a for a in auths if a.project_id == project.id] if project_ids else []
                    for auth in proj_auths:
                        _copy_row(edb, ProjectAuthorization, auth)

                    # Copy sources + routing
                    sources = db.query(DataSource).filter(
                        DataSource.project_id == project.id
                    ).all()
                    for source in sources:
                        _copy_row(edb, DataSource, source)
                        add_routing(db, source.id, entity.id, nip, "source")

                        # Copy import/export runs
                        for run in db.query(ImportRun).filter(
                            ImportRun.source_id == source.id
                        ).all():
                            _copy_row(edb, ImportRun, run)

                        for run in db.query(ExportRun).filter(
                            ExportRun.source_id == source.id
                        ).all():
                            _copy_row(edb, ExportRun, run)

                # 4. Copy tasks + documents + routing
                if project_ids:
                    for task in tasks:
                        _copy_row(edb, Task, task)
                        add_routing(db, task.id, entity.id, nip, "task")
                        total_tasks += 1

                    # Copy documents
                    task_ids = [t.id for t in tasks]
                    if task_ids:
                        documents = db.query(Document).filter(
                            Document.task_id.in_(task_ids)
                        ).all()
                        for doc in documents:
                            _copy_row(edb, Document, doc)
                            add_routing(db, doc.id, entity.id, nip, "document")
                            total_docs += 1

                        doc_ids = [d.id for d in documents]
                        if doc_ids:
                            # Copy metadata
                            for meta in db.query(DocumentMetadata).filter(
                                DocumentMetadata.document_id.in_(doc_ids)
                            ).all():
                                _copy_row(edb, DocumentMetadata, meta)

                            # Copy relations
                            for rel in db.query(DocumentRelation).filter(
                                DocumentRelation.parent_id.in_(doc_ids)
                            ).all():
                                _copy_row(edb, DocumentRelation, rel)

                edb.commit()
                log.info("ENTITY_DB MIGRATE: entity=%s nip=%s projects=%d",
                         entity.name, nip, len(projects))

            except Exception as e:
                edb.rollback()
                log.error("ENTITY_DB MIGRATE FAILED: entity=%s error=%s",
                          entity.name, e)
                raise

        db.commit()  # Commit routing entries
        log.info("ENTITY_DB MIGRATION DONE: %d entities, %d projects, %d tasks, %d documents",
                 len(entities), total_projects, total_tasks, total_docs)

    except Exception as e:
        db.rollback()
        log.error("ENTITY_DB MIGRATION FAILED: %s", e)
    finally:
        db.close()
        entity_db_manager.cleanup_sessions()


def _copy_row(target_db: Session, model, instance):
    """Copy an ORM instance to target session by extracting column values."""
    mapper = sa_inspect(model)
    data = {}
    for col in mapper.columns:
        data[col.key] = getattr(instance, col.key)
    target_db.merge(model(**data))


def get_db() -> Generator[Session, None, None]:
    """Dependency dla sesji bazy danych."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
