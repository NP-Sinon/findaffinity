"""
Conector Directo con la API Oficial de Stripe (Modo Solo Lectura - Zero Liability)
Extrae liquidaciones agrupadas (/v1/payouts) y su desglose exacto de cargos,
devoluciones y comisiones (/v1/balance_transactions?payout=po_XXX).
"""
from dataclasses import dataclass, field
from datetime import datetime, date, timezone
from typing import List, Dict, Any, Optional
import stripe


@dataclass
class StripePayoutItem:
    transaction_id: str
    source_id: str
    item_type: str              # 'charge' | 'refund' | 'adjustment' | 'stripe_fee'
    gross_cents: int
    fee_cents: int
    net_cents: int
    currency: str
    created_date: date
    description: str
    invoice_reference: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None


@dataclass
class StripeSyncedPayout:
    payout_id: str
    arrival_date: date
    created_date: date
    net_payout_cents: int
    gross_total_cents: int
    fee_total_cents: int
    refund_total_cents: int
    currency: str
    status: str
    statement_descriptor: str
    items: List[StripePayoutItem] = field(default_factory=list)


class StripeDirectSyncService:
    @staticmethod
    def validate_readonly_key(api_key: str) -> bool:
        clean = (api_key or "").strip()
        return clean.startswith(("rk_live_", "rk_test_", "sk_test_", "sk_live_"))

    @staticmethod
    def fetch_reconciled_payouts(
        stripe_api_key: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        max_payouts: int = 15,
        open_invoices: Optional[List[Dict[str, Any]]] = None,
    ) -> List[StripeSyncedPayout]:
        """
        Consulta a Stripe los payouts liquidados en cuenta bancaria y obtiene
        exactamente qué facturas/cargos y qué comisiones componen cada transferencia.
        """
        if not StripeDirectSyncService.validate_readonly_key(stripe_api_key):
            raise ValueError(
                "Clave de Stripe no válida. Utilice una Clave Restringida de solo lectura (rk_live_... o rk_test_...)."
            )

        arrival_filter: Dict[str, int] = {}
        if start_date:
            dt_start = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=timezone.utc)
            arrival_filter["gte"] = int(dt_start.timestamp())
        if end_date:
            dt_end = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=timezone.utc)
            arrival_filter["lte"] = int(dt_end.timestamp())

        payout_params: Dict[str, Any] = {
            "limit": min(max_payouts, 50),
            "status": "paid",
            "api_key": stripe_api_key.strip(),
        }
        if arrival_filter:
            payout_params["arrival_date"] = arrival_filter

        payouts_resp = stripe.Payout.list(**payout_params)
        synced_payouts: List[StripeSyncedPayout] = []

        # Índice rápido de cartera viva por número de factura o importe bruto
        invoices_by_number: Dict[str, Dict[str, Any]] = {}
        if open_invoices:
            for inv in open_invoices:
                num = str(inv.get("invoice_number", "")).strip().upper()
                if num:
                    invoices_by_number[num] = inv

        for po in payouts_resp.data:
            po_id = po.id
            arrival_dt = datetime.fromtimestamp(po.arrival_date, tz=timezone.utc).date()
            created_dt = datetime.fromtimestamp(po.created, tz=timezone.utc).date()
            net_payout_cents = int(po.amount)

            # Obtener todas las transacciones incluidas en este Payout bancario
            bt_resp = stripe.BalanceTransaction.list(
                payout=po_id,
                limit=100,
                expand=["data.source"],
                api_key=stripe_api_key.strip(),
            )

            items: List[StripePayoutItem] = []
            gross_sum = 0
            fee_sum = 0
            refund_sum = 0

            for bt in bt_resp.data:
                if bt.type == "payout":
                    # Es el apunte resumen de salida al banco; lo omitimos del desglose
                    continue

                bt_gross = int(bt.amount)
                bt_fee = int(bt.fee)
                bt_net = int(bt.net)
                bt_created = datetime.fromtimestamp(bt.created, tz=timezone.utc).date()
                desc = bt.description or f"Operación Stripe {bt.id}"

                inv_ref = None
                cust_name = "Cliente Stripe"
                cust_email = None

                # Extraer metadatos del objeto source expandido (Charge / Refund)
                src = bt.source
                if src and not isinstance(src, str):
                    metadata = getattr(src, "metadata", {}) or {}
                    inv_ref = (
                        metadata.get("invoice_number")
                        or metadata.get("order_id")
                        or metadata.get("factura")
                    )
                    billing_details = getattr(src, "billing_details", None)
                    if billing_details:
                        cust_name = getattr(billing_details, "name", None) or cust_name
                        cust_email = getattr(billing_details, "email", None)

                # Cruzar con cartera de facturas si hay coincidencia en descripción o metadata
                if not inv_ref and invoices_by_number:
                    for cand_num, cand_inv in invoices_by_number.items():
                        if cand_num in desc.upper():
                            inv_ref = cand_num
                            cust_name = cand_inv.get("customer_name", cust_name)
                            break

                if bt.type in ("charge", "payment"):
                    gross_sum += bt_gross
                    fee_sum += bt_fee
                elif bt.type in ("refund", "payment_refund"):
                    refund_sum += abs(bt_gross)
                    fee_sum += bt_fee
                else:
                    fee_sum += bt_fee - bt_gross

                items.append(
                    StripePayoutItem(
                        transaction_id=bt.id,
                        source_id=src.id if (src and not isinstance(src, str)) else str(src or ""),
                        item_type=bt.type,
                        gross_cents=bt_gross,
                        fee_cents=bt_fee,
                        net_cents=bt_net,
                        currency=(bt.currency or "eur").upper(),
                        created_date=bt_created,
                        description=desc,
                        invoice_reference=inv_ref or f"ST-{bt.id[-6:].upper()}",
                        customer_name=cust_name,
                        customer_email=cust_email,
                    )
                )

            synced_payouts.append(
                StripeSyncedPayout(
                    payout_id=po_id,
                    arrival_date=arrival_dt,
                    created_date=created_dt,
                    net_payout_cents=net_payout_cents,
                    gross_total_cents=gross_sum,
                    fee_total_cents=fee_sum,
                    refund_total_cents=refund_sum,
                    currency=(po.currency or "eur").upper(),
                    status=po.status,
                    statement_descriptor=po.statement_descriptor or f"STRIPE PAYOUT {po_id}",
                    items=items,
                )
            )

        return synced_payouts
