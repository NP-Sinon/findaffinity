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
    ) -> DoubleEntryJournal:
        """
        Construye el asiento compuesto de cuadre de liquidación agrupada.
        DEBE:
          572xxx (Bancos) = payout_net_cents
          626xxx (Comisiones) = sum(fee_cents)
        HABER:
          430xxx (Clientes por factura) = gross_cents cada una
        """
        journal = DoubleEntryJournal(
            entry_number=entry_number,
            entry_date=entry_date,
            description=f"Liquidación {gateway_name} {entry_date.strftime('%d/%m/%Y')}",
        )

        total_fees_cents = sum(inv.get("fee_cents", 0) for inv in matched_invoices)
        total_gross_cents = sum(inv.get("gross_cents", 0) for inv in matched_invoices)

        # 1. Línea Banco (572) -> DEBE por el neto abonado
        journal.lines.append(
            JournalEntryLine(
                account_code=bank_account_code,
                account_name="Bancos c/c",
                concept=f"Liq. {gateway_name} {entry_date.strftime('%d/%m')}"[:30],
                document_number=f"LIQ-{entry_date.strftime('%Y%m%d')}",
                debit_cents=payout_net_cents,
                credit_cents=0,
                contrapartida=fee_account_code,
            )
        )

        # 2. Línea Comisiones (626/669) -> DEBE por las comisiones retenidas
        if total_fees_cents > 0:
            journal.lines.append(
                JournalEntryLine(
                    account_code=fee_account_code,
                    account_name="Servicios bancarios y comisiones",
                    concept=f"Comisiones {gateway_name}"[:30],
                    document_number=f"FEE-{entry_date.strftime('%Y%m%d')}",
                    debit_cents=total_fees_cents,
                    credit_cents=0,
                    contrapartida=bank_account_code,
                )
            )

        # 3. Líneas de Facturas Clientes (430) -> HABER por el importe bruto
        for inv in matched_invoices:
            cust_acct = inv.get("account_code") or "430000001"
            inv_num = inv.get("invoice_number", "")
            cust_name = inv.get("customer_name", "Cliente")
            concept_str = f"Cobro Fra. {inv_num} {cust_name}"[:30]

            journal.lines.append(
                JournalEntryLine(
                    account_code=cust_acct,
                    account_name=f"Cliente: {cust_name}"[:40],
                    concept=concept_str,
                    document_number=inv_num,
                    debit_cents=0,
                    credit_cents=inv["gross_cents"],
                    contrapartida=bank_account_code,
                )
            )

        # Manejar devoluciones si las hay
        if refunds:
            for ref in refunds:
                ref_acct = ref.get("account_code") or "708000001"  # Devoluciones de ventas
                ref_gross = ref.get("gross_cents", 0)
                journal.lines.append(
                    JournalEntryLine(
                        account_code=ref_acct,
                        account_name="Devoluciones de ventas",
                        concept=f"Devolución {ref.get('refund_id', '')}"[:30],
                        document_number=ref.get("refund_id", ""),
                        debit_cents=ref_gross,
                        credit_cents=0,
                        contrapartida=bank_account_code,
                    )
                )

        # Ajuste de redondeo de 1 céntimo si fuera necesario por tolerancias
        journal.check_balance()
        if not journal.is_balanced and abs(journal.imbalance_cents) <= 2:
            # Si hay descuadre de 1 o 2 céntimos imputable al redondeo de pasarela,
            # se absorbe en la cuenta 626/669 de gastos financieros
            diff = journal.imbalance_cents
            for l in journal.lines:
                if l.account_code == fee_account_code:
                    l.debit_cents -= diff
                    break
            journal.check_balance()

        return journal
