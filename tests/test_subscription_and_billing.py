"""
Test Suite: Módulo de Suscripción, Monetización y Cuotas de Uso (Pricing del PDF)
Verifica los planes de precios oficiales, control de cuotas por despacho y sesiones Stripe Checkout.
"""
import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from src.main import app
from src.database.connection import Base, get_db
from src.database.repository import ReconciliationRepository
from src.database.models import Tenant, ClientCompany
from src.billing.pricing_plans import (
    PLAN_CONFIGS,
    PlanTier,
    EXTRA_BLOCK_PRICE_EUR,
    EXTRA_BLOCK_CLIENTS,
    EXTRA_BLOCK_TRANSACTIONS,
)
from src.billing.quota_manager import BillingQuotaManager, QuotaLimitExceeded

TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def client_api(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_pricing_plans_specification_matches_pdf():
    """Verifica que las especificaciones de precios coincidan exactamente con la Sección 4 del PDF."""
    starter = PLAN_CONFIGS[PlanTier.STARTER.value]
    assert starter["price_eur_month"] == 49.0
    assert starter["max_clients"] == 10
    assert starter["max_monthly_transactions"] == 2500
    assert "Norma43" in starter["supported_gateways"]

    pro = PLAN_CONFIGS[PlanTier.PROFESSIONAL.value]
    assert pro["price_eur_month"] == 119.0
    assert pro["max_clients"] == 30
    assert pro["max_monthly_transactions"] == 12000
    assert "Stripe" in pro["supported_gateways"]
    assert "Redsys" in pro["supported_gateways"]
    assert pro["has_sha256_audit"] is True

    pyme = PLAN_CONFIGS[PlanTier.PYME_DIRECTO.value]
    assert pyme["price_eur_month"] == 39.0
    assert pyme["max_clients"] == 1
    assert pyme["max_monthly_transactions"] == 2000

    assert EXTRA_BLOCK_PRICE_EUR == 25.0
    assert EXTRA_BLOCK_CLIENTS == 10
    assert EXTRA_BLOCK_TRANSACTIONS == 5000


def test_tenant_billing_status_and_economics(db_session):
    """Verifica el cálculo del estado de suscripción y métricas de cuota."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Auditoría Fiscal Costa del Sol SLP",
        fiscal_id="B-29001122",
        email="contacto@costasol.es",
        plan="STARTER",
    )

    # 1. Estado inicial sin clientes
    status = BillingQuotaManager.get_tenant_billing_status(db_session, tenant.id)
    assert status["plan_tier"] == "STARTER"
    assert status["base_price_eur"] == 49.0
    assert status["total_monthly_fee_eur"] == 49.0
    assert status["clients_count"] == 0
    assert status["max_clients_limit"] == 10
    assert status["can_add_client"] is True
    assert status["monthly_transactions_count"] == 0
    assert status["max_monthly_transactions_limit"] == 2500


def test_client_quota_limit_enforcement(db_session):
    """Verifica que no se puedan superar los clientes contratados sin adquirir bloques adicionales."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Asesoría Velázquez SLP",
        fiscal_id="B-28990011",
        email="velazquez@asesoria.es",
        plan="STARTER",  # Límite: 10 clientes
    )

    # Crear 10 clientes (límite máximo de Starter)
    for i in range(10):
        ReconciliationRepository.create_client(
            db=db_session,
            tenant_id=tenant.id,
            name=f"Cliente {i+1} SL",
            fiscal_id=f"B-{10000000+i}",
        )

    status = BillingQuotaManager.get_tenant_billing_status(db_session, tenant.id)
    assert status["clients_count"] == 10
    assert status["can_add_client"] is False

    # Intentar añadir el cliente 11 debe lanzar QuotaLimitExceeded
    with pytest.raises(QuotaLimitExceeded) as exc_info:
        BillingQuotaManager.assert_can_add_client(db_session, tenant.id)
    assert "Límite de empresas clientes alcanzado" in str(exc_info.value)

    # Adquirir 1 bloque extra (+10 empresas por 25€)
    updated_status = BillingQuotaManager.update_tenant_plan(
        db=db_session,
        tenant_id=tenant.id,
        new_plan="STARTER",
        extra_blocks=1,
    )
    assert updated_status["max_clients_limit"] == 20
    assert updated_status["total_monthly_fee_eur"] == 49.0 + 25.0
    assert updated_status["can_add_client"] is True

    # Ahora sí permite añadir el cliente 11
    BillingQuotaManager.assert_can_add_client(db_session, tenant.id)
    c11 = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Cliente 11 SL",
        fiscal_id="B-10000011",
    )
    assert c11.id is not None


def test_transaction_quota_limit_enforcement(db_session):
    """Verifica la validación de transacciones mensuales frente a la cuota contratada."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Gestoría Rápida SLP",
        fiscal_id="B-41882233",
        email="rapida@gestoria.es",
        plan="STARTER",  # Límite: 2500 tx
    )

    # Intentar procesar 3.000 transacciones debe ser rechazado
    with pytest.raises(QuotaLimitExceeded) as exc:
        BillingQuotaManager.assert_can_process_transactions(db_session, tenant.id, new_txs_count=3000)
    assert "Límite mensual de transacciones excedido" in str(exc.value)

    # Procesar 500 transacciones es permitido
    BillingQuotaManager.assert_can_process_transactions(db_session, tenant.id, new_txs_count=500)


def test_plan_upgrade_and_checkout_session(db_session):
    """Verifica la subida de plan a Professional y la generación de sesión de pago Stripe Checkout."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho Moderno SLP",
        fiscal_id="B-50112233",
        email="moderno@despacho.es",
        plan="STARTER",
    )

    # Generar checkout session para plan Professional
    checkout = BillingQuotaManager.create_simulated_checkout_session(
        db=db_session,
        tenant_id=tenant.id,
        target_plan="PROFESSIONAL",
        extra_blocks=0,
    )
    assert "cs_test" in checkout["checkout_session_id"]
    assert checkout["amount_total_eur"] == 119.0
    assert "https://checkout.stripe.com" in checkout["checkout_url"]

    # Aplicar upgrade
    upgraded = BillingQuotaManager.update_tenant_plan(
        db=db_session,
        tenant_id=tenant.id,
        new_plan="PROFESSIONAL",
        extra_blocks=0,
    )
    assert upgraded["plan_tier"] == "PROFESSIONAL"
    assert upgraded["base_price_eur"] == 119.0
    assert upgraded["max_clients_limit"] == 30
    assert upgraded["max_monthly_transactions_limit"] == 12000
    assert upgraded["has_sha256_audit"] is True


def test_rest_endpoints_subscription_api(client_api):
    """Verifica los endpoints REST de facturación /api/v1/pricing-plans y /api/v1/tenants/{id}/subscription."""
    # 1. Catálogo público de precios
    res_plans = client_api.get("/api/v1/pricing-plans")
    assert res_plans.status_code == 200
    plans = res_plans.json()
    assert len(plans) >= 3

    # 2. Crear Tenant
    res_t = client_api.post(
        "/api/v1/tenants",
        json={
            "name": "Auditores de Levante SLP",
            "fiscal_id": "B-03998811",
            "email": "levante@auditores.es",
            "plan": "STARTER",
        },
    )
    assert res_t.status_code == 201
    tenant_id = res_t.json()["id"]

    # 3. Consultar suscripción del Tenant
    res_sub = client_api.get(f"/api/v1/tenants/{tenant_id}/subscription")
    assert res_sub.status_code == 200
    sub_data = res_sub.json()
    assert sub_data["plan_tier"] == "STARTER"
    assert sub_data["base_price_eur"] == 49.0
    assert sub_data["can_add_client"] is True

    # 4. Actualizar plan vía REST (Upgrade a Professional con 1 paquete adicional de 25€)
    res_up = client_api.post(
        f"/api/v1/tenants/{tenant_id}/subscription/upgrade",
        json={
            "new_plan": "PROFESSIONAL",
            "extra_blocks": 1,
        },
    )
    assert res_up.status_code == 200
    up_data = res_up.json()
    assert up_data["plan_tier"] == "PROFESSIONAL"
    assert up_data["extra_blocks_count"] == 1
    assert up_data["total_monthly_fee_eur"] == 119.0 + 25.0
    assert up_data["max_clients_limit"] == 30 + 10  # 40 empresas

    # 5. Generar Stripe Checkout Session
    res_cs = client_api.post(
        f"/api/v1/tenants/{tenant_id}/subscription/checkout-session",
        json={
            "target_plan": "PROFESSIONAL",
            "extra_blocks": 1,
        },
    )
    assert res_cs.status_code == 200
    cs_data = res_cs.json()
    assert "checkout_url" in cs_data
    assert cs_data["amount_total_eur"] == 144.0
