"""
Gestor de Cuotas, Facturación y Límites de Suscripción para Despachos
"""
from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from src.database.models import Tenant, ClientCompany, ReconciliationBatch
from src.billing.pricing_plans import (
    PLAN_CONFIGS,
    PlanTier,
    EXTRA_BLOCK_PRICE_EUR,
    EXTRA_BLOCK_CLIENTS,
    EXTRA_BLOCK_TRANSACTIONS,
)


class QuotaLimitExceeded(Exception):
    """Excepción cuando el despacho rebasa el límite de clientes o transacciones contratado."""
    pass


class BillingQuotaManager:
    """Controlador de límites y tarificación por despacho."""

    @classmethod
    def get_tenant_billing_status(cls, db: Session, tenant_id: str) -> Dict[str, Any]:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise ValueError(f"Despacho {tenant_id} no encontrado.")

        plan_key = tenant.plan.upper() if tenant.plan else PlanTier.PROFESSIONAL.value
        config = PLAN_CONFIGS.get(plan_key, PLAN_CONFIGS[PlanTier.PROFESSIONAL.value])

        extra_blocks = getattr(tenant, "extra_blocks", 0) or 0
        total_max_clients = config["max_clients"] + (extra_blocks * EXTRA_BLOCK_CLIENTS)
        total_max_txs = config["max_monthly_transactions"] + (extra_blocks * EXTRA_BLOCK_TRANSACTIONS)

        # Contar clientes actuales
        active_clients_count = db.query(func.count(ClientCompany.id)).filter(ClientCompany.tenant_id == tenant_id).scalar() or 0

        # Contar transacciones procesadas en el mes en curso
        now = datetime.now(timezone.utc)
        monthly_txs_count = (
            db.query(func.coalesce(func.sum(ReconciliationBatch.total_movements), 0))
            .filter(
                ReconciliationBatch.tenant_id == tenant_id,
                extract("year", ReconciliationBatch.created_at) == now.year,
                extract("month", ReconciliationBatch.created_at) == now.month,
            )
            .scalar()
            or 0
        )

        total_price_eur = config["price_eur_month"] + (extra_blocks * EXTRA_BLOCK_PRICE_EUR)

        client_usage_pct = round((active_clients_count / max(1, total_max_clients)) * 100, 1)
        tx_usage_pct = round((monthly_txs_count / max(1, total_max_txs)) * 100, 1)

        return {
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "plan_tier": config["tier"],
            "plan_name": config["name"],
            "base_price_eur": config["price_eur_month"],
            "extra_blocks_count": extra_blocks,
            "extra_blocks_cost_eur": extra_blocks * EXTRA_BLOCK_PRICE_EUR,
            "total_monthly_fee_eur": total_price_eur,
            "clients_count": active_clients_count,
            "max_clients_limit": total_max_clients,
            "client_usage_percent": client_usage_pct,
            "can_add_client": active_clients_count < total_max_clients,
            "monthly_transactions_count": monthly_txs_count,
            "max_monthly_transactions_limit": total_max_txs,
            "transactions_usage_percent": tx_usage_pct,
            "can_process_more_transactions": monthly_txs_count < total_max_txs,
            "supported_gateways": config["supported_gateways"],
            "supported_erps": config["supported_erps"],
            "has_sha256_audit": config["has_sha256_audit"],
        }

    @classmethod
    def assert_can_add_client(cls, db: Session, tenant_id: str):
        status = cls.get_tenant_billing_status(db, tenant_id)
        if not status["can_add_client"]:
            raise QuotaLimitExceeded(
                f"Límite de empresas clientes alcanzado ({status['clients_count']}/{status['max_clients_limit']}). "
                f"Adquiera un bloque adicional (+10 empresas por {EXTRA_BLOCK_PRICE_EUR} €/mes) o actualice a un plan superior."
            )

    @classmethod
    def assert_can_process_transactions(cls, db: Session, tenant_id: str, new_txs_count: int = 1):
        status = cls.get_tenant_billing_status(db, tenant_id)
        projected = status["monthly_transactions_count"] + new_txs_count
        if projected > status["max_monthly_transactions_limit"]:
            raise QuotaLimitExceeded(
                f"Límite mensual de transacciones excedido ({status['monthly_transactions_count']} actuales + {new_txs_count} nuevas > {status['max_monthly_transactions_limit']} límite). "
                f"Adquiera un bloque adicional (+5.000 transacciones por {EXTRA_BLOCK_PRICE_EUR} €/mes)."
            )

    @classmethod
    def update_tenant_plan(
        cls, db: Session, tenant_id: str, new_plan: str, extra_blocks: int = 0
    ) -> Dict[str, Any]:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise ValueError("Despacho no encontrado.")

        plan_upper = new_plan.upper()
        if plan_upper not in PLAN_CONFIGS:
            raise ValueError(f"Plan desconocido: {new_plan}. Opciones: {list(PLAN_CONFIGS.keys())}")

        tenant.plan = plan_upper
        if hasattr(tenant, "extra_blocks"):
            tenant.extra_blocks = max(0, extra_blocks)
        db.commit()
        db.refresh(tenant)
        return cls.get_tenant_billing_status(db, tenant_id)

    @classmethod
    def create_simulated_checkout_session(
        cls,
        db: Session,
        tenant_id: str,
        target_plan: str,
        extra_blocks: int = 0,
        success_url: str = "http://127.0.0.1:5173/?billing=success",
        cancel_url: str = "http://127.0.0.1:5173/?billing=cancelled",
    ) -> Dict[str, Any]:
        """Simula una sesión oficial de Stripe Checkout para contratación/ampliación del SaaS."""
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise ValueError("Despacho no encontrado.")

        config = PLAN_CONFIGS.get(target_plan.upper(), PLAN_CONFIGS[PlanTier.PROFESSIONAL.value])
        amount_eur = config["price_eur_month"] + (extra_blocks * EXTRA_BLOCK_PRICE_EUR)

        session_id = f"cs_test_{tenant.fiscal_id}_{int(datetime.now(timezone.utc).timestamp())}"
        checkout_url = f"https://checkout.stripe.com/pay/{session_id}?target_plan={target_plan}&amount={amount_eur}"

        return {
            "checkout_session_id": session_id,
            "checkout_url": checkout_url,
            "currency": "EUR",
            "amount_total_eur": amount_eur,
            "plan_name": config["name"],
            "extra_blocks": extra_blocks,
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
