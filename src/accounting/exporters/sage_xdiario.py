"""
Exportador para Sage Despachos y Sage 50 (Estándar XDIARIO.csv)
Compatible con la estructura de diario contable del estándar ContaPlus / Sage 50.
Campos obligatorios:
Asiento,Fecha,Cuenta,Concepto,Documento,Debe,Haber,Factura,Contrapartida
"""
import io
import csv
from typing import List
from src.accounting.double_entry import DoubleEntryJournal, normalize_pgc_subaccount


class SageXdiarioExporter:
    HEADERS = [
        "Asiento",
        "Fecha",
        "Cuenta",
        "Concepto",
        "Documento",
        "Debe",
        "Haber",
        "Factura",
        "Contrapartida",
    ]

    @staticmethod
    def export_xdiario_csv(
        journals: List[DoubleEntryJournal],
        delimiter: str = ";",
        account_length: int = 9,
    ) -> str:
        output = io.StringIO()
        writer = csv.writer(output, delimiter=delimiter, lineterminator="\r\n")
        writer.writerow(SageXdiarioExporter.HEADERS)

        for journal in journals:
            if not journal.is_balanced:
                journal.check_balance()
                if not journal.is_balanced:
                    raise ValueError(
                        f"El asiento {journal.entry_number} presenta descuadre ({journal.imbalance_cents} céntimos). "
                        f"Sage 50 rechaza importaciones desbalanceadas."
                    )

            date_str = journal.entry_date.strftime("%d/%m/%Y")
            entry_num = journal.entry_number

            for line in journal.lines:
                acct = normalize_pgc_subaccount(line.account_code, account_length)
                contra = normalize_pgc_subaccount(line.contrapartida or "", account_length)
                debit_val = f"{line.debit_cents / 100.0:.2f}" if line.debit_cents > 0 else "0.00"
                credit_val = f"{line.credit_cents / 100.0:.2f}" if line.credit_cents > 0 else "0.00"
                concept = (line.concept or "").replace(delimiter, " ").strip()[:40]
                doc = (line.document_number or "").replace(delimiter, " ").strip()[:15]

                writer.writerow([
                    entry_num,
                    date_str,
                    acct,
                    concept,
                    doc,
                    debit_val,
                    credit_val,
                    doc,
                    contra,
                ])

        return output.getvalue()
