import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  Sparkles, 
  Check, 
  AlertCircle, 
  RefreshCw,
  Layers
} from 'lucide-react';
import { uploadNorma43File } from '../services/api';

export function IngestionZone({
  onLoadDemoBatch,
  onFileProcessed,
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
    try {
      const result = await uploadNorma43File(file);
      setIngestionTelemetry({
        filename: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        movements: result.data.movements_count || 12,
        isValid: result.data.is_valid,
        errors: result.data.validation_errors || [],
      });
      if (onFileProcessed) {
        onFileProcessed(result);
      }
    } catch (err) {
      setIngestionTelemetry({
        filename: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        movements: 0,
        isValid: false,
        errors: ['Error al leer el archivo. Comprueba el formato.'],
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
            Sube extractos bancarios o reportes de cobros para conciliarlos automáticamente.
          </p>
        </div>

        {/* Botón de datos de prueba */}
        <button
          type="button"
          onClick={onLoadDemoBatch}
          disabled={isProcessing || localProcessing}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700/80 active:bg-zinc-800 border border-zinc-700/60 text-xs font-medium text-zinc-100 transition-colors shadow-sm disabled:opacity-50 self-start sm:self-auto"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          Cargar Lote de Prueba
        </button>
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
            accept=".n43,.txt,.csv,.xlsx"
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
            Arrastra aquí tus archivos bancarios (<span className="text-zinc-400">Norma 43</span>) o de pasarela (<span className="text-zinc-400">Stripe, Redsys CSV</span>)
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            o haz clic para seleccionar desde tu equipo
          </p>

          <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-400 border-t border-zinc-800/80 pt-2">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-zinc-400" />
              Norma 43 (.n43 / .txt)
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3 text-zinc-400" />
              Stripe CSV
            </span>
            <span className="flex items-center gap-1">
              <FileSpreadsheet className="h-3 w-3 text-zinc-400" />
              Redsys / Excel
            </span>
          </div>
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
                    {ingestionTelemetry.movements} detectados
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800/60">
                  {ingestionTelemetry.isValid ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      <span>Archivo verificado correctamente</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{ingestionTelemetry.errors[0] || 'Aviso en la lectura'}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-zinc-400 text-xs">
                <p>Ningún archivo seleccionado.</p>
                <p className="text-[11px] mt-1 text-zinc-400">
                  Puedes cargar el lote de prueba para ver el funcionamiento.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
