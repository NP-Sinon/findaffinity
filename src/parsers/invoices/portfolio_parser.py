"""
FICHERO: src/parsers/invoices/portfolio_parser.py
Ingesta Masiva de Carteras de Facturas (.pdf, .xlsx, .csv, .json) por Archivos o Carpetas Completas
"""
import csv
import io
import json
import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import openpyxl
from pypdf import PdfReader


COLUMN_ALIASES = {
    "invoice_number": [
        "factura", "nº factura", "num factura", "numero", "invoice",
        "invoice_number", "documento", "ref", "pedido", "order id",
    ],
    "customer_name": [
        "cliente", "razon social", "razón social", "cliente / razón social",
        "nombre", "empresa", "customer", "customer_name", "titular",
    ],
    "customer_fiscal_id": [
        "nif", "cif", "dni", "nie", "nif/cif", "cif / nif",
        "identificador fiscal", "vat", "tax id", "customer_fiscal_id",
    ],
    "gross_amount": [
        "total factura (€)", "total factura", "total", "importe",
        "importe bruto", "bruto", "amount", "gross", "gross_amount_cents",
    ],
    "issue_date": [
        "fecha emisión", "fecha emision", "fecha", "fecha factura",
        "date", "issue_date", "created",
    ],
    "account_code": [
        "subcuenta 430", "subcuenta", "cuenta", "cuenta cliente",
        "430", "account", "account_code",
    ],
}


def parse_spanish_amount_to_cents(raw_val: Any) -> int:
    if raw_val is None:
        return 0
    if isinstance(raw_val, (int, float)):
        return int(round(float(raw_val) * 100))
    s = str(raw_val).strip()
    s = re.sub(r"[€$£\sA-Za-z]", "", s)
    if not s:
        return 0
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
    def parse_multiple_files(files_with_names: List[Tuple[bytes, str]]) -> List[Dict[str, Any]]:
        """
        Procesa una carpeta entera o lista de archivos (.pdf, .xlsx, .csv, .json)
        y consolida todas las facturas sin duplicados.
        """
        consolidated: List[Dict[str, Any]] = []
        seen_invoices = set()

        for idx, (f_bytes, f_name) in enumerate(files_with_names, start=1):
            if not f_bytes:
                continue
            parsed_items = InvoicePortfolioParser.parse_file_bytes(f_bytes, f_name, fallback_index=idx)
            for item in parsed_items:
                inv_key = f"{item.get('invoice_number')}_{item.get('gross_amount_cents')}"
                if inv_key not in seen_invoices:
                    seen_invoices.add(inv_key)
                    consolidated.append(item)

        return consolidated

    @staticmethod
    def parse_file_bytes(
        file_bytes: bytes,
        filename: str,
        fallback_index: int = 1,
    ) -> List[Dict[str, Any]]:
        fname = (filename or "").lower()

        if fname.endswith(".pdf"):
            pdf_item = InvoicePortfolioParser._parse_single_pdf(file_bytes, filename, fallback_index)
            return [pdf_item] if pdf_item else []

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
    def parse_pdf_bytes(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
        """Compatibilidad retrospectiva para parse_pdf_bytes."""
        item = InvoicePortfolioParser._parse_single_pdf(file_bytes, filename, 1)
        return [item] if item else []

    @staticmethod
    def _parse_single_pdf(
        file_bytes: bytes,
        filename: str,
        fallback_index: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """
        Extrae automáticamente los metadatos contables de una factura en PDF:
        Número de factura, NIF/CIF, Razón Social, Fecha, Subcuenta 430 e Importe Total.
        """
        text = ""
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                text += (page.extract_text() or "") + "\n"
        except Exception:
            text = ""

        base_name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        name_without_ext = re.sub(r"\.pdf$", "", base_name, flags=re.IGNORECASE)

        # 1. Número de Factura (desde texto o nombre de fichero ej. FRA-2026-001)
        inv_match = re.search(
            r"\b((?:FRA|FAC|INV|TPV|PRO|F)[-\s]?\d{4}[-\s]?\d{1,6})\b",
            text + " " + name_without_ext,
            flags=re.IGNORECASE,
        )
        inv_num = inv_match.group(1).upper().replace(" ", "-") if inv_match else f"FRA-2026-{fallback_index:03d}"

        # 2. NIF / CIF Español o Intracomunitario (ej. B-87654321, A-28001234, W0185698H)
        nif_matches = re.findall(
            r"\b([A-HJ-NP-SUVW][-\s]?\d{7}[0-9A-J]|\d{8}[-\s]?[A-Z]|[XYZ][-\s]?\d{7}[A-Z])\b",
            text.upper(),
        )
        # Si hay varios CIFs en el PDF (emisor y receptor), tomamos el del cliente receptor
        customer_nif = nif_matches[-1].replace(" ", "") if nif_matches else ""

        # 3. Subcuenta contable 430
        acct_match = re.search(r"\b(430\d{5,9})\b", text)
        if acct_match:
            account_code = acct_match.group(1)
        else:
            seq_digits = re.findall(r"\d+", inv_num)
            seq_num = int(seq_digits[-1]) if seq_digits else fallback_index
            account_code = f"430{seq_num:06d}"

        # 4. Fecha de emisión
        date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2}|\d{2}/\d{2}/20\d{2})\b", text)
        issue_date = parse_flexible_date(date_match.group(1)) if date_match else date.today().isoformat()

        # 5. Importe Total de la Factura en céntimos
        gross_cents = 0
        total_patterns = [
            r"TOTAL\s+FACTURA[^\d]*([\d.,]+)\s*€?",
            r"TOTAL\s+A\s+PAGAR[^\d]*([\d.,]+)\s*€?",
            r"IMPORTE\s+TOTAL[^\d]*([\d.,]+)\s*€?",
            r"TOTAL\s*\(?€\)?[^\d]*([\d.,]+)",
        ]
        for pat in total_patterns:
            m = re.search(pat, text, flags=re.IGNORECASE)
            if m:
                c = parse_spanish_amount_to_cents(m.group(1))
                if c > 0:
                    gross_cents = c
                    break

        if gross_cents <= 0:
            # Buscar todos los importes con formato moneda en el PDF y tomar el mayor (Total con IVA)
            all_amounts = re.findall(r"\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}(?=\s*€|\b)", text)
            cents_candidates = [parse_spanish_amount_to_cents(a) for a in all_amounts]
            # Filtrar años como 2026,00 si apareciesen
            valid_candidates = [c for c in cents_candidates if c > 0 and c != 202600]
            if valid_candidates:
                gross_cents = max(valid_candidates)

        # 6. Razón Social del Cliente
        customer_name = "Cliente Factura PDF"
        client_line_match = re.search(
            r"(?:Cliente|Raz[oó]n\s+Social|Destinatario)\s*[:\-]?\s*([^\n\r]{3,60})",
            text,
            flags=re.IGNORECASE,
        )
        if client_line_match:
            candidate_name = client_line_match.group(1).strip()
            if not any(k in candidate_name.lower() for k in ("cif", "nif", "fecha")):
                customer_name = candidate_name

        if customer_name == "Cliente Factura PDF" and "_" in name_without_ext:
            parts = name_without_ext.split("_", 1)
            if len(parts) == 2 and len(parts[1]) > 2:
                customer_name = parts[1].replace("_", " ").strip()

        if gross_cents <= 0:
            return None

        return {
            "invoice_id": f"INV-PDF-{fallback_index:04d}",
            "invoice_number": inv_num,
            "customer_name": customer_name,
            "customer_fiscal_id": customer_nif,
            "gross_amount_cents": gross_cents,
            "gross_amount_eur": round(gross_cents / 100.0, 2),
            "issue_date": issue_date,
            "account_code": account_code,
        }

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
