"""
API de Administración Global de la Plataforma FINDAFINITY
Permite al Administrador (SUPERADMIN / ADMIN) visualizar todas las compañías
y despachos registrados, su tipo de licencia, cuotas, usuarios y volumen gestionado.
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import Tenant, User, UserRole, ClientCompany, ReconciliationBatch
from src.auth.dependencies import get_current_user, require_roles
from src.billing.pricing_plans import PLAN_CONFIGS

router = APIRouter(prefix="/v1/admin", tags=["Administración Global & Licencias"])


class CompanyAdminDTO(BaseModel):
    id: str
    name: str
    fiscal_id: str
    email: str
    plan: str
    plan_name: str
    monthly_price_eur: float
    extra_blocks: int
    users_count: int
    clients_count: int
    batches_count: int
    total_volume_eur: float
    max_clients: int
    max_transactions_month: int
    created_at: Optional[datetime] = None
    status: str = "ACTIVE"


class UpdateCompanyPlanDTO(BaseModel):
    plan: str = Field(..., json_schema_extra={"example": "PROFESSIONAL"})
    extra_blocks: Optional[int] = Field(0, ge=0)


class PlatformStatsDTO(BaseModel):
    total_companies: int
    total_users: int
    total_batches: int
    total_volume_eur: float
    plan_distribution: Dict[str, int]


@router.get("/companies", response_model=List[CompanyAdminDTO])
def list_all_registered_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.SUPERADMIN])),
):
    """
    Lista todas las empresas y despachos registrados en el sistema
    con sus métricas operativas y tipo de licencia/plan contratado.
    Exclusivo para la cuenta SUPERADMIN de la plataforma.
    """
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    results = []

    for t in tenants:
        plan_key = t.plan.upper() if t.plan else "STARTER"
        plan_spec = PLAN_CONFIGS.get(plan_key, PLAN_CONFIGS["STARTER"])

        users_count = db.query(User).filter(User.tenant_id == t.id).count()
        clients_count = db.query(ClientCompany).filter(ClientCompany.tenant_id == t.id).count()
        batches = db.query(ReconciliationBatch).filter(ReconciliationBatch.tenant_id == t.id).all()
        batches_count = len(batches)
        total_volume_cents = sum(b.total_volume_cents or 0 for b in batches)

        extra_b = t.extra_blocks or 0
        effective_max_clients = plan_spec["max_clients"] + (extra_b * 10)
        effective_max_tx = plan_spec["max_monthly_transactions"] + (extra_b * 5000)
        total_monthly_price = plan_spec["price_eur_month"] + (extra_b * 25.0)

        results.append(
            CompanyAdminDTO(
                id=t.id,
                name=t.name,
                fiscal_id=t.fiscal_id,
                email=t.email,
                plan=plan_key,
                plan_name=plan_spec["name"],
                monthly_price_eur=total_monthly_price,
                extra_blocks=extra_b,
                users_count=users_count,
                clients_count=clients_count,
                batches_count=batches_count,
                total_volume_eur=round(total_volume_cents / 100.0, 2),
                max_clients=effective_max_clients,
                max_transactions_month=effective_max_tx,
                created_at=t.created_at,
                status="ACTIVE",
            )
        )

    return results


@router.put("/companies/{tenant_id}/plan", response_model=CompanyAdminDTO)
def update_company_plan(
    tenant_id: str,
    payload: UpdateCompanyPlanDTO,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.SUPERADMIN])),
):
    """Permite al SUPERADMIN modificar directamente el plan y cuota de una compañía."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compañía o despacho no encontrado.",
        )

    clean_plan = payload.plan.upper().strip()
    if clean_plan not in PLAN_CONFIGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plan '{clean_plan}' no reconocido. Planes válidos: {list(PLAN_CONFIGS.keys())}",
        )

    tenant.plan = clean_plan
    if payload.extra_blocks is not None:
        tenant.extra_blocks = payload.extra_blocks

    db.commit()
    db.refresh(tenant)

    plan_spec = PLAN_CONFIGS[clean_plan]
    users_count = db.query(User).filter(User.tenant_id == tenant.id).count()
    clients_count = db.query(ClientCompany).filter(ClientCompany.tenant_id == tenant.id).count()
    batches = db.query(ReconciliationBatch).filter(ReconciliationBatch.tenant_id == tenant.id).all()
    total_volume_cents = sum(b.total_volume_cents or 0 for b in batches)

    extra_b = tenant.extra_blocks or 0
    return CompanyAdminDTO(
        id=tenant.id,
        name=tenant.name,
        fiscal_id=tenant.fiscal_id,
        email=tenant.email,
        plan=clean_plan,
        plan_name=plan_spec["name"],
        monthly_price_eur=plan_spec["price_eur_month"] + (extra_b * 25.0),
        extra_blocks=extra_b,
        users_count=users_count,
        clients_count=clients_count,
        batches_count=len(batches),
        total_volume_eur=round(total_volume_cents / 100.0, 2),
        max_clients=plan_spec["max_clients"] + (extra_b * 10),
        max_transactions_month=plan_spec["max_monthly_transactions"] + (extra_b * 5000),
        created_at=tenant.created_at,
        status="ACTIVE",
    )


@router.get("/stats", response_model=PlatformStatsDTO)
def get_platform_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.SUPERADMIN])),
):
    """Estadísticas globales de la plataforma SaaS exclusivas para SUPERADMIN."""
    total_companies = db.query(Tenant).count()
    total_users = db.query(User).count()
    batches = db.query(ReconciliationBatch).all()
    total_batches = len(batches)
    total_volume_cents = sum(b.total_volume_cents or 0 for b in batches)

    distribution: Dict[str, int] = {}
    for t in db.query(Tenant).all():
        p = t.plan.upper() if t.plan else "STARTER"
        distribution[p] = distribution.get(p, 0) + 1

    return PlatformStatsDTO(
        total_companies=total_companies,
        total_users=total_users,
        total_batches=total_batches,
        total_volume_eur=round(total_volume_cents / 100.0, 2),
        plan_distribution=distribution,
    )
