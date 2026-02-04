"""Konfiguracja bazy danych."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import settings
from app.models.models import Base
from app.models.magic_link import MagicLink

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Inicjalizacja bazy danych - tworzenie tabel."""
    Base.metadata.create_all(bind=engine)
    MagicLink.metadata.create_all(bind=engine)

def get_db() -> Generator[Session, None, None]:
    """Dependency dla sesji bazy danych."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
