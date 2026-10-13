"""
Test Suite para la Fase 2: Motor de Reconciliación Algorítmica (SSMP con Fricción)
Verifica:
1. Poda Heurística en 3 Niveles (Temporal, Pasarela y Bounding Box).
2. Solver Exacto Meet-in-the-Middle (Horowitz-Sahni).
3. Solver HiGHS MILP con Función Objetivo de Penalización de Comisiones y Delta:
   min (lambda_1 * delta + lambda_2 * sum(|c_i - c_i^teorico| * x_i))
   Demostrando que descarta combinaciones espurias y selecciona el subconjunto óptimo.
4. Cuadre Contable a Cero de Partida Doble (572 Debe, 626 Debe, 430 Haber).
5. Orquestador End-to-End de Reconciliación de Batch Payouts.
"""
from datetime import date
import pytest

from src.parsers.base import (
    CanonicalBankTransaction,
    CanonicalInvoice,
    CanonicalGatewayTransaction,
    TransactionType,
)
from src.reconciliation.pruning import ReconciliationPruner
from src.reconciliation.meet_in_the_middle import MeetInTheMiddleSolver, SubsetSumCandidate
from src.reconciliation.milp_solver import HighsMILPSolver, MILPInvoiceCandidate
from src.accounting.double_entry import AccountingEntryBuilder
from src.reconciliation.engine import BatchPayoutReconciliationEngine


def test_reconciliation_pruner():
    """Verifica que la poda descarta facturas fuera de fecha, de pasarelas ajenas o con importes imposibles."""
    payout_date = date(2026, 10, 15)
    target_net_cents = 50000  # 500.00 €

    candidates = [
        # 1. Factura válida dentro de la ventana (12 Oct, Stripe, 200 €)
        CanonicalInvoice(
            invoice_id="INV-1",
            invoice_number="F-01",
            issue_date=date(2026, 10, 12),
            due_date=date(2026, 10, 12),
            customer_id="C-1",
            customer_name="Empresa A",
            gross_amount_cents=20000,
            gateway_id="stripe",
        ),
        # 2. Factura fuera de fecha (hace 40 días, 1 Septiembre) -> Poda Temporal
        CanonicalInvoice(
            invoice_id="INV-2",
            invoice_number="F-02",
            issue_date=date(2026, 9, 1),
            due_date=date(2026, 9, 1),
            customer_id="C-2",
            customer_name="Empresa B",
            gross_amount_cents=10000,
            gateway_id="stripe",
        ),
        # 3. Factura de otra pasarela (Redsys) -> Poda de Pasarela
        CanonicalInvoice(
            invoice_id="INV-3",
            invoice_number="F-03",
            issue_date=date(2026, 10, 14),
            due_date=date(2026, 10, 14),
            customer_id="C-3",
            customer_name="Empresa C",
            gross_amount_cents=15000,
            gateway_id="redsys",
        ),
        # 4. Factura desorbitada (10.000 €) frente a un abono de 500 € -> Poda Bounding Box
        CanonicalInvoice(
            invoice_id="INV-4",
            invoice_number="F-04",
            issue_date=date(2026, 10, 14),
            due_date=date(2026, 10, 14),
            customer_id="C-4",
            customer_name="Empresa D",
            gross_amount_cents=1000000,
            gateway_id="stripe",
        ),
    ]

    pruned = ReconciliationPruner.prune(
        target_net_cents=target_net_cents,
        payout_date=payout_date,
        candidates=candidates,
        gateway_id="stripe",
        max_lookback_days=7,
    )

    # Solo INV-1 debe sobrevivir a los 3 niveles de poda
    assert len(pruned.invoices) == 1
    assert pruned.invoices[0].invoice_id == "INV-1"
    assert pruned.pruning_stats["initial_count"] == 4
    assert pruned.pruning_stats["after_temporal"] == 3
    assert pruned.pruning_stats["after_gateway"] == 2
    assert pruned.pruning_stats["after_bounding"] == 1


def test_meet_in_the_middle_exact_match():
    """Verifica resolución exacta O(2^(n/2)) mediante Horowitz-Sahni."""
    # Target: 247.50 € -> 24750 céntimos
    target = 24750
    candidates = [
        SubsetSumCandidate("I1", net_cents=10000, gross_cents=10200, fee_cents=200),
        SubsetSumCandidate("I2", net_cents=5000, gross_cents=5100, fee_cents=100),
        SubsetSumCandidate("I3", net_cents=9750, gross_cents=10000, fee_cents=250), # I1 + I2 + I3 = 24750
        SubsetSumCandidate("I4", net_cents=3000, gross_cents=3100, fee_cents=100),
        SubsetSumCandidate("I5", net_cents=8000, gross_cents=8200, fee_cents=200),
    ]

    res = MeetInTheMiddleSolver.solve(target, candidates, tolerance_cents=0)
    assert res is not None
    assert res.is_exact is True
    assert res.delta_cents == 0
    assert set(res.matched_ids) == {"I1", "I2", "I3"}
    assert res.total_net_cents == 24750


def test_highs_milp_penalizes_spurious_combinations():
    """
    CRÍTICO: Demuestra que la función objetivo con penalización de desviación de comisiones:
    min (lambda_1 * delta + lambda_2 * sum(|c_i - c_i^teorico| * x_i))
    descarta combinaciones espurias que tendrían el mismo neto pero comisiones inconsistentes.
    """
    # Objetivo: liquidación bancaria de 100.00 € (10000 céntimos)
    target_net = 10000

    # Dos candidatos idénticos en neto (10000), pero uno tiene comisión legítima (25 céntimos)
    # y el otro tiene una comisión distorsionada/espuria (300 céntimos):
    legitimate_candidate = MILPInvoiceCandidate(
        invoice_id="INV-LEGIT",
        gross_cents=10250,
        observed_fee_cents=250,
        theoretical_fee_cents=250,  # |c - c_teo| = 0
        net_cents=10000,
    )
    spurious_candidate = MILPInvoiceCandidate(
        invoice_id="INV-SPURIOUS",
        gross_cents=10550,
        observed_fee_cents=550,
        theoretical_fee_cents=250,  # |c - c_teo| = 300 (penalización severa)
        net_cents=10000,
    )

    candidates = [spurious_candidate, legitimate_candidate]

    res = HighsMILPSolver.solve(
        target_net_cents=target_net,
        invoices=candidates,
        tolerance_cents=1,
        lambda_1=100.0,
        lambda_2=1.0,
    )

    assert res.is_success is True
    # El solver DEBE seleccionar el candidato legítimo debido al coste de penalización
    assert res.matched_invoice_ids == ["INV-LEGIT"]
    assert res.total_fee_deviation_cents == 0.0


def test_double_entry_balance_and_cents_perfection():
    """Verifica que el generador contable crea un asiento PGC estrictamente cuadrado a cero (Debe == Haber)."""
    payout_net = 97500  # 975.00 € recibido en banco
    matched_invoices = [
        {"account_code": "430000001", "invoice_number": "F-101", "gross_cents": 50000, "fee_cents": 1250, "customer_name": "ACME 1"},
        {"account_code": "430000002", "invoice_number": "F-102", "gross_cents": 50000, "fee_cents": 1250, "customer_name": "ACME 2"},
    ]
    # Total Bruto = 1000.00 € (100000 céntimos)
    # Total Comisiones = 25.00 € (2500 céntimos)
    # Neto = 975.00 € (97500 céntimos)

    journal = AccountingEntryBuilder.build_payout_reconciliation_entry(
        entry_number=101,
        entry_date=date(2026, 10, 15),
        bank_account_code="572000001",
        fee_account_code="626000001",
        payout_net_cents=payout_net,
        matched_invoices=matched_invoices,
        gateway_name="Stripe",
    )

    assert journal.is_balanced is True
    assert journal.imbalance_cents == 0
    assert journal.total_debit_cents == 100000
    assert journal.total_credit_cents == 100000

    # Comprobar desglose de cuentas
    bank_line = [l for l in journal.lines if l.account_code == "572000001"][0]
    assert bank_line.debit_cents == 97500
    assert bank_line.credit_cents == 0

    fee_line = [l for l in journal.lines if l.account_code == "626000001"][0]
    assert fee_line.debit_cents == 2500
    assert fee_line.credit_cents == 0

    cust_lines = [l for l in journal.lines if l.account_code.startswith("430")]
    assert len(cust_lines) == 2
    assert all(l.credit_cents == 50000 for l in cust_lines)


def test_batch_payout_reconciliation_engine_end_to_end():
    """Verifica el flujo integral del motor: apunte bancario + facturas abiertas -> reconciliación y asiento."""
    engine = BatchPayoutReconciliationEngine()

    bank_tx = CanonicalBankTransaction(
        transaction_id="TX-N43-0099",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 14),
        value_date=date(2026, 10, 14),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=19430,  # 194.30 €
        concept="STRIPE PAYOUT po_live_9988",
    )

    # Creamos un conjunto de facturas donde exactamente F-01 y F-02 suman el abono
    # F-01: 100.00 € bruto - (1.5% + 0.25€ = 1.75€ com) = 98.25 € neto -> 9825 cents
    # F-02: 98.00 € bruto - (1.5% + 0.25€ = 1.72€ com) = 96.28 € neto -> 9628 cents
    # 98.25 + 96.28 = 194.53 € -> ajustado
    invoices = [
        CanonicalInvoice("I-1", "F-01", date(2026, 10, 12), date(2026, 10, 12), "C1", "Cliente Alpha", 10000, gateway_id="stripe"),
        CanonicalInvoice("I-2", "F-02", date(2026, 10, 13), date(2026, 10, 13), "C2", "Cliente Beta", 9800, gateway_id="stripe"),
        CanonicalInvoice("I-3", "F-03", date(2026, 10, 13), date(2026, 10, 13), "C3", "Cliente Gamma", 5500, gateway_id="stripe"),
    ]

    # Pasamos las comisiones exactas observadas en el reporte de la pasarela:
    # F-01 comision = 185 céntimos -> neto = 9815 céntimos
    # F-02 comision = 185 céntimos -> neto = 9615 céntimos
    # Total neto = 9815 + 9615 = 19430 céntimos (194.30 € exactos)
    gw_txs = [
        CanonicalGatewayTransaction("GW-1", "stripe", date(2026, 10, 12), "charge", 10000, 185, 9815, order_id="F-01"),
        CanonicalGatewayTransaction("GW-2", "stripe", date(2026, 10, 13), "charge", 9800, 185, 9615, order_id="F-02"),
    ]

    report = engine.reconcile_payout(
        bank_tx=bank_tx,
        open_invoices=invoices,
        gateway_transactions=gw_txs,
        gateway_id="stripe",
    )

    assert report.is_reconciled is True
    assert set(report.matched_invoice_ids) == {"I-1", "I-2"}
    assert report.total_gross_cents == 19800
    assert report.total_fees_cents == 370
    assert report.total_net_cents == 19430
    assert report.discrepancy_cents == 0.0
    assert report.journal_entry is not None
    assert report.journal_entry.is_balanced is True
