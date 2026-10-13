# MANUAL OPERATIVO PARA EL DESPACHO AUDITOR Y CONTABLE
## Plataforma FINDAFINITY • Conciliación Algorítmica y Desambiguación B2B2B
### Certificación de Cuadre Contable a Céntimo Cero (0.00 €) y Protocolo Zero-Liability

---

## 1. Introducción y Filosofía "Zero-Liability"

**FINDAFINITY** es un micro-SaaS especializado en la conciliación algorítmica de liquidaciones bancarias agrupadas (*batch payouts* de Stripe, Redsys TPV, PayPal, SumUp) frente a extractos bancarios oficiales (**Norma 43 AEB**) y cartera viva de facturas emitidas.

### El Principio de Responsabilidad Cero (Zero-Liability)
A diferencia de herramientas intrusivas que modifican las bases de datos contables en caliente sin control humano, FINDAFINITY opera como una **Zona de Preparación (Staging Area) de solo lectura**:
1. **No altera los libros oficiales en producción.**
2. Resuelve de forma combinatoria los descuadres por comisiones retenidas en origen.
3. Genera **asientos de partida doble PGC** cerrados matemáticamente a $0.00\text{ \euro}$ de descuadre.
4. Exporta ficheros listos para inyección directa en el ERP contable del despacho (**A3, Sage 50 o Contasol**).
5. Sella cada acción en una **Cadena de Custodia Criptográfica SHA-256** inmutable para salvaguardar la responsabilidad jurídica del gestor frente a inspecciones de la AEAT.

---

## 2. Ingesta de Ficheros Bancarios y Pasarelas

FINDAFINITY soporta los estándares de facto del mercado español:

### A. Extractos Bancarios Norma 43 (Cuaderno 43 AEB)
- **Formatos:** Archivos `.n43`, `.txt` emitidos por cualquier entidad financiera española (Santander, BBVA, CaixaBank, Sabadell, Bankinter, etc.).
- **Codificaciones:** Detección automática y fallback inteligente entre **ISO-8859-15**, **Windows-1252** y **UTF-8**, preservando tildes, caracteres especiales y la letra **Ñ** en conceptos complementarios (Registros 22 y 23).
- **Validación Matemática:** Verificación estricta de cuadre en Registro 33 (Total Debe, Total Haber y Saldo Final).

### B. Reportes de Liquidación de Pasarelas de Pago
- **Stripe:** *Balance Transactions Report* (`.csv`). Descompone liquidaciones netas (*payouts*) identificando cargos brutos, comisiones deducidas en origen y número de pedido mercantil (`Order ID`).
- **Redsys TPV:** *Listado de Operaciones* (`.csv`). Procesa tickets y cobros físicos de datáfono, deduciendo las tasas de descuento y liquidaciones diarias consolidadas.

---

## 3. El Radar de Conciliación y el Semáforo de Auditoría

Cada apunte analizado se clasifica según el nivel de certidumbre matemática:

| Estado | Semáforo | Umbral | Acción Recomendada |
| :--- | :---: | :---: | :--- |
| **VERDE** | Automático | $\ge 95\%$ | Asiento conciliado y cerrado con descuadre $0.00\text{ \euro}$. Listo para exportar. |
| **AMARILLO** | Revisión 1-Clic | $70\% - 94\%$ | Alta verosimilitud (importe idéntico, ligero desvío léxico o temporal). Botón **Aprobar Asiento** para certificación inmediata. |
| **ROJO** | Excepción | $< 70\%$ | Apunte huérfano sin factura viva en cartera. Se aísla y se pre-contabiliza a la cuenta **555 (Partidas pendientes de aplicación)**. |

---

## 4. Guía de Importación Paso a Paso en los ERPs Líderes

Una vez validadas las partidas en el Radar, descargue el fichero oficial desde el panel de exportación:

### 4.1. Wolters Kluwer A3 (a3ASESOR | con / eco)
1. En el panel de FINDAFINITY, seleccione **Wolters Kluwer A3 (Suenlace)** y pulse **Descargar 1-Clic** (obtendrá un archivo `SUENLACE_BXXXXXXXX_AAAAMMDD.txt`).
2. Abra **a3ASESOR con** y acceda a la empresa cliente activa.
3. En el menú superior, navegue a: `Utilidades` > `Enlace Contable` > `Suenlace`.
4. Seleccione la ruta del archivo `.txt` descargado.
5. Indique formato **Delimitado por punto y coma (;)`.
6. Pulse **Procesar Asientos**. El sistema confirmará la importación con cero descuadres en subcuentas 572, 626 y 430.

### 4.2. Sage 50 / Sage Despachos Connected
1. En FINDAFINITY, seleccione **Sage 50 (XDIARIO)** y descargue el archivo `XDIARIO_BXXXXXXXX_AAAAMMDD.csv`.
2. Abra **Sage 50** y seleccione el ejercicio fiscal correspondiente.
3. En el menú de opciones contables, acceda a: `Asientos` > `Opciones de Diario` > `Importar Asientos (XDIARIO)`.
4. Seleccione el fichero `.csv`.
5. Marque la casilla **Separador de campos: Punto y coma (;)**.
6. Haga clic en **Importar**. Sage verificará que la suma del Debe coincida exactamente con el Haber y registrará los asientos con sus correspondientes números correlativos.

### 4.3. DELSOL Contasol
1. En FINDAFINITY, seleccione **DELSOL Contasol (.xlsx)** y descargue la hoja de cálculo `CONTASOL_DIARIO_BXXXXXXXX_AAAAMMDD.xlsx`.
2. Abra **Contasol** y sitúese en la empresa seleccionada.
3. Diríjase a la pestaña superior: `Diario` > grupo `Útiles` > desplegable `Importar` > opción **Desde hoja de cálculo (.xlsx / .xls)**.
4. Asigne las columnas correspondientes (pre-configuradas según el estándar DELSOL: Fecha, Asiento, Subcuenta, Concepto, Documento, Debe, Haber, Contrapartida).
5. Pulse **Iniciar Importación**. Los asientos quedarán asentados en el diario contable oficial.

---

## 5. Certificado Legal de Auditoría y Cadena de Custodia SHA-256

Para blindar judicial y tributariamente el trabajo del despacho:
1. Haga clic en el botón superior **Auditoría SHA-256**.
2. La plataforma desplegará la **sucesión criptográfica inmutable** con:
   - Identificador único del evento y timestamp con precisión de microsegundos.
   - Actor que realizó la acción (`system` o el email del auditor colegiado).
   - `prev_hash` ligado al hash del bloque anterior.
   - `current_hash_sha256` calculado sobre el contenido íntegro del lote.
3. Pulse **Copiar Certificado JSON** para adjuntar el certificado digital al expediente contable del cliente o incorporarlo al informe anual de auditoría.

---

## 6. Planes de Suscripción y Cuotas de Uso

El despacho puede gestionar su capacidad desde `/api/v1/tenants/{id}/subscription`:

- **Plan Gestoría Starter (49 €/mes):** Hasta 10 clientes del despacho y 2.500 transacciones/mes.
- **Plan Gestoría Professional (119 €/mes):** Hasta 30 clientes del despacho, 12.000 transacciones/mes, descomposición de pasarelas y auditoría SHA-256.
- **Plan Pyme Directo (39 €/mes):** 1 empresa individual y 2.000 transacciones/mes.
- **Bloques suplementarios:** 25 €/mes por cada +10 sociedades o +5.000 transacciones adicionales.
