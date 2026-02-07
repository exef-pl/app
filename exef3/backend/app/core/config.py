"""Konfiguracja aplikacji EXEF."""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List, Optional

class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "EXEF3"
    APP_NAME: str = "EXEF3"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "sqlite:///./data/exef.db"
    
    # Security
    SECRET_KEY: str = "exef-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3003", "http://127.0.0.1:3003"]
    
    # Per-entity database
    USE_ENTITY_DB: bool = False  # Toggle per-entity DB separation
    ENTITY_DB_DIR: str = "./data/entities"
    ENTITY_DB_PATH_TEMPLATE: str = "./data/entities/{nip}.db"
    ENTITY_DB_URL_TEMPLATE: str = "sqlite:///./data/entities/{nip}.db"
    ENTITY_REMOTE_DB_URL: Optional[str] = None
    ENTITY_SYNC_ENABLED: bool = False
    ENTITY_SYNC_DIRECTION: str = "local_to_remote"
    ENTITY_SYNC_INTERVAL_MINUTES: int = 60
    
    # Email
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = False
    FROM_EMAIL: str = "noreply@exef3.local"
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra fields from .env

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
