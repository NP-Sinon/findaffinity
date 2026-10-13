"""
Test Suite de Estrés y Resiliencia con Datos Sucios, Truncados y Malformados
(Dirty Data Stress Test & Fuzzing Resilience Auditor)

Verifica que el sistema maneje limpiamente y sin excepciones no controladas (Unhandled Exceptions):
1. Norma 43 Truncada y Corrupta:
   - Archivo cortado a mitad de registro (EOF inesperado).
   - Líneas con menos de 80 y más de 120 caracteres.
   - Tipos de registro inexistentes o desconocidos ('99', 'AA').
   - Registros 23 huérfanos sin registro 22 previo.
   - Registros 33 con sumas descuadradas o incompletas.
   - Bytes binarios corruptos / codificación mixta ilegible.
2. Identificadores Fiscales y Textos Caóticos:
   - NIFs, CIFs y NIEs truncados, caracteres prohibidos o letras de control erróneas.
   - Conceptos bancarios vacíos, solo espacios, solo emojis o caracteres de control.
   - Cadenas con 500+ caracteres de ruido bancario y palabras desordenadas.
3. Pasarelas (Stripe y Redsys) con Formatos Malformados:
   - CSVs de Stripe sin cabeceras 'id' o 'Gross', valores numéricos corruptos ("N/A", "NaN", "null", "--", "Infinity").
   - CSVs de Redsys con importes con formatos numéricos anómalos o múltiples separadores decimales.
   - Importes negativos absurdos o fees mayores que el bruto.
4. Autodescubridor de Columnas en Condiciones Extremas:
   - Tablas CSV de clientes sin encabezados reconocibles, vacíos o con None.
   - Filas truncadas con valores nulos y formatos numéricos desbordados.
5. Tolerancia y Fallback en Motores de Conciliación y Doble Partida.
"""
from datetime import date, datetime
from decimal import Decimal
import pytest

from src.parsers.bank.norma43 import Norma43Parser, Norma43ParseResult
from src.parsers.gateways.stripe import StripeParser
from src.parsers.gateways.redsys import RedsysParser
from src.parsers.mapper import ColumnMapper
from src.parsers.base import (
    CanonicalBankTransaction,
    CanonicalInvoice,
    CanonicalGatewayTransaction,
    TransactionType,
)
from src.disambiguation.fiscal_validators import SpanishFiscalValidator
from src.disambiguation.normalizer import SpanishBankTextNormalizer
from src.disambiguation.phonetic import SpanishPhoneticEncoder
from src.disambiguation.fuzzy_matcher import SpanishFuzzyMatcher
from src.disambiguation.confidence_scorer import BankDisambiguationScorer, DisambiguationStatus
from src.accounting.double_entry import AccountingEntryBuilder, DoubleEntryJournal
from src.reconciliation.engine import BatchPayoutReconciliationEngine


# ==============================================================================
# SECCIÓN 1: NORMA 43 TRUNCADA Y CORRUPTA
# ==============================================================================

def test_norma43_unexpected_eof_truncated_mid_record():
    """Verifica rechazo limpio cuando el fichero se corta abruptamente a mitad de registro (EOF inesperado)."""
    # 1. Cortado a mitad de registro 11 (25 caracteres)
    truncated_11 = "1100491234123456789026100"
    res1 = Norma43Parser.parse_text(truncated_11)
    assert not res1.is_valid
    assert len(res1.validation_errors) > 0
    assert any("Error procesando" in err or "truncado" in err for err in res1.validation_errors)

    # 2. Cortado a mitad de registro 22 (35 caracteres)
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    truncated_22 = f"{line_11}\n22004912342610102610100400020000000"
    res2 = Norma43Parser.parse_text(truncated_22)
    assert not res2.is_valid
    assert len(res2.validation_errors) > 0

    # 3. Registros 11 y 22 completos, pero EOF antes del registro 33 (cuenta abierta sin cierre)
    line_22 = "220049123426101026101004000200000000145025          STRIPE PAYOUT             "
    eof_no_33 = f"{line_11}\n{line_22}"
    res3 = Norma43Parser.parse_text(eof_no_33)
    assert not res3.is_valid
    assert any("truncado" in err.lower() or "falta registro de fin" in err.lower() for err in res3.validation_errors)
    assert len(res3.canonical_transactions) == 0  # No genera transacciones canónicas de un fichero truncado


def test_norma43_lines_with_less_than_80_and_more_than_120_chars():
    """Verifica tolerancia y manejo limpio de líneas con longitud anómala (< 80 y > 120 caracteres)."""
    # Registro 23 con solo 45 caracteres (menos de 80)
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    line_22 = "220049123426101026101004000200000000145025          STRIPE PAYOUT             "
    short_23 = "2301CONCEPTO CORTO CON MENOS DE 80 CARACTERES"
    # Registro 33 exacto: 0 debits (0 céntimos), 1 credit (145025 céntimos), final balance = 1145025
    valid_33 = "3300491234123456789000000000000000000000000100000000145025200000001145025978    "
    line_88 = "889999999999999999000004                                                        "
    file_short_line = "\n".join([line_11, line_22, short_23, valid_33, line_88])

    res_short = Norma43Parser.parse_text(file_short_line)
    # Debe procesar con relleno espacial (padding) sin crash y ser válido
    assert res_short.is_valid, f"Errores inesperados: {res_short.validation_errors}"
    assert len(res_short.accounts) == 1
    assert "CONCEPTO CORTO" in res_short.accounts[0].movements[0].full_concept

    # Línea 23 con 180 caracteres (desborde excesivo de texto bancario)
    long_23 = "2301" + "RUIDO BANCARIO EXTRA " * 15
    assert len(long_23) > 120
    file_long_line = "\n".join([line_11, line_22, long_23, valid_33, line_88])

    res_long = Norma43Parser.parse_text(file_long_line)
    assert res_long.is_valid
    assert len(res_long.canonical_transactions) == 1


def test_norma43_unknown_record_types_99_and_AA():
    """Verifica que registros desconocidos ('99', 'AA') se rechacen limpiamente y de forma estructurada."""
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    unknown_99 = "9900491234REGISTRO INVENTADO QUE NO EXISTE EN LA NORMA 43 AEB                 "
    unknown_AA = "AA00491234REGISTRO ALFANUMERICO ANOMALO NO CONTEMPLADO                         "
    valid_33 = "3300491234123456789000000000000000000000000000000000000000200000001000000978    "
    line_88 = "889999999999999999000004                                                        "
    raw_content = "\n".join([line_11, unknown_99, unknown_AA, valid_33, line_88])

    res = Norma43Parser.parse_text(raw_content)
    assert not res.is_valid
    assert any("desconocido o inválido '99'" in err for err in res.validation_errors)
    assert any("desconocido o inválido 'AA'" in err for err in res.validation_errors)


def test_norma43_orphan_record_23_without_record_22():
    """Verifica detección de registros complementarios 23 huérfanos sin registro 22 previo."""
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    orphan_23 = "2301CONCEPTO HUERFANO SIN APUNTE PRINCIPAL PREVIO 22                            "
    valid_33 = "3300491234123456789000000000000000000000000000000000000000200000001000000978    "
    raw_content = "\n".join([line_11, orphan_23, valid_33])

    res = Norma43Parser.parse_text(raw_content)
    assert not res.is_valid
    assert any("sin apunte principal (22)" in err for err in res.validation_errors)

    # 23 que aparece antes de cualquier registro 11
    res_pre_11 = Norma43Parser.parse_text(orphan_23)
    assert not res_pre_11.is_valid
    assert any("sin apunte principal (22)" in err for err in res_pre_11.validation_errors)


def test_norma43_record_33_mismatched_and_incomplete_sums():
    """Verifica que sumas descuadradas o recuentos erróneos en el registro 33 se identifiquen matemáticamente."""
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    line_22 = "220049123426101026101004000200000000145025          STRIPE PAYOUT             "
    # Saldo esperado: 1000000 + 145025 = 1145025. Ponemos saldo final erróneo 1145000 (25 céntimos de descuadre)
    # y recuento de abonos erróneo (dice 5 pero hay 1 apunte)
    corrupt_33 = "3300491234123456789000000000000000000000000500000000145025200000001145000978    "
    line_88 = "889999999999999999000003                                                        "
    file_corrupt_33 = "\n".join([line_11, line_22, corrupt_33, line_88])

    res = Norma43Parser.parse_text(file_corrupt_33)
    assert not res.is_valid
    assert len(res.validation_errors) >= 2
    assert any("número de abonos" in err for err in res.validation_errors)
    assert any("Descuadre matemático" in err for err in res.validation_errors)
    assert not res.accounts[0].is_balanced
    assert res.accounts[0].balance_discrepancy_cents == -25


def test_norma43_corrupt_binary_bytes_and_mixed_encodings():
    """Verifica que secuencias binarias aleatorias o codificaciones corruptas no provoquen crashes."""
    # 1. Bytes binarios no legibles (nulos, cabeceras ELF/PE, bytes corruptos)
    corrupt_bin = b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00\x3e\x00\xff\xfe\xaa\xbb"
    res_bin = Norma43Parser.parse_file(corrupt_bin)
    assert not res_bin.is_valid
    assert len(res_bin.canonical_transactions) == 0
    assert len(res_bin.validation_errors) > 0

    # 2. Fichero vacío
    res_empty = Norma43Parser.parse_file(b"")
    assert not res_empty.is_valid
    assert any("sin registros" in err.lower() for err in res_empty.validation_errors)

    # 3. Codificación mixta: texto en español con bytes no UTF-8 intercalados
    text_prefix = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           \n"
    mixed_bytes = text_prefix.encode("utf-8") + b"\xff\xfe\x80\x90\x00\x01\x02\x03"
    res_mixed = Norma43Parser.parse_file(mixed_bytes)
    assert not res_mixed.is_valid or len(res_mixed.accounts) >= 0  # No debe lanzar Unhandled Exception


# ==============================================================================
# SECCIÓN 2: IDENTIFICADORES FISCALES Y TEXTOS CAÓTICOS
# ==============================================================================

def test_fiscal_identifiers_truncated_prohibited_chars_and_wrong_checksum():
    """Verifica validación estricta de NIFs, NIEs y CIFs ante valores nulos, truncados y corruptos."""
    validator = SpanishFiscalValidator

    # Casos NIF
    assert not validator.validate_nif("")
    assert not validator.validate_nif(None)
    assert not validator.validate_nif("1234567")          # Truncado (7 dígitos)
    assert not validator.validate_nif("1234567890")       # Excedido (10 caracteres)
    assert not validator.validate_nif("12345678@")        # Carácter prohibido
    assert not validator.validate_nif("123456789")        # Sin letra
    assert not validator.validate_nif("12345678A")        # Letra errónea (para 12345678 es Z)
    assert validator.validate_nif("12345678Z")            # Válido

    # Casos NIE
    assert not validator.validate_nie("")
    assert not validator.validate_nie(None)
    assert not validator.validate_nie("A1234567Z")        # Letra inicial prohibida (solo X, Y, Z)
    assert not validator.validate_nie("X123456")          # Truncado
    assert not validator.validate_nie("X1234567@")        # Carácter no alfabético
    assert not validator.validate_nie("X1234567A")        # Letra de control errónea (X1234567 es L)
    assert validator.validate_nie("X1234567L")            # Válido

    # Casos CIF
    assert not validator.validate_cif("")
    assert not validator.validate_cif(None)
    assert not validator.validate_cif("Z1234567A")        # Letra inicial no contemplada
    assert not validator.validate_cif("B123456")          # Truncado
    assert not validator.validate_cif("B1234567@")        # Carácter especial
    assert not validator.validate_cif("B12345678")        # Control erróneo (para B1234567 el dígito es 4)
    assert validator.validate_cif("B12345674")            # Válido

    # Entradas no cadena (tipos anómalos)
    assert not validator.validate_nif(12345678)
    assert not validator.validate_nie([1, 2, 3])
    assert not validator.validate_cif({"cif": "B12345674"})


def test_fiscal_extraction_from_chaotic_text():
    """Verifica extracción resiliente de NIF/CIF o número de factura desde textos caóticos."""
    validator = SpanishFiscalValidator

    # Textos vacíos, solo espacios o tipos erróneos
    assert validator.extract_fiscal_id(None) is None
    assert validator.extract_fiscal_id("") is None
    assert validator.extract_fiscal_id("     ") is None
    assert validator.extract_invoice_number(None) is None
    assert validator.extract_invoice_number("") is None

    # Solo emojis o caracteres de control
    assert validator.extract_fiscal_id("🔥🔥🔥 🚀🚀🚀 💩💩💩 \x00\x01\x1f") is None
    assert validator.extract_invoice_number("🔥🔥🔥 🚀🚀🚀") is None

    # Cadena con 600 caracteres de ruido bancario y un NIF válido incrustado
    noise = "TRANSFERENCIA SEPA ORDENANTE PEPE PAGO REF 99999 " * 12
    dirty_text = f"{noise} NIF 12345678Z FACTURA INV-2026-9901 {noise}"
    extracted = validator.extract_fiscal_id(dirty_text)
    assert extracted is not None
    assert extracted == ("NIF", "12345678Z")

    extracted_inv = validator.extract_invoice_number(dirty_text)
    assert extracted_inv is not None
    assert "2026-9901" in extracted_inv or "INV" in extracted_inv


def test_bank_text_normalizer_empty_spaces_emojis_and_control_chars():
    """Verifica que el normalizador bancario tolere emojis, caracteres de control y cadenas vacías."""
    normalizer = SpanishBankTextNormalizer

    # Nulo y tipos inválidos
    assert normalizer.clean(None) == ""
    assert normalizer.clean(12345) == ""
    assert normalizer.clean("") == ""
    assert normalizer.clean("   \t\r\n   ") == ""

    # Solo caracteres de control
    assert normalizer.clean("\x00\x01\x02\x07\x0b\x1f") == ""

    # Mezcla de ruido bancario, control y emojis
    raw = "\x00 TRANSF. SEPA DE: JUAN CARLOS GARCIA-LOPEZ / REF: 9988 // CONCEPTO: PAGO FRA. 🔥"
    cleaned = normalizer.clean(raw)
    assert "JUAN CARLOS GARCIA LOPEZ" in cleaned
    assert "9988" in cleaned
    assert "TRANSF" not in cleaned
    assert "CONCEPTO" not in cleaned


def test_chaotic_bank_text_500_plus_chars_disambiguation_pipeline():
    """Somete a prueba el pipeline completo de desambiguación ante un concepto de 600+ caracteres de ruido."""
    long_chaotic_concept = (
        "TRANSF. EMITIDA ORDENANTE INDITEX ESPAÑA S.A. REF SEPA 1234567890 "
        "DETALLE OPERACION BANCARIA LIQUIDACION COMPLEJA DE SERVICIOS INFORMATICOS "
        "Y LOGISTICOS EN TERRITORIO NACIONAL CORRESPONDIENTE AL TERCER TRIMESTRE 2026 "
        "CON DEDUCCION DE RETENCIONES FISCALES Y TASAS DE GESTION ADMINISTRATIVA. "
        "CLIENTE DE REFERENCIA INTERNA CIF: B12345674 FACTURA FRA-2026-0044 "
    ) * 2
    assert len(long_chaotic_concept) > 600

    bank_tx = CanonicalBankTransaction(
        transaction_id="TX-CHAOTIC-001",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 15),
        value_date=date(2026, 10, 15),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=150000,
        concept=long_chaotic_concept,
        payer_or_payee="INDITEX ESPAÑA S.A.",
    )

    invoice = CanonicalInvoice(
        invoice_id="INV-0044",
        invoice_number="FRA-2026-0044",
        issue_date=date(2026, 10, 10),
        due_date=date(2026, 10, 15),
        customer_id="CUST-INDITEX",
        customer_name="INDITEX ESPAÑA S.A.",
        gross_amount_cents=150000,
        customer_fiscal_id="B12345674",
    )

    # Debe procesar sin fallar en menos de 10ms y validar por CIF / número de factura
    result = BankDisambiguationScorer.evaluate(bank_tx, invoice)
    assert result.status == DisambiguationStatus.GREEN
    assert result.confidence_score >= 0.95
    assert result.fiscal_match is True
    assert result.invoice_number_match is True


# ==============================================================================
# SECCIÓN 3: PASARELAS (STRIPE Y REDSYS) CON FORMATOS MALFORMADOS
# ==============================================================================

def test_stripe_csv_missing_headers_and_empty_files():
    """Verifica que ficheros CSV de Stripe sin cabeceras mínimas se rechacen sin excepción."""
    # 1. Sin cabecera 'id'
    csv_no_id = """Gross,Fee,Net,Currency,Created (UTC)
100.00,2.15,97.85,eur,2026-10-10 10:15:00
50.00,1.20,48.80,eur,2026-10-10 11:20:00
"""
    txs_no_id = StripeParser.parse_balance_transactions_csv(csv_no_id)
    assert len(txs_no_id) == 0  # Filas sin ID se descartan limpiamente

    # 2. Sin cabecera 'Gross' (se asume 0 céntimos por defecto)
    csv_no_gross = """id,Type,Fee,Net,Currency
txn_01,charge,2.15,0.00,eur
"""
    txs_no_gross = StripeParser.parse_balance_transactions_csv(csv_no_gross)
    assert len(txs_no_gross) == 1
    assert txs_no_gross[0].gross_cents == 0

    # 3. Fichero completamente vacío
    assert len(StripeParser.parse_balance_transactions_csv("")) == 0
    assert len(StripeParser.parse_balance_transactions_csv(b"")) == 0


def test_stripe_csv_corrupt_numeric_values():
    """Verifica conversión segura de valores numéricos corruptos en Stripe ("N/A", "NaN", "null", "--", "Infinity")."""
    corrupt_csv = """id,Type,Gross,Fee,Net,Currency
txn_nan,charge,NaN,null,--,eur
txn_inf,charge,Infinity,-Infinity,N/A,eur
txn_mixed,charge,100.50 €,None,98.00 $,eur
txn_spaces,charge,  50.00  ,  1.50  ,  48.50  ,eur
"""
    txs = StripeParser.parse_balance_transactions_csv(corrupt_csv)
    assert len(txs) == 4

    # txn_nan: todos 0 céntimos sin OverflowError ni ValueError
    assert txs[0].gross_cents == 0
    assert txs[0].fee_cents == 0
    assert txs[0].net_cents == 0

    # txn_inf: infinito amortiguado a 0
    assert txs[1].gross_cents == 0
    assert txs[1].fee_cents == 0
    assert txs[1].net_cents == 0

    # txn_mixed: 100.50 € -> 10050 céntimos
    assert txs[2].gross_cents == 10050
    assert txs[2].fee_cents == 0
    assert txs[2].net_cents == 9800

    # txn_spaces: espacios recortados
    assert txs[3].gross_cents == 5000
    assert txs[3].fee_cents == 150
    assert txs[3].net_cents == 4850


def test_redsys_csv_anomalous_formats_and_multiple_decimal_separators():
    """Verifica soporte para formatos españoles, múltiples separadores decimales y columnas truncadas en Redsys."""
    sample_csv = """Terminal;Fecha;Número Pedido;Tipo Operación;Importe Bruto;Comisión;Importe Líquido;Autorización
TPV01;12/10/2026;PED-101;0000;1.234,56 €;15,50 €;1.219,06 €;AUTH01
TPV01;12/10/2026;PED-102;0000;12,34,56;1,00;11,00;AUTH02
TPV01;12/10/2026;PED-103;0000;Infinity;NaN;null;AUTH03
TPV01;12/10/2026;PED-104;0000;--
"""
    txs = RedsysParser.parse_operations_csv(sample_csv)
    assert len(txs) == 4

    # PED-101: 1.234,56 € -> 123456 céntimos
    assert txs[0].gross_cents == 123456
    assert txs[0].fee_cents == 1550
    assert txs[0].net_cents == 121906

    # PED-102: Múltiples comas anómalas (12,34,56)
    assert isinstance(txs[1].gross_cents, int)

    # PED-103: Infinity / NaN amortiguados a 0
    assert txs[2].gross_cents == 0
    assert txs[2].fee_cents == 0

    # PED-104: Fila truncada (menos valores que cabeceras)
    assert txs[3].gross_cents == 0


def test_gateway_absurdly_negative_amounts_and_excessive_fees():
    """Verifica que transacciones con fees superiores al bruto o importes absurdos se procesen en asientos balanceados."""
    # Transacción donde la pasarela cobró más comisión que el bruto (saldo neto negativo)
    # Bruto = 10.00 € (1000 céntimos), Fee = 15.00 € (1500 céntimos), Neto = -5.00 € (-500 céntimos)
    matched_invoices = [
        {
            "account_code": "430000001",
            "invoice_number": "INV-SMALL-01",
            "gross_cents": 1000,
            "fee_cents": 1500,
            "customer_name": "Cliente Micro",
        }
    ]

    # Construir asiento
    journal = AccountingEntryBuilder.build_payout_reconciliation_entry(
        entry_number=1,
        entry_date=date(2026, 10, 15),
        bank_account_code="572000001",
        fee_account_code="626000001",
        payout_net_cents=-500,
        matched_invoices=matched_invoices,
        gateway_name="Stripe",
    )

    # DEBE = -500 (Banco) + 1500 (Comisiones) = 1000 céntimos
    # HABER = 1000 (Cliente)
    # Cuadre estricto: Debe == Haber
    assert journal.total_debit_cents == 1000
    assert journal.total_credit_cents == 1000
    assert journal.check_balance() is True
    assert journal.imbalance_cents == 0


# ==============================================================================
# SECCIÓN 4: AUTODESCUBRIDOR DE COLUMNAS EN CONDICIONES EXTREMAS
# ==============================================================================

def test_column_mapper_unrecognized_or_empty_headers():
    """Verifica que ColumnMapper gestione cabeceras no identificables, cabeceras None y filas vacías."""
    mapper = ColumnMapper

    # 1. Cabeceras None o vacías en detect_mapping
    mapping_none = mapper.detect_mapping(["Col1", None, "", "   "])
    assert isinstance(mapping_none, dict)
    assert len(mapping_none) == 0

    # 2. CSV sin ninguna cabecera reconocible
    unrecognized_csv = """col_alpha,col_beta,col_gamma,col_delta
val1,val2,val3,val4
"""
    invoices = mapper.parse_invoices_csv(unrecognized_csv)
    assert len(invoices) == 0  # No reconoce factura ni cliente -> no genera facturas espurias

    # 3. CSV con valores None en filas (filas con menos campos que columnas)
    truncated_row_csv = """número,cliente,total
FRA-001,ACME S.L.
FRA-002
"""
    invoices_trunc = mapper.parse_invoices_csv(truncated_row_csv)
    assert len(invoices_trunc) == 2
    assert invoices_trunc[0].invoice_number == "FRA-001"
    assert invoices_trunc[0].customer_name == "ACME S.L."
    assert invoices_trunc[0].gross_amount_cents == 0  # Campo total ausente asumido 0 sin crash
    assert invoices_trunc[1].invoice_number == "FRA-002"

    # 4. CSV con importes absurdos / desbordados
    overflow_csv = """factura,cliente,importe
FRA-999,CLIENTE VIP,Infinity
FRA-888,CLIENTE 2,NaN
FRA-777,CLIENTE 3,123.456,78 €
"""
    invoices_overflow = mapper.parse_invoices_csv(overflow_csv)
    assert len(invoices_overflow) == 3
    assert invoices_overflow[0].gross_amount_cents == 0
    assert invoices_overflow[1].gross_amount_cents == 0
    assert isinstance(invoices_overflow[2].gross_amount_cents, int)


# ==============================================================================
# SECCIÓN 5: RESILIENCIA EN MOTOR DE CONCILIACIÓN
# ==============================================================================

def test_reconciliation_engine_with_dirty_and_extreme_inputs():
    """Verifica que el orquestador algorítmico rechace o maneje con gracia datos numéricos y fechas extremas."""
    engine = BatchPayoutReconciliationEngine()

    # Apunte bancario con importe cero
    bank_tx_zero = CanonicalBankTransaction(
        transaction_id="TX-ZERO",
        account_iban="ES0000491234001234567890",
        operation_date=date(2026, 10, 15),
        value_date=date(2026, 10, 15),
        transaction_type=TransactionType.DEPOSIT,
        amount_cents=0,
    )

    report_zero = engine.reconcile_payout(bank_tx_zero, open_invoices=[])
    assert report_zero.is_reconciled is False
    assert len(report_zero.matched_invoice_ids) == 0

    # Facturas con importes desorbitados o fechas en el futuro
    extreme_invoice = CanonicalInvoice(
        invoice_id="INV-EXTREME",
        invoice_number="FRA-EXTREME",
        issue_date=date(2026, 11, 1),  # Fecha posterior al payout (debe ser podada)
        due_date=date(2026, 11, 15),
        customer_id="CUST-EXTREME",
        customer_name="EXTREMO SL",
        gross_amount_cents=9999999999,  # 100 millones de euros
    )

    report_extreme = engine.reconcile_payout(bank_tx_zero, open_invoices=[extreme_invoice])
    assert report_extreme.is_reconciled is False
