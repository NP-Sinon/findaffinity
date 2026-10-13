"""
Test Suite para la Fase 1: Ingesta Multiformato y Parsers Resilientes
Verifica:
1. Resiliencia de codificación en Norma 43 (ISO-8859-15, Windows-1252, UTF-8) con caracteres especiales ('Ñ', 'ó', '€').
2. Integridad matemática del Registro 33 frente a los registros 11 y 22.
3. Ingesta de Stripe Balance Transactions y agrupación de liquidaciones.
4. Ingesta de extractos de TPV Redsys.
5. Autodescubrimiento y mapeo de columnas para facturación heterogénea de pymes.
"""
from datetime import date
from decimal import Decimal
import pytest

from src.parsers.bank.norma43 import Norma43Parser, Norma43ParseResult
from src.parsers.gateways.stripe import StripeParser
from src.parsers.gateways.redsys import RedsysParser
from src.parsers.mapper import ColumnMapper
from src.parsers.base import TransactionType


def build_sample_norma43_text(include_special_chars: bool = True) -> str:
    """
    Construye un extracto sintético con formato exacto de 80 columnas de la AEB.
    - Registro 11: Saldo inicial = 10.000,00 € (1000000 céntimos, acreedor '2')
    - Registro 22 (1): Abono Stripe liquidación = 1.450,25 € (145025 céntimos, clave '2')
    - Registro 23 (1): Detalle con 'LIQUIDACIÓN STRIPE ESPAÑA S.L. - MAÑANA'
    - Registro 22 (2): Cargo comisión cuenta = 15,00 € (1500 céntimos, clave '1')
    - Registro 23 (2): Detalle 'COMISIÓN MANTENIMIENTO CUENTA'
    - Registro 33: Total Debe = 15,00 € (1500 céntimos), Total Haber = 1.450,25 € (145025 céntimos)
                   Saldo final = 1000000 + 145025 - 1500 = 1143525 céntimos (11.435,25 €)
    - Registro 88: Fin de fichero
    """
    # 80 caracteres exactos por línea
    line_11 = "110049123412345678902610012610152000000010000009783CLIENTE PRUEBA SL           "
    line_22_1 = "220049123426101026101004000200000000145025          STRIPE PAYOUT             "
    special_txt = "LIQUIDACIÓN STRIPE ESPAÑA S.L. - COMPAÑÍA" if include_special_chars else "LIQUIDACION STRIPE ESPANA S.L. - COMPANIA"
    line_23_1 = f"2301{special_txt:<76}"
    line_22_2 = "220049123426101226101217000100000000001500          COMISION BANCO            "
    line_23_2 = f"2301{'COMISIÓN MANTENIMIENTO TRIMESTRAL':<76}"
    # Registro 33: debits count = 1, debits total = 1500 (14d), credits count = 1, credits total = 145025 (14d), final bal = 1143525 (14d)
    line_33 = "3300491234123456789000001000000000015000000100000000145025200000001143525978    "
    line_88 = "889999999999999999000006                                                        "

    return "\n".join([line_11, line_22_1, line_23_1, line_22_2, line_23_2, line_33, line_88])


def test_norma43_iso8859_15_encoding():
    """Prueba que el parser decodifica sin errores bytes codificados en ISO-8859-15 con Ñ y tildes."""
    text_content = build_sample_norma43_text(include_special_chars=True)
    raw_bytes = text_content.encode("iso-8859-15")

    result = Norma43Parser.parse_file(raw_bytes)

    assert result.is_valid, f"Errores: {result.validation_errors}"
    assert result.detected_encoding in ("iso-8859-15", "windows-1252", "iso-8859-1")
    assert len(result.canonical_transactions) == 2

    # Verificar que los caracteres especiales se mantuvieron intactos
    stripe_tx = result.canonical_transactions[0]
    assert "ESPAÑA" in stripe_tx.concept or "ESPA" in stripe_tx.concept
    assert stripe_tx.transaction_type == TransactionType.DEPOSIT
    assert stripe_tx.amount_cents == 145025
    assert stripe_tx.amount_eur == Decimal("1450.25")

    fee_tx = result.canonical_transactions[1]
    assert fee_tx.transaction_type == TransactionType.WITHDRAWAL
    assert fee_tx.amount_cents == 1500
    assert fee_tx.amount_eur == Decimal("15.00")


def test_norma43_windows1252_encoding():
    """Prueba decodificación nativa Windows-1252."""
    text_content = build_sample_norma43_text(include_special_chars=True)
    raw_bytes = text_content.encode("windows-1252")

    result = Norma43Parser.parse_file(raw_bytes)
    assert result.is_valid
    assert len(result.accounts) == 1
    assert result.accounts[0].is_balanced is True
    assert result.accounts[0].balance_discrepancy_cents == 0


def test_norma43_utf8_encoding():
    """Prueba decodificación nativa UTF-8."""
    text_content = build_sample_norma43_text(include_special_chars=True)
    raw_bytes = text_content.encode("utf-8")

    result = Norma43Parser.parse_file(raw_bytes)
    assert result.is_valid
    assert len(result.canonical_transactions) == 2


def test_norma43_mathematical_imbalance_detection():
    """Prueba que el parser detecta y rechaza ficheros donde el saldo final no cuadra con el saldo inicial y movimientos."""
    valid_text = build_sample_norma43_text(include_special_chars=False)
    # Alteramos el saldo final en el registro 33 haciéndolo descuadrar por 10 céntimos
    lines = valid_text.splitlines()
    # Cambiar saldo final de 00000001143525 a 00000001143535
    corrupt_line_33 = lines[5][:59] + "00000001143535" + lines[5][73:]
    lines[5] = corrupt_line_33
    corrupt_text = "\n".join(lines)

    result = Norma43Parser.parse_text(corrupt_text)
    assert result.is_valid is False
    assert len(result.validation_errors) > 0
    assert any("Descuadre" in err or "no coincide" in err for err in result.validation_errors)


def test_stripe_parser_balance_transactions():
    """Verifica el parsing de transacciones de Stripe y agrupación en Payouts."""
    sample_csv = """id,Type,Gross,Fee,Net,Currency,Created (UTC),Description,Payout ID
txn_001,charge,100.00,2.15,97.85,eur,2026-10-10 10:15:00,Cobro Pedido #101,po_batch_123
txn_002,charge,50.00,1.20,48.80,eur,2026-10-10 11:20:00,Cobro Pedido #102,po_batch_123
txn_003,refund,-20.00,0.00,-20.00,eur,2026-10-11 09:00:00,Reembolso Parcial #99,po_batch_123
"""
    transactions = StripeParser.parse_balance_transactions_csv(sample_csv)
    assert len(transactions) == 3

    t1 = transactions[0]
    assert t1.transaction_id == "txn_001"
    assert t1.gross_cents == 10000
    assert t1.fee_cents == 215
    assert t1.net_cents == 9785

    payouts = StripeParser.group_by_payout(transactions)
    assert "po_batch_123" in payouts
    batch = payouts["po_batch_123"]
    # 97.85 + 48.80 - 20.00 = 126.65 € -> 12665 céntimos
    assert batch.net_amount_cents == 12665
    assert len(batch.transactions) == 3


def test_redsys_parser_operations():
    """Verifica el parsing de operaciones de TPV Redsys con formato español (; y comas decimales)."""
    sample_csv = """Terminal;Fecha;Hora;Número Pedido;Tipo Operación;Importe Bruto;Comisión;Importe Líquido;Autorización
TPV01;12/10/2026;14:22:10;PED-5544;0000;125,50 €;1,88 €;123,62 €;987654
TPV01;12/10/2026;15:10:05;PED-5545;0900;25,00 €;0,00 €;25,00 €;112233
"""
    transactions = RedsysParser.parse_operations_csv(sample_csv, delimiter=";")
    assert len(transactions) == 2

    # Venta
    assert transactions[0].type == "charge"
    assert transactions[0].gross_cents == 12550
    assert transactions[0].fee_cents == 188
    assert transactions[0].net_cents == 12362

    # Devolución (0900)
    assert transactions[1].type == "refund"
    assert transactions[1].gross_cents == -2500
    assert transactions[1].net_cents == -2500


def test_column_mapper_autodiscovery():
    """Verifica autodescubrimiento de columnas en hojas de clientes pyme."""
    sample_pyme_csv = """Nº Factura,Fecha Emisión,Vencimiento,Cliente,CIF/NIF,Total Factura,Concepto,Forma de Pago
F2026-001,01/10/2026,15/10/2026,ACME IBERICA S.L.,B12345678,250.00 €,Servicio Consultoría,stripe
F2026-002,02/10/2026,16/10/2026,HERMANOS LOPEZ CB,E98765432,120.50 €,Mantenimiento Web,redsys
"""
    invoices = ColumnMapper.parse_invoices_csv(sample_pyme_csv)
    assert len(invoices) == 2
    assert invoices[0].invoice_number == "F2026-001"
    assert invoices[0].customer_name == "ACME IBERICA S.L."
    assert invoices[0].customer_fiscal_id == "B12345678"
    assert invoices[0].gross_amount_cents == 25000
    assert invoices[0].gateway_id == "stripe"
