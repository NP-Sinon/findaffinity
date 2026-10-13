"""
Motor de Concordancia Difusa (Fuzzy Matching) con Aceleración C++ (RapidFuzz)
Combina Token Set Ratio (inmune a inversión de palabras) con fonética castellana y Damerau-Levenshtein.
"""
from typing import Tuple
from rapidfuzz import fuzz

from src.disambiguation.normalizer import SpanishBankTextNormalizer
from src.disambiguation.phonetic import SpanishPhoneticEncoder


class SpanishFuzzyMatcher:
    @staticmethod
    def match_strings(query: str, target: str) -> Tuple[float, dict]:
        """
        Calcula la similitud difusa normalizada en [0.0, 1.0] entre dos cadenas en castellano.
        Retorna (score_consolidado, desglose_metricas).
        """
        if not query or not target:
            return 0.0, {}

        # 1. Normalización léxica
        clean_q = SpanishBankTextNormalizer.clean(query)
        clean_t = SpanishBankTextNormalizer.clean(target)

        if not clean_q or not clean_t:
            return 0.0, {}

        # 2. Métricas léxicas directas (RapidFuzz en C++)
        # Token Set Ratio: maneja palabras intercaladas o invertidas ("JUAN GARCIA SL" vs "GARCIA, JUAN")
        token_set = fuzz.token_set_ratio(clean_q, clean_t) / 100.0
        # Token Sort Ratio: compara palabras ordenadas
        token_sort = fuzz.token_sort_ratio(clean_q, clean_t) / 100.0
        # Ratio directo (Damerau-Levenshtein)
        direct_ratio = fuzz.ratio(clean_q, clean_t) / 100.0

        # 3. Métrica fonética
        phonetic_q = SpanishPhoneticEncoder.encode(clean_q)
        phonetic_t = SpanishPhoneticEncoder.encode(clean_t)
        phonetic_score = fuzz.token_set_ratio(phonetic_q, phonetic_t) / 100.0

        # Combinación ponderada:
        # 60% Token Set + 20% Token Sort + 20% Fonético
        combined_score = (0.60 * token_set) + (0.20 * token_sort) + (0.20 * phonetic_score)

        metrics = {
            "token_set_ratio": round(token_set, 4),
            "token_sort_ratio": round(token_sort, 4),
            "direct_ratio": round(direct_ratio, 4),
            "phonetic_score": round(phonetic_score, 4),
            "combined_score": round(combined_score, 4),
        }

        return round(combined_score, 4), metrics
