/**
 * FICHERO: frontend/src/components/IngestionZone.jsx
 * Barra compacta de ingesta documental (soporta carpetas, N43, CSV, XLSX y múltiples PDFs)
 */
import React, { useState, useRef } from 'react';
import {
  Upload,
  FolderOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck,
  X,
  ArrowUpRight,
  Play,
} from 'lucide-react';

const VALID_PORTFOLIO_EXTS = ['.pdf', '.xlsx', '.csv', '.json'];
const VALID_STATEMENT_EXTS = ['.n43', '.txt', '.csv', '.xlsx', '.pdf', '.json'];

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
        text: 'Formatos admitidos: .pdf, .xlsx, .csv, .json',
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
      text: `${valid.length} documento(s) en cartera`,
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

  const handleSmartFilesExecution = async (fileList) => {
    const validFiles = fileList.filter((f) => VALID_STATEMENT_EXTS.includes(getExtension(f.name)));
    if (validFiles.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Archivo no compatible (.n43, .csv, .xlsx, .pdf, .json)',
      });
      return;
    }

    const pdfOrPortfolioFiles = validFiles.filter(
      (f) => getExtension(f.name) === '.pdf' || f.name.toLowerCase().includes('cartera')
    );
    const statementFiles = validFiles.filter(
      (f) => getExtension(f.name) !== '.pdf' && !f.name.toLowerCase().includes('cartera')
    );

    if (pdfOrPortfolioFiles.length > 0 && statementFiles.length > 0) {
      const updatedPortfolio = [...invoicesFiles, ...pdfOrPortfolioFiles];
      setInvoicesFiles(updatedPortfolio);
      await executeProcessing(statementFiles, updatedPortfolio);
      return;
    }

    if (pdfOrPortfolioFiles.length > 0 && statementFiles.length === 0) {
      const updatedPortfolio = [...invoicesFiles, ...pdfOrPortfolioFiles];
      setInvoicesFiles(updatedPortfolio);
      await executeProcessing(pdfOrPortfolioFiles, updatedPortfolio);
      return;
    }

    await executeProcessing(statementFiles, invoicesFiles);
  };

  const executeProcessing = async (mainFiles, portfolioList) => {
    const countLabel =
      mainFiles.length > 1 ? `${mainFiles.length} ficheros` : mainFiles[0]?.name || 'lote';

    setLocalProcessing(true);
    setFeedback({
      type: 'loading',
      text: `Conciliando ${countLabel}...`,
    });

    try {
      if (onFileProcessed) {
        // IMPORTANTE: ephemeralMode = false para persistir el lote en el servidor
        const result = await onFileProcessed(mainFiles, portfolioList, false);
        if (result && result.total_movements !== undefined) {
          setFeedback({
            type: 'ok',
            text: `${result.total_movements} apuntes conciliados`,
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

  const busy = localProcessing || isProcessing;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
      className={`rounded-md border transition-colors px-4 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
        isDragOver
          ? 'border-slate-400 bg-[#161920]'
          : 'border-[#1e222a] bg-[#111318]'
      }`}
    >
      {/* Inputs ocultos */}
      <input
        ref={bankInputRef}
        type="file"
        multiple
        onChange={handleBankFileChange}
        accept=".n43,.txt,.csv,.xlsx,.pdf,.json"
        className="hidden"
      />
      <input
        ref={portfolioFilesInputRef}
        type="file"
        multiple
        onChange={handlePortfolioInputChange}
        accept=".pdf,.xlsx,.csv,.json"
        className="hidden"
      />
      <input
        ref={portfolioFolderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handlePortfolioInputChange}
        className="hidden"
      />

      {/* Zona izquierda: Trigger de subida y feedback */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => bankInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-slate-100 hover:bg-white text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        >
          {busy ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          <span>Importar Extracto / Facturas</span>
        </button>

        <span className="text-xs text-slate-400 hidden sm:inline">
          Arrastre ficheros <span className="font-mono text-slate-300">.n43</span>, <span className="font-mono text-slate-300">.csv</span>, <span className="font-mono text-slate-300">.xlsx</span> o carpetas de <span className="font-mono text-slate-300">.pdf</span> directamente aquí
        </span>

        {feedback && (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/60'
                : feedback.type === 'error'
                ? 'bg-rose-950/40 text-rose-300 border border-rose-900/60'
                : 'bg-[#161920] text-slate-300 border border-[#2a303c]'
            }`}
          >
            {feedback.type === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
            {feedback.type === 'error' && <AlertCircle className="h-3 w-3 text-rose-400" />}
            {feedback.type === 'loading' && <RefreshCw className="h-3 w-3 animate-spin text-slate-300" />}
            <span>{feedback.text}</span>
          </span>
        )}
      </div>

      {/* Zona derecha: Cartera auxiliar y conexión Stripe */}
      <div className="flex flex-wrap items-center gap-2">
        {invoicesFiles.length > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161920] border border-[#2a303c] text-xs text-slate-200">
            <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-[11px]">
              {invoicesFiles.length === 1
                ? invoicesFiles[0].name
                : `${invoicesFiles.length} docs en cartera`}
            </span>
            <button
              type="button"
              onClick={() => executeProcessing(invoicesFiles, invoicesFiles)}
              disabled={busy}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-medium ml-1"
            >
              <Play className="h-2.5 w-2.5" />
              <span>Cruzar</span>
            </button>
            <button
              type="button"
              onClick={() => setInvoicesFiles([])}
              className="text-slate-500 hover:text-slate-200 ml-0.5"
              title="Limpiar cartera"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => portfolioFolderInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090a0d] hover:bg-[#161920] border border-[#1e222a] text-xs text-slate-300 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span>Carpeta Facturas</span>
        </button>

        <button
          type="button"
          onClick={() => portfolioFilesInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090a0d] hover:bg-[#161920] border border-[#1e222a] text-xs text-slate-300 transition-colors"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
          <span>+ Cartera</span>
        </button>

        {onOpenStripeSync && (
          <button
            type="button"
            onClick={onOpenStripeSync}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#090a0d] hover:bg-[#161920] border border-[#1e222a] text-xs text-slate-300 transition-colors"
          >
            <span>Stripe API</span>
            <ArrowUpRight className="h-3 w-3 text-slate-500" />
          </button>
        )}
      </div>
    </section>
  );
}
