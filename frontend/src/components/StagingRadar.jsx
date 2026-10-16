/**
 * FICHERO: frontend/src/components/StagingRadar.jsx
 * Mesa Central Unificada: Tabla de Facturas Procesadas + Drag & Drop Integrado
 */
import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  AlertOctagon,
  CheckCheck,
  Trash2,
  Plus,
  FolderOpen,
  UploadCloud,
  FileText,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { PeriodFilter } from './PeriodFilter';
import { formatEuro } from '../utils/formatters';

const VALID_EXTS = ['.n43', '.txt', '.csv', '.xlsx', '.pdf', '.json'];

function getExt(filename = '') {
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.slice(idx).toLowerCase() : '';
}

async function extractDroppedFiles(dataTransfer) {
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

export function StagingRadar({
  transactions = [],
  onFilesDropped,
  isProcessing = false,
  onOpenStripeSync,
  onApproveTransaction,
  onBulkApproveYellows,
  onOpenScoreModal,
  selectedYear,
  onSelectYear,
  periodType,
  onSelectPeriodType,
  startMonth,
  onSelectStartMonth,
  endMonth,
  onSelectEndMonth,
  onDeleteTransaction,
  onClearAllTransactions,
  hasCompanies = false,
  isGestor = false,
  onOpenAddClientModal,
}) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const filesInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleProcessFilesList = async (rawList) => {
    const valid = (rawList || []).filter((f) => VALID_EXTS.includes(getExt(f.name)));
    if (valid.length === 0) return;
    if (onFilesDropped) {
      await onFilesDropped(valid);
    }
  };

  const handleDropOnWorkspace = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = await extractDroppedFiles(e.dataTransfer);
    if (dropped && dropped.length > 0) {
      await handleProcessFilesList(dropped);
    }
  };

  const handleInputChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      e.target.value = '';
      await handleProcessFilesList(selected);
    }
  };

  const summary = useMemo(() => {
    let green = 0;
    let yellow = 0;
    let red = 0;
    let netTotal = 0;
    let grossTotal = 0;
    let feeTotal = 0;

    transactions.forEach((tx) => {
      if (tx.status === 'GREEN') green++;
      else if (tx.status === 'YELLOW') yellow++;
      else red++;

      netTotal += Number(tx.netAmountEur) || 0;
      grossTotal += Number(tx.grossAmountEur) || 0;
      feeTotal += Number(tx.feeAmountEur) || 0;
    });

    return {
      all: transactions.length,
      green,
      yellow,
      red,
      netTotal,
      grossTotal,
      feeTotal,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (activeTab !== 'ALL' && tx.status !== activeTab) return false;
      if (selectedSource !== 'ALL' && !(tx.source || '').toLowerCase().includes(selectedSource.toLowerCase())) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchConcept = (tx.concept || '').toLowerCase().includes(query);
        const matchId = (tx.id || '').toLowerCase().includes(query);
        const matchSolver = (tx.solverUsed || '').toLowerCase().includes(query);
        const matchAmount = String(tx.netAmountEur || '').includes(query);
        if (!matchConcept && !matchId && !matchSolver && !matchAmount) return false;
      }
      return true;
    });
  }, [transactions, activeTab, selectedSource, searchQuery]);

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3500);
      return;
    }
    setConfirmClear(false);
    if (onClearAllTransactions) onClearAllTransactions();
  };

  return (
    <div className="space-y-4">
      {/* Inputs ocultos para selección automática de archivos o carpetas completas */}
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept=".n43,.txt,.csv,.xlsx,.pdf,.json"
        onChange={handleInputChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Resumen limpio sin números 572, 430 ni 626 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-xs text-slate-400 font-medium">Facturas / Partidas</span>
          <div className="font-mono text-xl font-bold text-white mt-0.5">{summary.all}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-xs text-slate-400 font-medium">Importe Neto</span>
          <div className="font-mono text-xl font-bold text-white mt-0.5">{formatEuro(summary.netTotal)}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-xs text-slate-400 font-medium">Importe Bruto</span>
          <div className="font-mono text-xl font-bold text-slate-200 mt-0.5">{formatEuro(summary.grossTotal)}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-xs text-slate-400 font-medium">Comisiones</span>
          <div className="font-mono text-xl font-bold text-amber-400 mt-0.5">{formatEuro(summary.feeTotal)}</div>
        </div>
      </div>

      {/* CAJA CENTRAL ENORME: Es la tabla de facturas procesadas Y la zona de arrastrar y soltar */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDragOver(false);
          }
        }}
        onDrop={handleDropOnWorkspace}
        className={`relative bg-[#10131a] border-2 rounded-xl overflow-hidden shadow-xl transition-all min-h-[460px] flex flex-col ${
          isDragOver
            ? 'border-blue-500 bg-blue-950/15'
            : 'border-[#1e232d]'
        }`}
      >
        {/* Overlay visual cuando arrastras archivos encima de la tabla */}
        {isDragOver && (
          <div className="absolute inset-0 z-30 bg-blue-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="h-16 w-16 rounded-2xl bg-blue-600/20 border-2 border-blue-400 flex items-center justify-center text-blue-300 mb-3">
              <UploadCloud className="h-8 w-8" />
            </div>
            <p className="text-base font-semibold text-white">
              Suelta aquí tus archivos o carpetas para procesarlos y cruzarlos automáticamente
            </p>
            <p className="text-xs text-blue-200 mt-1">
              Admite facturas PDF (1 o más de 20 a la vez), Excel, CSV y Norma 43
            </p>
          </div>
        )}

        {/* Cabecera de la Caja Central: Filtro de Periodo + Botones Grandes de Subida */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-[#1e232d] bg-[#0d1016] gap-2 pr-3">
          <PeriodFilter
            selectedYear={selectedYear}
            onSelectYear={onSelectYear}
            periodType={periodType}
            onSelectPeriodType={onSelectPeriodType}
            startMonth={startMonth}
            onSelectStartMonth={onSelectStartMonth}
            endMonth={endMonth}
            onSelectEndMonth={onSelectEndMonth}
          />

          {/* Botones claros y visibles para subir archivos o carpetas en cualquier momento */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => filesInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>Subir Archivos (.PDF, .CSV, .XLSX, .N43)</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#161a23] hover:bg-[#1f2633] border border-[#2a3244] text-slate-100 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FolderOpen className="h-4 w-4 text-amber-400" />
              <span>Subir Carpeta Completa</span>
            </button>

            {onOpenStripeSync && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={onOpenStripeSync}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#161a23] hover:bg-[#1f2633] border border-[#2a3244] text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 text-blue-400" />
                <span>Stripe API</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Pestañas y Búsqueda */}
        <div className="p-3.5 border-b border-[#1e232d] bg-[#0f1218] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                activeTab === 'ALL'
                  ? 'bg-[#181c26] text-white border-[#2a3142]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Todas</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#0b0d11] text-slate-300">
                {summary.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('GREEN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                activeTab === 'GREEN'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  : 'border-transparent text-slate-400 hover:text-emerald-400'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Conciliadas</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300">
                {summary.green}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('YELLOW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                activeTab === 'YELLOW'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                  : 'border-transparent text-slate-400 hover:text-amber-400'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <span>En revisión</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300">
                {summary.yellow}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('RED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                activeTab === 'RED'
                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                  : 'border-transparent text-slate-400 hover:text-rose-400'
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5 text-rose-400" />
              <span>Sin conciliar</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300">
                {summary.red}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar factura, cliente, importe..."
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-[#0b0d11] border border-[#222834] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos los canales</option>
              <option value="Stripe">Stripe</option>
              <option value="Redsys">Redsys TPV</option>
              <option value="Norma 43">Norma 43</option>
              <option value="Factura PDF">Facturas PDF</option>
            </select>

            {summary.yellow > 0 && (
              <button
                type="button"
                onClick={onBulkApproveYellows}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Aprobar ({summary.yellow})</span>
              </button>
            )}

            {transactions.length > 0 && onClearAllTransactions && (
              <button
                type="button"
                onClick={handleClearAll}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  confirmClear
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-[#0b0d11] hover:bg-rose-950/40 border-[#222834] text-slate-400 hover:text-rose-300'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{confirmClear ? 'Confirmar vaciado' : 'Limpiar'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Contenido Central: Zona de Arrastrar Grande cuando está vacío, o Tabla de Facturas cuando hay datos */}
        {transactions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0b0d11]/80">
            {!hasCompanies ? (
              <div className="max-w-md space-y-3">
                <p className="text-sm text-slate-300 font-medium">
                  {isGestor
                    ? 'El administrador aún no ha dado de alta ninguna empresa en esta cuenta.'
                    : 'Para empezar a procesar facturas y extractos, crea primero tu empresa.'}
                </p>
                {!isGestor && (
                  <button
                    type="button"
                    onClick={onOpenAddClientModal}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Crear Primera Empresa</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full max-w-2xl rounded-2xl border-2 border-dashed border-[#263042] hover:border-blue-500/60 bg-[#0f131b] p-8 transition-all">
                <div className="h-14 w-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto mb-4">
                  {isProcessing ? (
                    <RefreshCw className="h-7 w-7 animate-spin" />
                  ) : (
                    <UploadCloud className="h-7 w-7" />
                  )}
                </div>

                <h3 className="text-base font-semibold text-white">
                  Arrastra aquí tus archivos o carpetas completas
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 max-w-lg mx-auto">
                  Puedes soltar a la vez múltiples facturas PDF, archivos Excel, CSV o extractos Norma 43. Se cargarán y cruzarán automáticamente en esta tabla.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => filesInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-lg cursor-pointer"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Seleccionar Archivos</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#181e29] hover:bg-[#222a38] border border-[#2e374a] text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <FolderOpen className="h-4 w-4 text-amber-400" />
                    <span>Seleccionar Carpeta Completa</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e232d] bg-[#0b0d11] text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-2 w-8 text-center"></th>
                  <th className="py-2.5 px-3">Origen / Factura</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Concepto</th>
                  <th className="py-2.5 px-3 text-right">Importe Neto</th>
                  <th className="py-2.5 px-3 text-right">Importe Bruto</th>
                  <th className="py-2.5 px-3 text-right">Comisión</th>
                  <th className="py-2.5 px-3 text-center">Coincidencia</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181c24]">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      isExpanded={expandedId === tx.id}
                      onToggleExpand={() => setExpandedId((prev) => (prev === tx.id ? null : tx.id))}
                      onOpenScoreModal={onOpenScoreModal}
                      onApprove={onApproveTransaction}
                      onDelete={onDeleteTransaction}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500 text-xs">
                      Sin coincidencias para el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
