# Micro-SaaS de Reconciliación Algorítmica y Desambiguación Contable (B2B2B)

Motor de conciliación bancaria y descomposición de liquidaciones agrupadas (*batch payouts*) de pasarelas de pago (Stripe, Redsys, PayPal, SumUp) frente a extractos bancarios (Norma 43 AEB, CAMT.053, CSV) y cartera de facturación emitida.

Diseñado bajo la filosofía **Zero-Liability / Staging Area en Modo "Solo Lectura"**, garantizando que los libros oficiales y bases de datos del despacho nunca se alteren en producción sin previa revisión, emitiendo pre-asientos nativos perfectamente cuadrados a cero para **Wolters Kluwer A3 (Suenlace)**, **Sage 50 / Despachos (XDIARIO.csv)** y **DELSOL Contasol (XLSX)**.

---

## 1. Arquitectura y Mecánica del Sistema

```
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │  Extractos Bancarios │   │  Pasarelas de Pago   │   │ Facturas / Cartera   │
 │ Norma 43 / CAMT / CSV│   │ Stripe/Redsys/PayPal │   │   ERPs / Facturas    │
 └──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
            │                          │                          │
            ▼                          ▼                          ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                     MÓDULO DE INGESTA Y NORMALIZACIÓN                      │
 │       (Detección ISO-8859-15/Windows-1252, Validación Módulo 11)           │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                     MOTOR DE RECONCILIACIÓN HÍBRIDO                        │
 │  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐ │
 │  │ 1. Poda Heurística en 3 Niveles │   │ 2. Desambiguación Difusa / NLP  │ │
 │  │ • Ventana temporal móvil (1-7d) │   │ • RapidFuzz (Token Set Ratio)   │ │
 │  │ • Partición por Gateway ID      │   │ • Fonética (Double Metaphone)   │ │
 │  │ • Bounding Box de comisiones    │   │ • Validación Módulo 23 / 11     │ │
 │  └────────────────┬────────────────┘   └────────────────┬────────────────┘ │
 │                   ▼                                     ▼                  │
 │  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐ │
 │  │ 3. Solver Combinatorio SSMP     │   │ 4. Scoring Compuesto (3 Niveles)│ │
 │  │ • Meet-in-the-Middle O(2^(n/2)) │   │ • Verde (≥95%): Auto-conciliado │ │
 │  │ • HiGHS MILP (scipy.optimize)   │   │ • Amarillo (70-94%): 1-Clic     │ │
 │  │   con penalización comisiones   │   │ • Rojo (<70%): No conciliado    │ │
 │  └─────────────────────────────────┘   └─────────────────────────────────┘ │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                  GENERADOR DE PRE-ASIENTOS (STAGING AREA)                  │
 │          Partida Doble: (D) 572 Bancos + (D) 626/669 Gastos = (H) 430      │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
 ┌───────────────┐             ┌───────────────┐             ┌───────────────┐
 │  Wolters A3   │             │ Sage 50 / Des │             │    Contasol   │
 │   (Suenlace)  │             │ (XDIARIO.csv) │             │     (XLSX)    │
 └───────────────┘             └───────────────┘             └───────────────┘
```

---

## 2. Formulaciones Matemáticas Nucleares

### A. Descomposición de Liquidaciones Agrupadas (Subset-Sum Matching Problem con Fricción)
El abono bancario $P_{net}$ agrupa un subconjunto de facturas $A_i$ minoradas por sus comisiones $c_i = \alpha A_i + \beta + \tau_i$ y devoluciones $R_j$:

$$\left| \sum_{i=1}^n (A_i - c_i) x_i - \sum_{j=1}^m (R_j + c'_j) y_j - P_{net} \right| \le \delta \le \epsilon \quad (\epsilon \le 0.02\text{ €})$$

### B. Función Objetivo HiGHS MILP contra Soluciones Espurias
Para evitar selecciones arbitrarias resultantes de vectores de coste nulos, el solver minimiza la holgura del neto bancario junto a una penalización por desvío de comisiones teóricas:

$$\min \left( \lambda_1 \cdot \delta + \lambda_2 \sum_{i=1}^n \vert{}c_i - c_i^{teorico}\vert{} \cdot x_i + \lambda_3 \sum_{j=1}^m \vert{}c'_j - c_j^{'teorico}\vert{} \cdot y_j \right)$$

### C. Desambiguación Difusa y Confidence Score
$$\text{Score} = 0.40 \cdot S_{importe} + 0.20 \cdot S_{fecha} + 0.40 \cdot S_{texto}$$

- **VERDE ($\ge 95\%$)**: Auto-conciliable con plena seguridad jurídica.
- **AMARILLO ($70\% \text{ a } 94\%$)**: Sugerencia de alta verosimilitud para aprobación en 1 clic.
- **ROJO ($< 70\%$)**: Descarte preventivo contra contaminación contable.

---

## 3. Estructura de Módulos

- `src/parsers/bank/norma43.py`: Parser de Cuaderno 43 con detección y fallback de codificación (`ISO-8859-15`, `Windows-1252`, `UTF-8`) y validación matemática de balance (Registro 33).
- `src/parsers/gateways/`: Parsers oficiales de Stripe (Balance Transactions) y Redsys (TPV Virtual/Físico).
- `src/reconciliation/pruning.py`: Poda en 3 niveles (Ventana temporal móvil, partición por pasarela y bounding box).
- `src/reconciliation/meet_in_the_middle.py`: Algoritmo Horowitz-Sahni para combinaciones deterministas en $O(2^{n/2})$.
- `src/reconciliation/milp_solver.py`: Solver HiGHS (`scipy.optimize.milp`) con función objetivo regularizada.
- `src/reconciliation/engine.py`: Orquestador integral de conciliación de liquidaciones agrupadas.
- `src/disambiguation/`: Normalización de texto bancario, validación de NIF/CIF/NIE (Módulo 11/23), fonética castellana y Confidence Scorer.
- `src/accounting/double_entry.py`: Constructor de partida doble para el PGC (572 Debe, 626 Debe, 430 Haber).
- `src/accounting/exporters/`: Generadores nativos para A3 (Suenlace), Sage 50 (XDIARIO.csv) y Contasol (XLSX).
- `src/api/v1/`: API REST FastAPI con endpoints para ingesta, conciliación y exportación.

---

## 4. Ejecución de Tests Automatizados

La suite completa de pruebas unitarias y de integración cubre el 100% de los componentes:

```powershell
# Ejecutar toda la suite de pruebas (26 tests)
python -m pytest tests/ -v
```
