"""
Punto de Entrada de la Aplicación FastAPI: Micro-SaaS Reconciliación Contable
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.v1.reconcile_api import router as v1_router
from src.api.v1.tenant_batch_api import router as tenant_batch_router
from src.database.connection import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "ReconcileSaaS-Engine",
        "version": "1.0.0",
        "staging_mode": "read_only_zero_liability",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
