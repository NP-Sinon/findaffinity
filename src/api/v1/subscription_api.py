"""
Endpoints REST de Facturación, Cuotas y Suscripción (Billing & Subscriptions API)
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import Tenant, ClientCompany, ReconciliationBatch
from src.billing.pricing_plans import PLAN_CONFIGS, PlanTier, QuotaManager
from src.billing.quota_manager import (
    BillingQuotaManager,
    QuotaLimitExceeded,
    get_and_sync_tenant_consumed_tx,
    increment_tenant_consumed_tx,
)
from src.billing.stripe_service import StripeBillingService

router = APIRouter(prefix="/v1", tags=["Facturación & Suscripción"])


class UpgradeSubscriptionDTO(BaseModel):
    new_plan: Optional[str] = Field(None, json_schema_extra={"example": "PROFESSIONAL"})
    plan: Optional[str] = Field(None, json_schema_extra={"example": "PROFESSIONAL"})
    extra_blocks: int = Field(0, json_schema_extra={"example": 1})


class CreateCheckoutSessionDTO(BaseModel):
    target_plan: str = Field("PROFESSIONAL", json_schema_extra={"example": "PROFESSIONAL"})
    extra_blocks: int = Field(0, json_schema_extra={"example": 0})
    success_url: Optional[str] = Field("http://127.0.0.1:8000/?billing=success")
    cancel_url: Optional[str] = Field("http://127.0.0.1:8000/?billing=cancel")


@router.get("/pricing-plans")
def list_pricing_plans():
    """Retorna la lista de planes oficiales según el estudio de viabilidad."""
    return list(PLAN_CONFIGS.values())


@router.get("/subscription/config")
def get_stripe_public_config():
    """Retorna la clave pública de Stripe y el catálogo de productos recurrentes."""
    return StripeBillingService.get_public_config()


@router.get("/tenants/{tenant_id}/subscription")
def get_tenant_subscription(tenant_id: str, db: Session = Depends(get_db)):
    """Consulta el estado de facturación, cuotas y límites del despacho."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Despacho o empresa no encontrado.")

    clients_count = db.query(ClientCompany).filter(ClientCompany.tenant_id == tenant_id).count()
    consumed_tx = get_and_sync_tenant_consumed_tx(db, tenant)

    quota = QuotaManager.evaluate_tenant_quota(
        plan_code=tenant.plan or "FREE",
        extra_blocks=tenant.extra_blocks or 0,
        current_clients_count=clients_count,
        current_month_transactions=consumed_tx,
    )
    legacy_status = BillingQuotaManager.get_tenant_billing_status(db, tenant_id)

    return {
        **legacy_status,
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        **quota,
        "available_plans": list(PLAN_CONFIGS.values()),
    }


@router.post("/tenants/{tenant_id}/upgrade")
@router.post("/tenants/{tenant_id}/subscription/upgrade")
def upgrade_tenant_subscription(
    tenant_id: str,
    payload: UpgradeSubscriptionDTO,
    db: Session = Depends(get_db),
):
    """Actualiza el plan del despacho tras completar el flujo de Stripe Checkout / Paywall."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Despacho no encontrado.")

    raw_plan = payload.new_plan or payload.plan or "PROFESSIONAL"
    clean_plan = raw_plan.upper().strip()
    if clean_plan not in PLAN_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Plan inválido: {clean_plan}")

    tenant.plan = clean_plan
    tenant.extra_blocks = max(0, payload.extra_blocks)
    db.commit()
    db.refresh(tenant)

    legacy_status = BillingQuotaManager.get_tenant_billing_status(db, tenant_id)

    return {
        **legacy_status,
        "success": True,
        "tenant_id": tenant.id,
        "new_plan": tenant.plan,
        "plan_details": PLAN_CONFIGS.get(clean_plan),
    }


@router.post("/tenants/{tenant_id}/subscription/checkout-session")
def create_checkout_session(
    tenant_id: str,
    payload: CreateCheckoutSessionDTO,
    db: Session = Depends(get_db),
):
    """Crea una sesión de pasarela de pago (Stripe Checkout) para contratación."""
    try:
        return StripeBillingService.create_checkout_session(
            db=db,
            tenant_id=tenant_id,
            target_plan=payload.target_plan,
            extra_blocks=payload.extra_blocks,
            success_url=payload.success_url or "http://127.0.0.1:8000/?billing=success",
            cancel_url=payload.cancel_url or "http://127.0.0.1:8000/?billing=cancel",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/subscription/webhook")
def stripe_webhook(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Endpoint oficial para recibir webhooks de eventos de Stripe en producción."""
    try:
        return StripeBillingService.handle_webhook_event(db=db, event_payload=payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error procesando webhook: {str(e)}")
