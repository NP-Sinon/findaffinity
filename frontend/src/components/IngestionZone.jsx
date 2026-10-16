/**
 * FICHERO: frontend/src/components/IngestionZone.jsx
 * Soporta arrastrar múltiples PDFs a la vez, carpetas completas y selección de directorios
 */
import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FolderOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck,
  X,
  Zap,
  Play,
} from 'lucide-react';

const VALID_PORTFOLIO_EXTS = ['.pdf', '.xlsx', '.csv', '.json'];
const VALID_STATEMENT_EXTS = ['.n43', '.txt', '.csv', '.xlsx', '.pdf', '.json'];

/**
 * Extrae recursivamente todos los archivos cuando el usuario arrastra
 * múltiples ficheros sueltos o una carpeta completa desde su ordenador.
 */
async function extractFilesFromDataTransfer(dataTransfer) {
  const files = [];

  const readEntry = (entry) =>
    new Promise((resolve) => {
      if (!entry) {
        resolve();
      } else if (entry.isFile) {
        entry.file(
          (file) => {
            files.push(file);
            resolve();
          },
          () => resolve()
        );
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readAllEntries = () => {
          dirReader.readEntries(
            async (entries) => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                await Promise.all(entries.map((e) => readEntry(e)));
                readAllEntries();
              }
            },
            () => resolve()
          );
        };
        readAllEntries();
      } else {
        resolve();
      }
    });

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const entries = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          entries.push(entry);
        } else {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    if (entries.length > 0) {
      await Promise.all(entries.map((entry) => readEntry(entry)));
      return files;
    }
  }

  return Array.from(dataTransfer.files || []);
}

function getExtension(filename = '') {
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.slice(idx).toLowerCase() : '';
}

export function IngestionZone({
  onFileProcessed,
  onOpenStripeSync,
  isProcessing,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [invoicesFiles, setInvoicesFiles] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [localProcessing, setLocalProcessing] = useState(false);

  const bankInputRef = useRef(null);
  const portfolioFilesInputRef = useRef(null);
  const portfolioFolderInputRef = useRef(null);

  const addPortfolioFiles = (fileList) => {
    const valid = fileList.filter((f) => VALID_PORTFOLIO_EXTS.includes(getExtension(f.name)));
    if (valid.length === 0) {
      setFeedback({
        type: 'error',
        text: 'No se encontraron archivos válidos (.pdf, .xlsx, .csv, .json) en la selección.',
      });
      return [];
    }
    setInvoicesFiles((prev) => {
      const existingNames = new Set(prev.map((p) => `${p.name}_${p.size}`));
      const merged = [...prev];
      valid.forEach((f) => {
        const key = `${f.name}_${f.size}`;
        if (!existingNames.has(key)) {
          existingNames.add(key);
          merged.push(f);
        }
      });
      return merged;
    });
    setFeedback({
      type: 'ok',
      text: `${valid.length} archivo(s) cargados en Cartera de Facturas`,
    });
    return valid;
  };

  const handlePortfolioInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addPortfolioFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
    if (!droppedFiles || droppedFiles.length === 0) return;

    await handleSmartFilesExecution(droppedFiles);
  };

  const handleBankFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      e.target.value = '';
      await handleSmartFilesExecution(selected);
    }
  };

  /**
   * Clasifica inteligentemente lotes de archivos o carpetas:
   * - Si sueltas 20 PDFs + 1 extracto (.n43/.csv), mete los 20 PDFs en cartera y los cruza con el extracto.
   * - Si sueltas 20 PDFs sueltos (o una carpeta de PDFs), los carga todos en Cartera y los procesa en bloque.
   */
  const handleSmartFilesExecution = async (fileList) => {
    const validFiles = fileList.filter((f) => VALID_STATEMENT_EXTS.includes(getExtension(f.name)));
    if (validFiles.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Formato no soportado. Usa .n43, .csv, .xlsx, .pdf o .json',
      });
      return;
    }

    const pdfOrPortfolioFiles = validFiles.filter(
      (f) => getExtension(f.name) === '.pdf' || f.name.toLowerCase().includes('cartera')
    );
    const statementFiles = validFiles.filter(
      (f) => getExtension(f.name) !== '.pdf' && !f.name.toLowerCase().includes('cartera')
    );

    // Caso 1: El usuario arrastró a la vez las facturas (PDFs/Cartera) y el extracto bancario (.n43/.csv)
    if (pdfOrPortfolioFiles.length > 0 && statementFiles.length > 0) {
      const updatedPortfolio = [...invoicesFiles, ...pdfOrPortfolioFiles];
      setInvoicesFiles(updatedPortfolio);
      await executeProcessing(statementFiles, updatedPortfolio);
      return;
    }

    // Caso 2: El usuario arrastró múltiples PDFs (ej. 20 facturas PDF de golpe o una carpeta de PDFs)
    if (pdfOrPortfolioFiles.length > 0 && statementFiles.length === 0) {
      const updatedPortfolio = [...invoicesFiles, ...pdfOrPortfolioFiles];
      setInvoicesFiles(updatedPortfolio);
      await executeProcessing(pdfOrPortfolioFiles, updatedPortfolio);
      return;
    }

    // Caso 3: El usuario arrastró uno o varios extractos (.n43 / .csv) y ya tenía o no cartera cargada
    await executeProcessing(statementFiles, invoicesFiles);
  };

  const executeProcessing = async (mainFiles, portfolioList) => {
    const countLabel =
      mainFiles.length > 1 ? `${mainFiles.length} archivos` : mainFiles[0]?.name || 'lote';

    setLocalProcessing(true);
    setFeedback({
      type: 'loading',
      text: `Procesando ${countLabel}${portfolioList.length > 0 ? ` con ${portfolioList.length} factura(s) en cartera` : ''}...`,
    });

    try {
      if (onFileProcessed) {
        const result = await onFileProcessed(mainFiles, portfolioList, true);
        if (result && result.total_movements !== undefined) {
          setFeedback({
            type: 'ok',
            text: `${result.total_movements} partidas procesadas correctamente`,
          });
        } else {
          setFeedback(null);
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Error al procesar los archivos',
      });
    } finally {
      setLocalProcessing(false);
    }
  };

  return (
    <section className="bg-[#10131a] border border-[#1e232d] rounded-xl p-5 shadow-lg">
      {/* Barra superior de acciones: Cartera de Facturas (Archivos o Carpeta entera) + Stripe API */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-white">Importar Extractos y Facturas</h2>
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Input oculto para múltiples archivos de cartera (.pdf, .xlsx, .csv, .json) */}
          <input
            ref={portfolioFilesInputRef}
            type="file"
            multiple
            onChange={handlePortfolioInputChange}
            accept=".pdf,.xlsx,.csv,.json"
            className="hidden"
          />

          {/* Input oculto para seleccionar una CARPETA entera de facturas */}
          <input
            ref={portfolioFolderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handlePortfolioInputChange}
            className="hidden"
          />

          {invoicesFiles.length > 0 ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-xs text-emerald-300">
              <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono text-[11px]">
                {invoicesFiles.length === 1
                  ? invoicesFiles[0].name
                  : `${invoicesFiles.length} facturas en cartera`}
              </span>
              <button
                type="button"
                onClick={() => executeProcessing(invoicesFiles, invoicesFiles)}
                disabled={isProcessing || localProcessing}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors"
                title="Procesar directamente las facturas de la cartera"
              >
                <Play className="h-2.5 w-2.5" />
                <span>Procesar</span>
              </button>
              <button
                type="button"
                onClick={() => setInvoicesFiles([])}
                className="text-slate-400 hover:text-white ml-1"
                title="Vaciar cartera de facturas"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => portfolioFolderInputRef.current?.click()}
            disabled={isProcessing || localProcessing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs font-medium text-slate-200 transition-colors"
            title="Seleccionar una carpeta completa con facturas PDF, Excel o CSV"
          >
            <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
            <span>Subir Carpeta Facturas</span>
          </button>

          <button
            type="button"
            onClick={() => portfolioFilesInputRef.current?.click()}
            disabled={isProcessing || localProcessing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs font-medium text-slate-300 transition-colors"
            title="Seleccionar múltiples archivos de facturas (.pdf, .xlsx, .csv)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            <span>+ Facturas Sueltas</span>
          </button>

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

      {/* Cuadro Grande Central: acepta múltiples archivos sueltos o carpetas completas arrastradas */}
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
          multiple
          onChange={handleBankFileChange}
          accept=".n43,.txt,.csv,.xlsx,.pdf,.json"
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
          Arrastra aquí tus archivos o carpetas enteras (Norma 43, CSV, Excel o múltiples PDFs)
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          Soporta subida simultánea de 20+ facturas PDF junto con el extracto bancario (.n43 / .csv)
        </p>
      </div>
    </section>
  );
}
