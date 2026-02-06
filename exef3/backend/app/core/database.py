"""Konfiguracja bazy danych."""
import logging
from uuid import uuid4
from datetime import datetime
from sqlalchemy import create_engine
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

def get_db() -> Generator[Session, None, None]:
    """Dependency dla sesji bazy danych."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
