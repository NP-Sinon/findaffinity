"""
Evaluador de Puntuación Compuesta (Confidence Score) y Semáforo de Desambiguación
Implementa la ecuación canónica del estudio técnico:
Score = 0.40 * S_importe + 0.20 * S_fecha + 0.40 * S_texto
Clasifica en:
- VERDE (Score >= 0.95): Auto-conciliación segura
- AMARILLO (0.70 <= Score < 0.95): Sugerencia de alta verosimilitud para 1-clic
- ROJO (Score < 0.70): No conciliado (protección contra asignaciones erróneas)
"""
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional

from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice
from src.disambiguation.fiscal_validators import SpanishFiscalValidator
from src.disambiguation.fuzzy_matcher import SpanishFuzzyMatcher


class DisambiguationStatus(str, Enum):
    GREEN = "GREEN"      # Seguro (>= 95%)
    YELLOW = "YELLOW"    # Sugerencia (70% - 94%)
    RED = "RED"          # No conciliado (< 70%)


@dataclass
class DisambiguationResult:
    status: DisambiguationStatus
    confidence_score: float
    s_importe: float
    s_fecha: float
    s_texto: float
    matched_invoice_id: Optional[str] = None
    fiscal_match: bool = False
    invoice_number_match: bool = False
    explanation: str = ""


class BankDisambiguationScorer:
    @staticmethod
    def evaluate(
        bank_tx: CanonicalBankTransaction,
        invoice: CanonicalInvoice,
        max_days_tolerance: int = 30,
    ) -> DisambiguationResult:
        # 1. Similitud cuantitativa (S_importe)
        # s_importe = max(0.0, 1.0 - abs(A_banco - A_fra) / max(A_banco, 1))
        diff_cents = abs(bank_tx.amount_cents - invoice.gross_amount_cents)
        base_amount = max(bank_tx.amount_cents, 1)
        s_importe = max(0.0, 1.0 - (diff_cents / base_amount))

        # 2. Coherencia temporal mercantil (S_fecha)
        # Si la fecha bancaria es posterior o cercana al vencimiento
        days_diff = abs((bank_tx.operation_date - invoice.due_date).days)
        s_fecha = max(0.0, 1.0 - (days_diff / float(max_days_tolerance)))

        # 3. Índice difuso-semántico (S_texto)
        # Comprobar primero identificadores deterministas (NIF/CIF o número de factura)
        bank_text = f"{bank_tx.concept} {bank_tx.payer_or_payee} {bank_tx.raw_reference or ''}"
        fiscal_match = False
        invoice_number_match = False

        # Comprobar CIF/NIF
        extracted_fiscal = SpanishFiscalValidator.extract_fiscal_id(bank_text)
        if extracted_fiscal and invoice.customer_fiscal_id:
            if extracted_fiscal[1].upper() == invoice.customer_fiscal_id.upper():
                fiscal_match = True

        # Comprobar número de factura
        extracted_inv_num = SpanishFiscalValidator.extract_invoice_number(bank_text)
        if extracted_inv_num and invoice.invoice_number:
            if extracted_inv_num.upper() in invoice.invoice_number.upper() or invoice.invoice_number.upper() in extracted_inv_num.upper():
                invoice_number_match = True

        # Matching difuso de nombre de cliente y conceptos
        fuzzy_score, _ = SpanishFuzzyMatcher.match_strings(bank_text, invoice.customer_name)

        if fiscal_match or invoice_number_match:
            # Si hay coincidencia determinista fuerte, S_texto es prácticamente perfecto
            s_texto = max(0.98, fuzzy_score)
        else:
            s_texto = fuzzy_score

        # 4. Cálculo de puntuación compuesta
        # Score = 0.40 * S_importe + 0.20 * S_fecha + 0.40 * S_texto
        final_score = (0.40 * s_importe) + (0.20 * s_fecha) + (0.40 * s_texto)
        final_score = round(min(1.0, max(0.0, final_score)), 4)

        # 5. Asignación de semáforo
        if final_score >= 0.95:
            status = DisambiguationStatus.GREEN
            explanation = "Coincidencia de alta certeza: importe exacto y coincidencia léxica/fiscal validada."
        elif final_score >= 0.70:
            status = DisambiguationStatus.YELLOW
            explanation = "Sugerencia de alta verosimilitud lista para aprobación manual en 1 clic."
        else:
            status = DisambiguationStatus.RED
            explanation = "Puntuación insuficiente (< 70%): descarte seguro para evitar descuadres en balance."

        return DisambiguationResult(
            status=status,
            confidence_score=final_score,
            s_importe=round(s_importe, 4),
            s_fecha=round(s_fecha, 4),
            s_texto=round(s_texto, 4),
            matched_invoice_id=invoice.invoice_id if status != DisambiguationStatus.RED else None,
            fiscal_match=fiscal_match,
            invoice_number_match=invoice_number_match,
            explanation=explanation,
        )
