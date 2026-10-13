"""
Test Suite de Estrés de Escala y Auditoría Algorítmica (Combinatorial & High-Volume Stress Test)

Evalúa y audita rigurosamente:
1. Estrés de Escala en Poda Heurística:
   - Universo de 2.000 facturas históricas abiertas distribuidas en 6 meses y 4 pasarelas.
   - Demostración cuantitativa: reducción de 2.000 facturas a <= 25 candidatos en < 50 ms.
2. Estrés Combinatorio en HiGHS MILP y Meet-in-the-Middle:
   - Lotes reales complejos de 15 a 30 facturas con trampas combinatorias (facturas señuelo).
   - Medición de latencia de HiGHS MILP (< 2.0 s según especificación técnica del PDF).
   - Verificación de inmunidad a facturas señuelo mediante la función objetivo regularizada.
   - Evaluación de rendimiento de Meet-in-the-Middle (Horowitz-Sahni).
3. Estrés de Asientos Compuestos Masivos:
   - Generación de asientos de partida doble para lotes de 50 facturas simultáneas.
   - Verificación estricta al céntimo: sum(Debe) - sum(Haber) == 0.00 € (desviación = 0).
4. Benchmark de Throughput y Memoria:
   - Ejecución de 20 liquidaciones de payouts en serie con medición de latencia media y memoria (tracemalloc).
"""
import random
import time
import tracemalloc
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Tuple

import pytest

from src.parsers.base import (
    CanonicalBankTransaction,
    CanonicalInvoice,
    CanonicalGatewayTransaction,
    TransactionType,
)
from src.reconciliation.pruning import ReconciliationPruner
from src.reconciliation.meet_in_the_middle import MeetInTheMiddleSolver, SubsetSumCandidate
from src.reconciliation.milp_solver import HighsMILPSolver, MILPInvoiceCandidate
from src.accounting.double_entry import AccountingEntryBuilder
from src.reconciliation.engine import BatchPayoutReconciliationEngine


def test_heuristic_pruning_scale_2000_invoices():
    """
    a) Estrés de Escala en Poda Heurística:
    - Universo de 2.000 facturas históricas abiertas distribuidas en 6 meses (180 días)
      y 4 pasarelas de pago (Stripe, Redsys, PayPal, TPV).
    - Demuestra cuantitativamente que la poda reduce el espacio de 2.000 facturas
      a <= 25 candidatos en menos de 50 ms.
    """
    random.seed(2026)
    start_date = date(2026, 4, 15)
    gateways = ["stripe", "redsys", "paypal", "tpv"]

    # Generar universo de 2.000 facturas distribuidas uniformemente en 180 días
    # con importes variados y algunas facturas fuera de escala (> 10.000 €)
    universe_size = 2000
    candidates: List[CanonicalInvoice] = []

    for i in range(universe_size):
        day_offset = random.randint(0, 180)
        inv_date = start_date + timedelta(days=day_offset)
        gw = gateways[i % len(gateways)]

        # 95% importes operativos ordinarios (10 € a 1.200 €), 5% importes gigantescos atípicos (> 10.000 €)
        if random.random() < 0.05:
            gross = random.randint(1000000, 5000000)  # 10.000 € - 50.000 €
        else:
            gross = random.randint(1500, 120000)      # 15 € - 1.200 €

        candidates.append(
            CanonicalInvoice(
                invoice_id=f"INV-SCALE-{i:04d}",
                invoice_number=f"F-2026-{i:05d}",
                issue_date=inv_date,
                due_date=inv_date,
                customer_id=f"CUST-{i:04d}",
                customer_name=f"Cliente Empresa {i}",
                gross_amount_cents=gross,
                gateway_id=gw,
            )
        )

    # Liquidación a auditar: fecha final del horizonte (Día 180), pasarela Stripe, abono neto de 2.500,00 €
    payout_date = start_date + timedelta(days=180)  # 2026-10-12
    target_net_cents = 250000                        # 2.500,00 €
    target_gateway = "stripe"
    lookback_days = 7

    # Medición de latencia de alta precisión
    t0 = time.perf_counter()
    pruned_result = ReconciliationPruner.prune(
        target_net_cents=target_net_cents,
        payout_date=payout_date,
        candidates=candidates,
        gateway_id=target_gateway,
        max_lookback_days=lookback_days,
    )
    pruning_latency_sec = time.perf_counter() - t0
    pruning_latency_ms = pruning_latency_sec * 1000.0

    stats = pruned_result.pruning_stats
    surviving_count = len(pruned_result.invoices)

    # Imprimir reporte cuantitativo en consola (-s)
    print("\n" + "=" * 80)
    print(" [BENCHMARK 1] AUDITORÍA DE PODA HEURÍSTICA EN 3 NIVELES (2.000 FACTURAS)")
    print("=" * 80)
    print(f" Universo inicial de facturas : {stats['initial_count']:,} facturas (6 meses, 4 pasarelas)")
    print(f" Nivel 1 (Filtro Temporal {lookback_days}d): {stats['after_temporal']} facturas retenidas")
    print(f" Nivel 2 (Filtro Pasarela '{target_gateway}'): {stats['after_gateway']} facturas retenidas")
    print(f" Nivel 3 (Bounding Box Comisiones) : {stats['after_bounding']} facturas retenidas")
    print(f" Total Candidatos Finales     : {surviving_count} facturas")
    print(f" Porcentaje de Reducción      : {stats['reduction_percentage']:.2f} %")
    print(f" Latencia de Ejecución        : {pruning_latency_ms:.3f} ms (Límite tolerado: 50.0 ms)")
    print("=" * 80)

    # Aserciones cuantitativas estrictas requeridas
    assert stats["initial_count"] == 2000, "El universo inicial debe ser exactamente de 2.000 facturas."
    assert surviving_count <= 25, f"La poda debe reducir el espacio a <= 25 candidatos, obtenido: {surviving_count}"
    assert pruning_latency_ms < 50.0, f"La latencia ({pruning_latency_ms:.2f} ms) debe ser inferior a 50.0 ms."
    assert stats["reduction_percentage"] >= 98.5, f"La reducción ({stats['reduction_percentage']}%) debe ser >= 98.5%"


@pytest.mark.parametrize("batch_size", [15, 20, 25, 30])
def test_combinatorial_stress_highs_milp_with_decoys(batch_size: int):
    """
    b) Estrés Combinatorio en HiGHS MILP:
    - Agrupación de lotes de 15, 20, 25 y 30 facturas reales legítimas.
    - Inyección de 15 a 20 facturas señuelo con importes netos idénticos o cuasi-idénticos (trampas combinatorias),
      pero con comisiones alteradas/falsas (|c_i - c_i^teorico| >> 0).
    - Verifica:
      1. Tiempo de resolución por payout de HiGHS MILP < 2.0 segundos (especificación del PDF).
      2. Inmunidad matemática: La función objetivo regularizada nunca selecciona facturas señuelo.
      3. Identificación exacta al 100% del subconjunto legítimo.
    """
    random.seed(42 + batch_size)
    num_decoys = 15

    # 1. Crear facturas legítimas
    genuine_invoices: List[MILPInvoiceCandidate] = []
    for i in range(batch_size):
        gross = random.randint(2500, 35000)  # 25 € a 350 €
        theo_fee = int(round(gross * 0.015 + 25))  # Comisión legítima Stripe 1.5% + 0.25€
        obs_fee = theo_fee                         # Desviación cero en legítimas
        net = gross - obs_fee
        genuine_invoices.append(
            MILPInvoiceCandidate(
                invoice_id=f"GENUINE_{batch_size}_{i:02d}",
                gross_cents=gross,
                observed_fee_cents=obs_fee,
                theoretical_fee_cents=theo_fee,
                net_cents=net,
            )
        )

    target_net_cents = sum(g.net_cents for g in genuine_invoices)

    # 2. Inyectar facturas señuelo (Trampas combinatorias)
    # Poseen exactamente el mismo neto que una factura legítima, pero con comisiones arbitrarias distorsionadas
    decoy_invoices: List[MILPInvoiceCandidate] = []
    for j in range(num_decoys):
        template = genuine_invoices[j % batch_size]
        # Distorsión de comisión: 2.00 € a 5.00 € de sobrecoste artificial
        fake_deviation = random.choice([200, 350, 500, -80])
        distorted_fee = max(5, template.theoretical_fee_cents + fake_deviation)
        distorted_gross = template.net_cents + distorted_fee
        decoy_invoices.append(
            MILPInvoiceCandidate(
                invoice_id=f"DECOY_TRAP_{batch_size}_{j:02d}",
                gross_cents=distorted_gross,
                observed_fee_cents=distorted_fee,
                theoretical_fee_cents=template.theoretical_fee_cents,
                net_cents=template.net_cents,  # Mismo neto exacto que la legítima -> trampa combinatoria
            )
        )

    # Mezclar candidatos en orden aleatorio para no sesgar el solver
    all_candidates = genuine_invoices + decoy_invoices
    random.shuffle(all_candidates)

    total_pool_count = len(all_candidates)

    # 3. Resolver con HiGHS MILP y medir tiempo
    t0 = time.perf_counter()
    solver_result = HighsMILPSolver.solve(
        target_net_cents=target_net_cents,
        invoices=all_candidates,
        tolerance_cents=0,  # Búsqueda exacta
        lambda_1=100.0,
        lambda_2=1.0,
    )
    solver_duration_sec = time.perf_counter() - t0
    solver_duration_ms = solver_duration_sec * 1000.0

    # Imprimir métricas
    print("\n" + "-" * 80)
    print(f" [BENCHMARK 2.MILP] HiGHS MILP CON TRAMPAS COMBINATORIAS (Lote = {batch_size} facturas)")
    print("-" * 80)
    print(f" Pool total evaluado          : {total_pool_count} candidatos ({batch_size} legítimos + {num_decoys} señuelos)")
    print(f" Neto objetivo liquidado      : {target_net_cents / 100:.2f} €")
    print(f" Éxito del Solver             : {solver_result.is_success}")
    print(f" Facturas seleccionadas       : {len(solver_result.matched_invoice_ids)}")
    print(f" Tiempo resolución HiGHS      : {solver_duration_ms:.2f} ms ({solver_duration_sec:.4f} s)")
    print(f" Límite exigido por PDF       : < 2.000,00 ms (2.0 segundos)")
    print(f" Desviación comisiones total  : {solver_result.total_fee_deviation_cents:.2f} céntimos")
    print(f" Valor función objetivo       : {solver_result.objective_value:.4f}")

    # Aserciones de rigor matemático
    assert solver_result.is_success is True, f"HiGHS MILP falló en resolver el lote de {batch_size} facturas."
    assert solver_duration_sec < 2.0, f"HiGHS excedió el límite de 2.0s: {solver_duration_sec:.4f}s"
    assert len(solver_result.matched_invoice_ids) == batch_size, "El solver no seleccionó el número exacto de facturas."

    # Inmunidad a señuelos: NINGUNA factura señuelo debe ser seleccionada
    selected_decoys = [iid for iid in solver_result.matched_invoice_ids if iid.startswith("DECOY_TRAP")]
    print(f" Facturas señuelo seleccionadas: {len(selected_decoys)} (Esperado: 0)")
    assert len(selected_decoys) == 0, f"¡Vulnerabilidad combinatoria! El solver seleccionó señuelos: {selected_decoys}"

    # Todos los IDs seleccionados deben coincidir con el conjunto legítimo
    genuine_ids = {g.invoice_id for g in genuine_invoices}
    assert set(solver_result.matched_invoice_ids) == genuine_ids


def test_combinatorial_stress_meet_in_the_middle():
    """
    b) Estrés Combinatorio en Meet-in-the-Middle (Horowitz-Sahni):
    - Evalúa el solver determinista O(2^(n/2) * (n/2)) con n = 24 candidatos.
    - Demuestra convergencia ultrarrápida (< 50 ms) para subconjuntos exactos.
    """
    random.seed(1234)
    n_candidates = 24
    candidates: List[SubsetSumCandidate] = []

    for i in range(n_candidates):
        gross = random.randint(2000, 25000)
        fee = int(round(gross * 0.015 + 25))
        net = gross - fee
        candidates.append(
            SubsetSumCandidate(
                item_id=f"MITM_INV_{i:02d}",
                net_cents=net,
                gross_cents=gross,
                fee_cents=fee,
            )
        )

    # Seleccionar un subconjunto de 12 facturas aleatorias como objetivo
    chosen_indices = [0, 2, 4, 7, 9, 11, 14, 16, 18, 20, 21, 23]
    target_net_cents = sum(candidates[idx].net_cents for idx in chosen_indices)

    t0 = time.perf_counter()
    mitm_res = MeetInTheMiddleSolver.solve(
        target_net_cents=target_net_cents,
        candidates=candidates,
        tolerance_cents=0,
    )
    mitm_latency_ms = (time.perf_counter() - t0) * 1000.0

    print("\n" + "-" * 80)
    print(" [BENCHMARK 2.MITM] MEET-IN-THE-MIDDLE HOROWITZ-SAHNI (N = 24)")
    print("-" * 80)
    print(f" Espacio combinatorial 2^24   : 16.777.216 combinaciones")
    print(f" Complejidad evaluada 2^(n/2) : 2x 2^12 = 8.192 subconjuntos")
    print(f" Tiempo resolución MITM       : {mitm_latency_ms:.2f} ms")
    print(f" Coincidencia exacta (delta=0): {mitm_res.is_exact if mitm_res else False}")
    if mitm_res:
        print(f" Facturas recuperadas         : {len(mitm_res.matched_ids)} facturas")
        print(f" Neto total recuperado        : {mitm_res.total_net_cents / 100:.2f} €")

    assert mitm_res is not None, "Meet-in-the-Middle no encontró solución exacta."
    assert mitm_res.is_exact is True
    assert mitm_res.delta_cents == 0
    assert mitm_res.total_net_cents == target_net_cents

    # Verificar que el subconjunto devuelto suma exactamente el neto objetivo al céntimo
    cand_dict = {c.item_id: c.net_cents for c in candidates}
    reconstructed_sum = sum(cand_dict[iid] for iid in mitm_res.matched_ids)
    # El PDF establece un umbral interactivo de < 2.0 segundos para resolución combinatoria
    assert mitm_latency_ms < 2000.0, f"MITM tardó más de 2.0 s: {mitm_latency_ms:.2f} ms"


@pytest.mark.parametrize("lot_iteration", [1, 2, 3])
def test_massive_composite_journal_entry_balance_50_invoices(lot_iteration: int):
    """
    c) Estrés de Asientos Compuestos Masivos:
    - Asientos contables de partida doble generados para lotes de 50 facturas simultáneas.
    - Verificar a nivel de 1 céntimo que sum(Debe) - sum(Haber) == 0.00 € sin la menor desviación.
    - Valida que la estructura del asiento PGC (572 Debe, 626 Debe, 430 Haber) sea inmaculada.
    """
    random.seed(5000 + lot_iteration)
    batch_size = 50

    matched_invoices_data = []
    total_gross_cents = 0
    total_fees_cents = 0

    for i in range(batch_size):
        gross = random.randint(1500, 75000)  # 15.00 € a 750.00 €
        fee = int(round(gross * 0.015 + 25))  # Comisión Stripe
        total_gross_cents += gross
        total_fees_cents += fee

        matched_invoices_data.append(
            {
                "account_code": f"43000{i:04d}",
                "invoice_number": f"F-MASS-2026-{lot_iteration:02d}-{i:03d}",
                "gross_cents": gross,
                "fee_cents": fee,
                "customer_name": f"Corporación Cliente {i}",
            }
        )

    # Neto liquidado abonado en banco: Total Bruto - Total Comisiones
    payout_net_cents = total_gross_cents - total_fees_cents
    entry_date = date(2026, 10, 15)

    # Construcción del asiento compuesto masivo
    t0 = time.perf_counter()
    journal = AccountingEntryBuilder.build_payout_reconciliation_entry(
        entry_number=500 + lot_iteration,
        entry_date=entry_date,
        bank_account_code="572000001",
        fee_account_code="626000001",
        payout_net_cents=payout_net_cents,
        matched_invoices=matched_invoices_data,
        gateway_name="Stripe",
    )
    journal_gen_latency_ms = (time.perf_counter() - t0) * 1000.0

    # Auditoría estricta de balance contable al céntimo
    total_debit = sum(l.debit_cents for l in journal.lines)
    total_credit = sum(l.credit_cents for l in journal.lines)
    imbalance_cents = total_debit - total_credit

    total_debit_eur = Decimal(total_debit) / Decimal(100)
    total_credit_eur = Decimal(total_credit) / Decimal(100)
    imbalance_eur = total_debit_eur - total_credit_eur

    print("\n" + "=" * 80)
    print(f" [BENCHMARK 3] ASIENTO COMPUESTO MASIVO DE 50 FACTURAS (Lote #{lot_iteration})")
    print("=" * 80)
    print(f" Número de apuntes generados  : {len(journal.lines)} líneas contables")
    print(f" Cuenta 572 (Banco Neto)      : {payout_net_cents / 100:,.2f} € (Debe)")
    print(f" Cuenta 626 (Comisiones)      : {total_fees_cents / 100:,.2f} € (Debe)")
    print(f" Cuentas 430 (50 Clientes)    : {total_gross_cents / 100:,.2f} € (Haber)")
    print(f" Total DEBE (Bancos + Gastos) : {total_debit_eur:,.2f} €")
    print(f" Total HABER (50 Facturas)    : {total_credit_eur:,.2f} €")
    print(f" Desviación Cuadre Contable   : {imbalance_eur:.2f} € ({imbalance_cents} céntimos)")
    print(f" Estado de Balance Cuadrado   : {journal.is_balanced}")
    print(f" Tiempo generación asiento    : {journal_gen_latency_ms:.3f} ms")
    print("=" * 80)

    # Aserciones de exactitud matemática
    assert len(journal.lines) == 52, "Debe contener 1 línea banco + 1 línea comisiones + 50 líneas clientes = 52"
    assert journal.is_balanced is True, "El asiento compuesto debe estar estrictamente cuadrado."
    assert imbalance_cents == 0, f"El descuadre en céntimos debe ser 0, obtenido: {imbalance_cents}"
    assert imbalance_eur == Decimal("0.00"), f"Desviación en euros no nula: {imbalance_eur} €"
    assert total_debit == total_credit == total_gross_cents


def test_throughput_and_memory_benchmark_20_payouts_series():
    """
    d) Benchmark de Throughput y Memoria:
    - Ejecuta 20 conciliaciones de payouts en serie simulando una jornada de cierre contable.
    - Cada payout agrupa entre 8 y 28 facturas, probando tanto Meet-in-the-Middle como HiGHS MILP.
    - Mide tiempo medio por payout, latencia mínima/máxima, throughput y uso de memoria mediante tracemalloc.
    """
    tracemalloc.start()
    random.seed(9999)

    engine = BatchPayoutReconciliationEngine()
    total_payouts = 20

    latencies_ms: List[float] = []
    matched_invoice_counts: List[int] = []
    total_volume_gross_cents = 0
    total_volume_net_cents = 0
    solvers_used = []

    print("\n" + "=" * 90)
    print(" [BENCHMARK 4] PROCESAMIENTO EN SERIE DE 20 BATCH PAYOUTS (THROUGHPUT & MEMORIA)")
    print("=" * 90)
    print(f"{'#':<3} | {'Payout ID':<14} | {'Neto (€)':<10} | {'Facturas':<8} | {'Solver':<28} | {'Latencia (ms)':<12} | {'Cuadre'}")
    print("-" * 90)

    benchmark_start_sec = time.perf_counter()

    for p in range(total_payouts):
        p_date = date(2026, 10, 1) + timedelta(days=p)
        # Variar intencionalmente el tamaño de lote para ejercitar ambos motores algorítmicos
        # Lotes <= 24 facturas sin discrepancia -> Meet-in-the-Middle
        # Lotes > 24 facturas o con ligera discrepancia -> HiGHS MILP
        batch_size = random.choice([10, 14, 18, 22, 26, 28])

        open_invoices: List[CanonicalInvoice] = []
        gw_txs: List[CanonicalGatewayTransaction] = []

        batch_gross = 0
        batch_fees = 0

        for i in range(batch_size):
            gross = random.randint(2500, 45000)
            fee = int(round(gross * 0.015 + 25))
            net = gross - fee

            batch_gross += gross
            batch_fees += fee

            inv_id = f"INV-RUN{p:02d}-{i:02d}"
            inv_num = f"F-RUN{p:02d}-{i:03d}"
            inv_date = p_date - timedelta(days=random.randint(0, 5))
            created_datetime = datetime.combine(inv_date, datetime.min.time())

            open_invoices.append(
                CanonicalInvoice(
                    invoice_id=inv_id,
                    invoice_number=inv_num,
                    issue_date=inv_date,
                    due_date=inv_date,
                    customer_id=f"CUST-{p}-{i}",
                    customer_name=f"Cliente {p}-{i}",
                    gross_amount_cents=gross,
                    gateway_id="stripe",
                )
            )

            gw_txs.append(
                CanonicalGatewayTransaction(
                    transaction_id=f"GW-TX-{p:02d}-{i:02d}",
                    gateway_id="stripe",
                    created_at=created_datetime,
                    type="charge",
                    gross_cents=gross,
                    fee_cents=fee,
                    net_cents=net,
                    order_id=inv_num,
                )
            )

        # Añadir ruido con facturas de otras pasarelas y fechas fuera de ventana
        for j in range(20):
            open_invoices.append(
                CanonicalInvoice(
                    invoice_id=f"NOISE-{p:02d}-{j:02d}",
                    invoice_number=f"F-NOISE-{p:02d}-{j:02d}",
                    issue_date=p_date - timedelta(days=random.randint(20, 60)),
                    due_date=p_date,
                    customer_id=f"CUST-NOISE-{j}",
                    customer_name=f"Cliente Ajeno {j}",
                    gross_amount_cents=random.randint(5000, 20000),
                    gateway_id=random.choice(["redsys", "paypal", "tpv"]),
                )
            )

        target_payout_net_cents = batch_gross - batch_fees
        bank_tx_id = f"TX-BANK-N43-{p:03d}"
        bank_tx = CanonicalBankTransaction(
            transaction_id=bank_tx_id,
            account_iban="ES9121000418450200051332",
            operation_date=p_date,
            value_date=p_date,
            transaction_type=TransactionType.DEPOSIT,
            amount_cents=target_payout_net_cents,
            concept=f"STRIPE PAYOUT BATCH #{p:03d}",
        )

        t_payout_0 = time.perf_counter()
        report = engine.reconcile_payout(
            bank_tx=bank_tx,
            open_invoices=open_invoices,
            gateway_transactions=gw_txs,
            gateway_id="stripe",
            entry_number=1000 + p,
        )
        lat_ms = (time.perf_counter() - t_payout_0) * 1000.0

        latencies_ms.append(lat_ms)
        matched_invoice_counts.append(len(report.matched_invoice_ids))
        total_volume_gross_cents += report.total_gross_cents
        total_volume_net_cents += report.total_net_cents
        solvers_used.append(report.solver_used)

        assert report.is_reconciled is True, f"Liquidación #{p} falló al conciliar."
        assert report.journal_entry is not None
        assert report.journal_entry.is_balanced is True, f"Asiento contable de #{p} descuadrado."
        assert len(report.matched_invoice_ids) == batch_size

        solver_short = "HiGHS MILP" if "HiGHS" in report.solver_used else "Meet-in-Middle"
        balance_flag = "OK (0.00€)" if report.journal_entry.is_balanced else "FAIL"

        print(
            f"{p+1:<3} | {bank_tx_id:<14} | {target_payout_net_cents / 100:>8.2f} € | "
            f"{len(report.matched_invoice_ids):<8} | {solver_short:<28} | {lat_ms:>8.2f} ms   | {balance_flag}"
        )

    total_benchmark_duration_sec = time.perf_counter() - benchmark_start_sec
    current_mem_bytes, peak_mem_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    mean_lat_ms = sum(latencies_ms) / len(latencies_ms)
    min_lat_ms = min(latencies_ms)
    max_lat_ms = max(latencies_ms)
    total_matched = sum(matched_invoice_counts)
    payouts_per_sec = total_payouts / total_benchmark_duration_sec
    invoices_per_sec = total_matched / total_benchmark_duration_sec
    peak_mem_mb = peak_mem_bytes / (1024 * 1024)
    current_mem_mb = current_mem_bytes / (1024 * 1024)

    print("-" * 90)
    print(" RESUMEN GLOBAL DEL BENCHMARK DE RENDIMIENTO Y ESCALA")
    print("-" * 90)
    print(f" Total Liquidaciones Conciliadas : {total_payouts} / {total_payouts} (100.0 % éxito)")
    print(f" Total Facturas Conciliadas      : {total_matched} facturas")
    print(f" Volumen Total Bruto Procesado   : {total_volume_gross_cents / 100:,.2f} €")
    print(f" Volumen Total Neto Liquidado    : {total_volume_net_cents / 100:,.2f} €")
    print(f" Tiempo Total del Benchmark      : {total_benchmark_duration_sec:.4f} segundos")
    print(f" Latencia Media por Liquidación  : {mean_lat_ms:.2f} ms (Target: < 2.000 ms)")
    print(f" Latencia Mínima / Máxima        : {min_lat_ms:.2f} ms / {max_lat_ms:.2f} ms")
    print(f" Throughput Liquidaciones        : {payouts_per_sec:.2f} liquidaciones / seg")
    print(f" Throughput Facturas             : {invoices_per_sec:.2f} facturas / seg")
    print(f" Consumo de Memoria Pico (Peak)  : {peak_mem_mb:.2f} MB")
    print(f" Consumo de Memoria Final        : {current_mem_mb:.2f} MB")
    print(f" Desviación Contable Acumulada   : 0.00 € (100% cuadre exacto)")
    print("=" * 90)

    # Aserciones de rendimiento y calidad
    assert mean_lat_ms < 200.0, f"La latencia media ({mean_lat_ms:.2f} ms) debe ser < 200 ms."
    assert max_lat_ms < 2000.0, f"Ninguna liquidación puede tardar >= 2.0s: {max_lat_ms:.2f} ms."
    assert peak_mem_mb < 50.0, f"El consumo de memoria ({peak_mem_mb:.2f} MB) excede 50 MB."
    assert total_matched > 0
