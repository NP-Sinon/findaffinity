"""
Test Suite: Módulo de Sincronización Stripe Directa, Paywall Freemium (25 partidas) y Normalización PGC
"""
from datetime import date
import io
import json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from src.main import app
from src.database.connection import Base, get_db
from src.database.repository import ReconciliationRepository
from src.database.models import Tenant, ClientCompany
from src.accounting.double_entry import (
    AccountingEntryBuilder,
    DoubleEntryJournal,
    normalize_pgc_subaccount,
)
from src.billing.pricing_plans import (
    PLAN_CONFIGS,
    PlanTier,
    QuotaManager,
    FREE_TIER_MAX_TRANSACTIONS,
)
from src.parsers.gateways.stripe_api_sync import StripeDirectSyncService
from src.parsers.invoices.portfolio_parser import (
    InvoicePortfolioParser,
    parse_spanish_amount_to_cents,
)

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


def test_normalize_pgc_subaccount_padding():
    """Verifica el formateo y relleno de ceros de subcuentas a 9, 10 y 12 dígitos."""
    assert normalize_pgc_subaccount("572.1", 9) == "572000001"
    assert normalize_pgc_subaccount("43015", 9) == "430000015"
    assert normalize_pgc_subaccount("626", 9) == "626000000"
    assert normalize_pgc_subaccount("572000001234", 12) == "572000001234"
    assert normalize_pgc_subaccount("430000145", 9) == "430000145"
    assert normalize_pgc_subaccount("", 9) == ""


def test_double_entry_rounding_without_initial_fee_line():
    """
    Verifica que si hay un descuadre de 1 o 2 céntimos sin comisiones previas,
    el generador de asientos cree la línea de ajuste por redondeo y garantice cuadre estricto a cero.
    """
    # Factura por 100.01 € (10001 cents) pero recibidos 100.00 € (10000 cents) en banco sin comisiones
    journal = AccountingEntryBuilder.build_payout_reconciliation_entry(
        entry_number=1,
        entry_date=date(2026, 10, 14),
        bank_account_code="572000001",
        fee_account_code="626000001",
        payout_net_cents=10000,
        matched_invoices=[
            {
                "account_code": "430000001",
                "invoice_number": "FRA-2026-001",
                "gross_cents": 10001,
                "fee_cents": 0,
                "customer_name": "Cliente Prueba",
            }
        ],
        gateway_name="Stripe",
        account_length=9,
    )

    assert journal.is_balanced is True
    assert journal.imbalance_cents == 0
    assert journal.total_debit_cents == journal.total_credit_cents == 10001
    adj_line = next((l for l in journal.lines if "ADJ-" in l.document_number), None)
    assert adj_line is not None
    assert adj_line.debit_cents == 1


def test_spanish_amount_parsing():
    """Verifica la detección y parseo de importes españoles e internacionales a céntimos."""
    assert parse_spanish_amount_to_cents("1.250,50 €") == 125050
    assert parse_spanish_amount_to_cents("1,250.50") == 125050
    assert parse_spanish_amount_to_cents("45,00") == 4500
    assert parse_spanish_amount_to_cents(120.75) == 12075
    assert parse_spanish_amount_to_cents("0") == 0


def test_invoice_portfolio_parser_csv_and_json():
    """Verifica que el parser inteligente autodescubra columnas heterogéneas."""
    csv_content = (
        "Nº Factura;Cliente;NIF/CIF;Total Factura;Fecha Emisión\n"
        "F-2026-101;Acme Tech S.L.;B-99887766;1.500,25 €;14/10/2026\n"
        "F-2026-102;Logística Sur;A-11223344;250,00;2026-10-15\n"
    )
    records = InvoicePortfolioParser.parse_file_bytes(csv_content.encode("utf-8"), "cartera.csv")
    assert len(records) == 2
    assert records[0]["invoice_number"] == "F-2026-101"
    assert records[0]["gross_amount_cents"] == 150025
    assert records[0]["customer_fiscal_id"] == "B-99887766"

    json_content = json.dumps([
        {
            "invoice_id": "INV-01",
            "invoice_number": "J-001",
            "customer_name": "Test Client",
            "customer_fiscal_id": "B-123",
            "gross_amount_cents": 50000,
            "issue_date": "2026-10-01",
        }
    ])
    json_records = InvoicePortfolioParser.parse_file_bytes(json_content.encode("utf-8"), "data.json")
    assert len(json_records) == 1
    assert json_records[0]["gross_amount_cents"] == 50000


def test_stripe_restricted_key_validation():
    """Valida que solo se acepten claves restringidas o secretas de Stripe."""
    assert StripeDirectSyncService.validate_readonly_key("rk_live_1234567890") is True
    assert StripeDirectSyncService.validate_readonly_key("rk_test_1234567890") is True
    assert StripeDirectSyncService.validate_readonly_key("sk_test_1234567890") is True
    assert StripeDirectSyncService.validate_readonly_key("pk_live_1234567890") is False
    assert StripeDirectSyncService.validate_readonly_key("invalid_key") is False


def test_paywall_quota_evaluation():
    """Verifica la lógica del Paywall Freemium a las 25 transacciones."""
    quota_under = QuotaManager.evaluate_tenant_quota(
        plan_code="FREE",
        extra_blocks=0,
        current_clients_count=1,
        current_month_transactions=20,
        incoming_transactions=4,
    )
    assert quota_under["paywall_triggered"] is False
    assert quota_under["remaining_transactions"] == 5

    quota_over = QuotaManager.evaluate_tenant_quota(
        plan_code="FREE",
        extra_blocks=0,
        current_clients_count=1,
        current_month_transactions=25,
        incoming_transactions=1,
    )
    assert quota_over["paywall_triggered"] is True
    assert quota_over["can_export"] is False


def test_subscription_and_upgrade_endpoints(client_api, db_session):
    """Verifica los endpoints REST de suscripción y upgrade de plan."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Asesoría Digital SLP",
        fiscal_id="B-99112233",
        email="info@asesoriadigital.es",
        plan="FREE",
    )

    res = client_api.get(f"/api/v1/tenants/{tenant.id}/subscription")
    assert res.status_code == 200
    data = res.json()
    assert data["plan"] == "FREE"
    assert data["max_monthly_transactions"] == FREE_TIER_MAX_TRANSACTIONS
    assert "available_plans" in data

    # Upgrade a STARTER
    up_res = client_api.post(
        f"/api/v1/tenants/{tenant.id}/upgrade",
        json={"plan": "STARTER", "extra_blocks": 0},
    )
    assert up_res.status_code == 200
    up_data = up_res.json()
    assert up_data["success"] is True
    assert up_data["new_plan"] == "STARTER"


def test_stripe_sync_endpoint_validation(client_api, db_session):
    """Verifica que el endpoint de sincronización directa valide las claves y clientes."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Pyme Online SL",
        fiscal_id="B-88223344",
        email="pyme@online.es",
        plan="PYME_DIRECTO",
    )
    client = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Tienda Virtual",
        fiscal_id="B-77665544",
    )

    # Intento con clave inválida debe rechazar con 400
    res = client_api.post(
        "/api/v1/batches/stripe-sync",
        json={
            "tenant_id": tenant.id,
            "client_id": client.id,
            "stripe_restricted_key": "invalid_key",
            "period_year": 2026,
            "start_month": 1,
            "end_month": 12,
        },
    )
    assert res.status_code == 400
    assert "no válida" in res.json()["detail"]
