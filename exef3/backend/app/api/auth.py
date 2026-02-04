"""API endpoints - autentykacja."""
from datetime import timedelta, datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import secrets

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, get_current_identity_id
from app.core.config import settings
from app.core.email import email_service
from app.models.models import Identity
from app.models.magic_link import MagicLink
from app.schemas.schemas import (
    Token, IdentityCreate, IdentityResponse, IdentityUpdate,
    MagicLinkRequest, MagicLinkResponse, MagicLinkLogin
)

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=IdentityResponse)
def register(data: IdentityCreate, db: Session = Depends(get_db)):
    """Rejestracja nowej tożsamości."""
    # Sprawdź czy email już istnieje
    if db.query(Identity).filter(Identity.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email już zarejestrowany")
    
    # Sprawdź czy PESEL już istnieje
    if data.pesel and db.query(Identity).filter(Identity.pesel == data.pesel).first():
        raise HTTPException(status_code=400, detail="PESEL już zarejestrowany")
    
    identity = Identity(
        id=str(uuid4()),
        email=data.email,
        password_hash=get_password_hash(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
        nip=data.nip,
        pesel=data.pesel,
        avatar=(data.first_name[0] if data.first_name else "") + (data.last_name[0] if data.last_name else ""),
    )
    db.add(identity)
    db.commit()
    db.refresh(identity)
    return identity

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Logowanie - zwraca JWT token."""
    identity = db.query(Identity).filter(Identity.email == form_data.username).first()
    if not identity or not verify_password(form_data.password, identity.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy email lub hasło",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": identity.id})
    return Token(access_token=access_token)

@router.get("/me", response_model=IdentityResponse)
def get_me(identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Pobiera dane zalogowanej tożsamości."""
    identity = db.query(Identity).filter(Identity.id == identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")
    return identity

@router.patch("/me", response_model=IdentityResponse)
def update_me(data: IdentityUpdate, identity_id: str = Depends(get_current_identity_id), db: Session = Depends(get_db)):
    """Aktualizuje dane zalogowanej tożsamości."""
    identity = db.query(Identity).filter(Identity.id == identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Tożsamość nie znaleziona")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(identity, key, value)
    
    db.commit()
    db.refresh(identity)
    return identity

# Magic Link Authentication
@router.post("/magic-link/request", response_model=MagicLinkResponse)
async def request_magic_link(data: MagicLinkRequest, request: Request, db: Session = Depends(get_db)):
    """Request magic link for passwordless login."""
    email = data.email
    
    # Check if user exists
    identity = db.query(Identity).filter(Identity.email == email).first()
    if not identity:
        # For security, don't reveal if email exists or not
        return MagicLinkResponse(
            message="Jeśli konto istnieje, link logowania został wysłany",
            email=email
        )
    
    # Generate magic link token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    # Save magic link to database
    magic_link = MagicLink(
        id=str(uuid4()),
        email=email,
        token=token,
        expires_at=expires_at
    )
    db.add(magic_link)
    db.commit()
    
    # Build magic link URL
    base_url = f"{request.url.scheme}://{request.url.netloc}"
    magic_link_url = f"{base_url}{settings.API_V1_STR}/auth/magic-link?token={token}"
    
    # Send email
    email_sent = await email_service.send_magic_link(email, magic_link_url)
    
    if email_sent:
        return MagicLinkResponse(
            message="Link logowania został wysłany na adres email",
            email=email
        )
    else:
        raise HTTPException(
            status_code=500,
            detail="Błąd podczas wysyłania emaila"
        )

@router.post("/magic-link/login", response_model=Token)
def login_with_magic_link(data: MagicLinkLogin, db: Session = Depends(get_db)):
    """Login using magic link token."""
    token = data.token
    
    # Find magic link
    magic_link = db.query(MagicLink).filter(
        MagicLink.token == token,
        MagicLink.is_used == False
    ).first()
    
    if not magic_link:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy lub wygasły link logowania"
        )
    
    if magic_link.is_expired():
        raise HTTPException(
            status_code=400,
            detail="Link logowania wygasł"
        )
    
    # Find user
    identity = db.query(Identity).filter(Identity.email == magic_link.email).first()
    if not identity:
        raise HTTPException(
            status_code=404,
            detail="Konto nie zostało znalezione"
        )
    
    # Mark magic link as used
    magic_link.is_used = True
    magic_link.used_at = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": identity.id})
    return Token(access_token=access_token)

@router.get("/magic-link")
def verify_magic_link(token: str, db: Session = Depends(get_db)):
    """Verify magic link (for frontend validation)."""
    magic_link = db.query(MagicLink).filter(
        MagicLink.token == token,
        MagicLink.is_used == False
    ).first()
    
    if not magic_link or magic_link.is_expired():
        return {"valid": False, "message": "Nieprawidłowy lub wygasły link"}
    
    return {"valid": True, "email": magic_link.email}
