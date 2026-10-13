"""
Esquemas Pydantic v2 para la API REST del SaaS de Reconciliación Contable
"""
from datetime import date
from typing import List, Optional
from pydantic import BaseModel, Field


class IngestionUploadResponse(BaseModel):
    is_valid: bool
    detected_encoding: str
    total_records: int
    movements_count: int
    validation_errors: List[str] = Field(default_factory=list)


class ReconcilePayoutRequest(BaseModel):
    payout_amount_cents: int
    payout_date: date
    bank_account_iban: str
    gateway_id: str = "stripe"
    company_id: str = "COMP-001"
    bank_account_code: str = "572000001"
    fee_account_code: str = "626000001"


class JournalLineDTO(BaseModel):
    account_code: str
    concept: str
    document_number: str
    debit_eur: float
    credit_eur: float


class ReconcilePayoutResponse(BaseModel):
    is_reconciled: bool
    target_net_eur: float
    matched_invoice_ids: List[str]
    total_gross_eur: float
    total_fees_eur: float
    solver_used: str
    is_balanced: bool
    journal_lines: List[JournalLineDTO] = Field(default_factory=list)


class DisambiguationTransferRequest(BaseModel):
    bank_amount_cents: int
    bank_date: date
    bank_concept: str
    invoice_number: str
    invoice_amount_cents: int
    invoice_due_date: date
    customer_name: str
    customer_fiscal_id: Optional[str] = None


class DisambiguationTransferResponse(BaseModel):
    status: str            # GREEN, YELLOW, RED
    confidence_score: float
    s_importe: float
    s_fecha: float
    s_texto: float
    fiscal_match: bool
    invoice_number_match: bool
    explanation: str


class ExportERPResponse(BaseModel):
    erp_type: str
    filename: str
    content_type: str
    total_entries: int
    content_preview: str
