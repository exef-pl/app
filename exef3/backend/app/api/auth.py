"""API endpoints - autentykacja."""
from datetime import timedelta
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, get_current_identity_id
from app.core.config import settings
from app.models.models import Identity
from app.schemas.schemas import Token, IdentityCreate, IdentityResponse, IdentityUpdate

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
