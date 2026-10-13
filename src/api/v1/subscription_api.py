"""
Endpoints REST de Facturación, Cuotas y Suscripción (Billing & Subscriptions API)
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.billing.pricing_plans import PLAN_CONFIGS, PlanTier
from src.billing.quota_manager import BillingQuotaManager, QuotaLimitExceeded

router = APIRouter(prefix="/v1", tags=["Facturación & Suscripción"])


class UpgradeSubscriptionDTO(BaseModel):
    new_plan: str = Field(..., json_schema_extra={"example": "PROFESSIONAL"})
    extra_blocks: int = Field(0, json_schema_extra={"example": 1})


class CreateCheckoutSessionDTO(BaseModel):
    target_plan: str = Field("PROFESSIONAL", json_schema_extra={"example": "PROFESSIONAL"})
    extra_blocks: int = Field(0, json_schema_extra={"example": 0})
    success_url: Optional[str] = Field("http://127.0.0.1:5173/?billing=success")
    cancel_url: Optional[str] = Field("http://127.0.0.1:5173/?billing=cancel")


@router.get("/pricing-plans")
def list_pricing_plans():
    """Retorna la lista de planes oficiales según el estudio de viabilidad."""
    return list(PLAN_CONFIGS.values())


@router.get("/tenants/{tenant_id}/subscription")
def get_tenant_subscription(tenant_id: str, db: Session = Depends(get_db)):
    """Consulta el estado de facturación, cuotas y límites del despacho."""
    try:
        return BillingQuotaManager.get_tenant_billing_status(db, tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/tenants/{tenant_id}/subscription/upgrade")
def upgrade_tenant_subscription(
    tenant_id: str,
    payload: UpgradeSubscriptionDTO,
    db: Session = Depends(get_db),
):
    """Actualiza el plan o añade paquetes suplementarios de 25€."""
    try:
        return BillingQuotaManager.update_tenant_plan(
            db=db,
            tenant_id=tenant_id,
            new_plan=payload.new_plan,
            extra_blocks=payload.extra_blocks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/subscription/checkout-session")
def create_checkout_session(
    tenant_id: str,
    payload: CreateCheckoutSessionDTO,
    db: Session = Depends(get_db),
):
    """Crea una sesión de pasarela de pago (Stripe Checkout) para contratación."""
    try:
        return BillingQuotaManager.create_simulated_checkout_session(
            db=db,
            tenant_id=tenant_id,
            target_plan=payload.target_plan,
            extra_blocks=payload.extra_blocks,
            success_url=payload.success_url or "http://127.0.0.1:5173/?billing=success",
            cancel_url=payload.cancel_url or "http://127.0.0.1:5173/?billing=cancel",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
