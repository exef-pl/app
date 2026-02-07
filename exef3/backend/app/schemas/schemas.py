"""Pydantic schemas dla API."""
from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field
from enum import Enum

# ═══════════════════════════════════════════════════════════════════════════════
# ENUMS
# ═══════════════════════════════════════════════════════════════════════════════

class EntityType(str, Enum):
    JDG = "jdg"
    MALZENSTWO = "malzenstwo"
    SPOLKA = "spolka"
    ORGANIZACJA = "organizacja"

class ProjectType(str, Enum):
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

class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPORTED = "exported"

class DocumentStatus(str, Enum):
    NEW = "new"
    DESCRIBED = "described"
    APPROVED = "approved"
    EXPORTED = "exported"

class AuthorizationRole(str, Enum):
    OWNER = "owner"
    ACCOUNTANT = "accountant"
    ASSISTANT = "assistant"
    VIEWER = "viewer"

# ═══════════════════════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════════════════════

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    identity_id: str

# Magic Link Authentication
class MagicLinkRequest(BaseModel):
    email: EmailStr

class MagicLinkResponse(BaseModel):
    message: str
    email: str

class MagicLinkLogin(BaseModel):
    token: str

# ═══════════════════════════════════════════════════════════════════════════════
# IDENTITY (Tożsamość)
# ═══════════════════════════════════════════════════════════════════════════════

class IdentityCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nip: Optional[str] = Field(None, pattern=r"^\d{10}$")
    pesel: Optional[str] = Field(None, pattern=r"^\d{11}$")

class IdentityUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nip: Optional[str] = None
    avatar: Optional[str] = None
    color: Optional[str] = None

class IdentityResponse(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    nip: Optional[str]
    pesel: Optional[str]
    avatar: Optional[str]
    color: Optional[str]
    is_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class IdentityBrief(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    avatar: Optional[str]
    color: Optional[str]
    
    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════════════════════════
# ENTITY (Podmiot)
# ═══════════════════════════════════════════════════════════════════════════════

class EntityCreate(BaseModel):
    name: str
    type: EntityType
    nip: Optional[str] = Field(None, pattern=r"^\d{10}$")
    regon: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_postal: Optional[str] = None
    icon: Optional[str] = "🏢"
    color: Optional[str] = "#3b82f6"

class EntityUpdate(BaseModel):
    name: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_postal: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_archived: Optional[bool] = None

class EntityMemberCreate(BaseModel):
    identity_id: str
    role: AuthorizationRole = AuthorizationRole.VIEWER
    can_manage_projects: bool = False
    can_invite_members: bool = False
    can_export: bool = False

class EntityMemberResponse(BaseModel):
    id: str
    identity: IdentityBrief
    role: AuthorizationRole
    can_manage_projects: bool
    can_invite_members: bool
    can_export: bool
    joined_at: datetime
    
    class Config:
        from_attributes = True

class EntityResponse(BaseModel):
    id: str
    name: str
    type: EntityType
    nip: Optional[str]
    regon: Optional[str]
    address_street: Optional[str]
    address_city: Optional[str]
    address_postal: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    owner_id: str
    is_archived: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class EntityDetail(EntityResponse):
    members: List[EntityMemberResponse] = []
    projects_count: int = 0

# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT (Projekt)
# ═══════════════════════════════════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    entity_id: str
    name: str
    description: Optional[str] = None
    type: ProjectType
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    year: Optional[int] = None
    icon: Optional[str] = "📊"
    color: Optional[str] = "#3b82f6"
    categories: Optional[List[str]] = None
    tags: Optional[List[str]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    categories: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None

class ProjectAuthorizationCreate(BaseModel):
    identity_id: str
    role: AuthorizationRole = AuthorizationRole.VIEWER
    can_view: bool = True
    can_describe: bool = False
    can_approve: bool = False
    can_export: bool = False
    valid_until: Optional[datetime] = None

class ProjectAuthorizationResponse(BaseModel):
    id: str
    identity: IdentityBrief
    role: AuthorizationRole
    can_view: bool
    can_describe: bool
    can_approve: bool
    can_export: bool
    valid_from: datetime
    valid_until: Optional[datetime]
    
    class Config:
        from_attributes = True

class ProjectResponse(BaseModel):
    id: str
    entity_id: str
    name: str
    description: Optional[str]
    type: ProjectType
    period_start: Optional[date]
    period_end: Optional[date]
    year: Optional[int]
    icon: Optional[str]
    color: Optional[str]
    categories: Optional[List[str]]
    tags: Optional[List[str]]
    is_active: bool
    is_archived: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class ProjectDetail(ProjectResponse):
    entity: EntityResponse
    tasks_count: int = 0
    authorizations: List[ProjectAuthorizationResponse] = []

class ProjectWithStats(ProjectResponse):
    entity_name: str
    docs_total: int = 0
    docs_described: int = 0
    docs_approved: int = 0
    docs_exported: int = 0
    my_role: Optional[AuthorizationRole] = None

# ═══════════════════════════════════════════════════════════════════════════════
# TASK (Zadanie)
# ═══════════════════════════════════════════════════════════════════════════════

class TaskCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "📋"
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    deadline: Optional[date] = None

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[TaskStatus] = None
    deadline: Optional[date] = None
    assigned_to_id: Optional[str] = None

class AssigneeInfo(BaseModel):
    id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class TaskResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    period_start: Optional[date]
    period_end: Optional[date]
    deadline: Optional[date]
    status: TaskStatus
    import_status: Optional[str] = "not_started"
    describe_status: Optional[str] = "not_started"
    export_status: Optional[str] = "not_started"
    assigned_to_id: Optional[str] = None
    assigned_to: Optional[AssigneeInfo] = None
    docs_total: int
    docs_described: int
    docs_approved: int
    docs_exported: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT (Dokument)
# ═══════════════════════════════════════════════════════════════════════════════

class DocumentCreate(BaseModel):
    task_id: str
    doc_type: str = "invoice"
    number: Optional[str] = None
    contractor_name: Optional[str] = None
    contractor_nip: Optional[str] = None
    amount_net: Optional[float] = None
    amount_vat: Optional[float] = None
    amount_gross: Optional[float] = None
    currency: str = "PLN"
    document_date: Optional[date] = None
    source: str = "manual"

class DocumentMetadataUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_fields: Optional[dict] = None

class DocumentMetadataResponse(BaseModel):
    id: str
    category: Optional[str]
    description: Optional[str]
    tags: Optional[List[str]]
    custom_fields: Optional[dict]
    edited_by_id: Optional[str]
    edited_at: Optional[datetime]
    version: int
    
    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: str
    task_id: str
    doc_type: str
    number: Optional[str]
    contractor_name: Optional[str]
    contractor_nip: Optional[str]
    amount_net: Optional[float]
    amount_vat: Optional[float]
    amount_gross: Optional[float]
    currency: str
    document_date: Optional[date]
    doc_id: Optional[str] = None
    source: Optional[str]
    status: DocumentStatus
    created_at: datetime
    document_metadata: Optional[DocumentMetadataResponse] = Field(None, alias="document_metadata", serialization_alias="metadata")
    
    class Config:
        from_attributes = True
        populate_by_name = True

class DuplicateDocumentResponse(DocumentResponse):
    project_id: str

class DocumentRelationCreate(BaseModel):
    parent_id: str
    child_id: str
    relation_type: str = "related"
    description: Optional[str] = None

class DocumentRelationResponse(BaseModel):
    id: str
    parent_id: str
    child_id: str
    relation_type: str
    description: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

class DashboardStats(BaseModel):
    entities_count: int
    projects_count: int
    tasks_pending: int
    docs_to_describe: int
    docs_to_approve: int
