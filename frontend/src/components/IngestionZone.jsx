/**
 * FICHERO: frontend/src/components/IngestionZone.jsx
 * Zona de Ingesta Profesional B2B (Extracto Bancario / Pasarela + Cartera de Facturas + Stripe API)
 */
import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Check,
  AlertCircle,
  RefreshCw,
  Layers,
  Zap,
  FileCheck,
  X,
} from 'lucide-react';

export function IngestionZone({
  onFileProcessed,
  onOpenStripeSync,
  isProcessing,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [invoicesFile, setInvoicesFile] = useState(null);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [ingestionTelemetry, setIngestionTelemetry] = useState(null);
  const [localProcessing, setLocalProcessing] = useState(false);

  const bankInputRef = useRef(null);
  const portfolioInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processSelectedFile(files[0]);
    }
  };

  const handleBankFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      await processSelectedFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handlePortfolioFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setInvoicesFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (file) => {
    setLocalProcessing(true);
    setIngestionTelemetry({
      filename: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
      movements: 'Procesando...',
      isValid: true,
      errors: [],
    });

    try {
      if (onFileProcessed) {
        const result = await onFileProcessed(file, invoicesFile, ephemeralMode);
        if (result && result.total_movements !== undefined) {
          setIngestionTelemetry({
            filename: file.name,
            sizeKb: (file.size / 1024).toFixed(1),
            movements: `${result.total_movements} apuntes conciliados`,
            isValid: true,
            errors: [],
          });
        } else {
          setIngestionTelemetry(null);
        }
      }
    } catch (err) {
      setIngestionTelemetry({
        filename: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        movements: '0',
        isValid: false,
        errors: [err.message || 'Error al procesar el archivo contable.'],
      });
    } finally {
      setLocalProcessing(false);
    }
  };

  return (
    <div className="bg-[#101013] border border-zinc-800 rounded-lg p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/60">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Ingesta de Extractos Bancarios, Pasarelas y Cartera de Facturas
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Sube tu fichero Norma 43 o liquidación de Stripe/Redsys para generar los pre-asientos PGC cuadrados a 0,00 €.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Selector de Modo Efímero en RAM */}
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={ephemeralMode}
              onChange={(e) => setEphemeralMode(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0"
            />
            <span>Modo Efímero RAM (Zero-Storage)</span>
          </label>

          {/* Adjuntar Cartera de Facturas Emitidas Opcional */}
          <input
            ref={portfolioInputRef}
            type="file"
            onChange={handlePortfolioFileChange}
            accept=".xlsx,.csv,.json"
            className="hidden"
          />
          {invoicesFile ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
              <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="truncate max-w-[140px]">{invoicesFile.name}</span>
              <button
                type="button"
                onClick={() => setInvoicesFile(null)}
                className="text-zinc-400 hover:text-white"
                title="Quitar cartera de facturas"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => portfolioInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>1. Adjuntar Cartera Facturas (Opcional)</span>
            </button>
          )}

          {/* Conectar Stripe API en 1 Clic */}
          {onOpenStripeSync && (
            <button
              type="button"
              onClick={onOpenStripeSync}
              disabled={isProcessing || localProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors shadow-sm disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Conectar Stripe API</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dropzone Principal */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => bankInputRef.current?.click()}
          className={`lg:col-span-2 border border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-950/20'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50'
          }`}
        >
          <input
            ref={bankInputRef}
            type="file"
            onChange={handleBankFileChange}
            accept=".n43,.txt,.csv,.xlsx"
            className="hidden"
          />

          <div className="h-10 w-10 rounded-full bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-emerald-400 mb-2.5">
            {localProcessing || isProcessing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
          </div>

          <p className="text-xs text-zinc-100 font-medium">
            2. Arrastra aquí el Extracto Bancario (Norma 43) o el CSV de Liquidaciones (Stripe / Redsys)
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Formatos oficiales soportados: Cuaderno 43 AEB (.n43, .txt), Stripe Balance (.csv), Redsys TPV (.csv)
          </p>
        </div>

        {/* Telemetría del Archivo */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-md p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium pb-2 border-b border-zinc-800/60 mb-2.5">
              TELEMETRÍA DE INGESTA
            </div>

            {ingestionTelemetry ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Fichero:</span>
                  <span className="text-zinc-200 font-mono text-[11px] truncate max-w-[160px]" title={ingestionTelemetry.filename}>
                    {ingestionTelemetry.filename}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tamaño:</span>
                  <span className="text-zinc-200 font-mono text-[11px]">{ingestionTelemetry.sizeKb} KB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Resultado:</span>
                  <span className="text-emerald-400 font-mono text-[11px] font-medium">
                    {ingestionTelemetry.movements}
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800/60">
                  {ingestionTelemetry.isValid ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      <span>Cuadre contable verificado</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Incidencia en el archivo</span>
                      </div>
                      {ingestionTelemetry.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-zinc-500 leading-tight">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-5 text-center text-zinc-500 text-xs">
                <Layers className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                Esperando fichero de extracto o liquidación para iniciar el motor.
              </div>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
            Validación automática de Registro 33 AEB y sellado SHA-256.
          </div>
        </div>
      </div>
    </div>
  );
}
