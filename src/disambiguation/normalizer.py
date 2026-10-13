"""
Módulo de Normalización y Depuración Léxica de Extractos Bancarios en Español
Elimina prefijos bancarios recurrentes, ruido operativo y caracteres no alfanuméricos superfluos.
"""
import re
import unicodedata
from typing import Tuple

BANK_NOISE_REGEX = re.compile(
    r"""(?ix)
    \b(
        transf(?:erencia)?\.?\s*(?:de|a|ord|emitida|recibida|internacional|sepa)?
        | adeudo(?:\s+sepa)?
        | recibo(?:\s+sepa)?
        | ord(?:enante)?\.?
        | benef(?:iciario)?\.?
        | remesa
        | pago\s+fra\.?
        | fra\.?
        | concepto:?
        | detalle:?
        | ref\.?:?
        | titular:?
        | d\.n\.i\.?
        | n\.i\.f\.?
        | c\.i\.f\.?
    )\b
    """
)

MULTIPLE_SPACES_REGEX = re.compile(r"\s+")


class SpanishBankTextNormalizer:
    @staticmethod
    def strip_accents(text: str) -> str:
        """Elimina tildes preservando la Ñ/ñ mediante sustitución controlada."""
        text = text.replace("ñ", "###_n_###").replace("Ñ", "###_N_###")
        normalized = unicodedata.normalize("NFKD", text)
        without_accents = "".join([c for c in normalized if not unicodedata.combining(c)])
        return without_accents.replace("###_n_###", "ñ").replace("###_N_###", "Ñ")

    @classmethod
    def clean(cls, raw_text: str) -> str:
        if not raw_text:
            return ""

        # 1. Quitar ruido bancario recurrente
        cleaned = BANK_NOISE_REGEX.sub(" ", raw_text)

        # 2. Reemplazar caracteres especiales que suelen separar palabras
        cleaned = re.sub(r"[/\\_:\-;,]", " ", cleaned)

        # 3. Quitar tildes (manteniendo Ñ) y pasar a mayúsculas
        cleaned = cls.strip_accents(cleaned).upper()

        # 4. Normalizar espacios en blanco
        cleaned = MULTIPLE_SPACES_REGEX.sub(" ", cleaned).strip()

        return cleaned
