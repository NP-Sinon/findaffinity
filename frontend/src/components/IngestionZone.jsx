import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  Sparkles, 
  Check, 
  AlertCircle, 
  RefreshCw,
  Layers,
  Zap
} from 'lucide-react';

export function IngestionZone({
  onLoadDemoBatch,
  onFileProcessed,
  onOpenStripeSync,
  isProcessing,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [ingestionTelemetry, setIngestionTelemetry] = useState(null);
  const [localProcessing, setLocalProcessing] = useState(false);
  const fileInputRef = useRef(null);

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
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = async (file) => {
    setLocalProcessing(true);
    setIngestionTelemetry({
      filename: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
      movements: 'Analizando...',
      isValid: true,
      errors: [],
    });

    try {
      if (onFileProcessed) {
        const result = await onFileProcessed(file);
        if (result && result.total_movements !== undefined) {
          setIngestionTelemetry({
            filename: file.name,
            sizeKb: (file.size / 1024).toFixed(1),
            movements: `${result.total_movements} detectados`,
            isValid: true,
            errors: [],
          });
        }
      }
    } catch (err) {
      setIngestionTelemetry({
        filename: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        movements: 0,
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
            Importar Extractos y Ventas
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Sube extractos bancarios, reportes de cobros o conecta directamente pasarelas en vivo.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenStripeSync && (
            <button
              type="button"
              onClick={onOpenStripeSync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-300 transition-colors shadow-sm"
            >
              <Zap className="h-3.5 w-3.5 text-indigo-400" />
              <span>Conectar Stripe API</span>
            </button>
          )}

          {/* Botón de datos de prueba */}
          <button
            type="button"
            onClick={onLoadDemoBatch}
            disabled={isProcessing || localProcessing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700/80 active:bg-zinc-800 border border-zinc-700/60 text-xs font-medium text-zinc-100 transition-colors shadow-sm disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Cargar Lote de Prueba
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-2 border border-dashed rounded-md p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            isDragOver 
              ? 'border-zinc-500 bg-zinc-900/80' 
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept=".n43,.txt,.csv,.xlsx,.json"
            className="hidden"
          />

          <div className="h-9 w-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-2">
            {localProcessing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-zinc-300" />
            ) : (
              <UploadCloud className="h-4 w-4 text-zinc-300" />
            )}
          </div>

          <p className="text-xs text-zinc-200 font-medium">
            Arrastra aquí tus archivos o haz clic para seleccionarlos
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Formatos soportados: Norma 43 (.n43), Stripe / Redsys (.csv), Cartera Facturas (.xlsx, .json)
          </p>
        </div>

        {/* Estado / Resumen de Carga */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-md p-3.5 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium pb-2 border-b border-zinc-800/60 mb-2.5">
              ESTADO DEL ARCHIVO
            </div>

            {ingestionTelemetry ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Archivo:</span>
                  <span className="text-zinc-200 font-mono text-[11px] truncate max-w-[150px]" title={ingestionTelemetry.filename}>
                    {ingestionTelemetry.filename}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tamaño:</span>
                  <span className="text-zinc-200 font-mono text-[11px]">
                    {ingestionTelemetry.sizeKb} KB
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Movimientos:</span>
                  <span className="text-zinc-200 font-mono text-[11px] font-medium text-emerald-400">
                    {ingestionTelemetry.movements}
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800/60">
                  {ingestionTelemetry.isValid ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      <span>Archivo verificado correctamente</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Incidencia en la ingesta</span>
                      </div>
                      {ingestionTelemetry.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-zinc-500 leading-tight">
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-zinc-500 text-xs">
                <Layers className="h-6 w-6 mx-auto mb-1 opacity-40" />
                Ningún archivo seleccionado aún.
              </div>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
            Los datos se procesan con validación algorítmica y sellado legal SHA-256.
          </div>
        </div>
      </div>
    </div>
  );
}
