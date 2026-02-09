"""Modele bazy danych EXEF.

Hierarchia:
- Tożsamość (Identity) - użytkownik z NIP/PESEL, autentykacja
- Podmiot (Entity) - JDG, małżeństwo, spółka, organizacja  
- Projekt (Project) - księgowość, JPK, ZUS z ramami czasowymi
- Zadanie (Task) - jednostka pracy w projekcie
- Dokument (Document) - faktury, umowy
"""
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Date, 
    ForeignKey, Text, JSON, Enum, Table, UniqueConstraint
)
from sqlalchemy.orm import relationship, declarative_base
import enum

Base = declarative_base()

# ═══════════════════════════════════════════════════════════════════════════════
# ENUMS
# ═══════════════════════════════════════════════════════════════════════════════

class EntityType(str, enum.Enum):
    JDG = "jdg"
    MALZENSTWO = "malzenstwo"
    SPOLKA = "spolka"
    ORGANIZACJA = "organizacja"

class TaskRecurrence(str, enum.Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    ONCE = "once"

class ProjectType(str, enum.Enum):
    KSIEGOWOSC = "ksiegowosc"
    JPK = "jpk"
    ZUS = "zus"
    VAT_UE = "vat_ue"
    PROJEKT_KLIENTA = "projekt_klienta"
    RD_IPBOX = "rd_ipbox"
    KPIR = "kpir"
    WPLATY = "wplaty"
    DOWODY_PLATNOSCI = "dowody_platnosci"
    DRUKI_PRZESYLKI = "druki_przesylki"
    REKRUTACJA = "rekrutacja"
    UMOWY = "umowy"
    KORESPONDENCJA = "korespondencja"
    ZAMOWIENIA = "zamowienia"
    PROTOKOLY = "protokoly"
    POLISY = "polisy"
    WNIOSKI = "wnioski"
    NIERUCHOMOSCI = "nieruchomosci"

class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPORTED = "exported"

class DocumentStatus(str, enum.Enum):
    NEW = "new"
    DESCRIBED = "described"
    APPROVED = "approved"
    EXPORTED = "exported"

class AuthorizationRole(str, enum.Enum):
    OWNER = "owner"
    ACCOUNTANT = "accountant"
    ASSISTANT = "assistant"
    VIEWER = "viewer"

class SourceDirection(str, enum.Enum):
    IMPORT = "import"
    EXPORT = "export"

class SourceType(str, enum.Enum):
    EMAIL = "email"
    KSEF = "ksef"
    UPLOAD = "upload"
    WEBHOOK = "webhook"
    WFIRMA = "wfirma"
    JPK_PKPIR = "jpk_pkpir"
    COMARCH = "comarch"
    SYMFONIA = "symfonia"
    ENOVA = "enova"
    CSV = "csv"
    MANUAL = "manual"
    BANK = "bank"
    BANK_ING = "bank_ing"
    BANK_MBANK = "bank_mbank"
    BANK_PKO = "bank_pko"
    BANK_SANTANDER = "bank_santander"
    BANK_PEKAO = "bank_pekao"

class PhaseStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

# ═══════════════════════════════════════════════════════════════════════════════
# TOŻSAMOŚĆ (Identity) - Użytkownik z autentykacją
# ═══════════════════════════════════════════════════════════════════════════════

class Identity(Base):
    """Tożsamość - użytkownik systemu (osoba fizyczna lub przedstawiciel firmy)."""
    __tablename__ = "identities"
    
    id = Column(String(36), primary_key=True)
    
    # Dane identyfikacyjne
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Dane osobowe
    first_name = Column(String(100))
    last_name = Column(String(100))
    pesel = Column(String(11), unique=True, index=True)
    nip = Column(String(10), index=True)  # NIP własny lub firmy którą reprezentuje
    
    # Metadane
    avatar = Column(String(10))
    color = Column(String(20), default="#3b82f6")
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    verification_method = Column(String(50))  # profile_zaufany, e_dowod, etc.
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    owned_entities = relationship("Entity", back_populates="owner", foreign_keys="Entity.owner_id")
    entity_memberships = relationship("EntityMember", back_populates="identity")
    project_authorizations = relationship("ProjectAuthorization", back_populates="identity", foreign_keys="ProjectAuthorization.identity_id")
    granted_authorizations = relationship("ProjectAuthorization", foreign_keys="ProjectAuthorization.granted_by_id")
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name or ''} {self.last_name or ''}".strip() or self.email

# ═══════════════════════════════════════════════════════════════════════════════
# PODMIOT (Entity) - JDG, Małżeństwo, Spółka, Organizacja
# ═══════════════════════════════════════════════════════════════════════════════

class Entity(Base):
    """Podmiot gospodarczy - ma własną bazę danych/kontekst."""
    __tablename__ = "entities"
    
    id = Column(String(36), primary_key=True)
    
    # Typ podmiotu
    type = Column(Enum(EntityType), nullable=False)
    
    # Dane identyfikacyjne
    name = Column(String(255), nullable=False)
    nip = Column(String(10), unique=True, index=True)
    regon = Column(String(14))
    krs = Column(String(10))
    
    # Dane adresowe
    address_street = Column(String(255))
    address_city = Column(String(100))
    address_postal = Column(String(10))
    
    # Metadane
    icon = Column(String(10), default="🏢")
    color = Column(String(20), default="#3b82f6")
    
    # Właściciel (tożsamość która utworzyła podmiot)
    owner_id = Column(String(36), ForeignKey("identities.id"), nullable=False)
    
    is_archived = Column(Boolean, default=False, server_default="0")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    owner = relationship("Identity", back_populates="owned_entities", foreign_keys=[owner_id])
    members = relationship("EntityMember", back_populates="entity", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="entity", cascade="all, delete-orphan")
    database_config = relationship("EntityDatabase", back_populates="entity", uselist=False, cascade="all, delete-orphan")

class EntityDatabase(Base):
    """Konfiguracja bazy danych per podmiot — lokalna + opcjonalna zdalna (sync/backup)."""
    __tablename__ = "entity_databases"

    id = Column(String(36), primary_key=True)
    entity_id = Column(String(36), ForeignKey("entities.id"), unique=True, nullable=False)

    # Lokalna baza danych
    local_db_url = Column(String(500))          # np. sqlite:///./data/entities/<nip>.db
    local_db_path = Column(String(500))         # ścieżka do pliku SQLite

    # Zdalna baza danych (sync / backup)
    remote_db_url = Column(String(500))         # np. postgresql://...
    remote_db_driver = Column(String(50))       # sqlite | postgresql | mysql

    # Synchronizacja
    sync_enabled = Column(Boolean, default=False)
    sync_direction = Column(String(20), default="local_to_remote")  # local_to_remote | remote_to_local | bidirectional
    sync_interval_minutes = Column(Integer, default=60)
    last_sync_at = Column(DateTime)
    last_sync_status = Column(String(50))       # success | error | pending
    last_sync_error = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacje
    entity = relationship("Entity", back_populates="database_config")

class ResourceRouting(Base):
    """Routing index — maps resource IDs to entity NIP for per-entity DB resolution."""
    __tablename__ = "resource_routing"

    resource_id = Column(String(36), primary_key=True)
    entity_nip = Column(String(10), nullable=False, index=True)
    entity_id = Column(String(36), nullable=False)
    resource_type = Column(String(20))  # project, task, source, document


class EntityMember(Base):
    """Członek podmiotu - powiązanie tożsamości z podmiotem."""
    __tablename__ = "entity_members"
    
    id = Column(String(36), primary_key=True)
    entity_id = Column(String(36), ForeignKey("entities.id"), nullable=False)
    identity_id = Column(String(36), ForeignKey("identities.id"), nullable=False)
    role = Column(Enum(AuthorizationRole), default=AuthorizationRole.VIEWER)
    
    # Uprawnienia szczegółowe
    can_manage_projects = Column(Boolean, default=False)
    can_invite_members = Column(Boolean, default=False)
    can_export = Column(Boolean, default=False)
    
    joined_at = Column(DateTime, default=datetime.utcnow)
    
    # Relacje
    entity = relationship("Entity", back_populates="members")
    identity = relationship("Identity", back_populates="entity_memberships")
    
    __table_args__ = (UniqueConstraint('entity_id', 'identity_id'),)

# ═══════════════════════════════════════════════════════════════════════════════
# PROJEKT (Project) - Księgowość, JPK, ZUS
# ═══════════════════════════════════════════════════════════════════════════════

class ProjectTemplate(Base):
    """Szablon projektu — definiuje typ, cykliczność zadań, kategorie.
    
    Szablony systemowe (is_system=True) są dostępne dla wszystkich.
    Szablony użytkownika (is_system=False) są tworzone przez tożsamości.
    """
    __tablename__ = "project_templates"

    id = Column(String(36), primary_key=True)
    code = Column(String(50), unique=True, nullable=False)  # np. "ksiegowosc_miesiecznie"
    name = Column(String(255), nullable=False)               # np. "Księgowość — opis faktur co miesiąc"
    description = Column(Text)
    project_type = Column(Enum(ProjectType), nullable=False)

    # Cykliczność zadań
    task_recurrence = Column(Enum(TaskRecurrence), default=TaskRecurrence.MONTHLY)
    task_name_template = Column(String(255))    # np. "{month_name} {year}" → "Styczeń 2026"
    task_icon = Column(String(10), default="📅")
    deadline_day = Column(Integer, default=20)  # dzień miesiąca na deadline (np. 20 = 20-tego następnego mc)

    # Domyślne ustawienia projektu
    default_icon = Column(String(10), default="📊")
    default_color = Column(String(20), default="#3b82f6")
    default_categories = Column(JSON, default=list)

    # Metadane
    is_system = Column(Boolean, default=True)
    created_by_id = Column(String(36), ForeignKey("identities.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class Project(Base):
    """Projekt w ramach podmiotu - np. Księgowość 2026, JPK Q1."""
    __tablename__ = "projects"
    
    id = Column(String(36), primary_key=True)
    entity_id = Column(String(36), ForeignKey("entities.id"), nullable=False)
    template_id = Column(String(36), ForeignKey("project_templates.id"))
    
    # Dane projektu
    name = Column(String(255), nullable=False)
    description = Column(Text)
    type = Column(Enum(ProjectType), nullable=False)
    
    # Ramy czasowe
    period_start = Column(Date)
    period_end = Column(Date)
    year = Column(Integer)
    
    # Metadane
    icon = Column(String(10), default="📊")
    color = Column(String(20), default="#3b82f6")
    settings = Column(JSON, default=dict)
    categories = Column(JSON, default=list)  # Lista kategorii kosztów
    tags = Column(JSON, default=list)  # Predefiniowane tagi dla dokumentów
    
    # Status
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    entity = relationship("Entity", back_populates="projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    authorizations = relationship("ProjectAuthorization", back_populates="project", cascade="all, delete-orphan")
    data_sources = relationship("DataSource", back_populates="project", cascade="all, delete-orphan")

class ProjectAuthorization(Base):
    """Autoryzacja tożsamości do projektu innego podmiotu."""
    __tablename__ = "project_authorizations"
    
    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    identity_id = Column(String(36), ForeignKey("identities.id"), nullable=False)
    
    # Rola i uprawnienia
    role = Column(Enum(AuthorizationRole), default=AuthorizationRole.VIEWER)
    
    # Zakres uprawnień
    can_view = Column(Boolean, default=True)
    can_describe = Column(Boolean, default=False)
    can_approve = Column(Boolean, default=False)
    can_export = Column(Boolean, default=False)
    
    # Ważność
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime)  # NULL = bezterminowo
    
    # Kto udzielił
    granted_by_id = Column(String(36), ForeignKey("identities.id"))
    granted_at = Column(DateTime, default=datetime.utcnow)
    
    # Relacje
    project = relationship("Project", back_populates="authorizations")
    identity = relationship("Identity", back_populates="project_authorizations", foreign_keys=[identity_id])
    granted_by = relationship("Identity", foreign_keys=[granted_by_id], overlaps="granted_authorizations")
    
    __table_args__ = (UniqueConstraint('project_id', 'identity_id'),)

# ═══════════════════════════════════════════════════════════════════════════════
# ZADANIE (Task) - Jednostka pracy w projekcie
# ═══════════════════════════════════════════════════════════════════════════════

class Task(Base):
    """Zadanie w projekcie - np. Rozliczenie Styczeń 2026."""
    __tablename__ = "tasks"
    
    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    
    # Dane zadania
    name = Column(String(255), nullable=False)
    description = Column(Text)
    icon = Column(String(10), default="📋")
    
    # Ramy czasowe
    period_start = Column(Date)
    period_end = Column(Date)
    deadline = Column(Date)
    
    # Status
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING)
    
    # Fazy zadania: import → opis → eksport
    import_status = Column(Enum(PhaseStatus), default=PhaseStatus.NOT_STARTED)
    describe_status = Column(Enum(PhaseStatus), default=PhaseStatus.NOT_STARTED)
    export_status = Column(Enum(PhaseStatus), default=PhaseStatus.NOT_STARTED)
    
    # Przypisanie
    assigned_to_id = Column(String(36), ForeignKey("identities.id"), nullable=True)
    
    # Statystyki (cache)
    docs_total = Column(Integer, default=0)
    docs_described = Column(Integer, default=0)
    docs_approved = Column(Integer, default=0)
    docs_exported = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    project = relationship("Project", back_populates="tasks")
    assigned_to = relationship("Identity", foreign_keys=[assigned_to_id])
    documents = relationship("Document", back_populates="task", cascade="all, delete-orphan")
    import_runs = relationship("ImportRun", back_populates="task", cascade="all, delete-orphan")
    export_runs = relationship("ExportRun", back_populates="task", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════════════════════════
# DOKUMENT (Document) - Faktury, umowy
# ═══════════════════════════════════════════════════════════════════════════════

class Document(Base):
    """Dokument - faktura, umowa, paragon."""
    __tablename__ = "documents"
    
    id = Column(String(36), primary_key=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    
    # Typ dokumentu
    doc_type = Column(String(50), default="invoice")  # invoice, contract, receipt
    
    # Dane z importu (read-only)
    number = Column(String(100))
    contractor_name = Column(String(255))
    contractor_nip = Column(String(10))
    amount_net = Column(Float)
    amount_vat = Column(Float)
    amount_gross = Column(Float)
    currency = Column(String(3), default="PLN")
    document_date = Column(Date)
    
    # Deterministic document ID (docid library compatible)
    doc_id = Column(String(30), index=True)  # e.g. DOC-FV-A7B3C9D2E1F04856
    
    # Źródło importu
    source = Column(String(50))  # ksef, email, scanner, manual
    source_id = Column(String(100))  # ID w systemie źródłowym
    
    # Status
    status = Column(Enum(DocumentStatus), default=DocumentStatus.NEW)
    
    # Plik
    file_path = Column(String(500))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    task = relationship("Task", back_populates="documents")
    document_metadata = relationship("DocumentMetadata", back_populates="document", uselist=False, cascade="all, delete-orphan")
    parent_relations = relationship("DocumentRelation", foreign_keys="DocumentRelation.child_id", back_populates="child")
    child_relations = relationship("DocumentRelation", foreign_keys="DocumentRelation.parent_id", back_populates="parent")

class DocumentMetadata(Base):
    """Metadane dokumentu - edytowalne przez użytkowników."""
    __tablename__ = "document_metadata"
    
    id = Column(String(36), primary_key=True)
    document_id = Column(String(36), ForeignKey("documents.id"), unique=True, nullable=False)
    
    # Metadane
    category = Column(String(100))
    description = Column(Text)
    tags = Column(JSON, default=list)
    custom_fields = Column(JSON, default=dict)
    
    # Historia edycji
    edited_by_id = Column(String(36), ForeignKey("identities.id"))
    edited_at = Column(DateTime)
    version = Column(Integer, default=1)
    
    # Relacje
    document = relationship("Document", back_populates="document_metadata")

class DocumentRelation(Base):
    """Relacja między dokumentami - np. umowa -> faktury."""
    __tablename__ = "document_relations"
    
    id = Column(String(36), primary_key=True)
    parent_id = Column(String(36), ForeignKey("documents.id"), nullable=False)
    child_id = Column(String(36), ForeignKey("documents.id"), nullable=False)
    
    relation_type = Column(String(50))  # contract_to_invoice, correction, attachment
    description = Column(String(255))
    
    created_by_id = Column(String(36), ForeignKey("identities.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relacje
    parent = relationship("Document", foreign_keys=[parent_id], back_populates="child_relations")
    child = relationship("Document", foreign_keys=[child_id], back_populates="parent_relations")
    
    __table_args__ = (UniqueConstraint('parent_id', 'child_id', 'relation_type'),)

# ═══════════════════════════════════════════════════════════════════════════════
# DATA SOURCE - Źródło danych (import/export) per projekt
# ═══════════════════════════════════════════════════════════════════════════════

class DataSource(Base):
    """Źródło danych — konfiguracja importu lub eksportu per projekt.
    
    Jeden projekt może mieć wiele źródeł: np. email (import) + wFirma (export).
    Źródła są dziedziczone przez wszystkie zadania w projekcie.
    """
    __tablename__ = "data_sources"
    
    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    
    # Kierunek i typ
    direction = Column(Enum(SourceDirection), nullable=False)  # import | export
    source_type = Column(Enum(SourceType), nullable=False)     # email, ksef, wfirma, etc.
    
    # Dane prezentacyjne
    name = Column(String(255), nullable=False)   # np. "Email biuro@exef.pl", "wFirma eksport"
    icon = Column(String(10), default="📥")
    
    # Konfiguracja (zależna od typu)
    config = Column(JSON, default=dict)   # {host, port, username, ...} lub {api_key, format, ...}
    
    # Harmonogram
    is_active = Column(Boolean, default=True)
    auto_pull = Column(Boolean, default=False)  # automatyczny import?
    pull_interval_minutes = Column(Integer, default=60)
    
    # Ostatnia operacja
    last_run_at = Column(DateTime)
    last_run_status = Column(String(50))   # success | error | partial
    last_run_count = Column(Integer, default=0)
    last_run_error = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacje
    project = relationship("Project", back_populates="data_sources")
    import_runs = relationship("ImportRun", back_populates="source", cascade="all, delete-orphan")
    export_runs = relationship("ExportRun", back_populates="source", cascade="all, delete-orphan")


class ImportRun(Base):
    """Zapis pojedynczej operacji importu."""
    __tablename__ = "import_runs"
    
    id = Column(String(36), primary_key=True)
    source_id = Column(String(36), ForeignKey("data_sources.id"), nullable=False)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    
    # Wynik
    status = Column(String(50), default="running")  # running | success | error | partial
    docs_found = Column(Integer, default=0)
    docs_imported = Column(Integer, default=0)
    docs_skipped = Column(Integer, default=0)   # duplikaty / odrzucone
    errors = Column(JSON, default=list)
    
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)
    triggered_by_id = Column(String(36), ForeignKey("identities.id"))
    
    # Relacje
    source = relationship("DataSource", back_populates="import_runs")
    task = relationship("Task", back_populates="import_runs")


class ExportRun(Base):
    """Zapis pojedynczej operacji eksportu."""
    __tablename__ = "export_runs"
    
    id = Column(String(36), primary_key=True)
    source_id = Column(String(36), ForeignKey("data_sources.id"), nullable=False)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    
    # Wynik
    status = Column(String(50), default="running")  # running | success | error
    docs_exported = Column(Integer, default=0)
    docs_failed = Column(Integer, default=0)
    errors = Column(JSON, default=list)
    
    # Wygenerowany plik
    output_format = Column(String(50))   # csv, xml, json
    output_filename = Column(String(255))
    output_content = Column(Text)         # treść pliku (CSV/XML) — mały rozmiar
    
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)
    triggered_by_id = Column(String(36), ForeignKey("identities.id"))
    
    # Relacje
    source = relationship("DataSource", back_populates="export_runs")
    task = relationship("Task", back_populates="export_runs")
