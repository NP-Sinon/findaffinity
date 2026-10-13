"""
Algoritmo de Partición Meet-in-the-Middle (Horowitz-Sahni)
Resuelve el Subset Sum Problem para liquidaciones deterministas con n <= 26
Precomputando las sumas en dos mitades de tamaño n/2 y aplicando búsqueda binaria.
Complejidad O(2^(n/2) * (n/2)), pasando 2^26 (~6.7x10^7) a < 7x10^4 operaciones elementales.
"""
import bisect
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class SubsetSumCandidate:
    item_id: str
    net_cents: int
    gross_cents: int
    fee_cents: int


@dataclass
class MeetInTheMiddleResult:
    matched_ids: List[str]
    total_net_cents: int
    delta_cents: int
    is_exact: bool


class MeetInTheMiddleSolver:
    @staticmethod
    def solve(
        target_net_cents: int,
        candidates: List[SubsetSumCandidate],
        tolerance_cents: int = 2
    ) -> Optional[MeetInTheMiddleResult]:
        n = len(candidates)
        if n == 0:
            return None

        # Si n es muy grande para Meet-in-the-Middle (p.ej. > 26), se debe derivar al solver MILP
        if n > 26:
            return None

        mid = n // 2
        left_candidates = candidates[:mid]
        right_candidates = candidates[mid:]

        # Generar todas las combinaciones de la mitad izquierda
        # Lista de tuplas: (suma_neta, mascara_bits)
        left_subsets = MeetInTheMiddleSolver._generate_subsets(left_candidates)
        # Ordenar por suma para búsqueda binaria
        left_subsets.sort(key=lambda x: x[0])
        left_sums = [s[0] for s in left_subsets]

        # Generar combinaciones de la mitad derecha
        right_subsets = MeetInTheMiddleSolver._generate_subsets(right_candidates)

        best_delta = float("inf")
        best_left_mask = 0
        best_right_mask = 0
        best_total = 0

        # Para cada subconjunto de la derecha, buscar el complemento en la izquierda
        for r_sum, r_mask in right_subsets:
            needed = target_net_cents - r_sum

            # Búsqueda binaria del valor más cercano en la izquierda
            idx = bisect.bisect_left(left_sums, needed)

            # Evaluar vecinos (idx y idx - 1)
            candidates_idx = []
            if idx < len(left_sums):
                candidates_idx.append(idx)
            if idx > 0:
                candidates_idx.append(idx - 1)
            if idx + 1 < len(left_sums):
                candidates_idx.append(idx + 1)

            for c_idx in candidates_idx:
                l_sum, l_mask = left_subsets[c_idx]
                total = l_sum + r_sum
                delta = abs(total - target_net_cents)

                # Si es un match exacto (delta == 0), retornar inmediatamente
                if delta == 0:
                    matched_ids = MeetInTheMiddleSolver._extract_ids(
                        left_candidates, l_mask, right_candidates, r_mask
                    )
                    return MeetInTheMiddleResult(
                        matched_ids=matched_ids,
                        total_net_cents=total,
                        delta_cents=0,
                        is_exact=True,
                    )

                if delta < best_delta:
                    best_delta = delta
                    best_left_mask = l_mask
                    best_right_mask = r_mask
                    best_total = total

        # Si el mejor delta entra dentro de la tolerancia admitida (<= 2 céntimos)
        if best_delta <= tolerance_cents and (best_left_mask > 0 or best_right_mask > 0):
            matched_ids = MeetInTheMiddleSolver._extract_ids(
                left_candidates, best_left_mask, right_candidates, best_right_mask
            )
            return MeetInTheMiddleResult(
                matched_ids=matched_ids,
                total_net_cents=best_total,
                delta_cents=int(best_delta),
                is_exact=False,
            )

        return None

    @staticmethod
    def _generate_subsets(candidates: List[SubsetSumCandidate]) -> List[Tuple[int, int]]:
        k = len(candidates)
        subsets = []
        num_combinations = 1 << k
        for mask in range(num_combinations):
            curr_sum = 0
            for i in range(k):
                if (mask >> i) & 1:
                    curr_sum += candidates[i].net_cents
            subsets.append((curr_sum, mask))
        return subsets

    @staticmethod
    def _extract_ids(
        left_candidates: List[SubsetSumCandidate],
        left_mask: int,
        right_candidates: List[SubsetSumCandidate],
        right_mask: int,
    ) -> List[str]:
        ids = []
        for i in range(len(left_candidates)):
            if (left_mask >> i) & 1:
                ids.append(left_candidates[i].item_id)
        for j in range(len(right_candidates)):
            if (right_mask >> j) & 1:
                ids.append(right_candidates[j].item_id)
        return ids
