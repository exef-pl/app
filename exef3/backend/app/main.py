"""EXEF - Document Flow Engine API."""
import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db
from app.core.entity_db import entity_db_manager

# ── Logging config ──
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
# Suppress noisy libs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("multipart.multipart").setLevel(logging.WARNING)
logging.getLogger("passlib").setLevel(logging.WARNING)
from app.api import auth, entities, projects, tasks, firm, templates, sources, sources_flow

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicjalizacja przy starcie aplikacji."""
    init_db()
    yield

app = FastAPI(
    title=settings.APP_NAME,
    description="Document Flow Engine - System zarządzania dokumentami księgowymi",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji ograniczyć do konkretnych domen
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Entity DB session cleanup middleware
@app.middleware("http")
async def entity_db_cleanup_middleware(request: Request, call_next):
    response = await call_next(request)
    entity_db_manager.cleanup_sessions()
    return response

# Routery API
app.include_router(auth.router, prefix="/api/v1")
app.include_router(entities.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(firm.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(sources.router, prefix="/api/v1")
app.include_router(sources_flow.router, prefix="/api/v1")

@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return JSON with CORS headers."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) if settings.DEBUG else "Wewnętrzny błąd serwera"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )
