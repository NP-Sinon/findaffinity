# Carpeta de Pruebas: Facturas y Extractos para FINDAFINITY

Esta carpeta contiene un juego completo de **20 facturas comerciales inventadas** y **ficheros de extracto bancario/pasarela** listos para ser probados de inmediato en la plataforma FINDAFINITY.

---

## 📁 Contenido de la Carpeta

| Fichero | Formato | Descripción |
| :--- | :--- | :--- |
| **`cartera_facturas_emitidas_20.xlsx`** | Excel (.xlsx) | Cartera viva con 20 facturas, importes, CIFs, subcuentas PGC 430 y formato oficial español. |
| **`cartera_facturas_emitidas_20.csv`** | CSV (.csv) | Cartera de 20 facturas con delimitador `;` y codificación UTF-8 para importación ERP. |
| **`cartera_facturas_emitidas_20.json`** | JSON (.json) | Cartera en JSON estructurado para integración por API. |
| **`extracto_bancario_norma43.n43`** | Norma 43 (.n43) | Extracto bancario real con 5 transferencias coincidentes por importe, CIF y número de factura. |
| **`extracto_stripe_ventas.csv`** | Stripe CSV (.csv) | Liquidación neta agrupada con 6 facturas y cálculo de comisiones (cuenta 626). |
| **`facturas_pdf/`** | 20 PDFs individuales | Facturas imprimibles maquetadas profesionalmente con desglose de Base, IVA 21%, vencimiento y datos fiscales. |

---

## 🚀 Cómo probarlas en FINDAFINITY (Paso a Paso)

### Escenario A: Conciliación Bancaria B2B (Norma 43 + Cartera)
1. Inicia sesión en FINDAFINITY (o abre el Radar de Conciliación).
2. Asegúrate de tener seleccionada tu **Empresa Cliente** en la cabecera.
3. En la **Zona de Ingesta**, arrastra o selecciona:
   - **Extracto Bancario:** Selecciona `extracto_bancario_norma43.n43`.
   - **Cartera de Facturas (Opcional pero recomendado):** Selecciona `cartera_facturas_emitidas_20.xlsx` (o `.csv`).
4. Haz clic en **Procesar Extracto**.
5. **Resultado esperado:**
   - 5 partidas bancarias conciliadas al 100% de confianza (**Semáforo VERDE**).
   - Coincidencia perfecta de NIF/CIF y número de documento (FRA-2026-003, FRA-2026-008, FRA-2026-009, FRA-2026-015, FRA-2026-018).
   - Asientos de partida doble PGC generados con **Descuadre 0,00 €**:
     - `(D) 572000001 Bancos`
     - `(H) 43000000x Clientes`

### Escenario B: Conciliación de Pasarela Stripe con Comisiones
1. En la **Zona de Ingesta**, sube:
   - **Extracto Bancario / Pasarela:** Selecciona `extracto_stripe_ventas.csv`.
   - **Cartera de Facturas:** Selecciona `cartera_facturas_emitidas_20.xlsx`.
2. Haz clic en **Procesar Extracto**.
3. **Resultado esperado:**
   - Se reconocen las 6 transacciones de Stripe.
   - Desglose contable automático a 3 patas:
     - `(D) 572 Bancos (Importe Neto cobrado)`
     - `(D) 626 Comisiones de pasarela Stripe`
     - `(H) 430 Clientes (Importe Bruto de la factura)`
   - Descuadre Debe - Haber: **0,00 €**.

---

## 📊 Resumen de las 20 Facturas

- **Total Cartera:** 39,982.00 €
- **Número de facturas:** 20
- **Empresas deudoras:** Logística Exprés, Telefónica Soluciones, Almacenes Centrales, Novatech, Amazon EU, Bodegas Rioja, etc.
- **Rango de importes:** Desde 420,00 € hasta 5.600,00 €.
