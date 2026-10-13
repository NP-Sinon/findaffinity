import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  AlertOctagon, 
  Layers, 
  ArrowRightLeft, 
  CreditCard,
  Check,
  BarChart2,
  Lock,
  Trash2
} from 'lucide-react';
import { DoubleEntryViewer } from './DoubleEntryViewer';
import { formatEuro, formatEuroNoSymbol, formatDateSpanish, formatPercent } from '../utils/formatters';

export function TransactionRow({
  transaction,
  isExpanded,
  onToggleExpand,
  onOpenScoreModal,
  onApprove,
  onDelete,
}) {
  const [approving, setApproving] = useState(false);

  const handleQuickApprove = (e) => {
    e.stopPropagation();
    setApproving(true);
    setTimeout(() => {
      onApprove(transaction.id);
      setApproving(false);
    }, 250);
  };

  const getStatusBadge = () => {
    switch (transaction.status) {
      case 'GREEN':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenScoreModal(transaction);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 hover:bg-emerald-900/40 transition-colors"
            title="Ver radar dimensional de coincidencia"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>{formatPercent(transaction.confidenceScore)}</span>
          </button>
        );
      case 'YELLOW':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenScoreModal(transaction);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/40 border border-amber-800/50 text-amber-400 hover:bg-amber-900/40 transition-colors"
            title="Revisión requerida - Clic para ver desglose"
          >
            <AlertCircle className="h-3 w-3" />
            <span>{formatPercent(transaction.confidenceScore)}</span>
          </button>
        );
      case 'RED':
      default:
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenScoreModal(transaction);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-950/40 border border-rose-800/50 text-rose-400 hover:bg-rose-900/40 transition-colors"
            title="Excepción de auditoría - Clic para ver desglose"
          >
            <AlertOctagon className="h-3 w-3" />
            <span>{formatPercent(transaction.confidenceScore)}</span>
          </button>
        );
    }
  };

  const getTypeIcon = () => {
    if (transaction.type === 'BATCH_PAYOUT') {
      return <Layers className="h-3.5 w-3.5 text-zinc-400" title="Liquidación agrupada (Batch Payout)" />;
    }
    if (transaction.type === 'TRANSFER') {
      return <ArrowRightLeft className="h-3.5 w-3.5 text-zinc-400" title="Transferencia bancaria directa" />;
    }
    return <CreditCard className="h-3.5 w-3.5 text-zinc-400" title="Excepción / Movimiento no conciliado" />;
  };

  return (
    <>
      <tr 
        onClick={onToggleExpand}
        className={`group border-b border-zinc-800/60 hover:bg-zinc-900/40 cursor-pointer transition-colors text-xs ${
          isExpanded ? 'bg-zinc-900/60' : ''
        }`}
      >
        {/* Expand Toggle */}
        <td className="py-2.5 px-2 text-center text-zinc-400">
          <button 
            type="button"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-300" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-300" />
            )}
          </button>
        </td>

        {/* Source & Type */}
        <td className="py-2.5 px-2">
          <div className="flex items-center gap-1.5">
            {getTypeIcon()}
            <div>
              <div className="font-mono text-[11px] font-semibold text-zinc-200">
                {transaction.id}
              </div>
              <div className="text-[10px] text-zinc-400 truncate max-w-[130px]" title={transaction.source}>
                {transaction.source}
              </div>
            </div>
          </div>
        </td>

        {/* Operation & Value Date */}
        <td className="py-2.5 px-2 font-mono text-[11px] text-zinc-300 whitespace-nowrap">
          <div>{formatDateSpanish(transaction.date)}</div>
          <div className="text-[10px] text-zinc-400">V: {formatDateSpanish(transaction.valueDate)}</div>
        </td>

        {/* Bank Concept & Match Note */}
        <td className="py-2.5 px-2 max-w-[280px]">
          <div className="text-zinc-200 font-sans text-xs truncate" title={transaction.concept}>
            {transaction.concept}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
            {transaction.solverUsed}
          </div>
        </td>

        {/* Net Bank Amount */}
        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
          <span className="text-zinc-100 font-semibold text-xs">
            {formatEuroNoSymbol(transaction.netAmountEur)} €
          </span>
          <div className="text-[10px] text-zinc-400">
            {transaction.bankAccountCode}
          </div>
        </td>

        {/* Gross Invoices Amount */}
        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
          <span className="text-zinc-300 text-xs">
            {formatEuroNoSymbol(transaction.grossAmountEur)} €
          </span>
          <div className="text-[10px] text-zinc-400">
            {transaction.matchedCount} {transaction.matchedCount === 1 ? 'partida' : 'partidas'}
          </div>
        </td>

        {/* Fees Amount */}
        <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
          {transaction.feeAmountEur > 0 ? (
            <span className="text-amber-400 text-xs font-medium">
              -{formatEuroNoSymbol(transaction.feeAmountEur)} €
            </span>
          ) : (
            <span className="text-zinc-400 text-xs">0,00 €</span>
          )}
          <div className="text-[10px] text-zinc-400">
            {transaction.feeAmountEur > 0 ? 'Cuenta 626' : '—'}
          </div>
        </td>

        {/* Confidence Score Badge */}
        <td className="py-2.5 px-2 text-center whitespace-nowrap">
          {getStatusBadge()}
        </td>

        {/* Action Button */}
        <td className="py-2.5 px-2 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            {transaction.status === 'YELLOW' ? (
              <button
                type="button"
                onClick={handleQuickApprove}
                disabled={approving}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/90 hover:bg-emerald-600 active:bg-emerald-700 text-white font-medium text-[11px] transition-colors shadow-sm"
                title="Aprobar asiento contable y certificar conciliación"
              >
                <Check className="h-3 w-3" />
                <span>Aprobar Asiento</span>
              </button>
            ) : transaction.status === 'GREEN' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" />
                <span>Conciliado</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenScoreModal(transaction);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 text-[10px] transition-colors"
              >
                <span>Inspeccionar</span>
              </button>
            )}

            {/* Botón para Eliminar Partida */}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(transaction.id);
                }}
                className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                title="Eliminar partida"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded Double-Entry Section */}
      {isExpanded && (
        <tr className="bg-zinc-950/80 border-b border-zinc-800/80">
          <td colSpan={9} className="p-3 pl-8">
            <DoubleEntryViewer 
              journal={transaction.journal} 
              transactionId={transaction.id}
            />
          </td>
        </tr>
      )}
    </>
  );
}
