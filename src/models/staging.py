"""
Modelos de Datos para Multi-Tenancy B2B2B y Staging Area (Modo Solo Lectura)
Asegura la trazabilidad y la inmutabilidad de los pre-asientos antes de su exportación.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Dict, List, Optional

from src.accounting.double_entry import DoubleEntryJournal


class SubscriptionTier(str, Enum):
    STARTER = "STARTER"            # 49 €/mes (hasta 10 clientes, 2.500 tx)
    PROFESSIONAL = "PROFESSIONAL"  # 119 €/mes (hasta 30 clientes, 12.000 tx)
    SCALE = "SCALE"                # 229 €/mes (hasta 80 clientes, 40.000 tx)
    PYME_DIRECT = "PYME_DIRECT"    # 39 €/mes (1 empresa, 2.000 tx)


class StagingAuditStatus(str, Enum):
    AUTO_VERIFIED = "AUTO_VERIFIED"  # Verde (aprobado automáticamente)
    PENDING_REVIEW = "PENDING_REVIEW" # Amarillo (pendiente de 1-clic)
    REJECTED = "REJECTED"             # Rechazado por el contable
    EXPORTED = "EXPORTED"             # Fichero nativo descargado/exportado


@dataclass
class AccountingFirmTenant:
    tenant_id: str
    firm_name: str
    contact_email: str
    subscription_tier: SubscriptionTier
    max_managed_companies: int
    max_monthly_transactions: int
    active_companies_count: int = 0
    current_month_transactions: int = 0

    def can_process_transactions(self, count: int = 1) -> bool:
        return (self.current_month_transactions + count) <= self.max_monthly_transactions


@dataclass
class ClientCompany:
    company_id: str
    tenant_id: str
    legal_name: str
    tax_id: str                     # CIF / NIF
    default_bank_account: str = "572000001"
    default_fee_account: str = "626000001"
    default_receivable_account: str = "430000001"
    target_erp: str = "a3"          # "a3", "sage", "contasol"


@dataclass
class StagingJournalRecord:
    staging_id: str
    company_id: str
    created_at: datetime
    journal: DoubleEntryJournal
    audit_status: StagingAuditStatus
    confidence_score: float
    notes: str = ""
    reviewed_by: Optional[str] = None
    exported_at: Optional[datetime] = None
