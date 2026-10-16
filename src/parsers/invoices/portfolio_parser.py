"""
Ingesta Tolerante a Fallos para Carteras de Facturas Emitidas (.csv, .xlsx, .json)
Autodescubre columnas (Factura, Cliente, NIF/CIF, Importe Bruto, Fecha, Subcuenta 430)
sin importar el orden o idioma de las cabeceras del Excel/CSV del cliente.
"""
import csv
import io
import json
import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import openpyxl


COLUMN_ALIASES = {
    "invoice_number": ["factura", "nº factura", "num factura", "numero", "invoice", "invoice_number", "documento", "ref", "pedido", "order id"],
    "customer_name": ["cliente", "razon social", "razón social", "nombre", "empresa", "customer", "customer_name", "titular"],
    "customer_fiscal_id": ["nif", "cif", "dni", "nie", "nif/cif", "identificador fiscal", "vat", "tax id", "customer_fiscal_id"],
    "gross_amount": ["total", "importe", "importe bruto", "total factura", "bruto", "amount", "gross", "gross_amount_cents", "base + iva"],
    "issue_date": ["fecha", "fecha emision", "fecha emisión", "fecha factura", "date", "issue_date", "created"],
    "account_code": ["subcuenta", "cuenta", "cuenta cliente", "430", "account", "account_code"],
}


def parse_spanish_amount_to_cents(raw_val: Any) -> int:
    if raw_val is None:
        return 0
    if isinstance(raw_val, (int, float)):
        # Si ya viene expresado en céntimos en un JSON (>10000 sin decimales y clave cents)
        return int(round(float(raw_val) * 100))
    s = str(raw_val).strip()
    s = re.sub(r"[€$£\sA-Za-z]", "", s)
    if not s:
        return 0
    # Detectar formato europeo 1.250,50 vs anglosajón 1,250.50
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return int(round(float(s) * 100))
    except ValueError:
        return 0


def parse_flexible_date(raw_val: Any) -> str:
    if not raw_val:
        return date.today().isoformat()
    if isinstance(raw_val, (datetime, date)):
        return raw_val.strftime("%Y-%m-%d")
    s = str(raw_val).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date.today().isoformat()


class InvoicePortfolioParser:
    @staticmethod
    def _extract_single_pdf_invoice(text: str, filename: str, idx: int = 1) -> Optional[Dict[str, Any]]:
        if not text or not text.strip():
            return None
        # 1. Número de Factura
        num_m = re.search(r'(?:N[º°]?\s*Factura|Factura\s*N[º°]?|Invoice\s*N[º°]?)\s*[:]?\s*([A-Za-z0-9\-_/]+)', text, re.IGNORECASE)
        if not num_m:
            num_m = re.search(r'\b(FRA-\d{4}-\d+|FAC-\d{4}-\d+|INV-\d{4}-\d+)\b', text, re.IGNORECASE)
        from pathlib import Path
        inv_number = num_m.group(1).strip() if num_m else Path(filename).stem

        # 2. Fecha de Emisión
        date_m = re.search(r'(?:Fecha\s*Emisi[óo]n|Fecha\s*Factura|Fecha|Date)\s*[:]?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-\d{2}-\d{4})', text, re.IGNORECASE)
        issue_date = parse_flexible_date(date_m.group(1)) if date_m else date.today().isoformat()

        # 3. CIF / NIF del Cliente (priorizando bloque de datos del cliente)
        cif_m = re.search(r'DATOS\s*(?:FISCALES\s*)?DEL\s*CLIENTE[\s\S]*?(?:NIF\s*[/]?\s*CIF|CIF|NIF|DNI|NIE)\s*:\s*([A-Za-z0-9\-]{9,12})', text, re.IGNORECASE)
        if not cif_m:
            cif_m = re.search(r'(?:NIF\s*[/]?\s*CIF|CIF|NIF|DNI|NIE|VAT|Tax\s*ID)\s*:\s*([A-Za-z0-9\-]{9,12})', text, re.IGNORECASE)
        customer_fiscal_id = cif_m.group(1).strip().upper() if cif_m else ""

        # 4. Razón Social / Nombre del Cliente
        client_m = re.search(r'Raz[óo]n\s*Social\s*:\s*([^\r\n]+)', text, re.IGNORECASE)
        if not client_m:
            client_m = re.search(r'(?:Cliente|Customer)\s*:\s*([^\r\n]+)', text, re.IGNORECASE)
        if client_m:
            customer_name = client_m.group(1).strip()
            customer_name = re.sub(r'^(?:Raz[óo]n\s*Social|Cliente|Customer)\s*[:]?\s*', '', customer_name, flags=re.IGNORECASE).strip()
        else:
            customer_name = "Cliente Factura PDF"

        # 5. Importe Total
        total_m = re.search(r'(?:TOTAL\s*FACTURA|Total\s*a\s*Pagar|Total|Importe\s*Total|Gross\s*Amount)\s*[:]?\s*([\d\.,]+)', text, re.IGNORECASE)
        gross_cents = parse_spanish_amount_to_cents(total_m.group(1)) if total_m else 0

        if gross_cents <= 0:
            euro_m = re.findall(r'([\d\.,]+)\s*€', text)
            if euro_m:
                cents_candidates = [parse_spanish_amount_to_cents(e) for e in euro_m]
                gross_cents = max(cents_candidates) if cents_candidates else 0

        # 6. Subcuenta PGC
        subc_m = re.search(r'(?:Subcuenta\s*PGC|Subcuenta|Cuenta)\s*[:]?\s*(\d{9,12})', text, re.IGNORECASE)
        account_code = subc_m.group(1).strip() if subc_m else f"430{idx:06d}"

        if gross_cents > 0:
            return {
                "invoice_id": f"INV-PDF-{idx:04d}",
                "invoice_number": inv_number,
                "customer_name": customer_name,
                "customer_fiscal_id": customer_fiscal_id,
                "gross_amount_cents": gross_cents,
                "gross_amount_eur": round(gross_cents / 100.0, 2),
                "issue_date": issue_date,
                "account_code": account_code,
            }
        return None

    @staticmethod
    def parse_pdf_bytes(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
        """Extrae facturas a partir de documentos PDF utilizando pypdf y expresiones regulares contables."""
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            invoices: List[Dict[str, Any]] = []

            # 1. Si el PDF tiene múltiples páginas, verificar si cada página contiene una factura distinta
            if len(reader.pages) > 1:
                for idx, page in enumerate(reader.pages, start=1):
                    txt = page.extract_text() or ""
                    inv = InvoicePortfolioParser._extract_single_pdf_invoice(txt, filename, idx)
                    if inv:
                        invoices.append(inv)

            # 2. Si no se extrajeron facturas por páginas (o es PDF de una página), procesar el documento completo
            if not invoices:
                full_text = "\n".join([page.extract_text() or "" for page in reader.pages])
                inv = InvoicePortfolioParser._extract_single_pdf_invoice(full_text, filename, 1)
                if inv:
                    invoices.append(inv)

            return invoices
        except Exception:
            return []

    @staticmethod
    def parse_file_bytes(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
        fname = (filename or "").lower()
        if fname.endswith(".pdf") or file_bytes.startswith(b"%PDF"):
            return InvoicePortfolioParser.parse_pdf_bytes(file_bytes, filename)

        if fname.endswith(".json"):
            data = json.loads(file_bytes.decode("utf-8", errors="replace"))
            if isinstance(data, list):
                return InvoicePortfolioParser._normalize_records(data, is_cents_json=True)
            return []

        if fname.endswith(".xlsx"):
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                return []
            headers = [str(h or "").strip() for h in rows[0]]
            dict_rows = [dict(zip(headers, r)) for r in rows[1:] if any(r)]
            return InvoicePortfolioParser._normalize_records(dict_rows)

        # Fallback CSV con autodetección de codificación y delimitador (; o ,)
        text = None
        for enc in ("utf-8-sig", "iso-8859-15", "windows-1252", "utf-8"):
            try:
                text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            text = file_bytes.decode("utf-8", errors="replace")

        sample_line = text.splitlines()[0] if text.splitlines() else ""
        delimiter = ";" if sample_line.count(";") >= sample_line.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        return InvoicePortfolioParser._normalize_records(list(reader))

    @staticmethod
    def _match_column(headers: List[str], field_key: str) -> Optional[str]:
        aliases = COLUMN_ALIASES.get(field_key, [])
        for h in headers:
            h_clean = h.lower().strip()
            if h_clean in aliases or any(a in h_clean for a in aliases):
                return h
        return None

    @staticmethod
    def _normalize_records(records: List[Dict[str, Any]], is_cents_json: bool = False) -> List[Dict[str, Any]]:
        if not records:
            return []
        headers = list(records[0].keys())
        col_inv = InvoicePortfolioParser._match_column(headers, "invoice_number")
        col_cust = InvoicePortfolioParser._match_column(headers, "customer_name")
        col_nif = InvoicePortfolioParser._match_column(headers, "customer_fiscal_id")
        col_amt = InvoicePortfolioParser._match_column(headers, "gross_amount")
        col_date = InvoicePortfolioParser._match_column(headers, "issue_date")
        col_acct = InvoicePortfolioParser._match_column(headers, "account_code")

        normalized: List[Dict[str, Any]] = []
        for idx, row in enumerate(records, start=1):
            raw_amt = row.get(col_amt) if col_amt else 0
            if is_cents_json and col_amt == "gross_amount_cents":
                gross_cents = int(raw_amt or 0)
            else:
                gross_cents = parse_spanish_amount_to_cents(raw_amt)

            if gross_cents <= 0:
                continue

            inv_num = str(row.get(col_inv) or f"FRA-{idx:04d}").strip()
            cust_name = str(row.get(col_cust) or "Cliente Cartera").strip()
            cust_nif = str(row.get(col_nif) or "").strip().upper()
            issue_dt = parse_flexible_date(row.get(col_date))
            acct_code = str(row.get(col_acct) or f"430{idx:06d}").strip()

            normalized.append({
                "invoice_id": f"INV-{idx:04d}",
                "invoice_number": inv_num,
                "customer_name": cust_name,
                "customer_fiscal_id": cust_nif,
                "gross_amount_cents": gross_cents,
                "gross_amount_eur": round(gross_cents / 100.0, 2),
                "issue_date": issue_dt,
                "account_code": acct_code,
            })

        return normalized
