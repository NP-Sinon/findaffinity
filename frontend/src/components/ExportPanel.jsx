/**
 * FICHERO: frontend/src/components/ExportPanel.jsx
 */
import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  Database,
  ShieldCheck,
  Eye,
  FileCheck2,
  Lock,
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
      totalCredit,
      imbalance: Math.abs(totalDebit - totalCredit),
    };
  }, [validJournals]);

  const previewText = useMemo(() => {
    if (validJournals.length === 0) {
      return '// Esperando asientos conciliados para exportar.';
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

    // Si el Paywall está activo (>25 facturas en plan FREE), abrir modal de precios
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
      } catch (err) {
        console.warn('Descargando mediante generador en memoria del navegador:', err);
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

  return (
    <div className="bg-[#101013] border border-zinc-800/80 rounded-lg p-4 sm:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 mb-4 border-b border-zinc-800/50">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Database className="h-4 w-4 text-zinc-400" />
            Exportación Oficial a ERP de Contabilidad
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Generación certificada de asientos auditados sin descuadre para inyección directa en el software contable.
          </p>
        </div>

        <div className="inline-flex rounded-md p-1 bg-zinc-900 border border-zinc-800 self-start md:self-auto">
          <button
            type="button"
            onClick={() => onSelectErp('A3')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'A3' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Wolters Kluwer A3 (Suenlace)
          </button>
          <button
            type="button"
            onClick={() => onSelectErp('SAGE')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'SAGE' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sage 50 (XDIARIO)
          </button>
          <button
            type="button"
            onClick={() => onSelectErp('CONTASOL')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'CONTASOL' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            DELSOL Contasol (.xlsx)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Asientos a Emitir</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">{auditMetrics.entriesCount}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Líneas Diario</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">{auditMetrics.linesCount}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Volumen Contabilizado</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">
            {formatEuro(auditMetrics.totalDebit)}
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Estado de Cuadre PGC</div>
          <div
            className={`font-mono text-sm font-semibold mt-0.5 flex items-center gap-1 ${
              auditMetrics.imbalance < 0.005 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {auditMetrics.imbalance < 0.005 ? 'Cuadre 0,00 €' : `Descuadre ${formatEuro(auditMetrics.imbalance)}`}
          </div>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-md overflow-hidden bg-[#0c0c0e]">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-800/80 bg-zinc-950/70 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] text-zinc-300">
              {selectedErp === 'A3'
                ? 'SUENLACE_A3.txt (Protocolo Enlace Contable A3)'
                : selectedErp === 'SAGE'
                ? 'XDIARIO.csv (9 Columnas Oficiales Sage 50)'
                : 'CONTASOL_DIARIO.xlsx (Diario 1 + Asiento Correlativo)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] text-zinc-300 font-medium transition-colors"
            >
              {paywallLocked ? (
                <Lock className="h-3 w-3 text-amber-400" />
              ) : copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={validJournals.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                paywallLocked
                  ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                  : 'bg-zinc-100 hover:bg-white text-zinc-900'
              }`}
            >
              {paywallLocked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : downloadSuccess ? (
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : selectedErp === 'CONTASOL' ? (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>
                {paywallLocked
                  ? 'Desbloquear Descarga (Paywall)'
                  : downloadSuccess
                  ? 'Descargado'
                  : 'Descargar 1-Clic'}
              </span>
            </button>
          </div>
        </div>

        <div className="p-3 max-h-56 overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre select-all bg-[#08080a]">
          {previewText}
        </div>
      </div>
    </div>
  );
}
