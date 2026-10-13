"""
Orquestador de Conciliación Algorítmica de Liquidaciones Agrupadas (Batch Payouts)
Integra:
1. Poda Heurística en 3 niveles
2. Selección automática entre Horowitz-Sahni (Meet-in-the-Middle) y HiGHS MILP
3. Formulación rigurosa con función objetivo contra subconjuntos espurios
4. Generación automática del asiento cuadrado en partida doble (572 / 626 / 430)
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, CanonicalGatewayTransaction
from src.reconciliation.pruning import ReconciliationPruner
from src.reconciliation.meet_in_the_middle import MeetInTheMiddleSolver, SubsetSumCandidate
from src.reconciliation.milp_solver import HighsMILPSolver, MILPInvoiceCandidate, MILPRefundCandidate
from src.accounting.double_entry import AccountingEntryBuilder, DoubleEntryJournal


@dataclass
class ReconciliationReport:
    is_reconciled: bool
    payout_id: str
    target_net_cents: int
    matched_invoice_ids: List[str]
    matched_refund_ids: List[str]
    matched_invoices: List[CanonicalInvoice] = field(default_factory=list)
    total_gross_cents: int = 0
    total_fees_cents: int = 0
    total_net_cents: int = 0
    discrepancy_cents: float = 0.0
    solver_used: str = ""
    journal_entry: Optional[DoubleEntryJournal] = None
    pruning_stats: dict = field(default_factory=dict)


class BatchPayoutReconciliationEngine:
    def __init__(
        self,
        default_alpha_rate: float = 0.015,       # 1.5% comisión variable estimada
        default_beta_cents: int = 25,             # 0.25 € comisión fija
        tolerance_cents: int = 2,
    ):
        self.default_alpha_rate = default_alpha_rate
        self.default_beta_cents = default_beta_cents
        self.tolerance_cents = tolerance_cents

    def reconcile_payout(
        self,
        bank_tx: CanonicalBankTransaction,
        open_invoices: List[CanonicalInvoice],
        gateway_transactions: Optional[List[CanonicalGatewayTransaction]] = None,
        gateway_id: Optional[str] = "stripe",
        bank_account_code: str = "572000001",
        fee_account_code: str = "626000001",
        entry_number: int = 1,
    ) -> ReconciliationReport:
        """
        Concilia un apunte bancario correspondiente al cobro neto de una liquidación
        frente al catálogo de facturas pendientes de cobro.
        """
        target_net = bank_tx.amount_cents
        payout_date = bank_tx.operation_date

        # 1. Poda Heurística
        pruned_res = ReconciliationPruner.prune(
            target_net_cents=target_net,
            payout_date=payout_date,
            candidates=open_invoices,
            gateway_id=gateway_id,
        )
        candidates = pruned_res.invoices
        stats = pruned_res.pruning_stats

        if not candidates:
            return ReconciliationReport(
                is_reconciled=False,
                payout_id=bank_tx.transaction_id,
                target_net_cents=target_net,
                matched_invoice_ids=[],
                matched_refund_ids=[],
                pruning_stats=stats,
            )

        # Mapeo de transacciones de pasarela si se han aportado
        gw_fee_map: Dict[str, int] = {}
        if gateway_transactions:
            for gtx in gateway_transactions:
                if gtx.order_id:
                    gw_fee_map[gtx.order_id] = gtx.fee_cents

        # Preparar candidatos para los solvers
        milp_candidates: List[MILPInvoiceCandidate] = []
        mitm_candidates: List[SubsetSumCandidate] = []

        for inv in candidates:
            gross = inv.gross_amount_cents
            # Comisión teórica esperada c_i = alpha * A_i + beta
            theo_fee = int(round(gross * self.default_alpha_rate + self.default_beta_cents))
            
            # Comisión observada (si viene del reporte de pasarela, si no usar la teórica)
            obs_fee = gw_fee_map.get(inv.invoice_number, theo_fee)
            net_val = gross - obs_fee

            milp_candidates.append(
                MILPInvoiceCandidate(
                    invoice_id=inv.invoice_id,
                    gross_cents=gross,
                    observed_fee_cents=obs_fee,
                    theoretical_fee_cents=theo_fee,
                    net_cents=net_val,
                )
            )

            mitm_candidates.append(
                SubsetSumCandidate(
                    item_id=inv.invoice_id,
                    net_cents=net_val,
                    gross_cents=gross,
                    fee_cents=obs_fee,
                )
            )

        solver_name = ""
        matched_inv_ids: List[str] = []
        delta_val = 0.0

        # Si n <= 24 y no hay discrepancia en comisiones observadas vs teóricas, probar Meet-in-the-Middle
        can_use_mitm = len(mitm_candidates) <= 24 and all(
            m.observed_fee_cents == m.theoretical_fee_cents for m in milp_candidates
        )

        if can_use_mitm:
            mitm_res = MeetInTheMiddleSolver.solve(
                target_net_cents=target_net,
                candidates=mitm_candidates,
                tolerance_cents=self.tolerance_cents,
            )
            if mitm_res:
                matched_inv_ids = mitm_res.matched_ids
                delta_val = float(mitm_res.delta_cents)
                solver_name = "Meet-in-the-Middle (Horowitz-Sahni)"

        # Si MITM no aplicaba o no encontró solución exacta, ejecutar HiGHS MILP con la función objetivo optimizada
        if not matched_inv_ids:
            milp_res = HighsMILPSolver.solve(
                target_net_cents=target_net,
                invoices=milp_candidates,
                tolerance_cents=self.tolerance_cents,
                lambda_1=100.0,
                lambda_2=1.0,
            )
            if milp_res.is_success and milp_res.matched_invoice_ids:
                matched_inv_ids = milp_res.matched_invoice_ids
                delta_val = milp_res.delta_cents
                solver_name = "HiGHS MILP (scipy.optimize.milp)"

        if not matched_inv_ids:
            return ReconciliationReport(
                is_reconciled=False,
                payout_id=bank_tx.transaction_id,
                target_net_cents=target_net,
                matched_invoice_ids=[],
                matched_refund_ids=[],
                pruning_stats=stats,
            )

        # Construir resultado enriquecido
        inv_by_id = {inv.invoice_id: inv for inv in candidates}
        matched_invoices_objs = [inv_by_id[iid] for iid in matched_inv_ids]

        milp_cand_by_id = {m.invoice_id: m for m in milp_candidates}
        total_gross = sum(inv.gross_amount_cents for inv in matched_invoices_objs)
        total_fees = sum(milp_cand_by_id[iid].observed_fee_cents for iid in matched_inv_ids)
        total_net = total_gross - total_fees

        # Preparar datos para el asiento contable
        invoice_rows_for_entry = [
            {
                "account_code": "430000001",
                "invoice_number": inv.invoice_number,
                "gross_cents": inv.gross_amount_cents,
                "fee_cents": milp_cand_by_id[inv.invoice_id].observed_fee_cents,
                "customer_name": inv.customer_name,
            }
            for inv in matched_invoices_objs
        ]

        journal_entry = AccountingEntryBuilder.build_payout_reconciliation_entry(
            entry_number=entry_number,
            entry_date=payout_date,
            bank_account_code=bank_account_code,
            fee_account_code=fee_account_code,
            payout_net_cents=target_net,
            matched_invoices=invoice_rows_for_entry,
            gateway_name=gateway_id.capitalize() if gateway_id else "Pasarela",
        )

        return ReconciliationReport(
            is_reconciled=True,
            payout_id=bank_tx.transaction_id,
            target_net_cents=target_net,
            matched_invoice_ids=matched_inv_ids,
            matched_refund_ids=[],
            matched_invoices=matched_invoices_objs,
            total_gross_cents=total_gross,
            total_fees_cents=total_fees,
            total_net_cents=total_net,
            discrepancy_cents=delta_val,
            solver_used=solver_name,
            journal_entry=journal_entry,
            pruning_stats=stats,
        )
