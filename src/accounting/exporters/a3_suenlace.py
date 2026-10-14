"""
Exportador para Wolters Kluwer A3 (A3ASESOR / A3innu / A3eco)
Genera ficheros estructurados según el estándar de intercambio del Enlace Contable (Suenlace / a3conv).
Exige:
- Fecha: DDMMAAAA
- Subcuenta a nivel de 9 a 12 dígitos
- Concepto limitado a 30 caracteres
- Indicador Debe/Haber ('D' / 'H')
- Importe decimal con 2 decimales
- Cuadre nulo obligatorio del asiento
"""
from typing import List
from src.accounting.double_entry import DoubleEntryJournal, normalize_pgc_subaccount


class A3SuenlaceExporter:
    @staticmethod
    def export_journal_entries(journals: List[DoubleEntryJournal], account_length: int = 9) -> str:
        lines = []

        for journal in journals:
            if not journal.is_balanced:
                journal.check_balance()
                if not journal.is_balanced:
                    raise ValueError(
                        f"El asiento {journal.entry_number} no está cuadrado "
                        f"(Descuadre: {journal.imbalance_cents} céntimos). A3 rechazaría la importación."
                    )

            date_str = journal.entry_date.strftime("%d%m%Y")
            entry_str = f"{journal.entry_number:06d}"

            for line in journal.lines:
                acct = normalize_pgc_subaccount(line.account_code, account_length)
                contra = normalize_pgc_subaccount(line.contrapartida or "", account_length)
                concept_str = (line.concept or "").replace(";", " ").strip()[:30]
                doc_str = (line.document_number or "").replace(";", " ").strip()[:10]

                if line.debit_cents > 0:
                    sign = "D"
                    amount_val = line.debit_cents / 100.0
                else:
                    sign = "H"
                    amount_val = line.credit_cents / 100.0

                record_line = f"{entry_str};{date_str};{acct};{sign};{amount_val:.2f};{concept_str};{doc_str};{contra}"
                lines.append(record_line)

        return "\r\n".join(lines) + ("\r\n" if lines else "")
