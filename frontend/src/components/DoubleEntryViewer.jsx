/**
 * FICHERO: frontend/src/components/DoubleEntryViewer.jsx
 */
import React from 'react';
import { formatEuro, formatEuroNoSymbol } from '../utils/formatters';

export function DoubleEntryViewer({ journal }) {
  if (!journal || !journal.lines || journal.lines.length === 0) {
    return (
      <div className="p-3 text-xs text-slate-500 bg-[#111318] rounded border border-[#1e222a]">
        Pre-asiento contable no disponible para esta partida.
      </div>
    );
  }

  const totalDebit = journal.lines.reduce((sum, line) => sum + (Number(line.debitEur) || 0), 0);
  const totalCredit = journal.lines.reduce((sum, line) => sum + (Number(line.creditEur) || 0), 0);
  const imbalance = Math.abs(totalDebit - totalCredit);
  const isPerfectSquare = imbalance < 0.005;

  return (
    <div className="bg-[#111318] border border-[#1e222a] rounded p-3 text-xs">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e222a]">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">
            Asiento #{String(journal.entryNumber || 1).padStart(4, '0')}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Fecha: {journal.date}
          </span>
        </div>

        <span
          className={`font-mono text-[11px] ${
            isPerfectSquare ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isPerfectSquare ? 'Descuadre: 0,00 €' : `Descuadre: ${formatEuro(imbalance)}`}
        </span>
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#1e222a] text-[10px] text-slate-500 uppercase tracking-wider">
            <th className="py-1 px-2">Subcuenta</th>
            <th className="py-1 px-2">Concepto Diario</th>
            <th className="py-1 px-2">Documento</th>
            <th className="py-1 px-2 text-right">Debe</th>
            <th className="py-1 px-2 text-right">Haber</th>
            <th className="py-1 px-2 text-right">Contrapartida</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#181b22] font-mono text-[11px]">
          {journal.lines.map((line, idx) => {
            const code = String(line.accountCode || '');
            return (
              <tr key={idx}>
                <td className="py-1.5 px-2 font-medium text-slate-200">{code}</td>
                <td className="py-1.5 px-2 font-sans text-slate-300">{line.concept}</td>
                <td className="py-1.5 px-2 text-slate-400">{line.documentNumber || '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-200">
                  {Number(line.debitEur) > 0 ? formatEuroNoSymbol(line.debitEur) : '—'}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-200">
                  {Number(line.creditEur) > 0 ? formatEuroNoSymbol(line.creditEur) : '—'}
                </td>
                <td className="py-1.5 px-2 text-right text-slate-500">
                  {line.contrapartida || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#2a303c] font-mono font-semibold text-[11px] text-slate-200">
            <td colSpan={3} className="py-1.5 px-2 text-right text-slate-400 font-sans">
              Total Asiento:
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums">
              {formatEuroNoSymbol(totalDebit)} €
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums">
              {formatEuroNoSymbol(totalCredit)} €
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
