"""
Parser de Liquidaciones y Operaciones de Redsys (TPV Virtual y Físico)
Soporta volcados tabulares de Redsys en CSV / Excel exportados desde el portal de administración del banco.
"""
import csv
import io
from datetime import datetime
from typing import Dict, List, Optional, Union

from src.parsers.base import CanonicalBatchPayout, CanonicalGatewayTransaction


class RedsysParser:
    @staticmethod
    def parse_operations_csv(csv_content: Union[str, bytes], delimiter: str = ";") -> List[CanonicalGatewayTransaction]:
        """
        Parsea el volcado estándar de operaciones de Redsys TPV (Canalweb / Comercios).
        Campos típicos en España:
        - Terminal / TPV
        - Fecha / Hora
        - Número Pedido / Referencia
        - Tipo Operación (0000 / SIS0000 = Autorización/Venta, 0900 = Devolución)
        - Importe / Importe Bruto
        - Tasa de Descuento / Comisión
        - Importe Líquido / Neto
        - Número Autorización
        """
        if isinstance(csv_content, bytes):
            # Redsys a veces descarga en windows-1252 o latin-1
            for enc in ["utf-8", "windows-1252", "iso-8859-15"]:
                try:
                    text = csv_content.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                text = csv_content.decode("latin1", errors="replace")
        else:
            text = csv_content

        # Auto-detectar delimitador si no es ';'
        sample_line = text.splitlines()[0] if text.splitlines() else ""
        if ";" not in sample_line and "," in sample_line:
            delimiter = ","

        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        transactions: List[CanonicalGatewayTransaction] = []

        for row in reader:
            # Normalizar nombres de columnas eliminando espacios y mayúsculas
            norm_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}

            order_id = (
                norm_row.get("número pedido")
                or norm_row.get("num. pedido")
                or norm_row.get("pedido")
                or norm_row.get("referencia")
                or norm_row.get("orden")
                or ""
            )
            auth_code = norm_row.get("autorización") or norm_row.get("autorizacion") or norm_row.get("código aut.") or ""
            tx_id = f"RED-{order_id}-{auth_code}" if order_id or auth_code else f"RED-{len(transactions)+1}"

            op_type_raw = norm_row.get("tipo operación") or norm_row.get("tipo operacion") or norm_row.get("operación") or "0000"
            is_refund = "0900" in op_type_raw or "devolución" in op_type_raw.lower() or "devolucion" in op_type_raw.lower()
            tx_type = "refund" if is_refund else "charge"

            gross_str = (
                norm_row.get("importe bruto")
                or norm_row.get("importe")
                or norm_row.get("cantidad")
                or "0"
            )
            fee_str = (
                norm_row.get("tasa descuento")
                or norm_row.get("comisión")
                or norm_row.get("comision")
                or "0"
            )
            net_str = (
                norm_row.get("importe líquido")
                or norm_row.get("importe liquido")
                or norm_row.get("neto")
                or ""
            )

            gross_cents = RedsysParser._to_cents(gross_str)
            fee_cents = RedsysParser._to_cents(fee_str)

            if net_str:
                net_cents = RedsysParser._to_cents(net_str)
            else:
                net_cents = gross_cents - fee_cents

            # Si es devolución, ajustar signo si no viene negativo
            if is_refund:
                if gross_cents > 0:
                    gross_cents = -gross_cents
                if net_cents > 0:
                    net_cents = -net_cents

            date_str = norm_row.get("fecha") or ""
            time_str = norm_row.get("hora") or "00:00:00"
            created_dt = RedsysParser._parse_datetime(f"{date_str} {time_str}".strip())

            tx = CanonicalGatewayTransaction(
                transaction_id=tx_id,
                gateway_id="redsys",
                created_at=created_dt,
                type=tx_type,
                gross_cents=gross_cents,
                fee_cents=fee_cents,
                net_cents=net_cents,
                currency="EUR",
                order_id=order_id,
                customer_name=f"TPV Auth: {auth_code}",
            )
            transactions.append(tx)

        return transactions

    @staticmethod
    def _to_cents(val_str: str) -> int:
        if not val_str:
            return 0
        cleaned = val_str.replace("€", "").replace(" ", "").strip()
        # Formato español 1.234,56 o 12,50
        if "," in cleaned and "." in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        try:
            return int(round(float(cleaned) * 100))
        except ValueError:
            return 0

    @staticmethod
    def _parse_datetime(dt_str: str) -> datetime:
        formats = [
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y",
            "%Y-%m-%d",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(dt_str.strip(), fmt)
            except ValueError:
                continue
        return datetime.now()
