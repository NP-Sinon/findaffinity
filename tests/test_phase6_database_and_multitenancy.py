"""
Fase 6 / Nivel 2: Tests de Base de Datos, Arquitectura Multi-Tenant y Audit Trail Inmutable SHA-256
"""
import pytest
from datetime import date
from starlette.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.main import app
from src.database.connection import Base, get_db
from src.database.models import (
    Tenant,
    ClientCompany,
    ReconciliationBatch,
    BatchTransaction,
    JournalEntryRecord,
    AuditLog,
)
from src.database.repository import ReconciliationRepository
from src.services.batch_service import BatchReconciliationService
from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, TransactionType

from sqlalchemy.pool import StaticPool

# Base de datos en memoria con StaticPool para pruebas aisladas multi-thread
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=TEST_ENGINE)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture(scope="function")
def client_api(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_tenant_and_client_creation(db_session):
    """Verifica la creación de despachos y empresas clientes con relaciones multi-tenant."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Auditoría & Finanzas Deloitte SLP",
        fiscal_id="B-88223344",
        email="soporte@deloittefin.es",
        plan="PROFESSIONAL",
    )
    assert tenant.id is not None
    assert tenant.name == "Auditoría & Finanzas Deloitte SLP"

    # Empresa 1: E-commerce con A3
    client1 = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Zapatos & Moda Online SL",
        fiscal_id="B-99887766",
        default_erp="A3",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )
    assert client1.id is not None
    assert client1.tenant_id == tenant.id
    assert client1.default_erp == "A3"

    # Empresa 2: Software SaaS con Sage
    client2 = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="CloudOps Tech SL",
        fiscal_id="B-11223344",
        default_erp="SAGE",
        account_length=10,
        bank_account_code="5720000001",
        fee_account_code="6260000001",
    )
    assert client2.account_length == 10

    # Listar empresas del tenant
    clients = ReconciliationRepository.list_clients_by_tenant(db_session, tenant.id)
    assert len(clients) == 2


def test_batch_creation_and_transaction_persistence(db_session):
    """Verifica la creación de lotes, partidas y cálculo de estadísticas contables."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Asesoría Contable Norte",
        fiscal_id="B-77112233",
        email="norte@asesoria.es",
    )
    client = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Ferretería Industrial SL",
        fiscal_id="B-33445566",
    )

    batch = ReconciliationRepository.create_batch(
        db=db_session,
        tenant_id=tenant.id,
        client_id=client.id,
        period_year=2026,
        period_type="Q2",
        start_month=4,
        end_month=6,
        file_name="extracto_2t_2026.n43",
    )
    assert batch.period_year == 2026
    assert batch.start_month == 4

    # Añadir 1 partida Verde
    tx1 = ReconciliationRepository.add_transaction(
        db=db_session,
        batch_id=batch.id,
        external_id="TX-01",
        source="Stripe",
        operation_date=date(2026, 4, 15),
        value_date=date(2026, 4, 15),
        concept="Liquidación Stripe #101",
        net_amount_cents=100000,
        gross_amount_cents=102500,
        fee_amount_cents=2500,
        status="GREEN",
        confidence_score=0.985,
    )

    # Añadir 1 partida Amarilla
    tx2 = ReconciliationRepository.add_transaction(
        db=db_session,
        batch_id=batch.id,
        external_id="TX-02",
        source="Norma 43",
        operation_date=date(2026, 5, 10),
        value_date=date(2026, 5, 10),
        concept="TRANSF. CONST MARTINEZ",
        net_amount_cents=50000,
        gross_amount_cents=50000,
        fee_amount_cents=0,
        status="YELLOW",
        confidence_score=0.820,
    )

    # Recalcular estadísticas del lote
    updated_batch = ReconciliationRepository.update_batch_statistics(db_session, batch.id)
    assert updated_batch.total_movements == 2
    assert updated_batch.total_volume_cents == 150000
    assert updated_batch.green_count == 1
    assert updated_batch.yellow_count == 1
    assert updated_batch.red_count == 0


def test_approval_workflow_and_audit_log_hash_chain(db_session):
    """Verifica el flujo de aprobación interactiva y la cadena inmutable de hashes SHA-256."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho Central Auditores",
        fiscal_id="B-55667788",
        email="central@audit.es",
    )
    client = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Logística Exprés SL",
        fiscal_id="B-22334455",
    )
    batch = ReconciliationRepository.create_batch(
        db=db_session,
        tenant_id=tenant.id,
        client_id=client.id,
        period_year=2026,
    )

    tx_yellow = ReconciliationRepository.add_transaction(
        db=db_session,
        batch_id=batch.id,
        external_id="TX-YEL-01",
        source="Redsys TPV",
        operation_date=date(2026, 6, 1),
        value_date=date(2026, 6, 1),
        concept="Abono TPV Comercio 01/06",
        net_amount_cents=85000,
        gross_amount_cents=86000,
        fee_amount_cents=1000,
        status="YELLOW",
        confidence_score=0.840,
    )
    assert tx_yellow.status == "YELLOW"
    assert not tx_yellow.is_approved

    # 1. Aprobar quirúrgicamente la partida
    approved_tx = ReconciliationRepository.approve_transaction(
        db=db_session,
        transaction_id=tx_yellow.id,
        approved_by="auditor_jefe@despacho.es",
        note="Verificado albarán firmado y comprobante TPV.",
    )
    assert approved_tx.status == "GREEN"
    assert approved_tx.is_approved is True
    assert approved_tx.approved_by == "auditor_jefe@despacho.es"

    # 2. Comprobar la cadena de bloques inmutable del Audit Trail
    logs = ReconciliationRepository.get_audit_trail(db_session, tenant.id, batch_id=batch.id)
    assert len(logs) >= 2  # BATCH_CREATED y TRANSACTION_APPROVED

    # Verificar enlace de hashes
    log_created = logs[0]
    log_approved = logs[1]

    assert log_created.action == "BATCH_CREATED"
    assert log_created.prev_hash.startswith("GENESIS_BLOCK_")
    assert len(log_created.current_hash_sha256) == 64

    assert log_approved.action == "TRANSACTION_APPROVED"
    # El prev_hash del segundo registro debe coincidir exactamente con el current_hash del primero
    assert log_approved.prev_hash == log_created.current_hash_sha256
    assert len(log_approved.current_hash_sha256) == 64


def test_bulk_approval_of_yellow_transactions(db_session):
    """Verifica la aprobación masiva en 1-clic de partidas amarillas."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Gestoría Rápida SL",
        fiscal_id="B-44332211",
        email="rapida@gestoria.es",
    )
    client = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Retail Sur SL",
        fiscal_id="B-66778899",
    )
    batch = ReconciliationRepository.create_batch(
        db=db_session,
        tenant_id=tenant.id,
        client_id=client.id,
        period_year=2026,
    )

    for i in range(3):
        ReconciliationRepository.add_transaction(
            db=db_session,
            batch_id=batch.id,
            external_id=f"TX-Y-{i}",
            source="Norma 43",
            operation_date=date(2026, 4, 10 + i),
            value_date=date(2026, 4, 10 + i),
            concept=f"Transf Cliente {i}",
            net_amount_cents=10000 * (i + 1),
            gross_amount_cents=10000 * (i + 1),
            fee_amount_cents=0,
            status="YELLOW",
            confidence_score=0.810,
        )

    # Actualizar estadísticas iniciales
    b = ReconciliationRepository.update_batch_statistics(db_session, batch.id)
    assert b.yellow_count == 3
    assert b.green_count == 0

    # Ejecutar bulk approve
    count = ReconciliationRepository.bulk_approve_yellows(db_session, batch.id, approved_by="auditor@gestoria.es")
    assert count == 3

    # Verificar que todas pasaron a Verde
    b_updated = ReconciliationRepository.get_batch(db_session, batch.id)
    assert b_updated.yellow_count == 0
    assert b_updated.green_count == 3


def test_fastapi_rest_endpoints_multitenant(client_api):
    """Verifica los endpoints REST de FastAPI para Tenants, Clients y Batches."""
    # 1. Crear Tenant vía API
    res_tenant = client_api.post(
        "/api/v1/tenants",
        json={
            "name": "Auditores Asociados Madrid",
            "fiscal_id": "B-99001122",
            "email": "madrid@auditores.es",
            "plan": "ENTERPRISE",
        },
    )
    assert res_tenant.status_code == 201
    tenant_data = res_tenant.json()
    tenant_id = tenant_data["id"]
    assert tenant_data["fiscal_id"] == "B-99001122"

    # 2. Crear ClientCompany vía API
    res_client = client_api.post(
        "/api/v1/clients",
        json={
            "tenant_id": tenant_id,
            "name": "Comercial Gourmet Mediterráneo SL",
            "fiscal_id": "B-44556677",
            "default_erp": "CONTASOL",
            "account_length": 9,
            "bank_account_code": "572000001",
            "fee_account_code": "626000001",
        },
    )
    assert res_client.status_code == 201
    client_data = res_client.json()
    assert client_data["default_erp"] == "CONTASOL"

    # 3. Listar Clientes del Tenant
    res_list = client_api.get(f"/api/v1/clients?tenant_id={tenant_id}")
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1


def test_batch_service_processing_and_erp_export(db_session):
    """Verifica el flujo completo de BatchReconciliationService: proceso, persistencia y exportación oficial."""
    tenant = ReconciliationRepository.create_tenant(
        db=db_session,
        name="Despacho Integral SLP",
        fiscal_id="B-12998877",
        email="integral@despacho.es",
    )
    client = ReconciliationRepository.create_client(
        db=db_session,
        tenant_id=tenant.id,
        name="Moda E-Commerce Ibérica SL",
        fiscal_id="B-88776655",
        default_erp="A3",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )

    # Facturas vivas
    inv1 = CanonicalInvoice(
        invoice_id="INV-01",
        invoice_number="FRA-2026-001",
        issue_date=date(2026, 4, 10),
        due_date=date(2026, 4, 10),
        customer_id="CUST-101",
        customer_name="Cliente Uno",
        gross_amount_cents=100000,
        customer_fiscal_id="B-11111111",
    )
    inv2 = CanonicalInvoice(
        invoice_id="INV-02",
        invoice_number="FRA-2026-002",
        issue_date=date(2026, 4, 11),
        due_date=date(2026, 4, 11),
        customer_id="CUST-102",
        customer_name="Cliente Dos",
        gross_amount_cents=200000,
        customer_fiscal_id="B-22222222",
    )

    # Movimiento Stripe agrupado: 1000.00 + 2000.00 = 3000.00 € bruto. Comisión ~ 1.4% = 42.00 €. Neto = 2958.00 € (295800 cents)
    bank_tx_stripe = CanonicalBankTransaction(
        transaction_id="TX-STRIPE-PO-1",
        account_iban="ES1200491500051234567890",
        operation_date=date(2026, 4, 15),
        value_date=date(2026, 4, 15),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=295800,
        concept="STRIPE PAYOUT po_12345",
        payer_or_payee="Stripe Payments Europe",
    )

    # Movimiento transferencia directa SEPA
    inv3 = CanonicalInvoice(
        invoice_id="INV-03",
        invoice_number="FRA-2026-003",
        issue_date=date(2026, 4, 18),
        due_date=date(2026, 4, 18),
        customer_id="CUST-103",
        customer_name="LOGISTICA CENTRAL SL",
        gross_amount_cents=75000,
        customer_fiscal_id="B-33333333",
    )
    bank_tx_sepa = CanonicalBankTransaction(
        transaction_id="TX-SEPA-01",
        account_iban="ES1200491500051234567890",
        operation_date=date(2026, 4, 20),
        value_date=date(2026, 4, 20),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=75000,
        concept="TRANSF DE LOGISTICA CENTRAL SL PAGO FACT FRA-2026-003",
        payer_or_payee="LOGISTICA CENTRAL SL",
    )

    # Ejecutar BatchReconciliationService
    batch = BatchReconciliationService.process_and_persist_batch(
        db=db_session,
        tenant_id=tenant.id,
        client_id=client.id,
        period_year=2026,
        bank_transactions=[bank_tx_stripe, bank_tx_sepa],
        open_invoices=[inv1, inv2, inv3],
        period_type="Q2",
        start_month=4,
        end_month=6,
        file_name="extracto_abril_2026.n43",
        file_bytes=b"dummy_n43_bytes_abril",
    )

    assert batch.total_movements == 2
    assert batch.green_count >= 1

    # Exportar a A3 (Suenlace)
    a3_res = BatchReconciliationService.export_batch_to_erp(db_session, batch.id, target_erp="A3")
    assert a3_res["erp"] == "A3"
    assert a3_res["filename"].endswith(".txt")
    assert isinstance(a3_res["content"], str)
    assert len(a3_res["content"]) > 0

    # Exportar a Sage 50 (XDIARIO)
    sage_res = BatchReconciliationService.export_batch_to_erp(db_session, batch.id, target_erp="SAGE")
    assert sage_res["erp"] == "SAGE"
    assert sage_res["filename"].endswith(".csv")
    assert "Asiento" in sage_res["content"] or "Fecha" in sage_res["content"] or ";" in sage_res["content"]

    # Exportar a Contasol (XLSX)
    contasol_res = BatchReconciliationService.export_batch_to_erp(db_session, batch.id, target_erp="CONTASOL")
    assert contasol_res["erp"] == "CONTASOL"
    assert contasol_res["filename"].endswith(".xlsx")
    assert isinstance(contasol_res["content"], bytes)
    assert contasol_res["content"][:2] == b"PK"  # Magic bytes de ZIP/XLSX

