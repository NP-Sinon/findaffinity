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
from src.accounting.double_entry import DoubleEntryJournal


class A3SuenlaceExporter:
    @staticmethod
    def export_journal_entries(journals: List[DoubleEntryJournal], account_length: int = 9) -> str:
        """
        Genera el fichero de texto plano conforme al protocolo Suenlace de Wolters Kluwer.
        Cada apunte representa una línea del asiento contable.
        """
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
                # Normalizar subcuenta a longitud fija (9 dígitos estándar)
                acct = line.account_code.replace(".", "").strip()
                if len(acct) < account_length:
                    # Rellenar con ceros después de los 3 primeros dígitos (ej. 572 -> 572000001)
                    prefix = acct[:3]
                    suffix = acct[3:]
                    acct = prefix + suffix.rjust(account_length - 3, "0")
                else:
                    acct = acct[:account_length]

                concept_str = line.concept.strip()[:30]
                doc_str = line.document_number.strip()[:10]

                if line.debit_cents > 0:
                    sign = "D"
                    amount_val = line.debit_cents / 100.0
                else:
                    sign = "H"
                    amount_val = line.credit_cents / 100.0

                contra = (line.contrapartida or "")[:account_length]

                # Formato delimitado estándar Suenlace A3 (Asiento;Fecha;Cuenta;Signo;Importe;Concepto;Documento;Contrapartida)
                record_line = f"{entry_str};{date_str};{acct};{sign};{amount_val:.2f};{concept_str};{doc_str};{contra}"
                lines.append(record_line)

        return "\r\n".join(lines) + "\r\n"
