"""
Servicio de Inicialización y Carga de Datos Semilla (Bootstrap Service)
Garantiza que la base de datos cuente con despachos, clientes y lotes piloto reales al iniciar.
"""
import json
from datetime import date
from pathlib import Path
from sqlalchemy.orm import Session

from src.database.repository import ReconciliationRepository
from src.parsers.bank.norma43 import Norma43Parser
from src.parsers.gateways.stripe import StripeParser
from src.parsers.gateways.redsys import RedsysParser
from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, TransactionType
from src.services.batch_service import BatchReconciliationService

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PILOT_DATA_DIR = BASE_DIR / "data" / "pilot"


def bootstrap_database_if_empty(db: Session) -> bool:
    """
    Verifica si la base de datos está vacía. Si no hay despachos,
    crea el despacho demo KÖNIG & ASOCIADOS, sus 3 clientes y los lotes piloto.
    """
    existing_tenants = ReconciliationRepository.list_tenants(db)
    if existing_tenants:
        return False  # Ya inicializada

    # 1. Crear Despacho Auditor
    tenant = ReconciliationRepository.create_tenant(
        db=db,
        name="KÖNIG & ASOCIADOS AUDITORES SLP",
        fiscal_id="B-99881122",
        email="auditoria@konigpartners.es",
        plan="PROFESSIONAL",
    )

    # 2. Crear las 3 Empresas Cliente
    client1 = ReconciliationRepository.create_client(
        db=db,
        tenant_id=tenant.id,
        name="Iberia Retail Logistics S.L.",
        fiscal_id="B-87654321",
        default_erp="A3",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )

    client2 = ReconciliationRepository.create_client(
        db=db,
        tenant_id=tenant.id,
        name="Hostelería y Restauración Mediterránea S.L.",
        fiscal_id="A-91283746",
        default_erp="SAGE",
        account_length=10,
        bank_account_code="5720000001",
        fee_account_code="6260000001",
    )

    client3 = ReconciliationRepository.create_client(
        db=db,
        tenant_id=tenant.id,
        name="Mediterráneo Gourmet Foods S.L.",
        fiscal_id="B-54892103",
        default_erp="CONTASOL",
        account_length=9,
        bank_account_code="572000001",
        fee_account_code="626000001",
    )

    # 3. Cargar Cartera Viva de Facturas
    invoices_file = PILOT_DATA_DIR / "cartera_viva_facturas.json"
    if not invoices_file.exists():
        return True

    with open(invoices_file, "r", encoding="utf-8") as f:
        invoices_data = json.load(f)

    all_invoices = []
    for item in invoices_data:
        y, m, d = item["issue_date"].split("-")
        issue_d = date(int(y), int(m), int(d))
        all_invoices.append(
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

    # 4. Cargar Lote Cliente 1 (Stripe)
    stripe_file = PILOT_DATA_DIR / "cliente1_stripe_balance.csv"
    if stripe_file.exists():
        with open(stripe_file, "rb") as f:
            stripe_bytes = f.read()
        stripe_txs = StripeParser.parse_balance_transactions_csv(stripe_bytes)
        charges = [t for t in stripe_txs if t.type == "charge"]
        payouts = [t for t in stripe_txs if t.type == "payout"]
        expected_net = sum(c.gross_cents for c in charges) - sum(c.fee_cents for c in charges)

        bank_tx = CanonicalBankTransaction(
            transaction_id="BANCO-STRIPE-PO1",
            account_iban="ES7600491500051234567890",
            operation_date=date(2026, 10, 7),
            value_date=date(2026, 10, 7),
            transaction_type=TransactionType.DEPOSIT,
            amount_cents=expected_net,
            concept="STRIPE PAYOUT po_1M9999 LIQUIDACION SEMANAL",
            payer_or_payee="Stripe Payments Europe",
        )
        c1_invs = [inv for inv in all_invoices if "STRIPE" in inv.invoice_id]
        BatchReconciliationService.process_and_persist_batch(
            db=db,
            tenant_id=tenant.id,
            client_id=client1.id,
            period_year=2026,
            period_type="Q4",
            start_month=10,
            end_month=12,
            bank_transactions=[bank_tx],
            open_invoices=c1_invs,
            file_name="cliente1_stripe_balance.csv",
            file_bytes=stripe_bytes,
            gateway_name="Stripe",
        )

    # 5. Cargar Lote Cliente 2 (Redsys)
    redsys_file = PILOT_DATA_DIR / "cliente2_redsys_tpv.csv"
    if redsys_file.exists():
        with open(redsys_file, "rb") as f:
            redsys_bytes = f.read()
        redsys_ops = RedsysParser.parse_operations_csv(redsys_bytes)
        total_gross = sum(op.gross_amount_cents for op in redsys_ops)
        total_fees = sum(op.fee_cents for op in redsys_ops)
        expected_net = total_gross - total_fees

        bank_tx = CanonicalBankTransaction(
            transaction_id="BANCO-REDSYS-SETTLEMENT-01",
            account_iban="ES9121000418450200051332",
            operation_date=date(2026, 10, 13),
            value_date=date(2026, 10, 13),
            transaction_type=TransactionType.DEPOSIT,
            amount_cents=expected_net,
            concept="LIQUIDACION DIARIA TPV COMERCIO 998877661",
            payer_or_payee="Redsys Servicios de Procesamiento",
        )
        c2_invs = [inv for inv in all_invoices if "REDSYS" in inv.invoice_id]
        BatchReconciliationService.process_and_persist_batch(
            db=db,
            tenant_id=tenant.id,
            client_id=client2.id,
            period_year=2026,
            period_type="Q4",
            start_month=10,
            end_month=12,
            bank_transactions=[bank_tx],
            open_invoices=c2_invs,
            file_name="cliente2_redsys_tpv.csv",
            file_bytes=redsys_bytes,
            gateway_name="Redsys",
        )

    # 6. Cargar Lote Cliente 3 (Norma 43)
    n43_file = PILOT_DATA_DIR / "cliente3_norma43.n43"
    if n43_file.exists():
        with open(n43_file, "rb") as f:
            n43_bytes = f.read()
        parse_res = Norma43Parser.parse_file(n43_bytes)
        c3_invs = [inv for inv in all_invoices if "B2B" in inv.invoice_id]
        BatchReconciliationService.process_and_persist_batch(
            db=db,
            tenant_id=tenant.id,
            client_id=client3.id,
            period_year=2026,
            period_type="Q4",
            start_month=10,
            end_month=12,
            bank_transactions=parse_res.canonical_transactions,
            open_invoices=c3_invs,
            file_name="cliente3_norma43.n43",
            file_bytes=n43_bytes,
        )

    # 7. Garantizar cuentas demo de auditor y superadministrador
    ensure_default_accounts(db)

    return True


def ensure_default_accounts(db: Session):
    """
    Garantiza que la cuenta de Administrador Global (admin@findaffinity.com)
    y la cuenta de auditor demo (auditor@konigpartners.es) existan siempre en la base de datos.
    """
    from src.database.models import User, UserRole, Tenant
    from src.auth.security import hash_password

    # 1. Cuenta Administrador Global (SUPERADMIN)
    admin_user = db.query(User).filter(User.email == "admin@findaffinity.com").first()
    if not admin_user:
        admin_user = User(
            email="admin@findaffinity.com",
            hashed_password=hash_password("AdminPass2026!"),
            full_name="Administrador Global FINDAFINITY",
            role=UserRole.SUPERADMIN,
            is_active=True,
            tenant_id=None,
        )
        db.add(admin_user)
        db.commit()

    # 2. Cuenta Auditor Demo
    demo_tenant = db.query(Tenant).filter(Tenant.fiscal_id == "B-99881122").first()
    if demo_tenant:
        auditor_user = db.query(User).filter(User.email == "auditor@konigpartners.es").first()
        if not auditor_user:
            auditor_user = User(
                email="auditor@konigpartners.es",
                hashed_password=hash_password("AuditPass2026!"),
                full_name="Carlos Méndez (Auditor Senior)",
                role=UserRole.AUDITOR,
                is_active=True,
                tenant_id=demo_tenant.id,
            )
            db.add(auditor_user)
            db.commit()
