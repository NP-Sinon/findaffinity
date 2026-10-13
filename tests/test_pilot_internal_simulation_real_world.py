"""
Fase 7 / Nivel 3: Prueba Piloto Interna End-to-End con Datos Reales de Internet y Banca Española
Simula el flujo completo para un despacho auditor gestionando 3 empresas clientes:
1. E-Commerce (Shopify / Stripe) -> Exportación a Wolters Kluwer A3 (Suenlace)
2. Comercio Físico (Redsys TPV) -> Exportación a Sage 50 / Despachos (XDIARIO)
3. Distribución B2B (Norma 43 Banco Santander) -> Exportación a DELSOL Contasol (.xlsx)

Verifica cuadre a céntimo cero (0.00 €), inmutabilidad SHA-256 y generación física de ficheros.
"""
import json
import os
from datetime import date
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database.connection import Base
from src.database.repository import ReconciliationRepository
from src.parsers.bank.norma43 import Norma43Parser
from src.parsers.gateways.stripe import StripeParser
from src.parsers.gateways.redsys import RedsysParser
from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, TransactionType
from src.services.batch_service import BatchReconciliationService
from src.accounting.exporters.a3_suenlace import A3SuenlaceExporter
from src.accounting.exporters.sage_xdiario import SageXdiarioExporter
from src.accounting.exporters.contasol_xlsx import ContasolXlsxExporter

BASE_DIR = Path(__file__).resolve().parent.parent
PILOT_DATA_DIR = BASE_DIR / "data" / "pilot"
OUTPUT_DIR = BASE_DIR / "output_pilot"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PILOT_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
PilotSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=PILOT_ENGINE)


@pytest.fixture(scope="module")
def pilot_db():
    Base.metadata.create_all(bind=PILOT_ENGINE)
    db = PilotSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=PILOT_ENGINE)


@pytest.fixture(scope="module")
def pilot_invoices():
    json_path = PILOT_DATA_DIR / "cartera_viva_facturas.json"
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    invoices = []
    for item in data:
        y, m, d = item["issue_date"].split("-")
        issue_d = date(int(y), int(m), int(d))
        invoices.append(
            CanonicalInvoice(
                invoice_id=item["invoice_id"],
                invoice_number=item["invoice_number"],
                issue_date=issue_d,
                due_date=issue_d,
                customer_id=item["customer_id"],
                customer_name=item["customer_name"],
                gross_amount_cents=item["gross_amount_cents"],
                customer_fiscal_id=item["customer_fiscal_id"],
            )
        )
    return invoices


def test_pilot_client1_ecommerce_stripe_to_a3(pilot_db, pilot_invoices):
    """
    CLIENTE 1: Tienda Online E-commerce
    - Fuente: Stripe Balance Transactions Report (CSV real descargado de Stripe)
    - Liquidación agrupada: Payout neto de 3.823,82 €
    - Facturas asociadas: 4 pedidos (1.250€ + 890€ + 1.100€ + 695€ = 3.935,00€ bruto)
    - Comisiones Stripe: 111,18 €
    - Destino: Wolters Kluwer A3 (Suenlace .txt)
    """
    # 1. Crear Despacho y Empresa Cliente 1
    tenant = ReconciliationRepository.create_tenant(
        db=pilot_db,
        name="KÖNIG & ASOCIADOS AUDITORES SLP",
        fiscal_id="B-99881122",
        email="auditoria@konigpartners.es",
    )
    client1 = ReconciliationRepository.create_client(
        db=pilot_db,
        tenant_id=tenant.id,
        name="Iberia Retail Logistics S.L.",
        fiscal_id="B-87654321",
        default_erp="A3",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )

    # 2. Ingesta de fichero Stripe
    csv_path = PILOT_DATA_DIR / "cliente1_stripe_balance.csv"
    with open(csv_path, "rb") as f:
        file_bytes = f.read()

    stripe_txs = StripeParser.parse_balance_transactions_csv(file_bytes)
    assert len(stripe_txs) == 5  # 4 cargos + 1 payout

    payout_tx = next(t for t in stripe_txs if t.type == "payout")
    charges = [t for t in stripe_txs if t.type == "charge"]

    total_gross = sum(c.gross_cents for c in charges)
    total_fees = sum(c.fee_cents for c in charges)
    expected_net = total_gross - total_fees
    assert abs(payout_tx.net_cents) == expected_net == 382382  # 3.823,82 €

    # 3. Simular apunte bancario correspondiente en la cuenta corriente
    bank_tx = CanonicalBankTransaction(
        transaction_id="BANCO-SANTANDER-STRIPE-PO1",
        account_iban="ES7600491500051234567890",
        operation_date=date(2026, 10, 7),
        value_date=date(2026, 10, 7),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=expected_net,
        concept="STRIPE PAYOUT po_1M9999 LIQUIDACION SEMANAL",
        payer_or_payee="Stripe Payments Europe",
    )

    # 4. Procesar Lote con BatchReconciliationService
    client1_invoices = [inv for inv in pilot_invoices if "STRIPE" in inv.invoice_id]
    assert len(client1_invoices) == 4

    batch = BatchReconciliationService.process_and_persist_batch(
        db=pilot_db,
        tenant_id=tenant.id,
        client_id=client1.id,
        period_year=2026,
        period_type="Q4",
        start_month=10,
        end_month=12,
        bank_transactions=[bank_tx],
        open_invoices=client1_invoices,
        file_name="cliente1_stripe_balance.csv",
        file_bytes=file_bytes,
        gateway_name="Stripe",
    )

    assert batch.total_movements == 1
    assert batch.green_count == 1
    assert batch.imbalance_cents == 0

    # 5. Exportar a Wolters Kluwer A3 (Suenlace)
    export_res = BatchReconciliationService.export_batch_to_erp(pilot_db, batch.id, target_erp="A3")
    assert export_res["erp"] == "A3"
    assert export_res["entries_count"] == 1
    suenlace_text = export_res["content"]

    # Guardar archivo físico en disco
    out_file = OUTPUT_DIR / "SUENLACE_A3_CLIENTE1.txt"
    with open(out_file, "w", encoding="windows-1252") as f:
        f.write(suenlace_text)

    assert out_file.exists()
    assert len(suenlace_text.splitlines()) >= 6  # 1 banco + 1 comisiones + 4 clientes


def test_pilot_client2_retail_redsys_to_sage(pilot_db, pilot_invoices):
    """
    CLIENTE 2: Comercio Físico / Hostelería con TPV Redsys
    - Fuente: Redsys Operaciones CSV (descargado del portal bancario de comercios)
    - Liquidación: 1.701,08 € netos (1.720,00 € bruto - 18,92 € tasa descuento)
    - Facturas/Tickets asociados: 3 ventas de mostrador (750€ + 550€ + 420€)
    - Destino: Sage 50 / Despachos (XDIARIO.csv)
    """
    tenant = ReconciliationRepository.list_tenants(pilot_db)[0]
    client2 = ReconciliationRepository.create_client(
        db=pilot_db,
        tenant_id=tenant.id,
        name="Novatech Software Ibérica S.A.",
        fiscal_id="A-91283746",
        default_erp="SAGE",
        account_length=10,
        bank_account_code="5720000001",
        fee_account_code="6260000001",
    )

    # 1. Ingesta Redsys CSV
    csv_path = PILOT_DATA_DIR / "cliente2_redsys_tpv.csv"
    with open(csv_path, "rb") as f:
        file_bytes = f.read()

    redsys_txs = RedsysParser.parse_operations_csv(file_bytes, delimiter=";")
    assert len(redsys_txs) == 3

    total_gross = sum(t.gross_cents for t in redsys_txs)
    total_fees = sum(t.fee_cents for t in redsys_txs)
    net_payout = total_gross - total_fees
    assert total_gross == 172000
    assert total_fees == 1892
    assert net_payout == 170108

    # 2. Apunte bancario por el abono de TPV
    bank_tx = CanonicalBankTransaction(
        transaction_id="BBVA-REDSYS-TPV-880",
        account_iban="ES9121000418450200051332",
        operation_date=date(2026, 10, 13),
        value_date=date(2026, 10, 13),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=net_payout,
        concept="ABONO OPERACIONES TPV REDSYS COMERCIO 12/10",
        payer_or_payee="Redsys Servicios de Procesamiento",
    )

    client2_invoices = [inv for inv in pilot_invoices if "REDSYS" in inv.invoice_id]
    assert len(client2_invoices) == 3

    # 3. Procesar y persistir lote
    batch = BatchReconciliationService.process_and_persist_batch(
        db=pilot_db,
        tenant_id=tenant.id,
        client_id=client2.id,
        period_year=2026,
        period_type="Q4",
        start_month=10,
        end_month=12,
        bank_transactions=[bank_tx],
        open_invoices=client2_invoices,
        file_name="cliente2_redsys_tpv.csv",
        file_bytes=file_bytes,
        gateway_name="Redsys TPV",
    )

    assert batch.green_count == 1
    assert batch.imbalance_cents == 0

    # 4. Exportar a Sage 50 (XDIARIO)
    export_res = BatchReconciliationService.export_batch_to_erp(pilot_db, batch.id, target_erp="SAGE")
    assert export_res["erp"] == "SAGE"
    sage_csv = export_res["content"]

    out_file = OUTPUT_DIR / "XDIARIO_SAGE_CLIENTE2.csv"
    with open(out_file, "w", encoding="windows-1252", newline="") as f:
        f.write(sage_csv)

    assert out_file.exists()
    assert "Asiento" in sage_csv
    assert "Cuenta" in sage_csv


def test_pilot_client3_b2b_norma43_to_contasol(pilot_db, pilot_invoices):
    """
    CLIENTE 3: Distribución B2B con Extracto Bancario Norma 43
    - Fuente: Cuaderno 43 oficial emitido por Banco Santander (Windows-1252)
    - Movimientos:
      * Transf. 1: 1.450,00 € -> Cancela Fra FRA-2026-091 Hnos Martínez
      * Transf. 2: 2.410,00 € -> Cancela Fra FRA-2026-088 Amazon Services Europe
      * Abono TPV: 1.701,08 €
      * Comisión bancaria: 15,00 €
    - Destino: DELSOL Contasol (.xlsx)
    """
    tenant = ReconciliationRepository.list_tenants(pilot_db)[0]
    client3 = ReconciliationRepository.create_client(
        db=pilot_db,
        tenant_id=tenant.id,
        name="Mediterráneo Gourmet Foods S.L.",
        fiscal_id="B-54892103",
        default_erp="CONTASOL",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )

    # 1. Ingesta Norma 43
    n43_path = PILOT_DATA_DIR / "cliente3_norma43.n43"
    with open(n43_path, "rb") as f:
        raw_bytes = f.read()

    parse_res = Norma43Parser.parse_file(raw_bytes)
    assert parse_res.is_valid is True
    assert len(parse_res.canonical_transactions) == 4

    client3_invoices = [inv for inv in pilot_invoices if "B2B" in inv.invoice_id]
    assert len(client3_invoices) == 2

    # 2. Procesar y persistir lote
    batch = BatchReconciliationService.process_and_persist_batch(
        db=pilot_db,
        tenant_id=tenant.id,
        client_id=client3.id,
        period_year=2026,
        period_type="Q4",
        start_month=10,
        end_month=12,
        bank_transactions=parse_res.canonical_transactions,
        open_invoices=client3_invoices,
        file_name="cliente3_norma43.n43",
        file_bytes=raw_bytes,
    )

    assert batch.total_movements == 4
    # Las 2 transferencias B2B con factura coincidente pasan a Verde
    assert batch.green_count >= 2

    # 3. Exportar a DELSOL Contasol (XLSX)
    export_res = BatchReconciliationService.export_batch_to_erp(pilot_db, batch.id, target_erp="CONTASOL")
    assert export_res["erp"] == "CONTASOL"
    xlsx_bytes = export_res["content"]

    out_file = OUTPUT_DIR / "CONTASOL_CLIENTE3.xlsx"
    with open(out_file, "wb") as f:
        f.write(xlsx_bytes)

    assert out_file.exists()
    assert out_file.stat().st_size > 1000
    assert xlsx_bytes[:2] == b"PK"  # Cabecera ZIP válida de archivo .xlsx


def test_pilot_tamper_proof_audit_certificate(pilot_db):
    """
    Verifica la emisión del Certificado Legal de Auditoría con cadena de custodia SHA-256
    garantizando la inmutabilidad jurídica de todos los asientos procesados en la prueba piloto.
    """
    tenant = ReconciliationRepository.list_tenants(pilot_db)[0]
    logs = ReconciliationRepository.get_audit_trail(pilot_db, tenant.id)

    assert len(logs) >= 6  # 3 BATCH_CREATED + 3 BATCH_EXPORTED

    # Verificar que la cadena SHA-256 está perfectamente intacta de principio a fin
    for i in range(1, len(logs)):
        assert logs[i].prev_hash == logs[i - 1].current_hash_sha256

    # Generar Certificado de Auditoría JSON oficial
    certificate = {
        "certificate_title": "CERTIFICADO DE AUDITORÍA Y CONCILIACIÓN CONTABLE INMUTABLE",
        "protocol": "FINDAFINITY ZERO-LIABILITY HASH-CHAIN v1.0",
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "tenant_fiscal_id": tenant.fiscal_id,
        "issued_at": date.today().isoformat(),
        "total_events_certified": len(logs),
        "genesis_hash": logs[0].prev_hash,
        "head_hash_sha256": logs[-1].current_hash_sha256,
        "audit_events": [
            {
                "event_id": l.id,
                "action": l.action,
                "actor": l.actor,
                "timestamp": l.timestamp.isoformat(),
                "sha256_hash": l.current_hash_sha256,
                "details": json.loads(l.details_json) if l.details_json else {},
            }
            for l in logs
        ],
    }

    cert_path = OUTPUT_DIR / "CERTIFICADO_AUDITORIA_PILOTO.json"
    with open(cert_path, "w", encoding="utf-8") as f:
        json.dump(certificate, f, indent=2, ensure_ascii=False)

    assert cert_path.exists()
    assert len(certificate["head_hash_sha256"]) == 64
