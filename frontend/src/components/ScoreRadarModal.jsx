import React from 'react';
import { X, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conciliado Automático
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/40 border border-amber-800/60 text-amber-400 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            Pendiente de Aprobación
          </span>
        );
      case 'RED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/60 text-rose-400 text-xs font-medium">
            <HelpCircle className="h-3.5 w-3.5" />
            Sin Coincidencia
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div 
        className="bg-[#121215] border border-zinc-800 rounded-lg max-w-lg w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
          <h3 className="text-sm font-semibold text-zinc-100">
            Detalle de la Coincidencia
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Main Score Summary */}
          <div className="flex items-center justify-between p-3.5 rounded-md bg-zinc-900 border border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                Nivel de Coincidencia
              </span>
              <div className="text-2xl font-mono font-bold tracking-tight text-zinc-100 mt-0.5">
                {formatPercent(transaction.confidenceScore)}
              </div>
            </div>
            <div>{getStatusBadge()}</div>
          </div>

          {/* Reference Info */}
          <div className="space-y-1.5 p-3 rounded bg-zinc-950/60 border border-zinc-800/60 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Referencia:</span>
              <span className="text-zinc-200 font-mono text-[11px]">{transaction.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Importe Neto:</span>
              <span className="text-zinc-100 font-mono font-semibold">{formatEuro(transaction.netAmountEur)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Concepto:</span>
              <span className="text-zinc-200 truncate max-w-[280px]" title={transaction.concept}>
                {transaction.concept}
              </span>
            </div>
          </div>

          {/* Criterios de Evaluación Claros */}
          <div className="space-y-3 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
              Comprobaciones Realizadas
            </span>

            {/* 1. Importe */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200 font-medium">1. Importe y Comisiones</span>
                <span className="font-mono text-zinc-100 font-semibold">{formatPercent(dims.s_importe)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${dims.s_importe * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                El total ingresado en el banco coincide con la suma de las facturas menos las tarifas aplicadas.
              </p>
            </div>

            {/* 2. Fecha */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200 font-medium">2. Fecha de Operación</span>
                <span className="font-mono text-zinc-100 font-semibold">{formatPercent(dims.s_fecha)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${dims.s_fecha * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                El cobro se ha recibido dentro del plazo habitual de liquidación de la entidad.
              </p>
            </div>

            {/* 3. Cliente y Factura */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200 font-medium">3. Cliente y Documento</span>
                <span className="font-mono text-zinc-100 font-semibold">{formatPercent(dims.s_texto)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${dims.s_texto * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Identificación del nombre del cliente o número de factura en el texto del extracto.
              </p>
            </div>

            {/* 4. CIF / NIF */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-200 font-medium">4. NIF / CIF</span>
                <span className="font-mono text-zinc-100 font-semibold">{formatPercent(dims.s_fiscal)}</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${dims.s_fiscal * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Identificador fiscal comprobado y contrastado con la cartera de clientes.
              </p>
            </div>
          </div>

          {/* Resumen Final */}
          <div className="p-3 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-zinc-100 block mb-0.5">Estado:</span>
            {transaction.status === 'GREEN' && 'La partida está totalmente identificada y cuadrada a céntimo cero. Lista para exportar al ERP.'}
            {transaction.status === 'YELLOW' && 'Existe alta probabilidad de coincidencia pero se recomienda validar con un clic antes de enviar al libro diario.'}
            {transaction.status === 'RED' && 'No se ha encontrado una factura correspondiente o el importe presenta una diferencia significativa. Requiere revisión manual.'}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
          >
            Cerrar
          </button>

          {transaction.status === 'YELLOW' && onApprove && (
            <button
              onClick={() => {
                onApprove(transaction.id);
                onClose();
              }}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprobar Asiento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
