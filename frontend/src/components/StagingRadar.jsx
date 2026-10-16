/**
 * FICHERO: frontend/src/components/StagingRadar.jsx
 * Mesa de Conciliación Contable de Alta Densidad
 */
import React, { useState, useMemo } from 'react';
import {
  Search,
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
    <div className="bg-[#111318] border border-[#1e222a] rounded-md overflow-hidden flex-1 flex flex-col">
      {/* Barra superior: Filtro de Periodo + Totales Contables del Lote */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-[#1e222a] bg-[#0d0f14]">
        <div className="flex flex-wrap items-center">
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
            <div className="flex items-center gap-2 px-3 py-2 border-l border-[#1e222a] text-xs">
              <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={currentBatchId || ''}
                onChange={(e) => onSelectBatch && onSelectBatch(e.target.value)}
                className="bg-[#111318] border border-[#1e222a] rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none"
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

        {/* Cinta de saldos PGC compacta */}
        <div className="flex flex-wrap items-center gap-5 px-4 py-2 border-t xl:border-t-0 border-[#1e222a] text-xs">
          <div>
            <span className="text-slate-500 mr-1.5">572 Tesorería:</span>
            <span className="font-mono font-semibold text-slate-100">{formatEuro(summary.netTotal)}</span>
          </div>
          <div className="h-3 w-px bg-[#1e222a]" />
          <div>
            <span className="text-slate-500 mr-1.5">430 Clientes:</span>
            <span className="font-mono font-semibold text-slate-200">{formatEuro(summary.grossTotal)}</span>
          </div>
          <div className="h-3 w-px bg-[#1e222a]" />
          <div>
            <span className="text-slate-500 mr-1.5">626 Gastos/Comisiones:</span>
            <span className="font-mono font-semibold text-amber-400">{formatEuro(summary.feeTotal)}</span>
          </div>
        </div>
      </div>

      {/* Barra de Pestañas de Estado y Búsqueda */}
      <div className="px-4 py-2.5 border-b border-[#1e222a] bg-[#111318] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ALL'
                ? 'bg-[#1a1e26] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Todos</span>
            <span className="font-mono text-[11px] text-slate-400">{summary.all}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('GREEN')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'GREEN'
                ? 'bg-[#1a1e26] text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Conciliados</span>
            <span className="font-mono text-[11px] text-slate-400">{summary.green}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('YELLOW')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'YELLOW'
                ? 'bg-[#1a1e26] text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Pendientes de revisión</span>
            <span className="font-mono text-[11px] text-slate-400">{summary.yellow}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RED')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'RED'
                ? 'bg-[#1a1e26] text-rose-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span>Cuenta 555</span>
            <span className="font-mono text-[11px] text-slate-400">{summary.red}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por concepto, factura, importe..."
              className="w-full bg-[#090a0d] border border-[#1e222a] rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>

          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="bg-[#090a0d] border border-[#1e222a] rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Todos los orígenes</option>
            <option value="Stripe">Stripe</option>
            <option value="Redsys">Redsys TPV</option>
            <option value="Norma 43">Norma 43</option>
          </select>

          {summary.yellow > 0 && (
            <button
              type="button"
              onClick={onBulkApproveYellows}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Conformar {summary.yellow} en revisión</span>
            </button>
          )}

          {transactions.length > 0 && onClearAllTransactions && (
            <button
              type="button"
              onClick={handleClearAll}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                confirmClear
                  ? 'bg-rose-700 text-white border-rose-600'
                  : 'bg-[#090a0d] hover:bg-rose-950/30 border-[#1e222a] text-slate-400 hover:text-rose-300'
              }`}
            >
              <Trash2 className="h-3 w-3" />
              <span>{confirmClear ? 'Confirmar vaciado' : 'Vaciar lote'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Apuntes Contables */}
      {transactions.length === 0 ? (
        <div className="py-16 px-6 text-center bg-[#090a0d] flex-1 flex flex-col items-center justify-center">
          {!hasCompanies ? (
            <button
              type="button"
              onClick={onOpenAddClientModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-slate-100 hover:bg-white text-xs font-semibold text-slate-950 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Dar de alta primera sociedad cliente</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              No hay apuntes contables cargados en este periodo. Importe un extracto Norma 43, CSV o conjunto de facturas en la barra superior.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1e222a] bg-[#0d0f14] text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-2 px-2 w-8 text-center"></th>
                <th className="py-2 px-3">Referencia / Canal</th>
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Concepto Bancario y Regla</th>
                <th className="py-2 px-3 text-right">Neto (572)</th>
                <th className="py-2 px-3 text-right">Bruto (430)</th>
                <th className="py-2 px-3 text-right">Gastos (626)</th>
                <th className="py-2 px-3 text-center">Afinidad</th>
                <th className="py-2 px-3 text-right">Estado / Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181b22]">
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
                    Ningún apunte coincide con los criterios de búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
