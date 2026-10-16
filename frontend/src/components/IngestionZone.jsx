/**
 * FICHERO: frontend/src/components/IngestionZone.jsx
 * Barra de Ingesta Operativa de Doble Ranura (Cartera de Facturas + Extracto Bancario / Pasarela)
 */
import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  RefreshCw,
  FileCheck,
  X,
  Link2,
} from 'lucide-react';

export function IngestionZone({
  onFileProcessed,
  onOpenStripeSync,
  isProcessing,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [invoicesFile, setInvoicesFile] = useState(null);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [telemetry, setTelemetry] = useState(null);
  const [localProcessing, setLocalProcessing] = useState(false);

  const bankInputRef = useRef(null);
  const portfolioInputRef = useRef(null);

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processSelectedFile(e.dataTransfer.files[0]);
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
    setTelemetry({
      filename: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
      statusText: 'Conciliando partidas...',
      isValid: true,
    });

    try {
      if (onFileProcessed) {
        const result = await onFileProcessed(file, invoicesFile, ephemeralMode);
        if (result && result.total_movements !== undefined) {
          setTelemetry({
            filename: file.name,
            sizeKb: (file.size / 1024).toFixed(1),
            statusText: `${result.total_movements} apuntes generados`,
            isValid: true,
          });
        } else {
          setTelemetry(null);
        }
      }
    } catch (err) {
      setTelemetry({
        filename: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        statusText: err.message || 'Error de formato en el fichero',
        isValid: false,
      });
    } finally {
      setLocalProcessing(false);
    }
  };

  return (
    <section className="bg-[#10131a] border border-[#1e232d] rounded-md p-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Ranura 1: Cartera de Facturas Emitidas (3 columnas) */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#1e232d] pb-3 lg:pb-0 lg:pr-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              1. Cartera de Facturas (430)
            </span>
            <span className="text-[10px] font-mono text-slate-500">.xlsx, .csv, .json</span>
          </div>

          <input
            ref={portfolioInputRef}
            type="file"
            onChange={handlePortfolioFileChange}
            accept=".xlsx,.csv,.json,.pdf"
            className="hidden"
          />

          {invoicesFile ? (
            <div className="flex items-center justify-between px-3 py-2 rounded bg-emerald-950/20 border border-emerald-800/50 text-xs text-emerald-300">
              <div className="flex items-center gap-2 truncate">
                <FileCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-mono text-[11px]">{invoicesFile.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setInvoicesFile(null)}
                className="p-0.5 text-slate-400 hover:text-white"
                title="Retirar archivo de cartera"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => portfolioInputRef.current?.click()}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                <span>Cargar libro de facturas emitidas</span>
              </span>
              <span className="text-[11px] text-blue-400 font-medium">Examinar</span>
            </button>
          )}
        </div>

        {/* Ranura 2: Extracto Bancario / Liquidación de Pasarela (5 columnas) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#1e232d] pb-3 lg:pb-0 lg:pr-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              2. Extracto Bancario o Liquidación Pasarela
            </span>
            <span className="text-[10px] font-mono text-slate-500">Norma 43 (.n43) / Stripe / Redsys (.csv)</span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={handleDrop}
            onClick={() => bankInputRef.current?.click()}
            className={`flex items-center justify-between px-3 py-2 rounded border border-dashed cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-950/20'
                : 'border-[#283040] bg-[#0b0d11] hover:bg-[#161a23]'
            }`}
          >
            <input
              ref={bankInputRef}
              type="file"
              onChange={handleBankFileChange}
              accept=".n43,.txt,.csv,.xlsx,.json"
              className="hidden"
            />
            <div className="flex items-center gap-2 truncate text-xs text-slate-200">
              {localProcessing || isProcessing ? (
                <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
              ) : (
                <Upload className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              )}
              <span className="truncate">
                {telemetry ? `${telemetry.filename} (${telemetry.statusText})` : 'Arrastrar fichero .n43 / .csv o hacer clic para procesar'}
              </span>
            </div>
            <span className="text-[11px] font-medium text-blue-400 shrink-0 ml-2">Subir Fichero</span>
          </div>
        </div>

        {/* Ranura 3: Sincronización Directa API y Privacidad RAM (3 columnas) */}
        <div className="lg:col-span-3 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ephemeralMode}
                onChange={(e) => setEphemeralMode(e.target.checked)}
                className="rounded border-slate-700 bg-[#0b0d11] text-blue-600 focus:ring-0"
              />
              <span>Procesamiento efímero en RAM</span>
            </label>

            {telemetry && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${telemetry.isValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                {telemetry.isValid ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {telemetry.isValid ? 'OK' : 'Error'}
              </span>
            )}
          </div>

          {onOpenStripeSync && (
            <button
              type="button"
              onClick={onOpenStripeSync}
              disabled={isProcessing || localProcessing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[#161a23] hover:bg-[#1e2430] border border-[#283040] text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5 text-blue-400" />
              <span>Importar Liquidaciones vía Stripe API</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
