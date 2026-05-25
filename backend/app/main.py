from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings
from app.core.database import check_db_connection, init_db
from app.core.logging_config import setup_logging

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

setup_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


_cors_origins = settings.get_cors_origins()
_allow_credentials = "*" not in _cors_origins

app = FastAPI(
    title=settings.api_title,
    description=settings.api_description,
    version=settings.api_version,
    lifespan=lifespan,
)

limiter = Limiter(key_func=get_remote_address)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
@limiter.limit("5/minute")
async def root():
    return {
        "message": settings.api_title,
        "version": settings.api_version,
        "status": "running",
        "env": settings.app_env,
    }


@app.get("/health")
@limiter.limit("5/minute")
async def health_check():
    db_ok = check_db_connection()
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
    }
