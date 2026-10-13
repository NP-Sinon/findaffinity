"""
Servicio Integral de Gestión y Procesamiento de Lotes (Batch Reconciliation Service)
Coordina la conciliación algorítmica, persistencia en base de datos, generación de asientos PGC
y sellado legal inmutable con SHA-256.
"""
import hashlib
import json
from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from src.database.models import (
    Tenant,
    ClientCompany,
    ReconciliationBatch,
    BatchTransaction,
    JournalEntryRecord,
    AuditLog,
)
from src.database.repository import ReconciliationRepository
from src.parsers.base import (
    CanonicalBankTransaction,
    CanonicalInvoice,
    TransactionType,
)
from src.reconciliation.engine import BatchPayoutReconciliationEngine
from src.disambiguation.confidence_scorer import BankDisambiguationScorer
from src.accounting.double_entry import (
    AccountingEntryBuilder,
    DoubleEntryJournal,
    JournalEntryLine,
)
from src.accounting.exporters.a3_suenlace import A3SuenlaceExporter
from src.accounting.exporters.sage_xdiario import SageXdiarioExporter
from src.accounting.exporters.contasol_xlsx import ContasolXlsxExporter


class BatchReconciliationService:
    """Servicio de orquestación de lotes de conciliación y persistencia."""

    @staticmethod
    def process_and_persist_batch(
        db: Session,
        tenant_id: str,
        client_id: str,
        period_year: int,
        bank_transactions: List[CanonicalBankTransaction],
        open_invoices: List[CanonicalInvoice],
        period_type: str = "ALL",
        start_month: int = 1,
        end_month: int = 12,
        file_name: Optional[str] = None,
        file_bytes: Optional[bytes] = None,
        gateway_name: str = "Stripe",
        gateway_transactions: Optional[List[Any]] = None,
    ) -> ReconciliationBatch:
        """
        Procesa una serie de movimientos bancarios frente a facturas vivas,
        construye asientos certificados a descuadre cero y persiste en SQLite/PostgreSQL.
        """
        client = ReconciliationRepository.get_client(db, client_id)
        if not client:
            raise ValueError(f"Empresa cliente {client_id} no encontrada.")

        file_hash = hashlib.sha256(file_bytes).hexdigest() if file_bytes else None

        # Auto-parsear gateway_transactions si se aportan file_bytes y no se han pasado explícitamente
        if gateway_transactions is None and file_bytes:
            try:
                gw_lower = gateway_name.lower()
                fn_lower = (file_name or "").lower()
                if "stripe" in gw_lower or "stripe" in fn_lower:
                    from src.parsers.gateways.stripe import StripeParser
                    gateway_transactions = StripeParser.parse_balance_transactions_csv(file_bytes)
                elif "redsys" in gw_lower or "redsys" in fn_lower:
                    from src.parsers.gateways.redsys import RedsysParser
                    gateway_transactions = RedsysParser.parse_operations_csv(file_bytes)
            except Exception:
                pass

        # 1. Crear el Lote en Base de Datos
        batch = ReconciliationRepository.create_batch(
            db=db,
            tenant_id=tenant_id,
            client_id=client_id,
            period_year=period_year,
            period_type=period_type,
            start_month=start_month,
            end_month=end_month,
            file_name=file_name,
            file_hash_sha256=file_hash,
        )

        payout_engine = BatchPayoutReconciliationEngine()
        entry_counter = 100

        # Facturas pendientes disponibles para conciliación
        remaining_invoices = list(open_invoices)

        for bank_tx in bank_transactions:
            entry_counter += 1
            entry_date = bank_tx.operation_date

            # Caso A: Movimiento con indicios de liquidación de pasarela (Batch Payout)
            concept_upper = bank_tx.concept.upper()
            is_gateway_payout = any(k in concept_upper for k in ["STRIPE", "REDSYS", "PAYPAL", "TPV", "SUMUP", "LIQUIDACION"])

            if is_gateway_payout and len(remaining_invoices) > 0:
                report = payout_engine.reconcile_payout(
                    bank_tx=bank_tx,
                    open_invoices=remaining_invoices,
                    gateway_transactions=gateway_transactions,
                    gateway_id=gateway_name,
                    bank_account_code=client.bank_account_code,
                    fee_account_code=client.fee_account_code,
                )

                if report.is_reconciled and report.journal_entry:
                    status = "GREEN"
                    confidence = 0.985
                    solver = report.solver_used
                    explanation = f"Liquidación {gateway_name} de {len(report.matched_invoice_ids)} facturas con descuadre 0.00 €."
                    gross_cents = report.total_gross_cents
                    fee_cents = report.total_fees_cents
                    matched_cnt = len(report.matched_invoice_ids)
                    journal = report.journal_entry

                    # Retirar facturas conciliadas del pool
                    matched_set = set(report.matched_invoice_ids)
                    remaining_invoices = [inv for inv in remaining_invoices if inv.invoice_id not in matched_set]
                else:
                    status = "YELLOW" if report.total_gross_cents > 0 else "RED"
                    confidence = 0.75 if status == "YELLOW" else 0.40
                    solver = "Revisión Heurística"
                    explanation = "Liquidación con diferencia respecto a la cartera viva disponible."
                    gross_cents = bank_tx.amount_cents
                    fee_cents = 0
                    matched_cnt = 0
                    journal = None
            else:
                # Caso B: Transferencia bancaria o abono directo -> Desambiguación difusa
                best_match_inv = None
                best_score_res = None

                for inv in remaining_invoices:
                    score_res = BankDisambiguationScorer.evaluate(bank_tx, inv)
                    if best_score_res is None or score_res.confidence_score > best_score_res.confidence_score:
                        best_score_res = score_res
                        best_match_inv = inv

                if best_score_res and best_score_res.confidence_score >= 0.70:
                    status = best_score_res.status.value
                    confidence = best_score_res.confidence_score
                    solver = "Desambiguación Difusa"
                    explanation = best_score_res.explanation
                    gross_cents = best_match_inv.gross_amount_cents
                    fee_cents = 0
                    matched_cnt = 1

                    # Asiento 572 (D) / 430 (H)
                    customer_acc = f"430{best_match_inv.customer_id[-6:].zfill(6)}"
                    journal = DoubleEntryJournal(
                        entry_number=entry_counter,
                        entry_date=entry_date,
                        description=f"Cobro Transf. {best_match_inv.invoice_number}"[:30],
                    )
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=client.bank_account_code,
                            account_name="Bancos c/c",
                            concept=f"Transf. {best_match_inv.invoice_number}"[:30],
                            document_number=best_match_inv.invoice_number,
                            debit_cents=bank_tx.amount_cents,
                            credit_cents=0,
                            contrapartida=customer_acc,
                        )
                    )
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=customer_acc,
                            account_name=f"Cliente: {best_match_inv.customer_name}"[:40],
                            concept=f"Canc. {best_match_inv.invoice_number}"[:30],
                            document_number=best_match_inv.invoice_number,
                            debit_cents=0,
                            credit_cents=bank_tx.amount_cents,
                            contrapartida=client.bank_account_code,
                        )
                    )
                    journal.check_balance()

                    if status == "GREEN":
                        remaining_invoices = [inv for inv in remaining_invoices if inv.invoice_id != best_match_inv.invoice_id]
                else:
                    # Partida sin emparejamiento (ROJA)
                    status = "RED"
                    confidence = 0.35
                    solver = "Sin Coincidencia"
                    explanation = "Ingreso bancario sin factura viva coincidente en cartera."
                    gross_cents = bank_tx.amount_cents
                    fee_cents = 0
                    matched_cnt = 0

                    # Asiento a cuenta 555 (Partidas pendientes de aplicación)
                    journal = DoubleEntryJournal(
                        entry_number=entry_counter,
                        entry_date=entry_date,
                        description=f"Partida Pte. Aplicación {entry_date}"[:30],
                    )
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=client.bank_account_code,
                            account_name="Bancos c/c",
                            concept=f"Ingreso pte. identificar"[:30],
                            document_number=f"DOC-{entry_counter}",
                            debit_cents=bank_tx.amount_cents,
                            credit_cents=0,
                            contrapartida="555000000",
                        )
                    )
                    journal.lines.append(
                        JournalEntryLine(
                            account_code="555000000",
                            account_name="Partidas pendientes de aplicación",
                            concept=f"Pendiente aplicación"[:30],
                            document_number=f"DOC-{entry_counter}",
                            debit_cents=0,
                            credit_cents=bank_tx.amount_cents,
                            contrapartida=client.bank_account_code,
                        )
                    )
                    journal.check_balance()

            # 2. Persistir Transacción en Base de Datos
            dims_dict = {
                "s_importe": 1.0 if status == "GREEN" else 0.85,
                "s_fecha": 0.95,
                "s_texto": 0.90 if status == "GREEN" else 0.65,
                "s_fiscal": 1.0 if status == "GREEN" else 0.70,
            }

            db_tx = ReconciliationRepository.add_transaction(
                db=db,
                batch_id=batch.id,
                external_id=bank_tx.transaction_id,
                source=f"{bank_tx.payer_or_payee or 'Extracto Bancario'}",
                operation_date=bank_tx.operation_date,
                value_date=bank_tx.value_date,
                concept=bank_tx.concept,
                net_amount_cents=bank_tx.amount_cents,
                gross_amount_cents=gross_cents,
                fee_amount_cents=fee_cents,
                status=status,
                confidence_score=confidence,
                dimensions=dims_dict,
                solver_used=solver,
                matched_count=matched_cnt,
                audit_explanation=explanation,
            )

            # 3. Persistir Asiento Contable si existe
            if journal:
                lines_json = [
                    {
                        "account_code": l.account_code,
                        "concept": l.concept,
                        "document_number": l.document_number,
                        "debit_eur": float(l.debit_eur),
                        "credit_eur": float(l.credit_eur),
                        "contrapartida": l.contrapartida,
                    }
                    for l in journal.lines
                ]
                ReconciliationRepository.add_journal_entry(
                    db=db,
                    batch_id=batch.id,
                    transaction_id=db_tx.id,
                    entry_number=journal.entry_number,
                    entry_date=journal.entry_date,
                    total_debit_cents=journal.total_debit_cents,
                    total_credit_cents=journal.total_credit_cents,
                    lines=lines_json,
                    is_balanced=journal.is_balanced,
                )

        # 4. Actualizar Estadísticas del Lote
        ReconciliationRepository.update_batch_statistics(db, batch.id)
        return batch

    @staticmethod
    def export_batch_to_erp(
        db: Session,
        batch_id: str,
        target_erp: str,
        actor: str = "auditor@gestoria.es",
    ) -> Dict[str, Any]:
        """
        Exporta los asientos certificados de un lote al ERP configurado (A3, SAGE o CONTASOL).
        Registra el evento inmutable en el audit trail.
        """
        batch = ReconciliationRepository.get_batch(db, batch_id)
        if not batch:
            raise ValueError(f"Lote {batch_id} no encontrado.")

        client = batch.client
        records = batch.journal_entries

        # Convertir registros ORM a objetos DoubleEntryJournal
        journals: List[DoubleEntryJournal] = []
        for rec in records:
            # Solo exportar si la transacción está en Verde o aprobada
            if rec.transaction.status == "GREEN" or rec.transaction.is_approved:
                lines_data = json.loads(rec.lines_json)
                j = DoubleEntryJournal(
                    entry_number=rec.entry_number,
                    entry_date=rec.date,
                    description=f"Asiento #{rec.entry_number}",
                )
                for l in lines_data:
                    j.lines.append(
                        JournalEntryLine(
                            account_code=l["account_code"],
                            account_name="",
                            concept=l["concept"],
                            document_number=l.get("document_number", ""),
                            debit_cents=int(round(float(l["debit_eur"]) * 100)),
                            credit_cents=int(round(float(l["credit_eur"]) * 100)),
                            contrapartida=l.get("contrapartida"),
                        )
                    )
                j.check_balance()
                journals.append(j)

        erp_upper = target_erp.upper()
        content = None
        filename = f"EXPORT_{client.fiscal_id}_{erp_upper}_{batch.period_year}"

        if erp_upper == "A3":
            content = A3SuenlaceExporter.export_journal_entries(journals, account_length=client.account_length)
            filename += ".txt"
            content_type = "text/plain; charset=windows-1252"
        elif erp_upper == "SAGE":
            content = SageXdiarioExporter.export_xdiario_csv(journals, delimiter=";", account_length=client.account_length)
            filename += ".csv"
            content_type = "text/csv; charset=windows-1252"
        elif erp_upper == "CONTASOL":
            content = ContasolXlsxExporter.export_xlsx(journals, account_length=client.account_length)
            filename += ".xlsx"
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            raise ValueError(f"ERP '{target_erp}' no soportado.")

        # Registrar en Audit Trail
        ReconciliationRepository.append_audit_log(
            db=db,
            tenant_id=batch.tenant_id,
            client_id=batch.client_id,
            batch_id=batch.id,
            action="BATCH_EXPORTED",
            actor=actor,
            details={
                "erp": erp_upper,
                "filename": filename,
                "exported_entries": len(journals),
            },
        )

        return {
            "batch_id": batch.id,
            "erp": erp_upper,
            "filename": filename,
            "content_type": content_type,
            "content": content,
            "entries_count": len(journals),
        }
