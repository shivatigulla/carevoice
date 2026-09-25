"""Async SQLAlchemy engine + session factory (asyncpg over the Supabase session pooler)."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


class DatabaseNotConfigured(RuntimeError):
    pass


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().async_database_url
        if not url:
            raise DatabaseNotConfigured("DATABASE_URL is not set")
        _engine = create_async_engine(
            url,
            pool_size=5,
            max_overflow=5,
            pool_pre_ping=True,
            connect_args={"timeout": 10, "server_settings": {"application_name": "carevoice-backend"}},
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with get_sessionmaker()() as session:
        yield session


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
