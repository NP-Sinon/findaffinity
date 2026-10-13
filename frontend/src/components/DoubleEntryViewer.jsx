import React from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight, BookOpen } from 'lucide-react';
import { formatEuro, formatEuroNoSymbol } from '../utils/formatters';

export function DoubleEntryViewer({ journal, transactionId }) {
  if (!journal || !journal.lines || journal.lines.length === 0) {
    return (
      <div className="p-3 text-xs text-zinc-400 bg-zinc-950/60 rounded border border-zinc-800">
        No se ha generado pre-asiento para esta partida aún.
      </div>
    );
  }

  const totalDebit = journal.lines.reduce((sum, line) => sum + (Number(line.debitEur) || 0), 0);
  const totalCredit = journal.lines.reduce((sum, line) => sum + (Number(line.creditEur) || 0), 0);
  const imbalance = Math.abs(totalDebit - totalCredit);
  const isPerfectSquare = imbalance < 0.005;

  return (
    <div className="bg-[#0e0e11] border border-zinc-800/90 rounded-md p-3.5 my-2 text-xs shadow-inner">
      {/* Header of Entry */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-2.5 border-b border-zinc-800/60 gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
          <span className="font-semibold text-zinc-200">
            Pre-Asiento de Partida Doble PGC
          </span>
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/40">
            Asiento #{String(journal.entryNumber || 1).padStart(4, '0')} &bull; Fecha: {journal.date}
          </span>
        </div>

        {/* Verification Checksum */}
        <div className="flex items-center gap-2 text-[11px]">
          {isPerfectSquare ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Cuadre PGC: 0,00 €
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              Descuadre detectado: {formatEuro(imbalance)}
            </span>
          )}
        </div>
      </div>

      {/* Accounting Lines Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800/70 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
              <th className="py-1.5 px-2">Subcuenta</th>
              <th className="py-1.5 px-2">Concepto Contable Oficial</th>
              <th className="py-1.5 px-2 text-right">Debe (€)</th>
              <th className="py-1.5 px-2 text-right">Haber (€)</th>
              <th className="py-1.5 px-2 text-center">Contrapartida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 font-mono text-[11px]">
            {journal.lines.map((line, idx) => {
              const isDebit = Number(line.debitEur) > 0;
              const isFee = line.accountCode.startsWith('626') || line.accountCode.startsWith('669');
              const isBank = line.accountCode.startsWith('572');
              const isCustomer = line.accountCode.startsWith('430');

              return (
                <tr 
                  key={idx}
                  className="hover:bg-zinc-900/40 transition-colors"
                >
                  {/* Account Code */}
                  <td className="py-1.5 px-2 font-medium">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                      isBank ? 'bg-blue-950/40 text-blue-300 border border-blue-900/50' :
                      isFee ? 'bg-amber-950/40 text-amber-300 border border-amber-900/50' :
                      isCustomer ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50' :
                      'bg-zinc-800 text-zinc-300'
                    }`}>
                      {line.accountCode}
                    </span>
                  </td>

                  {/* Concept */}
                  <td className="py-1.5 px-2 text-zinc-300 font-sans text-xs">
                    {line.concept}
                  </td>

                  {/* Debit */}
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {Number(line.debitEur) > 0 ? (
                      <span className="text-zinc-100 font-semibold">
                        {formatEuroNoSymbol(line.debitEur)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">0,00</span>
                    )}
                  </td>

                  {/* Credit */}
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {Number(line.creditEur) > 0 ? (
                      <span className="text-zinc-100 font-semibold">
                        {formatEuroNoSymbol(line.creditEur)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">0,00</span>
                    )}
                  </td>

                  {/* Contrapartida */}
                  <td className="py-1.5 px-2 text-center text-zinc-400 text-[10px]">
                    {line.contrapartida || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Table Footer: Sum Totals */}
          <tfoot>
            <tr className="border-t border-zinc-700/80 bg-zinc-950/80 font-mono font-semibold text-[11px]">
              <td colSpan={2} className="py-2 px-2 text-right uppercase tracking-wider text-[10px] text-zinc-400 font-sans">
                Totales de Control Contable:
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-100">
                {formatEuroNoSymbol(totalDebit)} €
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-100">
                {formatEuroNoSymbol(totalCredit)} €
              </td>
              <td className="py-2 px-2 text-center">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  isPerfectSquare ? 'text-emerald-400 bg-emerald-950/40' : 'text-rose-400 bg-rose-950/40'
                }`}>
                  Δ {imbalance.toFixed(2)} €
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
