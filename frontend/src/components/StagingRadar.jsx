/**
 * FICHERO: frontend/src/components/StagingRadar.jsx
 * Mesa de Conciliación Minimalista de Alta Densidad
 */
import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  AlertOctagon,
  CheckCheck,
  Trash2,
  Plus,
  FolderOpen,
} from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { PeriodFilter } from './PeriodFilter';
import { formatEuro } from '../utils/formatters';

export function StagingRadar({
  transactions = [],
  batches = [],
  currentBatchId = null,
  onSelectBatch,
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
  onOpenAddClientModal,
}) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

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
      {/* KPIs Directos sin texto sobrante */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-[11px] text-slate-400 font-medium">Partidas</span>
          <div className="font-mono text-xl font-bold text-white mt-0.5">{summary.all}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-[11px] text-slate-400 font-medium">Neto Banco (572)</span>
          <div className="font-mono text-xl font-bold text-white mt-0.5">{formatEuro(summary.netTotal)}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-[11px] text-slate-400 font-medium">Bruto Facturas (430)</span>
          <div className="font-mono text-xl font-bold text-slate-200 mt-0.5">{formatEuro(summary.grossTotal)}</div>
        </div>

        <div className="bg-[#10131a] border border-[#1e232d] rounded-xl px-4 py-3">
          <span className="text-[11px] text-slate-400 font-medium">Comisiones (626)</span>
          <div className="font-mono text-xl font-bold text-amber-400 mt-0.5">{formatEuro(summary.feeTotal)}</div>
        </div>
      </div>

      {/* Contenedor de Tabla */}
      <div className="bg-[#10131a] border border-[#1e232d] rounded-xl overflow-hidden shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-[#1e232d] bg-[#0d1016]">
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

          {batches && batches.length > 1 && (
            <div className="flex items-center gap-2 px-4 py-2 border-t lg:border-t-0 border-[#1e232d] text-xs">
              <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={currentBatchId || ''}
                onChange={(e) => onSelectBatch && onSelectBatch(e.target.value)}
                className="bg-[#161a23] border border-[#262c3a] rounded px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.filename} ({b.total_movements})
                  </option>
                ))}
              </select>
            </div>
          )}
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
              <span>Revisión</span>
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
              <span>Cuenta 555</span>
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
                placeholder="Buscar factura, NIF, importe..."
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
                <span>{confirmClear ? 'Confirmar' : 'Limpiar'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabla o Estado Vacío */}
        {transactions.length === 0 ? (
          <div className="py-12 px-6 text-center bg-[#0b0d11]">
            {!hasCompanies ? (
              <button
                type="button"
                onClick={onOpenAddClientModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Crear Primera Empresa Cliente</span>
              </button>
            ) : (
              <span className="text-xs text-slate-500">
                Sin partidas cargadas. Sube un archivo arriba para conciliar.
              </span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1e232d] bg-[#0b0d11] text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-2 w-8 text-center"></th>
                  <th className="py-2.5 px-2">Origen</th>
                  <th className="py-2.5 px-2">Fecha</th>
                  <th className="py-2.5 px-2">Concepto</th>
                  <th className="py-2.5 px-2 text-right">Neto (572)</th>
                  <th className="py-2.5 px-2 text-right">Bruto (430)</th>
                  <th className="py-2.5 px-2 text-right">Comisión (626)</th>
                  <th className="py-2.5 px-2 text-center">Score</th>
                  <th className="py-2.5 px-2 text-right">Acción</th>
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
                    <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
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
