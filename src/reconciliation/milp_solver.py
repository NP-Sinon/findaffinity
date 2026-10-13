"""
Solver Combinatorio MILP con HiGHS (scipy.optimize.milp)
Implementa la formulación rigurosa con función objetivo parametrizada:
min ( lambda_1 * delta + lambda_2 * sum(|c_i - c_i^teorico| * x_i) + lambda_3 * sum(|c'_j - c'_j^teorico| * y_j) )
Sujeto a:
  -delta <= sum((A_i - c_i)*x_i) - sum((R_j + c'_j)*y_j) - P_net <= delta
  0 <= delta <= tolerancia
  x_i, y_j in {0, 1}
Elimina la factibilidad trivial (c=0) y previene la selección de combinaciones espurias.
"""
from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
from scipy.optimize import LinearConstraint, Bounds, milp


@dataclass
class MILPInvoiceCandidate:
    invoice_id: str
    gross_cents: int
    observed_fee_cents: int
    theoretical_fee_cents: int
    net_cents: int


@dataclass
class MILPRefundCandidate:
    refund_id: str
    gross_cents: int             # Positivo
    reversal_cost_cents: int     # Coste de reversión
    net_deduction_cents: int     # gross + cost


@dataclass
class MILPSolverResult:
    is_success: bool
    matched_invoice_ids: List[str]
    matched_refund_ids: List[str]
    delta_cents: float
    total_invoices_net_cents: int
    total_refunds_net_cents: int
    total_fee_deviation_cents: float
    objective_value: float


class HighsMILPSolver:
    @staticmethod
    def solve(
        target_net_cents: int,
        invoices: List[MILPInvoiceCandidate],
        refunds: Optional[List[MILPRefundCandidate]] = None,
        tolerance_cents: int = 2,
        lambda_1: float = 100.0,   # Peso de penalización por desviación respecto al neto bancario (delta)
        lambda_2: float = 1.0,     # Peso de penalización por desvío de comisiones en ventas
        lambda_3: float = 1.0,     # Peso de penalización por desvío de costes en devoluciones
    ) -> MILPSolverResult:
        refunds = refunds or []
        n = len(invoices)
        m = len(refunds)

        if n == 0 and m == 0:
            return MILPSolverResult(
                is_success=False,
                matched_invoice_ids=[],
                matched_refund_ids=[],
                delta_cents=0.0,
                total_invoices_net_cents=0,
                total_refunds_net_cents=0,
                total_fee_deviation_cents=0.0,
                objective_value=0.0,
            )

        # Variables:
        # [0 .. n-1]: x_i (binarias facturas)
        # [n .. n+m-1]: y_j (binarias devoluciones)
        # [n+m]: delta (holgura continua)
        total_vars = n + m + 1
        delta_idx = n + m

        # 1. Vector de costes de la función objetivo:
        # c^T * v = lambda_2 * sum(|c_i - c_i^teorico| * x_i) + lambda_3 * sum(costes_y * y_j) + lambda_1 * delta
        c_obj = np.zeros(total_vars, dtype=np.float64)

        for i, inv in enumerate(invoices):
            fee_dev = abs(inv.observed_fee_cents - inv.theoretical_fee_cents)
            # Para romper empates en soluciones factibles idénticas, añadimos un término minúsculo (-1e-4)
            # que favorece incluir facturas legítimas frente a dejar el sistema ocioso
            c_obj[i] = lambda_2 * fee_dev - 1e-4

        for j, ref in enumerate(refunds):
            c_obj[n + j] = lambda_3 * ref.reversal_cost_cents

        c_obj[delta_idx] = lambda_1

        # 2. Vector de integralidad:
        # 1 para variables binarias/enteras (x_i, y_j), 0 para continua (delta)
        integrality = np.zeros(total_vars, dtype=int)
        integrality[: n + m] = 1  # Binarias

        # 3. Límites (Bounds):
        # x_i in [0, 1], y_j in [0, 1], delta in [0, tolerance_cents]
        lb = np.zeros(total_vars, dtype=np.float64)
        ub = np.ones(total_vars, dtype=np.float64)
        ub[delta_idx] = float(tolerance_cents)

        bounds = Bounds(lb=lb, ub=ub)

        # 4. Restricciones lineales:
        # S = sum(N_i * x_i) - sum((R_j + c'_j) * y_j)
        # R1: S - delta <= P_net
        # R2: S + delta >= P_net  <=>  -S - delta <= -P_net
        # Formato scipy: lb <= A @ v <= ub
        
        # Coeficientes para S:
        s_coeffs = np.zeros(total_vars, dtype=np.float64)
        for i, inv in enumerate(invoices):
            s_coeffs[i] = float(inv.net_cents)
        for j, ref in enumerate(refunds):
            s_coeffs[n + j] = -float(ref.net_deduction_cents)

        # Fila 1: S - delta <= P_net  -->  -inf <= S - delta <= P_net
        row1 = np.copy(s_coeffs)
        row1[delta_idx] = -1.0

        # Fila 2: S + delta >= P_net  -->  P_net <= S + delta <= inf
        row2 = np.copy(s_coeffs)
        row2[delta_idx] = 1.0

        A = np.vstack([row1, row2])
        constraint_lb = np.array([-np.inf, float(target_net_cents)], dtype=np.float64)
        constraint_ub = np.array([float(target_net_cents), np.inf], dtype=np.float64)

        constraints = LinearConstraint(A, lb=constraint_lb, ub=constraint_ub)

        # Resolver mediante HiGHS
        res = milp(c=c_obj, integrality=integrality, constraints=constraints, bounds=bounds)

        if not res.success:
            return MILPSolverResult(
                is_success=False,
                matched_invoice_ids=[],
                matched_refund_ids=[],
                delta_cents=0.0,
                total_invoices_net_cents=0,
                total_refunds_net_cents=0,
                total_fee_deviation_cents=0.0,
                objective_value=0.0,
            )

        sol = res.x
        x_sol = np.round(sol[:n]).astype(int)
        y_sol = np.round(sol[n : n + m]).astype(int)
        delta_val = float(sol[delta_idx])

        matched_inv_ids = [invoices[i].invoice_id for i in range(n) if x_sol[i] == 1]
        matched_ref_ids = [refunds[j].refund_id for j in range(m) if y_sol[j] == 1]

        # Verificar que se seleccionó al menos un elemento si el target > 0
        if target_net_cents > 0 and len(matched_inv_ids) == 0:
            return MILPSolverResult(
                is_success=False,
                matched_invoice_ids=[],
                matched_refund_ids=[],
                delta_cents=0.0,
                total_invoices_net_cents=0,
                total_refunds_net_cents=0,
                total_fee_deviation_cents=0.0,
                objective_value=0.0,
            )

        tot_inv_net = sum(invoices[i].net_cents for i in range(n) if x_sol[i] == 1)
        tot_ref_net = sum(refunds[j].net_deduction_cents for j in range(m) if y_sol[j] == 1)
        tot_fee_dev = sum(
            abs(invoices[i].observed_fee_cents - invoices[i].theoretical_fee_cents)
            for i in range(n)
            if x_sol[i] == 1
        )

        return MILPSolverResult(
            is_success=True,
            matched_invoice_ids=matched_inv_ids,
            matched_refund_ids=matched_ref_ids,
            delta_cents=round(delta_val, 2),
            total_invoices_net_cents=tot_inv_net,
            total_refunds_net_cents=tot_ref_net,
            total_fee_deviation_cents=float(tot_fee_dev),
            objective_value=float(res.fun),
        )
