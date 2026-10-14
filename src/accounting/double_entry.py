"""
Generador de Asientos Contables de Partida Doble (Plan General Contable Español)
Garantiza el cuadre matemático estricto al céntimo (Debe == Haber) y genera las líneas:
- 572 Bancos (Debe = Neto liquidado recibido)
- 626 Servicios bancarios / 669 Otros gastos financieros (Debe = Comisiones retenidas)
- 430 Clientes / Cartera (Haber = Bruto nominal de facturas conciliadas)
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List, Optional


def normalize_pgc_subaccount(code: str, length: int = 9) -> str:
    """
    Normaliza cualquier subcuenta contable (ej. '572.1', '43001') al ancho exacto
    exigido por el ERP (8, 9, 10 o 12 dígitos), rellenando con ceros tras el grupo (3 dígitos).
    """
    if not code:
        return ""
    clean = "".join(ch for ch in str(code).strip() if ch.isalnum())
    if not clean:
        return ""
    if len(clean) < length:
        prefix = clean[:3]
        suffix = clean[3:]
        return prefix + suffix.rjust(length - 3, "0")
    return clean[:length]


@dataclass
class JournalEntryLine:
    account_code: str          # Subcuenta a 9-12 dígitos (p.ej. 572000001, 430000145)
    account_name: str
    concept: str               # Máximo 30 caracteres para compatibilidad con A3
    document_number: str
    debit_cents: int = 0       # Importe al Debe en céntimos
    credit_cents: int = 0      # Importe al Haber en céntimos
    contrapartida: Optional[str] = None

    @property
    def debit_eur(self) -> Decimal:
        return Decimal(self.debit_cents) / Decimal(100)

    @property
    def credit_eur(self) -> Decimal:
        return Decimal(self.credit_cents) / Decimal(100)


@dataclass
class DoubleEntryJournal:
    entry_number: int
    entry_date: date
    description: str
    lines: List[JournalEntryLine] = field(default_factory=list)
    is_balanced: bool = False
    imbalance_cents: int = 0

    @property
    def total_debit_cents(self) -> int:
        return sum(l.debit_cents for l in self.lines)

    @property
    def total_credit_cents(self) -> int:
        return sum(l.credit_cents for l in self.lines)

    def check_balance(self) -> bool:
        diff = self.total_debit_cents - self.total_credit_cents
        self.imbalance_cents = diff
        self.is_balanced = (diff == 0)
        return self.is_balanced


class AccountingEntryBuilder:
    @staticmethod
    def build_payout_reconciliation_entry(
        entry_number: int,
        entry_date: date,
        bank_account_code: str,        # p.ej. "572000001"
        fee_account_code: str,         # p.ej. "626000001" o "669000001"
        payout_net_cents: int,
        matched_invoices: List[dict],  # dicts con: account_code, invoice_number, gross_cents, fee_cents, customer_name
        refunds: Optional[List[dict]] = None,
        gateway_name: str = "Stripe",
        account_length: int = 9,
    ) -> DoubleEntryJournal:
        """
        Construye el asiento compuesto de cuadre de liquidación agrupada.
        Garantiza cuadre a 0 céntimos absorbiendo desviaciones de redondeo (<= 2 céntimos).
        """
        bank_acct = normalize_pgc_subaccount(bank_account_code or "572000001", account_length)
        fee_acct = normalize_pgc_subaccount(fee_account_code or "626000001", account_length)

        journal = DoubleEntryJournal(
            entry_number=entry_number,
            entry_date=entry_date,
            description=f"Liquidación {gateway_name} {entry_date.strftime('%d/%m/%Y')}",
        )

        total_fees_cents = sum(int(inv.get("fee_cents", 0)) for inv in matched_invoices)
        first_customer_acct = normalize_pgc_subaccount(
            matched_invoices[0].get("account_code", "430000001") if matched_invoices else "430000001",
            account_length,
        )

        # 1. Línea Banco (572) -> DEBE por el neto abonado
        journal.lines.append(
            JournalEntryLine(
                account_code=bank_acct,
                account_name="Bancos c/c",
                concept=f"Liq. {gateway_name} {entry_date.strftime('%d/%m')}"[:30],
                document_number=f"LIQ-{entry_date.strftime('%Y%m%d')}",
                debit_cents=int(payout_net_cents),
                credit_cents=0,
                contrapartida=first_customer_acct,
            )
        )

        # 2. Línea Comisiones (626/669) -> DEBE por las comisiones retenidas
        if total_fees_cents > 0:
            journal.lines.append(
                JournalEntryLine(
                    account_code=fee_acct,
                    account_name="Servicios bancarios y comisiones",
                    concept=f"Comisiones {gateway_name}"[:30],
                    document_number=f"FEE-{entry_date.strftime('%Y%m%d')}",
                    debit_cents=total_fees_cents,
                    credit_cents=0,
                    contrapartida=bank_acct,
                )
            )

        # 3. Líneas de Facturas Clientes (430) -> HABER por el importe bruto
        for idx, inv in enumerate(matched_invoices, start=1):
            raw_cust_acct = inv.get("account_code") or f"430{idx:06d}"
            cust_acct = normalize_pgc_subaccount(raw_cust_acct, account_length)
            inv_num = str(inv.get("invoice_number", f"FRA-{idx}")).strip()
            cust_name = str(inv.get("customer_name", "Cliente")).strip()
            concept_str = f"Cobro Fra. {inv_num} {cust_name}"[:30]

            journal.lines.append(
                JournalEntryLine(
                    account_code=cust_acct,
                    account_name=f"Cliente: {cust_name}"[:40],
                    concept=concept_str,
                    document_number=inv_num[:15],
                    debit_cents=0,
                    credit_cents=int(inv["gross_cents"]),
                    contrapartida=bank_acct,
                )
            )

        # 4. Manejar devoluciones concurrentes (Refunds)
        if refunds:
            for ref in refunds:
                ref_acct = normalize_pgc_subaccount(ref.get("account_code") or "708000001", account_length)
                ref_gross = abs(int(ref.get("gross_cents", 0)))
                ref_fee = int(ref.get("fee_cents", 0))
                if ref_gross > 0:
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=ref_acct,
                            account_name="Devoluciones de ventas",
                            concept=f"Devolución {ref.get('refund_id', '')}"[:30],
                            document_number=str(ref.get("refund_id", "DEV"))[:15],
                            debit_cents=ref_gross,
                            credit_cents=0,
                            contrapartida=bank_acct,
                        )
                    )
                if ref_fee > 0:
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=fee_acct,
                            account_name="Comisión devolución pasarela",
                            concept=f"Gasto dev. {gateway_name}"[:30],
                            document_number=str(ref.get("refund_id", "FEE-DEV"))[:15],
                            debit_cents=ref_fee,
                            credit_cents=0,
                            contrapartida=bank_acct,
                        )
                    )

        # 5. Ajuste automático de redondeo (hasta 2 céntimos)
        journal.check_balance()
        if not journal.is_balanced and abs(journal.imbalance_cents) <= 2:
            diff = journal.imbalance_cents  # total_debit - total_credit
            fee_line = next((l for l in journal.lines if l.account_code == fee_acct), None)
            if fee_line:
                if fee_line.debit_cents - diff >= 0:
                    fee_line.debit_cents -= diff
                else:
                    fee_line.credit_cents += (diff - fee_line.debit_cents)
                    fee_line.debit_cents = 0
            else:
                # Si no había línea de comisión previa, creamos línea de ajuste por redondeo (669/626)
                if diff < 0:
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=fee_acct,
                            account_name="Ajuste redondeo pasarela",
                            concept=f"Redondeo {gateway_name}"[:30],
                            document_number=f"ADJ-{entry_date.strftime('%Y%m%d')}",
                            debit_cents=abs(diff),
                            credit_cents=0,
                            contrapartida=bank_acct,
                        )
                    )
                else:
                    journal.lines.append(
                        JournalEntryLine(
                            account_code=fee_acct,
                            account_name="Ajuste redondeo pasarela",
                            concept=f"Redondeo {gateway_name}"[:30],
                            document_number=f"ADJ-{entry_date.strftime('%Y%m%d')}",
                            debit_cents=0,
                            credit_cents=diff,
                            contrapartida=bank_acct,
                        )
                    )
            journal.check_balance()

        return journal
