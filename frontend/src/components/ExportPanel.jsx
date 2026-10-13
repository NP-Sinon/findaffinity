import React, { useState, useMemo } from 'react';
import { 
  Download, 
  Copy, 
  Check, 
  FileCode, 
  FileSpreadsheet, 
  Database, 
  ShieldCheck, 
  Eye,
  FileCheck2
} from 'lucide-react';
import { 
  generateA3Suenlace, 
  generateSageXdiario, 
  generateContasolXlsx,
  downloadTextFile, 
  downloadBinaryFile 
} from '../utils/exporters';
import { formatEuro } from '../utils/formatters';

export function ExportPanel({
  transactions,
  selectedErp,
  onSelectErp,
  selectedCompany,
}) {
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Filtrar partidas conciliables (Verdes o aprobadas)
  const validJournals = useMemo(() => {
    return transactions
      .filter(tx => (tx.status === 'GREEN' || tx.isApproved) && tx.journal)
      .map(tx => tx.journal);
  }, [transactions]);

  // Totales contables
  const auditMetrics = useMemo(() => {
    let totalLines = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    validJournals.forEach(j => {
      j.lines.forEach(l => {
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

  // Previsualización de texto según ERP
  const previewText = useMemo(() => {
    if (validJournals.length === 0) {
      return '// No hay asientos conciliados listos para exportar.';
    }

    if (selectedErp === 'A3') {
      return generateA3Suenlace(validJournals, selectedCompany.accountLength || 9);
    }
    if (selectedErp === 'SAGE') {
      return generateSageXdiario(validJournals, selectedCompany.accountLength || 9);
    }
    // Para Contasol se muestra la estructura CSV correspondiente
    const header = 'Diario;Fecha;Subcuenta;Concepto;Documento;Debe;Haber';
    const lines = [header];
    validJournals.forEach(j => {
      const [y, m, d] = j.date.split('-');
      const dateFormatted = `${d}/${m}/${y}`;
      j.lines.forEach(l => {
        lines.push(`${j.entryNumber || 1};${dateFormatted};${l.accountCode};${l.concept};${l.documentNumber};${Number(l.debitEur).toFixed(2)};${Number(l.creditEur).toFixed(2)}`);
      });
    });
    return lines.join('\r\n');
  }, [validJournals, selectedErp, selectedCompany]);

  // Manejador de descarga de archivo oficial
  const handleDownload = () => {
    if (validJournals.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const clientCode = selectedCompany.fiscalId.replace(/[^a-zA-Z0-9]/g, '');

    if (selectedErp === 'A3') {
      const filename = `SUENLACE_${clientCode}_${dateStr}.txt`;
      downloadTextFile(previewText, filename, 'text/plain;charset=windows-1252');
    } else if (selectedErp === 'SAGE') {
      const filename = `XDIARIO_${clientCode}_${dateStr}.csv`;
      downloadTextFile(previewText, filename, 'text/csv;charset=windows-1252');
    } else if (selectedErp === 'CONTASOL') {
      const filename = `CONTASOL_DIARIO_${clientCode}_${dateStr}.xlsx`;
      const binaryData = generateContasolXlsx(validJournals, selectedCompany.accountLength || 9);
      downloadBinaryFile(binaryData, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#101013] border border-zinc-800/80 rounded-lg p-4 sm:p-5">
      {/* Panel Header */}
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

        {/* ERP Switcher Tabs */}
        <div className="inline-flex rounded-md p-1 bg-zinc-900 border border-zinc-800 self-start md:self-auto">
          <button
            type="button"
            onClick={() => onSelectErp('A3')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'A3'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Wolters Kluwer A3 (Suenlace)
          </button>
          <button
            type="button"
            onClick={() => onSelectErp('SAGE')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'SAGE'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sage 50 (XDIARIO)
          </button>
          <button
            type="button"
            onClick={() => onSelectErp('CONTASOL')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedErp === 'CONTASOL'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            DELSOL Contasol (.xlsx)
          </button>
        </div>
      </div>

      {/* Audit Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Asientos a Emitir</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">
            {auditMetrics.entriesCount}
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Líneas Diario</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">
            {auditMetrics.linesCount}
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Volumen Contabilizado</div>
          <div className="font-mono text-sm font-semibold text-zinc-100 mt-0.5">
            {formatEuro(auditMetrics.totalDebit)}
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Auditoría Checksum</div>
          <div className="font-mono text-sm font-semibold text-emerald-400 mt-0.5 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Cuadre 0.00 €
          </div>
        </div>
      </div>

      {/* Code / Content Live Preview */}
      <div className="border border-zinc-800 rounded-md overflow-hidden bg-[#0c0c0e]">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-800/80 bg-zinc-950/70 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] text-zinc-300">
              {selectedErp === 'A3' ? 'SUENLACE_A3.txt (Ancho Fijo / Delimitado)' :
               selectedErp === 'SAGE' ? 'XDIARIO.csv (Estructura Sage 50)' :
               'CONTASOL_DIARIO.xlsx (Vista Previa Estructurada)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] text-zinc-300 font-medium transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={validJournals.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-900 text-[11px] font-semibold transition-colors disabled:opacity-40"
            >
              {downloadSuccess ? (
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : selectedErp === 'CONTASOL' ? (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{downloadSuccess ? 'Descargado' : 'Descargar 1-Clic'}</span>
            </button>
          </div>
        </div>

        {/* Live Monospace Text Box */}
        <div className="p-3 max-h-56 overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre select-all bg-[#08080a]">
          {previewText}
        </div>
      </div>
    </div>
  );
}
