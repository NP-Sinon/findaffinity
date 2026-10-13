"""
Motor Fonético Adaptado al Castellano (Spanish Phonetic Encoding)
Neutraliza las variaciones homófonas más frecuentes en el entorno mercantil y bancario español:
- B / V (bilabial)
- C (ante e, i) / Z / S (seseo/ceceo)
- C (ante a, o, u) / K / Q (oclusiva velar sorda)
- LL / Y (yeísmo)
- H (muda)
- G (ante e, i) / J (fricativa velar)
- GU (ante e, i) / G
"""
import re


class SpanishPhoneticEncoder:
    @staticmethod
    def encode(text: str) -> str:
        if not text:
            return ""

        s = text.upper().strip()

        # 1. H muda al inicio o entre vocales
        s = re.sub(r"H", "", s)

        # 2. B y V se unifican en B
        s = re.sub(r"[BV]", "B", s)

        # 3. Yeísmo: LL -> Y
        s = re.sub(r"LL", "Y", s)

        # 4. CH -> X
        s = re.sub(r"CH", "X", s)

        # 5. QU(E|I) -> K(E|I)
        s = re.sub(r"QU([EI])", r"K\1", s)

        # 6. C suave y Z -> S (seseo sistemático)
        s = re.sub(r"C([EI])", r"S\1", s)
        s = re.sub(r"Z", "S", s)

        # 7. C fuerte -> K
        s = re.sub(r"C([AOU])", r"K\1", s)
        s = re.sub(r"C$", "K", s)
        s = re.sub(r"C([^S])", r"K\1", s)

        # 8. GU suave ante E/I -> G
        s = re.sub(r"GU([EI])", r"G\1", s)

        # 9. G suave ante E/I y J -> J
        s = re.sub(r"G([EI])", r"J\1", s)

        # 10. Reducir letras dobles adyacentes (excepto RR)
        s = re.sub(r"(.)\1+", r"\1", s)

        return s
