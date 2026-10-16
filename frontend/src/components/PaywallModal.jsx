/**
 * FICHERO: frontend/src/components/PaywallModal.jsx
 * Gestión de Licencias Corporativas y Ampliación de Cuota Mensual
 */
import React, { useState } from 'react';
import { ShieldCheck, Check, Lock, X, CreditCard } from 'lucide-react';

const PLANS = [
  {
    code: 'PYME_DIRECTO',
    name: 'Pyme Directo',
    price: 39,
    subtitle: 'Para departamentos de administración de una única sociedad mercantil',
    maxClients: '1 sociedad',
    maxTx: '2.000 partidas / mes',
    features: [
      'Hasta 2.000 partidas conciliadas al mes',
      '1 sociedad mercantil activa',
      'Importación directa desde API de Stripe',
      'Exportación a Wolters Kluwer A3, Sage 50 y Contasol',
    ],
  },
  {
    code: 'STARTER',
    name: 'Despacho Starter',
    price: 49,
    subtitle: 'Para despachos contables y asesorías con cartera inicial de comercios',
    maxClients: 'Hasta 10 sociedades',
    maxTx: '2.500 partidas / mes',
    features: [
      'Hasta 10 sociedades cliente activas',
      'Hasta 2.500 partidas agregadas al mes',
      'Desglose automático de comisiones (626) y devoluciones',
      'Exportación nativa Suenlace, XDIARIO y Contasol',
    ],
  },
  {
    code: 'PROFESSIONAL',
    name: 'Despacho Profesional',
    price: 119,
    subtitle: 'Para firmas de auditoría y asesorías con alto volumen transaccional',
    maxClients: 'Hasta 30 sociedades',
    maxTx: '12.000 partidas / mes',
    features: [
      'Hasta 30 sociedades cliente activas',
      'Hasta 12.000 partidas agregadas al mes',
      'Certificado de cadena de custodia SHA-256 exportable',
      'Sincronización multi-cuenta con API de Stripe',
    ],
  },
];

export function PaywallModal({
  isOpen,
  onClose,
  usedTransactions = 0,
  freeLimit = 25,
  currentPlan = 'FREE',
  onSelectPlanUpgrade,
}) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan === 'FREE' ? 'STARTER' : currentPlan);
  const [extraBlocks, setExtraBlocks] = useState(0);
  const [processing, setProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirmUpgrade = async () => {
    setProcessing(true);
    try {
      if (onSelectPlanUpgrade) {
        await onSelectPlanUpgrade(selectedPlan, extraBlocks);
      }
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#10131a] border border-[#222834] rounded-lg max-w-4xl w-full overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[#1e232d] bg-[#0d1016] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-white">
                  Licencias de Uso y Capacidad Mensual de Conciliación
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#161a23] border border-[#283040] text-slate-300">
                  Consumo acumulado: {usedTransactions} / {freeLimit} partidas
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                El cómputo mensual registra todas las partidas procesadas en el periodo en curso con independencia de las limpiezas de pantalla.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#161a23] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.code;
            return (
              <div
                key={plan.code}
                onClick={() => setSelectedPlan(plan.code)}
                className={`rounded-md p-5 border cursor-pointer transition-colors flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#141923] border-blue-500'
                    : 'bg-[#0b0d11] border-[#1e232d] hover:border-[#2c3444]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">{plan.name}</h4>
                    {currentPlan === plan.code && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 min-h-[32px]">{plan.subtitle}</p>

                  <div className="my-4 flex items-baseline gap-1 border-y border-[#1e232d] py-3">
                    <span className="text-2xl font-mono font-bold text-white">{plan.price} €</span>
                    <span className="text-xs text-slate-400">/ mes (IVA no incl.)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[#10131a] border border-[#1e232d] mb-4 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Sociedades</span>
                      <strong className="text-slate-200 font-mono">{plan.maxClients}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cuota Mensual</span>
                      <strong className="text-blue-400 font-mono">{plan.maxTx}</strong>
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-slate-300">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-[#1e232d]">
                  <div
                    className={`w-full py-2 rounded text-xs font-semibold text-center transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#161a23] text-slate-300 hover:bg-[#1e2430]'
                    }`}
                  >
                    {isSelected ? 'Modalidad Seleccionada' : 'Seleccionar'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-[#1e232d] bg-[#0d1016] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Facturación mensual por cuota fija sin cargos variables por apunte.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-[#161a23] hover:bg-[#1e2430] border border-[#262c3a] text-xs text-slate-300"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={handleConfirmUpgrade}
              className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              <span>{processing ? 'Actualizando licencia...' : 'Confirmar y Activar Licencia'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
