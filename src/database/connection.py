"""
Motor de Conexión SQLAlchemy Híbrido (SQLite WAL Local / PostgreSQL Cloud en Supabase o Neon)
"""
import os
from contextlib import contextmanager
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

RAW_DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'findaffinity.db'}")

# Compatibilidad automática con URLs de Render, Railway, Supabase y Neon
if RAW_DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = RAW_DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    DATABASE_URL = RAW_DATABASE_URL

is_sqlite = DATABASE_URL.startswith("sqlite")

engine_kwargs = {"pool_pre_ping": True}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
else:
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "5"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "10"))

engine = create_engine(DATABASE_URL, **engine_kwargs)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """Context manager para uso en scripts, tests o servicios."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db(target_engine=None):
    """Crea todas las tablas en la base de datos si no existen y aplica migraciones ligeras."""
    eng = target_engine or engine
    Base.metadata.create_all(bind=eng)

    # Migración ligera automática para asegurar columnas añadidas en revisiones
    try:
        from sqlalchemy import text
        with eng.connect() as conn:
            if eng.dialect.name == "sqlite":
                res = conn.execute(text("PRAGMA table_info(tenants)")).fetchall()
                cols = [r[1] for r in res]
                if cols and "extra_blocks" not in cols:
                    conn.execute(text("ALTER TABLE tenants ADD COLUMN extra_blocks INTEGER DEFAULT 0 NOT NULL"))
                    conn.commit()
            elif eng.dialect.name == "postgresql":
                conn.execute(text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS extra_blocks INTEGER DEFAULT 0 NOT NULL"))
                conn.commit()
    except Exception:
        pass
