"""
Motor de Poda Heurística en 3 Niveles para Mitigación de Complejidad Combinatoria
Reduce el espacio de búsqueda de O(2^N) a O(2^k) con k <= 25 antes de invocar los solvers.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional, Tuple

from src.parsers.base import CanonicalInvoice


@dataclass
class PrunedCandidates:
    invoices: List[CanonicalInvoice]
    pruning_stats: dict


class ReconciliationPruner:
    @staticmethod
    def prune(
        target_net_cents: int,
        payout_date: date,
        candidates: List[CanonicalInvoice],
        gateway_id: Optional[str] = None,
        max_lookback_days: int = 14,
        alpha_max: float = 0.05,    # Comisión porcentual máxima de pasarela (p.ej. 5%)
        beta_max_cents: int = 50,    # Comisión fija máxima por transacción en céntimos (0.50 €)
    ) -> PrunedCandidates:
        """
        Aplica los 3 niveles de poda descritos en el estudio de viabilidad:
        1. Ventana Temporal Dinámica: [t_payout - max_lookback_days, t_payout]
        2. Partición por Metadatos de Pasarela (Gateway ID)
        3. Acotación por Horquilla de Comisiones (Bounding Box)
        """
        initial_count = len(candidates)
        stats = {
            "initial_count": initial_count,
            "after_temporal": 0,
            "after_gateway": 0,
            "after_bounding": 0,
            "reduction_percentage": 0.0,
        }

        # Nivel 1: Ventana Temporal Desplazada
        # Una liquidación no puede incluir facturas emitidas después del abono, ni de fecha excesivamente antigua
        min_date = payout_date - timedelta(days=max_lookback_days)
        temporal_filtered = [
            inv for inv in candidates
            if min_date <= inv.issue_date <= payout_date
        ]
        stats["after_temporal"] = len(temporal_filtered)

        # Nivel 2: Partición por Pasarela (Gateway ID)
        # Si la liquidación proviene de Stripe, las facturas pagadas por Redsys o PayPal quedan excluidas
        if gateway_id:
            gw_clean = gateway_id.lower().strip()
            gateway_filtered = [
                inv for inv in temporal_filtered
                if not inv.gateway_id or inv.gateway_id.lower().strip() == gw_clean
            ]
        else:
            gateway_filtered = temporal_filtered
        stats["after_gateway"] = len(gateway_filtered)

        # Nivel 3: Acotación por Bounding Box de Comisiones
        # El importe bruto de una factura individual no puede ser inferior a un umbral mínimo
        # ni exceder sustancialmente el neto del payout bancario
        max_possible_gross = int(round((target_net_cents + beta_max_cents) / (1.0 - alpha_max)))
        bounding_filtered = [
            inv for inv in gateway_filtered
            if 0 < inv.gross_amount_cents <= max_possible_gross
        ]
        stats["after_bounding"] = len(bounding_filtered)

        reduction = (1.0 - (len(bounding_filtered) / initial_count)) * 100.0 if initial_count > 0 else 0.0
        stats["reduction_percentage"] = round(reduction, 2)

        return PrunedCandidates(invoices=bounding_filtered, pruning_stats=stats)
