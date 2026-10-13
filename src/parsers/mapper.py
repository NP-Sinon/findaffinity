"""
Autodescubridor y Mapeador Inteligente de Ficheros de Clientes
Detecta automáticamente encabezados y estructuras heterogéneas enviadas por micropymes
(Hojas de cálculo de facturación, extractos CSV no estructurados).
"""
import csv
import io
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
    def detect_mapping(cls, headers: List[str]) -> Dict[str, str]:
        detected = {}
        cleaned_headers = [h.strip().lower() for h in headers]

        for target_field, candidates in cls.SYNONYMS.items():
            for idx, raw_h in enumerate(cleaned_headers):
                if raw_h in candidates:
                    detected[target_field] = headers[idx]
                    break
                # Búsqueda por contención
                elif any(cand in raw_h for cand in candidates):
                    detected[target_field] = headers[idx]
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
            inv_num = row.get(mapping.get("invoice_number", ""), "").strip()
            cust_name = row.get(mapping.get("customer_name", ""), "").strip()
            gross_str = row.get(mapping.get("gross_amount", ""), "0").strip()

            if not inv_num and not cust_name:
                continue

            gross_cents = cls._to_cents(gross_str)
            issue_date = cls._parse_date(row.get(mapping.get("issue_date", ""), ""))
            due_date = cls._parse_date(row.get(mapping.get("due_date", ""), "")) or issue_date
            fiscal_id = row.get(mapping.get("customer_fiscal_id", ""), "").strip() or None
            concept = row.get(mapping.get("concept", ""), "").strip()
            gateway = row.get(mapping.get("gateway_id", ""), "").strip().lower() or None

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
    def _to_cents(val_str: str) -> int:
        cleaned = val_str.replace("€", "").replace(" ", "").strip()
        if "," in cleaned and "." in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        try:
            return int(round(float(cleaned) * 100))
        except ValueError:
            return 0

    @staticmethod
    def _parse_date(dt_str: str) -> date:
        dt_str = dt_str.strip()
        for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"]:
            try:
                return datetime.strptime(dt_str, fmt).date()
            except ValueError:
                continue
        return date.today()
