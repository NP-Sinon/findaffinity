"""
Parser de Liquidaciones y Transacciones de Stripe
Procesa informes oficiales de 'Balance Transactions' y liquidaciones (Payouts) de Stripe.
"""
import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Union

from src.parsers.base import CanonicalBatchPayout, CanonicalGatewayTransaction


class StripeParser:
    @staticmethod
    def parse_balance_transactions_csv(csv_content: Union[str, bytes]) -> List[CanonicalGatewayTransaction]:
        """
        Procesa el fichero CSV oficial de transacciones de saldo de Stripe
        (campos: id, Type, Gross, Fee, Net, Created (UTC), Description, Source, etc.).
        """
        if isinstance(csv_content, bytes):
            # Stripe usa UTF-8
            text = csv_content.decode("utf-8", errors="replace")
        else:
            text = csv_content

        reader = csv.DictReader(io.StringIO(text))
        transactions: List[CanonicalGatewayTransaction] = []

        for row in reader:
            tx_id = row.get("id") or row.get("Balance transaction ID") or ""
            if not tx_id:
                continue

            tx_type = row.get("Type") or row.get("Reporting Category") or "charge"
            tx_type = tx_type.lower()

            # Extraer importes y convertir a céntimos enteros
            gross_val = StripeParser._parse_currency_to_cents(row.get("Gross") or row.get("Amount") or "0")
            fee_val = StripeParser._parse_currency_to_cents(row.get("Fee") or "0")
            net_val = StripeParser._parse_currency_to_cents(row.get("Net") or "0")

            currency = (row.get("Currency") or "eur").upper()
            created_str = row.get("Created (UTC)") or row.get("Created") or ""
            created_dt = StripeParser._parse_datetime(created_str)

            order_id = row.get("Source") or row.get("Payment ID") or row.get("Customer ID") or ""
            desc = row.get("Description") or ""
            payout_id = row.get("Payout ID") or row.get("Automatic payout ID") or None

            tx = CanonicalGatewayTransaction(
                transaction_id=tx_id,
                gateway_id="stripe",
                created_at=created_dt,
                type=tx_type,
                gross_cents=gross_val,
                fee_cents=fee_val,
                net_cents=net_val,
                currency=currency,
                order_id=order_id,
                customer_name=desc,
                payout_id=payout_id,
            )
            transactions.append(tx)

        return transactions

    @staticmethod
    def group_by_payout(transactions: List[CanonicalGatewayTransaction]) -> Dict[str, CanonicalBatchPayout]:
        """Agrupa transacciones individuales bajo sus respectivos payouts si vienen informados."""
        payouts: Dict[str, CanonicalBatchPayout] = {}
        for tx in transactions:
            pid = tx.payout_id or "unassigned"
            if pid not in payouts:
                payouts[pid] = CanonicalBatchPayout(
                    payout_id=pid,
                    gateway_id="stripe",
                    payout_date=tx.created_at.date(),
                    net_amount_cents=0,
                    currency=tx.currency,
                    transactions=[],
                )
            payouts[pid].transactions.append(tx)
            # Solo sumar cobros y deducciones (no el propio apunte payout que suele ser negativo)
            if tx.type != "payout":
                payouts[pid].net_amount_cents += tx.net_cents

        return payouts

    @staticmethod
    def _parse_currency_to_cents(val_str: str) -> int:
        if not val_str:
            return 0
        cleaned = val_str.strip().replace("€", "").replace("$", "").replace(" ", "")
        # Si tiene coma como separador decimal
        if "," in cleaned and "." not in cleaned:
            cleaned = cleaned.replace(",", ".")
        elif "," in cleaned and "." in cleaned:
            # ej. 1,234.56 o 1.234,56
            if cleaned.rfind(".") > cleaned.rfind(","):
                cleaned = cleaned.replace(",", "")
            else:
                cleaned = cleaned.replace(".", "").replace(",", ".")
        try:
            return int(round(float(cleaned) * 100))
        except ValueError:
            return 0

    @staticmethod
    def _parse_datetime(dt_str: str) -> datetime:
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S%z",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(dt_str.strip(), fmt)
            except ValueError:
                continue
        return datetime.now()
