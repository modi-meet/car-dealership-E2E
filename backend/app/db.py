from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.settings import settings


def _url(raw: str) -> str:
    # neon and render hand out postgres:// urls, sqlalchemy wants to know the driver
    for old in ("postgres://", "postgresql://"):
        if raw.startswith(old):
            return "postgresql+psycopg://" + raw[len(old):]
    return raw


URL = _url(settings.database_url)
# sqlite needs this when fastapi hops threads
_args = {"check_same_thread": False} if URL.startswith("sqlite") else {}
# pre_ping because serverless postgres drops idle connections
engine = create_engine(URL, connect_args=_args, pool_pre_ping=True)


def init_db() -> None:
    from app import models  # noqa: F401  registers the tables

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
