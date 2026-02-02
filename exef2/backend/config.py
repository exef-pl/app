"""EXEF Configuration Management"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    # App
    app_name: str = "EXEF"
    app_version: str = "1.1.0"
    debug: bool = False
    
    # Database
    db_path: str = "/data/exef.db"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # KSeF (for future use)
    ksef_env: str = "demo"  # demo | prod
    ksef_nip: Optional[str] = None
    ksef_token: Optional[str] = None
    
    # Email (for future use)
    imap_host: Optional[str] = None
    imap_port: int = 993
    imap_user: Optional[str] = None
    imap_pass: Optional[str] = None
    
    # OCR (for future use)
    ocr_enabled: bool = False
    ocr_api_key: Optional[str] = None
    
    # Limits
    max_file_size_mb: int = 10
    max_documents_per_profile: int = 10000
    
    class Config:
        env_file = ".env"
        env_prefix = "EXEF_"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

# Quick access
settings = get_settings()
