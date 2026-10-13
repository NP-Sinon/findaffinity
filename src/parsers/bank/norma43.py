"""
Parser de Norma 43 (Cuaderno 43 de la Asociación Española de Banca)
Incluye detección resiliente y fallback de codificación (ISO-8859-15, Windows-1252, UTF-8),
extracción estricta de registros de longitud fija (80 caracteres) y validación matemática de integridad.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import List, Optional, Tuple, Union

from src.parsers.base import CanonicalBankTransaction, TransactionType


class Norma43ValidationError(Exception):
    """Error emitido cuando el fichero Norma 43 incumple reglas estructurales o de balance matemático."""
    pass


@dataclass
class Norma43AccountHeader:
    bank_code: str
    branch_code: str
    account_number: str
    start_date: date
    end_date: date
    initial_balance_cents: int
    initial_balance_type: str  # '1': Deudor (Negativo), '2': Acreedor (Positivo)
    currency: str
    account_name: str


@dataclass
class Norma43AccountFooter:
    bank_code: str
    branch_code: str
    account_number: str
    num_debits: int
    total_debits_cents: int
    num_credits: int
    total_credits_cents: int
    final_balance_cents: int
    final_balance_type: str    # '1': Deudor (Negativo), '2': Acreedor (Positivo)
    currency: str


@dataclass
class Norma43MovementItem:
    movement_id: str
    branch_code: str
    operation_date: date
    value_date: date
    common_code: str           # '04' transferencias, '17' comisiones, etc.
    own_code: str
    debit_credit: str          # '1' Debe/Cargo, '2' Haber/Abono
    amount_cents: int
    document_number: str
    reference_1: str
    reference_2: str
    complementary_lines: List[str] = field(default_factory=list)

    @property
    def full_concept(self) -> str:
        all_parts = [self.reference_1.strip(), self.reference_2.strip()]
        all_parts.extend([line.strip() for line in self.complementary_lines if line.strip()])
        return " - ".join([p for p in all_parts if p]).strip()


@dataclass
class Norma43AccountBlock:
    header: Norma43AccountHeader
    movements: List[Norma43MovementItem]
    footer: Optional[Norma43AccountFooter] = None
    is_balanced: bool = False
    balance_discrepancy_cents: int = 0


@dataclass
class Norma43ParseResult:
    detected_encoding: str
    total_records: int
    accounts: List[Norma43AccountBlock] = field(default_factory=list)
    canonical_transactions: List[CanonicalBankTransaction] = field(default_factory=list)
    is_valid: bool = False
    validation_errors: List[str] = field(default_factory=list)


class Norma43Parser:
    SUPPORTED_ENCODINGS = ["iso-8859-15", "windows-1252", "iso-8859-1", "utf-8", "utf-8-sig"]

    @classmethod
    def detect_and_decode(cls, raw_data: bytes) -> Tuple[str, str]:
        """
        Detecta la codificación de un fichero bancario español probando primero ISO-8859-15
        y Windows-1252 (estándares habituales de la banca española con Ñ, tildes y €)
        y aplicando fallback controlado.
        """
        # Prioridad de prueba:
        # En la banca española los extractos con 'ñ', 'á', '€' suelen codificarse en ISO-8859-15 o CP1252.
        # Si un archivo contiene bytes como 0xF1 ('ñ') o 0xA4 ('€' en ISO-8859-15),
        # probar UTF-8 primero podría fallar con UnicodeDecodeError.
        for enc in cls.SUPPORTED_ENCODINGS:
            try:
                decoded = raw_data.decode(enc)
                # Validar que no contenga el carácter nulo o patrones corruptos
                if "\x00" not in decoded:
                    return decoded, enc
            except UnicodeDecodeError:
                continue

        # Fallback de emergencia reemplazando bytes no representables
        return raw_data.decode("latin1", errors="replace"), "latin1-replace"

    @classmethod
    def parse_file(cls, file_path_or_bytes: Union[str, Path, bytes]) -> Norma43ParseResult:
        if isinstance(file_path_or_bytes, (str, Path)):
            with open(file_path_or_bytes, "rb") as f:
                raw_bytes = f.read()
        else:
            raw_bytes = file_path_or_bytes

        text_content, detected_enc = cls.detect_and_decode(raw_bytes)
        return cls.parse_text(text_content, detected_encoding=detected_enc)

    @classmethod
    def parse_text(cls, text: str, detected_encoding: str = "utf-8") -> Norma43ParseResult:
        lines = [line.rstrip("\r\n") for line in text.splitlines() if line.strip()]
        result = Norma43ParseResult(detected_encoding=detected_encoding, total_records=len(lines))

        current_block: Optional[Norma43AccountBlock] = None
        current_movement: Optional[Norma43MovementItem] = None
        global_mov_counter = 0

        for line_idx, line in enumerate(lines, start=1):
            if len(line) < 80:
                # Los registros AEB exigen longitud fija de 80 caracteres. Rellenar si tiene padding recortado
                line = line.ljust(80)

            rec_type = line[0:2]

            try:
                if rec_type == "11":
                    # Cabecera de cuenta
                    bank_code = line[2:6]
                    branch_code = line[6:10]
                    account_num = line[10:20]
                    start_date = cls._parse_date_yymmdd(line[20:26])
                    end_date = cls._parse_date_yymmdd(line[26:32])
                    init_bal_type = line[32]
                    init_bal_cents = int(line[33:47])
                    currency = cls._parse_currency(line[47:50])
                    acct_name = line[51:77].strip()

                    header = Norma43AccountHeader(
                        bank_code=bank_code,
                        branch_code=branch_code,
                        account_number=account_num,
                        start_date=start_date,
                        end_date=end_date,
                        initial_balance_cents=init_bal_cents,
                        initial_balance_type=init_bal_type,
                        currency=currency,
                        account_name=acct_name,
                    )
                    current_block = Norma43AccountBlock(header=header, movements=[])
                    result.accounts.append(current_block)
                    current_movement = None

                elif rec_type == "22":
                    if not current_block:
                        result.validation_errors.append(f"Línea {line_idx}: Movimiento (22) sin cabecera previa (11).")
                        continue

                    global_mov_counter += 1
                    branch_code = line[6:10]
                    op_date = cls._parse_date_yymmdd(line[10:16])
                    val_date = cls._parse_date_yymmdd(line[16:22])
                    common_code = line[22:24]
                    own_code = line[24:27]
                    deb_cred = line[27]  # '1'=Debe, '2'=Haber
                    amount_cents = int(line[28:42])
                    doc_num = line[42:52].strip()
                    ref_1 = line[52:64].strip()
                    ref_2 = line[64:80].strip()

                    mov_id = f"N43-{current_block.header.bank_code}-{current_block.header.account_number}-{global_mov_counter}"
                    current_movement = Norma43MovementItem(
                        movement_id=mov_id,
                        branch_code=branch_code,
                        operation_date=op_date,
                        value_date=val_date,
                        common_code=common_code,
                        own_code=own_code,
                        debit_credit=deb_cred,
                        amount_cents=amount_cents,
                        document_number=doc_num,
                        reference_1=ref_1,
                        reference_2=ref_2,
                    )
                    current_block.movements.append(current_movement)

                elif rec_type == "23":
                    if not current_movement:
                        result.validation_errors.append(f"Línea {line_idx}: Concepto complementario (23) sin apunte principal (22).")
                        continue
                    concept_line = line[4:80].strip()
                    if concept_line:
                        current_movement.complementary_lines.append(concept_line)

                elif rec_type == "33":
                    if not current_block:
                        result.validation_errors.append(f"Línea {line_idx}: Fin de cuenta (33) sin cabecera previa (11).")
                        continue

                    bank_code = line[2:6]
                    branch_code = line[6:10]
                    account_num = line[10:20]
                    num_debits = int(line[20:25])
                    tot_debits = int(line[25:39])
                    num_credits = int(line[39:44])
                    tot_credits = int(line[44:58])
                    fin_bal_type = line[58]
                    fin_bal_cents = int(line[59:73])
                    currency = cls._parse_currency(line[73:76])

                    footer = Norma43AccountFooter(
                        bank_code=bank_code,
                        branch_code=branch_code,
                        account_number=account_num,
                        num_debits=num_debits,
                        total_debits_cents=tot_debits,
                        num_credits=num_credits,
                        total_credits_cents=tot_credits,
                        final_balance_cents=fin_bal_cents,
                        final_balance_type=fin_bal_type,
                        currency=currency,
                    )
                    current_block.footer = footer
                    cls._verify_block_balance(current_block, result)
                    current_movement = None

                elif rec_type == "88":
                    # Registro final de fichero
                    break

            except Exception as e:
                result.validation_errors.append(f"Error procesando línea {line_idx} (Tipo {rec_type}): {str(e)}")

        # Convertir a entidades canónicas si es válido
        if not result.validation_errors:
            result.is_valid = True
            for block in result.accounts:
                iban_synth = f"ES00{block.header.bank_code}{block.header.branch_code}00{block.header.account_number}"
                for mov in block.movements:
                    tx_type = TransactionType.DEPOSIT if mov.debit_credit == "2" else TransactionType.WITHDRAWAL
                    full_desc = mov.full_concept

                    canonical_tx = CanonicalBankTransaction(
                        transaction_id=mov.movement_id,
                        account_iban=iban_synth,
                        operation_date=mov.operation_date,
                        value_date=mov.value_date,
                        transaction_type=tx_type,
                        amount_cents=mov.amount_cents,
                        currency=block.header.currency,
                        common_code=mov.common_code,
                        concept=full_desc,
                        payer_or_payee=mov.reference_1 or full_desc,
                        raw_reference=mov.reference_2 or mov.document_number,
                    )
                    result.canonical_transactions.append(canonical_tx)

        return result

    @staticmethod
    def _parse_date_yymmdd(str_val: str) -> date:
        # AAMMDD: año 00-49 -> 2000-2049, 50-99 -> 1950-1999
        yy = int(str_val[0:2])
        mm = int(str_val[2:4])
        dd = int(str_val[4:6])
        full_year = 2000 + yy if yy < 50 else 1900 + yy
        return date(full_year, mm, dd)

    @staticmethod
    def _parse_currency(code_str: str) -> str:
        # En norma 43 '978' o 'EUR' representan euros
        clean = code_str.strip()
        if clean in ("978", "EUR", ""):
            return "EUR"
        if clean in ("840", "USD"):
            return "USD"
        return clean

    @staticmethod
    def _verify_block_balance(block: Norma43AccountBlock, result: Norma43ParseResult) -> None:
        """
        Verifica matemáticamente que el saldo inicial, abonos, cargos y saldo final
        satisfagan la ecuación de cierre del extracto contable:
        Saldo Inicial con signo + Total Abonos - Total Cargos = Saldo Final con signo
        """
        if not block.footer:
            return

        header = block.header
        footer = block.footer

        # Clave 1 = Deudor (negativo), Clave 2 = Acreedor (positivo)
        signed_init = header.initial_balance_cents if header.initial_balance_type == "2" else -header.initial_balance_cents
        signed_final = footer.final_balance_cents if footer.final_balance_type == "2" else -footer.final_balance_cents

        expected_final = signed_init + footer.total_credits_cents - footer.total_debits_cents
        discrepancy = signed_final - expected_final

        # Comprobar también el sumatorio de apuntes leídos
        actual_debits = sum(m.amount_cents for m in block.movements if m.debit_credit == "1")
        actual_credits = sum(m.amount_cents for m in block.movements if m.debit_credit == "2")

        if actual_debits != footer.total_debits_cents:
            result.validation_errors.append(
                f"Cuenta {header.account_number}: El sumatorio de cargos ({actual_debits} céntimos) "
                f"no coincide con el registro 33 ({footer.total_debits_cents} céntimos)."
            )
        if actual_credits != footer.total_credits_cents:
            result.validation_errors.append(
                f"Cuenta {header.account_number}: El sumatorio de abonos ({actual_credits} céntimos) "
                f"no coincide con el registro 33 ({footer.total_credits_cents} céntimos)."
            )

        if discrepancy != 0:
            block.is_balanced = False
            block.balance_discrepancy_cents = discrepancy
            result.validation_errors.append(
                f"Cuenta {header.account_number}: Descuadre matemático de extracto. "
                f"Saldo final esperado: {expected_final} céntimos, registrado: {signed_final} céntimos (Diferencia: {discrepancy} céntimos)."
            )
        else:
            block.is_balanced = True
            block.balance_discrepancy_cents = 0
