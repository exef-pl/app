"""Per-entity database management.

Architecture:
- Main DB (exef.db): identities, entities, entity_members, entity_databases,
  project_templates, magic_links, resource_routing
- Entity DB (entities/{nip}.db): projects, project_authorizations, tasks, documents,
  document_metadata, document_relations, data_sources, import_runs, export_runs
  + stub copies of identities/entities for FK satisfaction

When USE_ENTITY_DB=False (default), all data lives in main DB (backward compatible).
When USE_ENTITY_DB=True, business data is routed to per-entity SQLite files.
"""
import os
import logging
import contextvars
from threading import Lock
from typing import Optional

from sqlalchemy import create_engine, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

log = logging.getLogger("exef.entity_db")

# Track entity sessions per request for cleanup
_entity_sessions: contextvars.ContextVar[list] = contextvars.ContextVar(
    'entity_sessions', default=[])


class EntityDBManager:
    """Manages per-entity SQLite databases."""

    def __init__(self):
        self._engines = {}
        self._session_factories = {}
        self._lock = Lock()

    def ensure_dir(self):
        os.makedirs(settings.ENTITY_DB_DIR, exist_ok=True)

    def init_entity_db(self, entity_nip: str) -> str:
        """Initialize entity database file and schema. Returns db path."""
        with self._lock:
            if entity_nip in self._engines:
                return settings.ENTITY_DB_PATH_TEMPLATE.format(nip=entity_nip)

            db_path = settings.ENTITY_DB_PATH_TEMPLATE.format(nip=entity_nip)
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

            db_url = settings.ENTITY_DB_URL_TEMPLATE.format(nip=entity_nip)
            engine = create_engine(
                db_url,
                connect_args={"check_same_thread": False}
            )

            # Create ALL tables (entity-specific get data; auth tables stay as empty stubs
            # to satisfy FK constraints — SQLite doesn't enforce FKs by default)
            from app.models.models import Base
            Base.metadata.create_all(engine)

            self._engines[entity_nip] = engine
            self._session_factories[entity_nip] = sessionmaker(
                autocommit=False, autoflush=False, bind=engine
            )

            log.info("INIT entity DB: nip=%s path=%s", entity_nip, db_path)
            return db_path

    def get_session(self, entity_nip: str) -> Session:
        """Get a session for entity's database, initializing if needed.
        Sessions are tracked per-request for cleanup via middleware."""
        if entity_nip not in self._session_factories:
            self.ensure_dir()
            self.init_entity_db(entity_nip)

        # Reuse existing session for same NIP within current request
        try:
            sessions = _entity_sessions.get()
        except LookupError:
            sessions = []
            _entity_sessions.set(sessions)

        for s in sessions:
            if getattr(s, '_entity_nip', None) == entity_nip:
                return s

        session = self._session_factories[entity_nip]()
        session._entity_nip = entity_nip  # Tag for reuse
        sessions.append(session)
        return session

    def cleanup_sessions(self):
        """Close all entity sessions for current request. Called by middleware."""
        try:
            sessions = _entity_sessions.get()
        except LookupError:
            return
        for s in sessions:
            try:
                s.close()
            except Exception:
                pass
        _entity_sessions.set([])

    def db_exists(self, entity_nip: str) -> bool:
        db_path = settings.ENTITY_DB_PATH_TEMPLATE.format(nip=entity_nip)
        return os.path.exists(db_path)


# Singleton
entity_db_manager = EntityDBManager()


# ─── Routing helpers ───────────────────────────────────────────────────────────

def resolve_entity_db(main_db: Session, resource_id: str) -> Session:
    """Resolve entity DB session from any resource ID (project, task, source, document).

    Returns main_db as fallback when:
    - USE_ENTITY_DB is False
    - No routing entry exists for the resource
    """
    if not settings.USE_ENTITY_DB:
        return main_db

    from app.models.models import ResourceRouting
    routing = main_db.query(ResourceRouting).filter(
        ResourceRouting.resource_id == resource_id
    ).first()

    if not routing:
        log.debug("No routing for resource %s, falling back to main DB", resource_id[:8])
        return main_db

    return entity_db_manager.get_session(routing.entity_nip)


def resolve_entity_db_by_entity(main_db: Session, entity_id: str) -> Session:
    """Resolve entity DB session from entity_id.

    Looks up entity in main DB to get NIP, then returns entity session.
    Returns main_db as fallback.
    """
    if not settings.USE_ENTITY_DB:
        return main_db

    from app.models.models import Entity
    entity = main_db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        return main_db

    nip = entity.nip or entity.id[:10]
    return entity_db_manager.get_session(nip)


def add_routing(main_db: Session, resource_id: str, entity_id: str,
                entity_nip: str, resource_type: str):
    """Add a routing entry mapping resource_id → entity NIP."""
    if not settings.USE_ENTITY_DB:
        return
    from app.models.models import ResourceRouting
    main_db.merge(ResourceRouting(
        resource_id=resource_id,
        entity_nip=entity_nip,
        entity_id=entity_id,
        resource_type=resource_type,
    ))


def remove_routing(main_db: Session, resource_id: str):
    """Remove a routing entry."""
    if not settings.USE_ENTITY_DB:
        return
    from app.models.models import ResourceRouting
    main_db.query(ResourceRouting).filter(
        ResourceRouting.resource_id == resource_id
    ).delete()


# ─── Identity/Entity sync helpers ─────────────────────────────────────────────

def sync_identity_to_entity_db(entity_db: Session, identity):
    """Copy/update identity stub in entity DB so FK relationships work."""
    if not settings.USE_ENTITY_DB:
        return
    from app.models.models import Identity
    existing = entity_db.query(Identity).filter(Identity.id == identity.id).first()
    if existing:
        existing.email = identity.email
        existing.first_name = identity.first_name
        existing.last_name = identity.last_name
        existing.avatar = identity.avatar
        existing.color = identity.color
        existing.is_active = identity.is_active
    else:
        stub = Identity(
            id=identity.id,
            email=identity.email,
            password_hash="<synced>",
            first_name=identity.first_name,
            last_name=identity.last_name,
            avatar=identity.avatar,
            color=identity.color,
            is_active=identity.is_active,
            is_verified=identity.is_verified,
        )
        entity_db.add(stub)


def sync_entity_to_entity_db(entity_db: Session, entity):
    """Copy/update entity stub in entity DB so FK relationships work."""
    if not settings.USE_ENTITY_DB:
        return
    from app.models.models import Entity
    existing = entity_db.query(Entity).filter(Entity.id == entity.id).first()
    if existing:
        existing.name = entity.name
        existing.nip = entity.nip
        existing.type = entity.type
    else:
        stub = Entity(
            id=entity.id,
            type=entity.type,
            name=entity.name,
            nip=entity.nip,
            owner_id=entity.owner_id,
            icon=entity.icon,
            color=entity.color,
        )
        entity_db.add(stub)
