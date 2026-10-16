/**
 * FICHERO: frontend/src/components/IngestionZone.jsx
 * Dropzone Grande e Intuitivo (RAM Efímera Activa Siempre por Defecto)
 */
import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck,
  X,
  Zap,
} from 'lucide-react';

export function IngestionZone({
  onFileProcessed,
  onOpenStripeSync,
  isProcessing,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [invoicesFile, setInvoicesFile] = useState(null);
  const [feedback, setFeedback] = useState(null);
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
    setFeedback({
      type: 'loading',
      text: `Procesando ${file.name}...`,
    });

    try {
      if (onFileProcessed) {
        // RAM Efímera siempre activa (true)
        const result = await onFileProcessed(file, invoicesFile, true);
        if (result && result.total_movements !== undefined) {
          setFeedback({
            type: 'ok',
            text: `${file.name} • ${result.total_movements} partidas conciliadas`,
          });
        } else {
          setFeedback(null);
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Error al procesar el archivo',
      });
    } finally {
      setLocalProcessing(false);
    }
  };

  return (
    <section className="bg-[#10131a] border border-[#1e232d] rounded-xl p-5 shadow-lg">
      {/* Cabecera compacta con acciones secundarias */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-white">Importar Extracto o Liquidación</h2>
          {feedback && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono ${
                feedback.type === 'ok'
                  ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                  : feedback.type === 'error'
                  ? 'bg-rose-950/50 text-rose-300 border border-rose-800/60'
                  : 'bg-blue-950/50 text-blue-300 border border-blue-800/60'
              }`}
            >
              {feedback.type === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
              {feedback.type === 'error' && <AlertCircle className="h-3 w-3 text-rose-400" />}
              {feedback.type === 'loading' && <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />}
              <span>{feedback.text}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Botón para adjuntar Cartera de Facturas */}
          <input
            ref={portfolioInputRef}
            type="file"
            onChange={handlePortfolioFileChange}
            accept=".xlsx,.csv,.json,.pdf"
            className="hidden"
          />

          {invoicesFile ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-xs text-emerald-300">
              <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="truncate max-w-[160px] font-mono text-[11px]">{invoicesFile.name}</span>
              <button
                type="button"
                onClick={() => setInvoicesFile(null)}
                className="text-slate-400 hover:text-white"
                title="Quitar cartera"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => portfolioInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs font-medium text-slate-300 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-400" />
              <span>+ Cartera Facturas (Opcional)</span>
            </button>
          )}

          {/* Botón Stripe API */}
          {onOpenStripeSync && (
            <button
              type="button"
              onClick={onOpenStripeSync}
              disabled={isProcessing || localProcessing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#161a23] hover:bg-[#1e2430] border border-[#283040] text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5 text-blue-400" />
              <span>Stripe API</span>
            </button>
          )}
        </div>
      </div>

      {/* Cuadro Grande e Intuitivo de Subida (Dropzone) */}
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
        className={`w-full rounded-xl border-2 border-dashed py-10 px-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-blue-500 bg-blue-950/20 scale-[0.998]'
            : 'border-[#242b38] hover:border-blue-500/50 bg-[#0b0d11]/90 hover:bg-[#0f131a]'
        }`}
      >
        <input
          ref={bankInputRef}
          type="file"
          onChange={handleBankFileChange}
          accept=".n43,.txt,.csv,.xlsx,.json"
          className="hidden"
        />

        <div className="h-12 w-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 shadow-inner">
          {localProcessing || isProcessing ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <UploadCloud className="h-6 w-6" />
          )}
        </div>

        <p className="text-sm font-semibold text-white">
          Arrastra aquí tu archivo o haz clic para seleccionarlo
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          Norma 43 (.n43) &bull; Stripe (.csv) &bull; Redsys TPV (.csv) &bull; Excel (.xlsx)
        </p>
      </div>
    </section>
  );
}
