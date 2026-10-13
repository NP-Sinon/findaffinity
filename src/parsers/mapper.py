"""
Autodescubridor y Mapeador Inteligente de Ficheros de Clientes
Detecta automáticamente encabezados y estructuras heterogéneas enviadas por micropymes
(Hojas de cálculo de facturación, extractos CSV no estructurados).
"""
import csv
import io
import math
from datetime import date, datetime
from typing import Dict, List, Optional, Union

from src.parsers.base import CanonicalInvoice


class ColumnMapper:
    """Mapeo difuso de sinónimos habituales en facturas emitidas por pymes españolas."""
    SYNONYMS = {
        "invoice_number": ["número", "numero", "nº factura", "num_factura", "factura", "doc", "invoice_no", "invoice_id"],
        "issue_date": ["fecha", "fecha emisión", "fecha_emision", "date", "f.factura", "fecha_fra"],
        "due_date": ["vencimiento", "fecha vencimiento", "fecha_vto", "f.vto", "due_date"],
        "customer_name": ["cliente", "nombre", "razón social", "razon_social", "destinatario", "customer"],
        "customer_fiscal_id": ["cif", "nif", "cif/nif", "nif/cif", "dni", "vat_number", "id_fiscal"],
        "gross_amount": ["total", "importe", "total factura", "bruto", "amount", "total_fra", "importe_total"],
        "concept": ["concepto", "descripción", "descripcion", "observaciones", "artículos", "lineas"],
        "gateway_id": ["pasarela", "forma de pago", "forma_pago", "medio_pago", "gateway", "canal_cobro"],
    }

    @classmethod
    def detect_mapping(cls, headers: List[Optional[str]]) -> Dict[str, str]:
        detected = {}
        if not headers:
            return detected

        cleaned_headers = [
            (h.strip().lower() if h and isinstance(h, str) else "")
            for h in headers
        ]

        for target_field, candidates in cls.SYNONYMS.items():
            for idx, raw_h in enumerate(cleaned_headers):
                if not raw_h:
                    continue
                orig_h = headers[idx]
                if orig_h is None:
                    continue
                if raw_h in candidates:
                    detected[target_field] = orig_h
                    break
                # Búsqueda por contención
                elif any(cand in raw_h for cand in candidates):
                    detected[target_field] = orig_h
                    break

        return detected

    @classmethod
    def parse_invoices_csv(cls, csv_content: Union[str, bytes]) -> List[CanonicalInvoice]:
        if isinstance(csv_content, bytes):
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

        # Auto-detectar delimitador
        first_line = text.splitlines()[0] if text.splitlines() else ""
        delim = ";" if ";" in first_line else ","

        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        if not reader.fieldnames:
            return []

        mapping = cls.detect_mapping(reader.fieldnames)
        invoices: List[CanonicalInvoice] = []

        for row in reader:
            if not row:
                continue

            def _safe_get(field_key: str, default: str = "") -> str:
                mapped_col = mapping.get(field_key)
                if not mapped_col:
                    return default
                val = row.get(mapped_col)
                return val.strip() if val and isinstance(val, str) else default

            inv_num = _safe_get("invoice_number", "")
            cust_name = _safe_get("customer_name", "")
            gross_str = _safe_get("gross_amount", "0")

            if not inv_num and not cust_name:
                continue

            gross_cents = cls._to_cents(gross_str)
            issue_date = cls._parse_date(_safe_get("issue_date", ""))
            due_date = cls._parse_date(_safe_get("due_date", "")) or issue_date
            fiscal_id = _safe_get("customer_fiscal_id", "") or None
            concept = _safe_get("concept", "")
            gateway_raw = _safe_get("gateway_id", "")
            gateway = gateway_raw.lower() if gateway_raw else None

            inv = CanonicalInvoice(
                invoice_id=f"INV-{inv_num or len(invoices)+1}",
                invoice_number=inv_num,
                issue_date=issue_date,
                due_date=due_date,
                customer_id=fiscal_id or f"CUST-{len(invoices)+1}",
                customer_name=cust_name,
                customer_fiscal_id=fiscal_id,
                gross_amount_cents=gross_cents,
                concept=concept,
                gateway_id=gateway,
            )
            invoices.append(inv)

        return invoices

    @staticmethod
    def _to_cents(val_str: Optional[str]) -> int:
        if not val_str or not isinstance(val_str, str):
            return 0
        cleaned = val_str.replace("€", "").replace("$", "").replace(" ", "").strip()
        if cleaned.lower() in ("nan", "null", "none", "n/a", "--", "inf", "-inf", "infinity", "-infinity"):
            return 0
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            if cleaned.count(",") > 1:
                last_comma = cleaned.rfind(",")
                cleaned = cleaned[:last_comma].replace(",", "") + "." + cleaned[last_comma + 1:]
            else:
                cleaned = cleaned.replace(",", ".")
        elif "." in cleaned and cleaned.count(".") > 1:
            last_dot = cleaned.rfind(".")
            cleaned = cleaned[:last_dot].replace(".", "") + "." + cleaned[last_dot + 1:]
        try:
            val = float(cleaned)
            if math.isnan(val) or math.isinf(val):
                return 0
            return int(round(val * 100))
        except (ValueError, OverflowError):
            return 0

    @staticmethod
    def _parse_date(dt_str: Optional[str]) -> date:
        if not dt_str or not isinstance(dt_str, str):
            return date.today()
        dt_str = dt_str.strip()
        for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"]:
            try:
                return datetime.strptime(dt_str, fmt).date()
            except ValueError:
                continue
        return date.today()
