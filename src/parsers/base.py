"""
Modelos de Datos Canónicos para Ingesta Multiformato
Desacopla los diferentes orígenes bancarios y de pasarelas en estructuras estandarizadas.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional


class TransactionType(str, Enum):
    DEPOSIT = "DEPOSIT"          # Abono / Haber (incremento en cuenta)
    WITHDRAWAL = "WITHDRAWAL"    # Cargo / Debe (salida de dinero)


@dataclass
class CanonicalBankTransaction:
    """Representa un apunte bancario unificado independientemente de su origen (Norma 43, CAMT, CSV)."""
    transaction_id: str
    account_iban: str
    operation_date: date
    value_date: date
    transaction_type: TransactionType
    amount_cents: int                  # En céntimos enteros (positivo siempre)
    currency: str = "EUR"
    common_code: Optional[str] = None  # Código concepto AEB (04 transf, 17 comisiones, etc.)
    concept: str = ""                  # Descripción o concepto consolidado
    payer_or_payee: str = ""           # Nombre ordenante / beneficiario
    fiscal_id: Optional[str] = None    # NIF/CIF extraído si está presente
    raw_reference: Optional[str] = None

    @property
    def signed_amount_cents(self) -> int:
        return self.amount_cents if self.transaction_type == TransactionType.DEPOSIT else -self.amount_cents

    @property
    def amount_eur(self) -> Decimal:
        return Decimal(self.amount_cents) / Decimal(100)


@dataclass
class CanonicalInvoice:
    """Factura viva / abierta en el sistema contable."""
    invoice_id: str
    invoice_number: str
    issue_date: date
    due_date: date
    customer_id: str
    customer_name: str
    customer_fiscal_id: Optional[str] = None
    gross_amount_cents: int = 0        # Total a cobrar en céntimos
    concept: str = ""
    gateway_id: Optional[str] = None   # Pasarela asignada (p.ej. 'stripe', 'redsys_tpv1')
    currency: str = "EUR"

    @property
    def gross_eur(self) -> Decimal:
        return Decimal(self.gross_amount_cents) / Decimal(100)


@dataclass
class CanonicalGatewayTransaction:
    """Transacción individual procesada por pasarela (cobro, devolución o comisión)."""
    transaction_id: str
    gateway_id: str                    # 'stripe', 'redsys', 'paypal', 'sumup'
    created_at: datetime
    type: str                          # 'charge', 'refund', 'fee', 'adjustment'
    gross_cents: int                   # Importe bruto
    fee_cents: int                     # Comisión real aplicada
    net_cents: int                     # Importe neto liquidable
    currency: str = "EUR"
    order_id: Optional[str] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None
    payout_id: Optional[str] = None    # ID de liquidación si ya viene asignado


@dataclass
class CanonicalBatchPayout:
    """Liquidación agrupada transferida a la cuenta bancaria."""
    payout_id: str
    gateway_id: str
    payout_date: date
    net_amount_cents: int              # Total abonado en banco en céntimos
    currency: str = "EUR"
    status: str = "paid"
    transactions: List[CanonicalGatewayTransaction] = field(default_factory=list)
