"""
Punto de Entrada de la Aplicación FastAPI: Micro-SaaS Reconciliación Contable
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.v1.reconcile_api import router as v1_router
from src.api.v1.tenant_batch_api import router as tenant_batch_router
from src.api.v1.subscription_api import router as subscription_router
from src.api.v1.auth_api import router as auth_router
from src.api.v1.admin_api import router as admin_router
from src.database.connection import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from src.database.connection import get_db_context
    from src.database.seed import seed_initial_data
    try:
        with get_db_context() as db:
            seed_initial_data(db)
    except Exception as e:
        print(f"Aviso al inicializar datos semilla: {e}")
    yield


app = FastAPI(
    title="FINDAFINITY - Conciliación Contable & Desambiguación",
    description="Motor de conciliación de liquidaciones agrupadas, persistencia multi-tenant y generación de pre-asientos auditados para A3, Sage y Contasol.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api")
app.include_router(tenant_batch_router, prefix="/api")
app.include_router(subscription_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "ReconcileSaaS-Engine",
        "version": "1.0.2",
        "build": "2026.10.16-v1",
        "staging_mode": "read_only_zero_liability",
    }


# Servir Frontend Compilado en Producción
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException

_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if (_frontend_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

if (_frontend_dist / "index.html").exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi") or full_path == "health":
            raise HTTPException(status_code=404)
        target = _frontend_dist / full_path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_frontend_dist / "index.html")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
