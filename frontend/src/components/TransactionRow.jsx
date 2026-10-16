/**
 * FICHERO: frontend/src/components/TransactionRow.jsx
 */
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Trash2,
} from 'lucide-react';
import { DoubleEntryViewer } from './DoubleEntryViewer';
import { formatEuroNoSymbol, formatDateSpanish, formatPercent } from '../utils/formatters';

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
    }, 150);
  };

  const renderAffinityBadge = () => {
    const dotColor =
      transaction.status === 'GREEN'
        ? 'bg-emerald-400'
        : transaction.status === 'YELLOW'
        ? 'bg-amber-400'
        : 'bg-rose-400';

    const textColor =
      transaction.status === 'GREEN'
        ? 'text-emerald-300'
        : transaction.status === 'YELLOW'
        ? 'text-amber-300'
        : 'text-rose-300';

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenScoreModal(transaction);
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#090a0d] hover:bg-[#1a1e26] border border-[#1e222a] text-[11px] font-mono ${textColor} transition-colors`}
        title="Ver desglose de puntuación"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span>{formatPercent(transaction.confidenceScore)}</span>
      </button>
    );
  };

  const matchedCount = transaction.matchedCount ?? 1;

  return (
    <>
      <tr
        onClick={onToggleExpand}
        className={`group hover:bg-[#161920] cursor-pointer transition-colors text-xs ${
          isExpanded ? 'bg-[#161920]' : ''
        }`}
      >
        <td className="py-2 px-2 text-center text-slate-500">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-300 mx-auto" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 mx-auto" />
          )}
        </td>

        <td className="py-2 px-3">
          <div className="font-mono text-[11px] font-medium text-slate-200">
            {transaction.id}
          </div>
          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
            {transaction.source}
          </div>
        </td>

        <td className="py-2 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
          <div>{formatDateSpanish(transaction.date)}</div>
        </td>

        <td className="py-2 px-3 max-w-[320px]">
          <div className="text-slate-200 text-xs truncate" title={transaction.concept}>
            {transaction.concept}
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">
            {transaction.solverUsed}
          </div>
        </td>

        <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
          <span className="text-slate-100 font-medium">
            {formatEuroNoSymbol(transaction.netAmountEur)} €
          </span>
          <div className="text-[10px] text-slate-500">
            {transaction.bankAccountCode}
          </div>
        </td>

        <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
          <span className="text-slate-300">
            {formatEuroNoSymbol(transaction.grossAmountEur)} €
          </span>
          <div className="text-[10px] text-slate-500">
            {matchedCount} {matchedCount === 1 ? 'fra.' : 'fras.'}
          </div>
        </td>

        <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
          {transaction.feeAmountEur > 0 ? (
            <span className="text-amber-400">
              -{formatEuroNoSymbol(transaction.feeAmountEur)} €
            </span>
          ) : (
            <span className="text-slate-600">0,00 €</span>
          )}
        </td>

        <td className="py-2 px-3 text-center whitespace-nowrap">
          {renderAffinityBadge()}
        </td>

        <td className="py-2 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            {transaction.status === 'YELLOW' ? (
              <button
                type="button"
                onClick={handleQuickApprove}
                disabled={approving}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-[11px] transition-colors"
              >
                <Check className="h-3 w-3" />
                <span>Conformar</span>
              </button>
            ) : transaction.status === 'GREEN' ? (
              <span className="text-[11px] text-slate-400 font-mono">
                Cuadrado
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenScoreModal(transaction);
                }}
                className="px-2 py-0.5 rounded bg-[#090a0d] hover:bg-[#1a1e26] border border-[#2a303c] text-slate-300 text-[11px] transition-colors"
              >
                Revisar 555
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(transaction.id);
                }}
                className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                title="Descartar apunte"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-[#090a0d] border-b border-[#1e222a]">
          <td colSpan={9} className="p-3 pl-10">
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
