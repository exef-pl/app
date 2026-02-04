"""Konfiguracja aplikacji EXEF."""
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    APP_NAME: str = "EXEF"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite:///./exef.db"
    SECRET_KEY: str = "exef-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 dni
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
