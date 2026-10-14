/**
 * FICHERO: frontend/src/components/StagingRadar.jsx
 * Radar de Conciliación de Alta Densidad (100% Producción, Cero Datos Demo)
 */
import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  AlertOctagon,
  Layers,
  CheckCheck,
  Trash2,
  Plus,
} from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { PeriodFilter } from './PeriodFilter';
import { formatEuro } from '../utils/formatters';

export function StagingRadar({
  transactions = [],
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

  const counts = useMemo(() => {
    let green = 0;
    let yellow = 0;
    let red = 0;
    transactions.forEach((tx) => {
      if (tx.status === 'GREEN') green++;
      else if (tx.status === 'YELLOW') yellow++;
      else red++;
    });
    return { all: transactions.length, green, yellow, red };
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

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
    <div className="bg-[#101013] border border-zinc-800 rounded-lg overflow-hidden shadow-xl">
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

      <div className="p-4 border-b border-zinc-800/80 bg-[#0c0c0e] flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <span>Todas las Partidas</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900/80 border border-zinc-700/50 text-zinc-300">
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('GREEN')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'GREEN'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/70 shadow-sm'
                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900/60'
              }`}
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span>Verdes (Automáticas)</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/50 text-emerald-300">
                {counts.green}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('YELLOW')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'YELLOW'
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-800/70 shadow-sm'
                  : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-900/60'
              }`}
            >
              <AlertCircle className="h-3 w-3 text-amber-400" />
              <span>Amarillas (Revisión 1-Clic)</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/50 text-amber-300">
                {counts.yellow}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('RED')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'RED'
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800/70 shadow-sm'
                  : 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-900/60'
              }`}
            >
              <AlertOctagon className="h-3 w-3 text-rose-400" />
              <span>Rojas (Cuenta 555)</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800/50 text-rose-300">
                {counts.red}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {counts.yellow > 0 && (
              <button
                type="button"
                onClick={onBulkApproveYellows}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Aprobar Amarillas ({counts.yellow})</span>
              </button>
            )}

            {transactions.length > 0 && onClearAllTransactions && (
              <button
                type="button"
                onClick={handleClearAll}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  confirmClear
                    ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                    : 'bg-zinc-900/90 hover:bg-rose-950/50 border-zinc-800 hover:border-rose-800/60 text-zinc-400 hover:text-rose-300'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{confirmClear ? '¿Confirmar vaciado?' : 'Vaciar Radar'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por concepto bancario, factura, NIF/CIF o importe..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider hidden sm:inline">Origen:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-zinc-900/90 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas las Fuentes</option>
              <option value="Stripe">Stripe</option>
              <option value="Redsys">Redsys TPV</option>
              <option value="Norma 43">Extracto Bancario Norma 43</option>
            </select>
          </div>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="py-16 px-6 text-center flex flex-col items-center justify-center bg-[#0c0c0f]">
          <div className="h-12 w-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
            <Layers className="h-5 w-5 text-emerald-400" />
          </div>

          {!hasCompanies ? (
            <>
              <h3 className="text-sm font-semibold text-zinc-100 mb-1.5">
                Paso 1: Da de alta la primera sociedad o empresa cliente
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto mb-5 leading-relaxed">
                Tu espacio de despacho está recién creado y limpio. Añade una sociedad indicando su CIF y su ERP de destino (A3, Sage 50 o Contasol) para empezar a conciliar.
              </p>
              {onOpenAddClientModal && (
                <button
                  type="button"
                  onClick={onOpenAddClientModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  <span>Añadir Primera Empresa Cliente</span>
                </button>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-zinc-100 mb-1.5">
                Radar listo para conciliar
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Arrastra un fichero Norma 43 (.n43) o un CSV de liquidaciones de Stripe / Redsys en el panel superior, o conecta directamente la API de Stripe para generar los pre-asientos contables.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-[#09090b] text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-2 w-8 text-center"></th>
                  <th className="py-2.5 px-2">ID & Origen</th>
                  <th className="py-2.5 px-2">Fechas</th>
                  <th className="py-2.5 px-2">Concepto Bancario / Operación</th>
                  <th className="py-2.5 px-2 text-right">Banco Neto (€)</th>
                  <th className="py-2.5 px-2 text-right">Bruto Fra (€)</th>
                  <th className="py-2.5 px-2 text-right">Comisión (€)</th>
                  <th className="py-2.5 px-2 text-center">Afinidad</th>
                  <th className="py-2.5 px-2 text-right">Estado / Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      isExpanded={expandedId === tx.id}
                      onToggleExpand={() => toggleExpand(tx.id)}
                      onOpenScoreModal={onOpenScoreModal}
                      onApprove={onApproveTransaction}
                      onDelete={onDeleteTransaction}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-zinc-400 text-xs">
                      No se encontraron partidas con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-zinc-800/60 bg-[#09090b] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-400 gap-2">
            <div>
              Mostrando <span className="font-mono text-zinc-200">{filteredTransactions.length}</span> de{' '}
              <span className="font-mono text-zinc-200">{transactions.length}</span> partidas del periodo
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span>
                Neto Conciliado:{' '}
                <strong className="text-zinc-100">
                  {formatEuro(filteredTransactions.reduce((acc, t) => acc + (t.netAmountEur || 0), 0))}
                </strong>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
