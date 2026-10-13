import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  AlertOctagon, 
  Layers, 
  ChevronDown,
  CheckCheck,
  Sparkles
} from 'lucide-react';
import { TransactionRow } from './TransactionRow';
import { PeriodFilter } from './PeriodFilter';
import { formatEuro } from '../utils/formatters';

export function StagingRadar({
  transactions,
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
  onLoadDemoBatch,
}) {
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'GREEN' | 'YELLOW' | 'RED'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);

  // Contadores en vivo para las pestañas
  const counts = useMemo(() => {
    let green = 0;
    let yellow = 0;
    let red = 0;
    transactions.forEach(tx => {
      if (tx.status === 'GREEN') green++;
      else if (tx.status === 'YELLOW') yellow++;
      else red++;
    });
    return { all: transactions.length, green, yellow, red };
  }, [transactions]);

  // Filtrado reactivo de transacciones
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Filtro por pestaña de estado
      if (activeTab === 'GREEN' && tx.status !== 'GREEN') return false;
      if (activeTab === 'YELLOW' && tx.status !== 'YELLOW') return false;
      if (activeTab === 'RED' && tx.status !== 'RED') return false;

      // Filtro por origen
      if (selectedSource !== 'ALL') {
        if (!tx.source.toLowerCase().includes(selectedSource.toLowerCase())) {
          return false;
        }
      }

      // Filtro por búsqueda textual
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesConcept = tx.concept.toLowerCase().includes(query);
        const matchesId = tx.id.toLowerCase().includes(query);
        const matchesSource = tx.source.toLowerCase().includes(query);
        const matchesSolver = tx.solverUsed.toLowerCase().includes(query);
        const matchesAmount = tx.netAmountEur.toString().includes(query);
        return matchesConcept || matchesId || matchesSource || matchesSolver || matchesAmount;
      }

      return true;
    });
  }, [transactions, activeTab, selectedSource, searchQuery]);

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="bg-[#101013] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
      {/* Top Controls: Tabs and Search Bar */}
      <div className="p-4 border-b border-zinc-800/60 bg-[#0d0d10] space-y-3">
        {/* Filtro por Año, Trimestres o Rango Personalizado de Meses */}
        {selectedYear && (
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
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          {/* Status Tabs with Live Counters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
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
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-900/80 border border-zinc-700/50 text-zinc-300">
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
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/50 text-emerald-300">
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
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800/50 text-amber-300">
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
              <span>Rojas (Excepciones)</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-800/50 text-rose-300">
                {counts.red}
              </span>
            </button>
          </div>

          {/* Bulk Action for Yellows if any */}
          {counts.yellow > 0 && (
            <button
              type="button"
              onClick={onBulkApproveYellows}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium transition-colors whitespace-nowrap self-start md:self-auto"
            >
              <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Aprobar Todas las Amarillas ({counts.yellow})</span>
            </button>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por concepto, factura, solver, importe..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Source Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider hidden sm:inline">
              Origen:
            </span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-zinc-900/90 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="ALL">Todas las Fuentes</option>
              <option value="Stripe">Stripe</option>
              <option value="Redsys">Redsys TPV</option>
              <option value="Santander">Banco Santander (N43)</option>
              <option value="BBVA">BBVA (N43)</option>
            </select>
          </div>
        </div>
      </div>

      {/* High-Density Transactions Table o Empty State */}
      {transactions.length === 0 ? (
        <div className="py-16 px-6 text-center flex flex-col items-center justify-center bg-[#0c0c0f]">
          <div className="h-14 w-14 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
            <Layers className="h-7 w-7 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 mb-2">
            No hay movimientos contables cargados en este periodo
          </h3>
          <p className="text-xs text-zinc-400 max-w-lg mx-auto mb-6 leading-relaxed">
            Sube un extracto bancario o reporte de cobros arriba, o pulsa en <strong className="text-zinc-200">"Cargar Lote de Prueba"</strong> para probar el motor con datos de muestra.
          </p>
          {onLoadDemoBatch && (
            <button
              type="button"
              onClick={onLoadDemoBatch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 text-xs font-semibold text-amber-300 transition-colors shadow-sm"
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>Cargar Lote de Prueba</span>
            </button>
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
                  <th className="py-2.5 px-2">Concepto Bancario / Solver</th>
                  <th className="py-2.5 px-2 text-right">Banco Neto (€)</th>
                  <th className="py-2.5 px-2 text-right">Bruto Fra (€)</th>
                  <th className="py-2.5 px-2 text-right">Comisión (€)</th>
                  <th className="py-2.5 px-2 text-center">Score</th>
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

          {/* Table Footer: Summary count */}
          <div className="p-3 border-t border-zinc-800/60 bg-[#09090b] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-400 gap-2">
            <div>
              Mostrando <span className="font-mono text-zinc-200">{filteredTransactions.length}</span> de <span className="font-mono text-zinc-200">{transactions.length}</span> partidas del periodo
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span>Neto Periodo: <strong className="text-zinc-100">{formatEuro(filteredTransactions.reduce((acc, t) => acc + t.netAmountEur, 0))}</strong></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
