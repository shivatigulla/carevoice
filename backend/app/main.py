"""CareVoice backend API."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import appointments, health
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import dispose_engine

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


app = FastAPI(title="CareVoice API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(appointments.router)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "carevoice-backend", "docs": "/docs", "health": "/health"}
