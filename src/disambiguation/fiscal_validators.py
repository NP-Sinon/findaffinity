"""
Validador de Identificadores Fiscales Españoles (NIF, CIF, NIE) y Patrones de Facturas
Aplica validación de Módulo 23 para personas físicas (NIF/NIE) y Módulo 11/algoritmo oficial para sociedades (CIF).
"""
import re
from typing import Optional, Tuple


class SpanishFiscalValidator:
    NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"
    CIF_CONTROL_LETTERS = "JABCDEFGHI"

    NIF_REGEX = re.compile(r"\b(\d{8})([A-Z])\b", re.IGNORECASE)
    NIE_REGEX = re.compile(r"\b([XYZ])(\d{7})([A-Z])\b", re.IGNORECASE)
    CIF_REGEX = re.compile(r"\b([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])\b", re.IGNORECASE)
    INVOICE_PATTERN_REGEX = re.compile(
        r"""(?ix)\b(?:FRA|FACTURA|FAC|DOC|INV)?[\s\-_/:]*([A-Z0-9]{1,6}[/\-_][0-9]{2,8}|[0-9]{4,8})\b"""
    )

    @classmethod
    def validate_nif(cls, nif_str: str) -> bool:
        clean = nif_str.strip().upper()
        if len(clean) != 9:
            return False
        digits_part = clean[:8]
        letter_part = clean[8]
        if not digits_part.isdigit() or not letter_part.isalpha():
            return False
        expected_letter = cls.NIF_LETTERS[int(digits_part) % 23]
        return letter_part == expected_letter

    @classmethod
    def validate_nie(cls, nie_str: str) -> bool:
        clean = nie_str.strip().upper()
        if len(clean) != 9:
            return False
        first_char = clean[0]
        if first_char not in ("X", "Y", "Z"):
            return False
        prefix_digit = {"X": "0", "Y": "1", "Z": "2"}[first_char]
        full_digits = prefix_digit + clean[1:8]
        if not full_digits.isdigit():
            return False
        expected_letter = cls.NIF_LETTERS[int(full_digits) % 23]
        return clean[8] == expected_letter

    @classmethod
    def validate_cif(cls, cif_str: str) -> bool:
        clean = cif_str.strip().upper()
        if len(clean) != 9:
            return False
        first_letter = clean[0]
        digits = clean[1:8]
        control = clean[8]
        if first_letter not in "ABCDEFGHJKLMNPQRSUVW" or not digits.isdigit():
            return False

        # Algoritmo de control oficial CIF:
        # Suma dígitos posiciones pares
        even_sum = int(digits[1]) + int(digits[3]) + int(digits[5])
        # Multiplicar por 2 las posiciones impares y sumar dígitos resultantes
        odd_sum = 0
        for i in [0, 2, 4, 6]:
            val = int(digits[i]) * 2
            odd_sum += (val // 10) + (val % 10)

        total = even_sum + odd_sum
        control_digit = (10 - (total % 10)) % 10

        # Para sociedades A, B, E, H el control suele ser numérico
        # Para P, Q, S, K, W suele ser letra
        expected_digit_char = str(control_digit)
        expected_letter_char = cls.CIF_CONTROL_LETTERS[control_digit]

        return control == expected_digit_char or control == expected_letter_char

    @classmethod
    def extract_fiscal_id(cls, text: str) -> Optional[Tuple[str, str]]:
        """
        Busca en un texto libre un NIF, CIF o NIE válido.
        Retorna (tipo, identificador_normalizado) o None.
        """
        if not text:
            return None
        text_upper = text.upper()

        # Probar NIF
        for m in cls.NIF_REGEX.finditer(text_upper):
            candidate = m.group(0)
            if cls.validate_nif(candidate):
                return ("NIF", candidate)

        # Probar NIE
        for m in cls.NIE_REGEX.finditer(text_upper):
            candidate = m.group(0)
            if cls.validate_nie(candidate):
                return ("NIE", candidate)

        # Probar CIF
        for m in cls.CIF_REGEX.finditer(text_upper):
            candidate = m.group(0)
            if cls.validate_cif(candidate):
                return ("CIF", candidate)

        return None

    @classmethod
    def extract_invoice_number(cls, text: str) -> Optional[str]:
        """Detecta posibles números o códigos de factura referenciados en el concepto."""
        matches = cls.INVOICE_PATTERN_REGEX.findall(text)
        for m in matches:
            clean_m = m.strip()
            # Ignorar años sueltos o cifras muy cortas
            if len(clean_m) >= 4 and not (clean_m.isdigit() and clean_m in ("2024", "2025", "2026", "2027")):
                return clean_m
        return None
