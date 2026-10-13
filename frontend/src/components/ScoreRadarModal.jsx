import React from 'react';
import { X, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Cpu } from 'lucide-react';
import { formatPercent, formatEuro } from '../utils/formatters';

export function ScoreRadarModal({ transaction, onClose, onApprove }) {
  if (!transaction) return null;

  const dims = transaction.dimensions || {
    s_importe: 1.0,
    s_fecha: 0.9,
    s_texto: 0.8,
    s_fiscal: 0.85,
  };

  const getStatusBadge = () => {
    switch (transaction.status) {
      case 'GREEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 font-mono text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            VERDE &bull; Auto-Conciliable (&ge; 95%)
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/40 border border-amber-800/60 text-amber-400 font-mono text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            AMARILLO &bull; Revisión 1-Clic (70% - 94%)
          </span>
        );
      case 'RED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/60 text-rose-400 font-mono text-xs font-medium">
            <HelpCircle className="h-3.5 w-3.5" />
            ROJO &bull; Excepción Crítica (&lt; 70%)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div 
        className="bg-[#121215] border border-zinc-800 rounded-lg max-w-lg w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/80 bg-zinc-950/70">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Desglose Algorítmico &bull; Confidence Scorer
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Main Score Summary */}
          <div className="flex items-center justify-between p-3 rounded-md bg-zinc-900/60 border border-zinc-800/60">
            <div>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                Puntuación Compuesta
              </span>
              <div className="text-2xl font-mono font-bold tracking-tight text-zinc-100 mt-0.5">
                {formatPercent(transaction.confidenceScore)}
              </div>
            </div>
            <div>{getStatusBadge()}</div>
          </div>

          {/* Reference Info */}
          <div className="space-y-1.5 p-3 rounded bg-zinc-950/50 border border-zinc-800/50 font-mono text-[11px]">
            <div className="flex justify-between text-zinc-400">
              <span>ID Transacción:</span>
              <span className="text-zinc-200">{transaction.id}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Importe Banco Neto:</span>
              <span className="text-zinc-100 font-semibold">{formatEuro(transaction.netAmountEur)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Concepto Bancario:</span>
              <span className="text-zinc-200 font-sans text-xs truncate max-w-[260px]" title={transaction.concept}>
                {transaction.concept}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Motor / Solver:</span>
              <span className="text-zinc-300">{transaction.solverUsed}</span>
            </div>
          </div>

          {/* Dimensional Score Breakdown */}
          <div className="space-y-3 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
              Vector de Afinidad Multidimensional
            </span>

            {/* 1. S_importe */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-300 font-medium">1. Importe Mercantil ($S_{`{importe}`}$ &bull; Peso 40%)</span>
                <span className="font-mono text-zinc-100">{formatPercent(dims.s_importe)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                  style={{ width: `${dims.s_importe * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Tolerancia centesimal estricta (&le; 0.02 €) con penalización por holgura de comisiones.
              </p>
            </div>

            {/* 2. S_fecha */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-300 font-medium">2. Ventana Temporal ($S_{`{fecha}`}$ &bull; Peso 20%)</span>
                <span className="font-mono text-zinc-100">{formatPercent(dims.s_fecha)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                  style={{ width: `${dims.s_fecha * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Decaimiento temporal por compensación bancaria (días hábiles y festivos AEB).
              </p>
            </div>

            {/* 3. S_texto */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-300 font-medium">3. Similitud Léxica & Fonética ($S_{`{texto}`}$ &bull; Peso 40%)</span>
                <span className="font-mono text-zinc-100">{formatPercent(dims.s_texto)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                  style={{ width: `${dims.s_texto * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                RapidFuzz Token Set Ratio normalizado + Double Metaphone fonético en castellano.
              </p>
            </div>

            {/* 4. NIF / CIF Modulo 11 */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-zinc-300 font-medium">4. Verificación Fiscal NIF/CIF (Módulo 11 AEAT)</span>
                <span className="font-mono text-zinc-100">{formatPercent(dims.s_fiscal)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-500" 
                  style={{ width: `${dims.s_fiscal * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Checksum oficial de personas jurídicas (Módulo 11) y físicas DNI/NIE (Módulo 23).
              </p>
            </div>
          </div>

          {/* Explanation Text */}
          <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed">
            <div className="font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
              Dictamen de Auditoría:
            </div>
            {transaction.auditExplanation}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/70 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 font-medium transition-colors"
          >
            Cerrar
          </button>

          {transaction.status === 'YELLOW' && onApprove && (
            <button
              onClick={() => {
                onApprove(transaction.id);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-medium text-white transition-colors flex items-center gap-1.5 shadow"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprobar Asiento Contable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
