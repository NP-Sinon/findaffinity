"""
Rutas de la API REST v1 para Conciliación, Desambiguación y Exportación a ERPs
"""
from datetime import date
from typing import List
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from src.parsers.bank.norma43 import Norma43Parser
from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, TransactionType
from src.reconciliation.engine import BatchPayoutReconciliationEngine
from src.disambiguation.confidence_scorer import BankDisambiguationScorer
from src.accounting.exporters.a3_suenlace import A3SuenlaceExporter
from src.accounting.exporters.sage_xdiario import SageXdiarioExporter
from src.accounting.exporters.contasol_xlsx import ContasolXlsxExporter
from src.schemas.api_schemas import (
    IngestionUploadResponse,
    ReconcilePayoutRequest,
    ReconcilePayoutResponse,
    DisambiguationTransferRequest,
    DisambiguationTransferResponse,
    JournalLineDTO,
)

router = APIRouter(prefix="/v1", tags=["Reconciliation & Staging"])


@router.post("/ingest/norma43", response_model=IngestionUploadResponse)
async def ingest_norma43(file: UploadFile = File(...)):
    """Sube y procesa un fichero bancario Norma 43 con detección de codificación y verificación matemática."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichero vacío.")

    result = Norma43Parser.parse_file(content)

    return IngestionUploadResponse(
        is_valid=result.is_valid,
        detected_encoding=result.detected_encoding,
        total_records=result.total_records,
        movements_count=len(result.canonical_transactions),
        validation_errors=result.validation_errors,
    )


@router.post("/disambiguate/transfer", response_model=DisambiguationTransferResponse)
def disambiguate_transfer(req: DisambiguationTransferRequest):
    """Evalúa la afinidad de una transferencia bancaria respecto a una factura viva calculando el Confidence Score."""
    bank_tx = CanonicalBankTransaction(
        transaction_id="API-TX-01",
        account_iban="ES00000000000000000000",
        operation_date=req.bank_date,
        value_date=req.bank_date,
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=req.bank_amount_cents,
        concept=req.bank_concept,
        payer_or_payee=req.bank_concept,
    )

    inv = CanonicalInvoice(
        invoice_id=f"INV-{req.invoice_number}",
        invoice_number=req.invoice_number,
        issue_date=req.invoice_due_date,
        due_date=req.invoice_due_date,
        customer_id="CUST-01",
        customer_name=req.customer_name,
        gross_amount_cents=req.invoice_amount_cents,
        customer_fiscal_id=req.customer_fiscal_id,
    )

    eval_res = BankDisambiguationScorer.evaluate(bank_tx, inv)

    return DisambiguationTransferResponse(
        status=eval_res.status.value,
        confidence_score=eval_res.confidence_score,
        s_importe=eval_res.s_importe,
        s_fecha=eval_res.s_fecha,
        s_texto=eval_res.s_texto,
        fiscal_match=eval_res.fiscal_match,
        invoice_number_match=eval_res.invoice_number_match,
        explanation=eval_res.explanation,
    )


@router.post("/reconcile/batch-payout", response_model=ReconcilePayoutResponse)
def reconcile_batch_payout(
    req: ReconcilePayoutRequest,
    invoices: List[CanonicalInvoice],
):
    """Ejecuta el motor de poda + MILP HiGHS / Meet-in-the-Middle y genera el pre-asiento contable PGC."""
    engine = BatchPayoutReconciliationEngine()

    bank_tx = CanonicalBankTransaction(
        transaction_id="API-PAYOUT-01",
        account_iban=req.bank_account_iban,
        operation_date=req.payout_date,
        value_date=req.payout_date,
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=req.payout_amount_cents,
        concept=f"Liquidación {req.gateway_id}",
    )

    report = engine.reconcile_payout(
        bank_tx=bank_tx,
        open_invoices=invoices,
        gateway_id=req.gateway_id,
        bank_account_code=req.bank_account_code,
        fee_account_code=req.fee_account_code,
    )

    if not report.is_reconciled or not report.journal_entry:
        return ReconcilePayoutResponse(
            is_reconciled=False,
            target_net_eur=req.payout_amount_cents / 100.0,
            matched_invoice_ids=[],
            total_gross_eur=0.0,
            total_fees_eur=0.0,
            solver_used="None",
            is_balanced=False,
            journal_lines=[],
        )

    lines_dto = [
        JournalLineDTO(
            account_code=l.account_code,
            concept=l.concept,
            document_number=l.document_number,
            debit_eur=float(l.debit_eur),
            credit_eur=float(l.credit_eur),
        )
        for l in report.journal_entry.lines
    ]

    return ReconcilePayoutResponse(
        is_reconciled=True,
        target_net_eur=req.payout_amount_cents / 100.0,
        matched_invoice_ids=report.matched_invoice_ids,
        total_gross_eur=report.total_gross_cents / 100.0,
        total_fees_eur=report.total_fees_cents / 100.0,
        solver_used=report.solver_used,
        is_balanced=report.journal_entry.is_balanced,
        journal_lines=lines_dto,
    )
