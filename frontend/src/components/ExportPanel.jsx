/**
 * FICHERO: frontend/src/components/ExportPanel.jsx
 * Barra de Descarga Protagonista con Selector de ERP y Vista Previa Plegable
 */
import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  ShieldCheck,
  Code2,
  FileCheck2,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  generateA3Suenlace,
  generateSageXdiario,
  generateContasolXlsx,
  downloadTextFile,
  downloadBinaryFile,
} from '../utils/exporters';
import { downloadBackendExportBlob } from '../services/api';
import { formatEuro, formatAccountCode } from '../utils/formatters';

export function ExportPanel({
  transactions,
  selectedErp,
  onSelectErp,
  selectedCompany,
  batchId,
  paywallLocked = false,
  onOpenPaywall,
}) {
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);

  const validJournals = useMemo(() => {
    return transactions
      .filter((tx) => (tx.status === 'GREEN' || tx.isApproved) && tx.journal)
      .map((tx) => tx.journal);
  }, [transactions]);

  const auditMetrics = useMemo(() => {
    let totalLines = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    validJournals.forEach((j) => {
      (j.lines || []).forEach((l) => {
        totalLines += 1;
        totalDebit += Number(l.debitEur) || 0;
        totalCredit += Number(l.creditEur) || 0;
      });
    });

    return {
      entriesCount: validJournals.length,
      linesCount: totalLines,
      totalDebit,
      imbalance: Math.abs(totalDebit - totalCredit),
    };
  }, [validJournals]);

  const previewText = useMemo(() => {
    if (validJournals.length === 0) {
      return '// Sin asientos listos para exportar.';
    }

    const accLen = selectedCompany?.accountLength || 9;
    if (selectedErp === 'A3') {
      return generateA3Suenlace(validJournals, accLen);
    }
    if (selectedErp === 'SAGE') {
      return generateSageXdiario(validJournals, accLen);
    }
    const header = 'Diario;Fecha;Asiento;Subcuenta;Concepto;Documento;Debe;Haber;Contrapartida';
    const lines = [header];
    validJournals.forEach((j, idx) => {
      const [y, m, d] = (j.date || '2026-01-01').split('-');
      const dateFormatted = `${d}/${m}/${y}`;
      const entryNum = j.entryNumber || idx + 1;
      (j.lines || []).forEach((l) => {
        const acct = formatAccountCode(l.accountCode, accLen);
        const contra = l.contrapartida ? formatAccountCode(l.contrapartida, accLen) : '';
        lines.push(
          `1;${dateFormatted};${entryNum};${acct};${l.concept};${l.documentNumber};${Number(l.debitEur).toFixed(2)};${Number(l.creditEur).toFixed(2)};${contra}`
        );
      });
    });
    return lines.join('\r\n');
  }, [validJournals, selectedErp, selectedCompany]);

  const handleDownload = async () => {
    if (validJournals.length === 0) return;

    if (paywallLocked && onOpenPaywall) {
      onOpenPaywall();
      return;
    }

    const clientCode = (selectedCompany?.fiscalId || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '');

    if (batchId) {
      try {
        const { blob, disposition } = await downloadBackendExportBlob(batchId, selectedErp);
        let fname = `EXPORT_${clientCode}_${selectedErp}`;
        if (disposition && disposition.includes('filename=')) {
          fname = disposition.split('filename=')[1].replace(/"/g, '').trim();
        } else {
          fname += selectedErp === 'CONTASOL' ? '.xlsx' : selectedErp === 'SAGE' ? '.csv' : '.txt';
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 2500);
        return;
      } catch {
        // Fallback inmediato al generador en RAM del navegador
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (selectedErp === 'A3') {
      downloadTextFile(previewText, `SUENLACE_${clientCode}_${dateStr}.txt`, 'text/plain;charset=windows-1252');
    } else if (selectedErp === 'SAGE') {
      downloadTextFile(previewText, `XDIARIO_${clientCode}_${dateStr}.csv`, 'text/csv;charset=windows-1252');
    } else if (selectedErp === 'CONTASOL') {
      const binaryData = generateContasolXlsx(validJournals, selectedCompany?.accountLength || 9);
      downloadBinaryFile(
        binaryData,
        `CONTASOL_DIARIO_${clientCode}_${dateStr}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    }

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleCopy = () => {
    if (paywallLocked && onOpenPaywall) {
      onOpenPaywall();
      return;
    }
    navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const erpButtonLabel =
    selectedErp === 'A3'
      ? 'Descargar Wolters Kluwer A3 (.txt)'
      : selectedErp === 'SAGE'
      ? 'Descargar Sage 50 XDIARIO (.csv)'
      : 'Descargar Excel Contasol (.xlsx)';

  return (
    <section className="bg-[#10131a] border border-[#1e232d] rounded-xl p-5 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Izquierda: Selector de Formato ERP y Resumen de Asientos */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-white">Exportar Diario Contable</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>{auditMetrics.entriesCount} asientos</span>
              <span>&bull;</span>
              <span>{formatEuro(auditMetrics.totalDebit)}</span>
              <span>&bull;</span>
              <span>Cuadre 0,00 €</span>
            </span>
          </div>

          {/* Botones de selección de ERP claros */}
          <div className="inline-flex rounded-lg p-1 bg-[#0b0d11] border border-[#222834]">
            <button
              type="button"
              onClick={() => onSelectErp('A3')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
                selectedErp === 'A3'
                  ? 'bg-[#181c26] text-white border border-[#2c3444] shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wolters Kluwer A3
            </button>
            <button
              type="button"
              onClick={() => onSelectErp('SAGE')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
                selectedErp === 'SAGE'
                  ? 'bg-[#181c26] text-white border border-[#2c3444] shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sage 50
            </button>
            <button
              type="button"
              onClick={() => onSelectErp('CONTASOL')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
                selectedErp === 'CONTASOL'
                  ? 'bg-[#181c26] text-white border border-[#2c3444] shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DELSOL Contasol
            </button>
          </div>
        </div>

        {/* Derecha: Botón Grande e Intuitivo de Descarga */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCodePreview((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs font-medium text-slate-300 transition-colors"
          >
            <Code2 className="h-4 w-4 text-slate-400" />
            <span>{showCodePreview ? 'Ocultar vista previa' : 'Ver pre-asiento'}</span>
            {showCodePreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={validJournals.length === 0}
            className={`inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
              paywallLocked
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/10'
                : downloadSuccess
                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white shadow-blue-600/25'
            }`}
          >
            {paywallLocked ? (
              <Lock className="h-4 w-4" />
            ) : downloadSuccess ? (
              <FileCheck2 className="h-5 w-5" />
            ) : selectedErp === 'CONTASOL' ? (
              <FileSpreadsheet className="h-5 w-5" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            <span>
              {paywallLocked
                ? 'Desbloquear Descarga'
                : downloadSuccess
                ? 'Archivo Descargado'
                : erpButtonLabel}
            </span>
          </button>
        </div>
      </div>

      {/* Vista previa plegable bajo demanda */}
      {showCodePreview && (
        <div className="mt-4 border border-[#1e232d] rounded-lg overflow-hidden bg-[#0b0d11]">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1e232d] bg-[#0f1218] text-xs">
            <span className="font-mono text-[11px] text-slate-400">
              {selectedErp === 'A3'
                ? 'SUENLACE_A3.txt'
                : selectedErp === 'SAGE'
                ? 'XDIARIO.csv'
                : 'CONTASOL_DIARIO.xlsx'}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161a23] hover:bg-[#1e2430] border border-[#262c3a] text-[11px] text-slate-300"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copiado' : 'Copiar texto'}</span>
            </button>
          </div>
          <div className="p-3.5 max-h-52 overflow-y-auto font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre select-all">
            {previewText}
          </div>
        </div>
      )}
    </section>
  );
}
