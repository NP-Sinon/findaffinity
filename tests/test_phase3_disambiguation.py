"""
Test Suite para la Fase 3: Motor de Desambiguación Difusa y NLP en Castellano
Verifica:
1. Depuración léxica y supresión de literales bancarios (TRANSF. DE:, ORD:, BENEF:).
2. Validación determinista de NIF, CIF y NIE (Módulo 23 y Módulo 11) y patrones de facturas.
3. Matching fonético en castellano (B/V, C/Z/S, yeísmo) y Token Set Ratio con RapidFuzz.
4. Confidence Scorer y política de semáforo tricolor (Verde >= 95%, Amarillo 70-94%, Rojo < 70%).
"""
from datetime import date
import pytest

from src.parsers.base import CanonicalBankTransaction, CanonicalInvoice, TransactionType
from src.disambiguation.normalizer import SpanishBankTextNormalizer
from src.disambiguation.fiscal_validators import SpanishFiscalValidator
from src.disambiguation.phonetic import SpanishPhoneticEncoder
from src.disambiguation.fuzzy_matcher import SpanishFuzzyMatcher
from src.disambiguation.confidence_scorer import BankDisambiguationScorer, DisambiguationStatus


def test_bank_text_normalizer():
    """Verifica la eliminación de prefijos bancarios y normalización de tildes manteniendo Ñ."""
    raw_1 = "TRANSF. DE: TALLERES MAÑANA S.L. - PAGO FRA. 2026/01"
    cleaned_1 = SpanishBankTextNormalizer.clean(raw_1)
    assert "TRANSF" not in cleaned_1
    assert "PAGO FRA" not in cleaned_1
    assert "MAÑANA" in cleaned_1  # La Ñ se preserva
    assert "TALLERES" in cleaned_1

    raw_2 = "ORD: CONST. RODRÍGUEZ E HIJOS / BENEF: SUMINISTROS"
    cleaned_2 = SpanishBankTextNormalizer.clean(raw_2)
    assert "ORD" not in cleaned_2
    assert "BENEF" not in cleaned_2
    assert "RODRIGUEZ" in cleaned_2  # Tilde eliminada


def test_spanish_fiscal_validator_modulo11_and_23():
    """Verifica validación algorítmica de NIF (personas físicas), CIF (sociedades) y NIE (extranjeros)."""
    # 1. NIFs válidos conocidos (Módulo 23)
    assert SpanishFiscalValidator.validate_nif("12345678Z") is True
    assert SpanishFiscalValidator.validate_nif("12345678A") is False  # Letra errónea

    # 2. CIFs válidos (Módulo 11 oficial)
    # A58818501 (Telefónica) o B82387770
    assert SpanishFiscalValidator.validate_cif("B82387770") is True
    assert SpanishFiscalValidator.validate_cif("B82387779") is False  # Dígito control inválido

    # 3. NIEs válidos (X, Y, Z + Módulo 23)
    assert SpanishFiscalValidator.validate_nie("X1234567L") is True
    assert SpanishFiscalValidator.validate_nie("X1234567Z") is False

    # 4. Extracción desde texto bancario libre
    sample_text = "TRANSF DE JUAN PEREZ CON DNI 12345678Z POR SERVICIOS"
    extracted = SpanishFiscalValidator.extract_fiscal_id(sample_text)
    assert extracted is not None
    assert extracted[0] == "NIF"
    assert extracted[1] == "12345678Z"


def test_phonetic_and_fuzzy_matching():
    """Verifica que el matching fonético y Token Set Ratio superan inversiones de nombre y grafías homófonas (B/V, C/Z/S)."""
    # Homofonía B / V y C / Z
    str_1 = "BOTELLAS VELASCO"
    str_2 = "VOTELLAS BELASCO"
    assert SpanishPhoneticEncoder.encode(str_1) == SpanishPhoneticEncoder.encode(str_2)

    # Inversión de nombre de cliente («GARCIA LOPEZ JUAN» vs «JUAN GARCIA LOPEZ»)
    name_a = "GARCIA LOPEZ JUAN"
    name_b = "JUAN GARCIA LOPEZ"
    score, _ = SpanishFuzzyMatcher.match_strings(name_a, name_b)
    assert score >= 0.95  # Token Set Ratio identifica equivalencia completa


def test_confidence_scorer_traffic_light_green():
    """Verifica que una factura con importe exacto, fecha coincidente y NIF o nombre claro obtiene VERDE (>= 95%)."""
    bank_tx = CanonicalBankTransaction(
        transaction_id="TX-001",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 10),
        value_date=date(2026, 10, 10),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=50000,  # 500.00 €
        concept="TRANSF DE LOPEZ Y ASOCIADOS SL FRA 2026-44 B82387770",
        payer_or_payee="LOPEZ Y ASOCIADOS SL",
    )

    invoice = CanonicalInvoice(
        invoice_id="INV-44",
        invoice_number="2026-44",
        issue_date=date(2026, 10, 8),
        due_date=date(2026, 10, 10),
        customer_id="CUST-44",
        customer_name="LOPEZ Y ASOCIADOS S.L.",
        gross_amount_cents=50000,  # 500.00 €
        customer_fiscal_id="B82387770",
    )

    res = BankDisambiguationScorer.evaluate(bank_tx, invoice)
    assert res.status == DisambiguationStatus.GREEN
    assert res.confidence_score >= 0.95
    assert res.fiscal_match is True
    assert res.invoice_number_match is True


def test_confidence_scorer_traffic_light_yellow():
    """Verifica que una discrepancia leve de días o errata menor genera AMARILLO (70% - 94%) para 1-clic."""
    bank_tx = CanonicalBankTransaction(
        transaction_id="TX-002",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 20),  # 15 días tras vencimiento
        value_date=date(2026, 10, 20),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=50000,
        concept="PAGO SERVICIOS JULIO GARCIA",
        payer_or_payee="GARCIA JULIO",
    )

    invoice = CanonicalInvoice(
        invoice_id="INV-55",
        invoice_number="2026-99",
        issue_date=date(2026, 10, 1),
        due_date=date(2026, 10, 5),
        customer_id="CUST-55",
        customer_name="JULIO GARCIA PEREZ",
        gross_amount_cents=50000,
    )

    res = BankDisambiguationScorer.evaluate(bank_tx, invoice)
    assert res.status == DisambiguationStatus.YELLOW
    assert 0.70 <= res.confidence_score < 0.95


def test_confidence_scorer_traffic_light_red():
    """Verifica que un concepto o importe no coincidente resulta en ROJO (< 70%) evitando falsos positivos."""
    bank_tx = CanonicalBankTransaction(
        transaction_id="TX-003",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 10),
        value_date=date(2026, 10, 10),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=12000,  # 120.00 €
        concept="ABONO FERRETERIA CENTRAL",
        payer_or_payee="FERRETERIA CENTRAL",
    )

    invoice = CanonicalInvoice(
        invoice_id="INV-99",
        invoice_number="2026-001",
        issue_date=date(2026, 10, 10),
        due_date=date(2026, 10, 10),
        customer_id="CUST-99",
        customer_name="CLINICA DENTAL SANITAS",
        gross_amount_cents=80000,  # 800.00 €
    )

    res = BankDisambiguationScorer.evaluate(bank_tx, invoice)
    assert res.status == DisambiguationStatus.RED
    assert res.confidence_score < 0.70
    assert res.matched_invoice_id is None
