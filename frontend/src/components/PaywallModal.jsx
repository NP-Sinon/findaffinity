/**
 * FICHERO: frontend/src/components/PaywallModal.jsx
 * Modal de Paywall Freemium (Límite de 25 facturas/transacciones gratis alcanzado)
 */
import React, { useState } from 'react';
import { ShieldCheck, Check, Sparkles, Lock, X, CreditCard, Building2, Zap } from 'lucide-react';

const PLANS = [
  {
    code: 'PYME_DIRECTO',
    name: 'Pyme Directo',
    price: 39,
    subtitle: 'Ideal para tiendas online y comercios individuales',
    maxClients: '1 empresa',
    maxTx: '2.000 facturas / mes',
    badge: null,
    features: [
      'Hasta 2.000 transacciones conciliadas/mes',
      'Sincronización directa con API de Stripe',
      'Exportación oficial a A3, Sage 50 y Contasol',
      'Modo Efímero RAM (Cero retención de archivos)',
    ],
  },
  {
    code: 'STARTER',
    name: 'Gestoría Starter',
    price: 49,
    subtitle: 'Para despachos pequeños con clientes e-commerce y TPV',
    maxClients: 'Hasta 10 empresas',
    maxTx: '2.500 facturas / mes',
    badge: 'POPULAR DESPACHOS',
    features: [
      'Hasta 10 empresas cliente activas',
      'Hasta 2.500 transacciones agregadas/mes',
      'Descomposición algorítmica de Stripe y Redsys',
      'Exportación 1-Clic (Suenlace, XDIARIO, Contasol)',
    ],
  },
  {
    code: 'PROFESSIONAL',
    name: 'Gestoría Professional',
    price: 119,
    subtitle: 'Para asesorías con alto volumen transaccional y auditoría',
    maxClients: 'Hasta 30 empresas',
    maxTx: '12.000 facturas / mes',
    badge: 'MÁXIMO RETORNO (ROI 30x)',
    features: [
      'Hasta 30 empresas cliente activas',
      'Hasta 12.000 transacciones agregadas/mes',
      'Certificado Legal de Auditoría SHA-256 para AEAT',
      'Sincronización API Stripe multi-empresa',
    ],
  },
];

export function PaywallModal({
  isOpen,
  onClose,
  usedTransactions = 25,
  freeLimit = 25,
  currentPlan = 'FREE',
  onSelectPlanUpgrade,
}) {
  const [selectedPlan, setSelectedPlan] = useState('STARTER');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#101013] border border-zinc-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl">
        {/* Cabecera */}
        <div className="px-6 py-5 border-b border-zinc-800 bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-blue-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Desbloquea la Exportación Ilimitada a tu ERP
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300">
                  {usedTransactions} / {freeLimit} Facturas Gratis Usadas
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Con solo 24 transacciones complejas al mes ya recuperas más de 1,5 horas de punteo manual. Elige una tarifa plana predecible sin cobros variables sorpresa.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tarjetas de Planes */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.code;
            return (
              <div
                key={plan.code}
                onClick={() => setSelectedPlan(plan.code)}
                className={`relative rounded-xl p-5 border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-zinc-900/90 border-emerald-500 ring-1 ring-emerald-500/50 shadow-lg'
                    : 'bg-[#0c0c0e] border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-600 text-white shadow">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-zinc-100">{plan.name}</h4>
                    {currentPlan === plan.code && (
                      <span className="text-[10px] font-mono text-emerald-400">Plan Actual</span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 min-h-[32px]">{plan.subtitle}</p>

                  <div className="my-4 flex items-baseline gap-1">
                    <span className="text-3xl font-mono font-bold text-white">{plan.price} €</span>
                    <span className="text-xs text-zinc-400">/ mes (IVA no incl.)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 mb-4 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Capacidad</span>
                      <strong className="text-zinc-200 font-mono">{plan.maxClients}</strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Volumen</span>
                      <strong className="text-emerald-400 font-mono">{plan.maxTx}</strong>
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-zinc-300">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-800/80">
                  <div
                    className={`w-full py-2 rounded-lg text-xs font-semibold text-center transition-colors ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {isSelected ? 'Plan Seleccionado' : 'Seleccionar Plan'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer de Checkout */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/90 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              Pago seguro vía <strong>Stripe Checkout</strong> &bull; Cancela o cambia de tramo en cualquier momento sin permanencia.
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
            >
              Seguir en modo vista previa
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={handleConfirmUpgrade}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              <span>{processing ? 'Activando licencia...' : 'Activar Plan y Desbloquear Exportación'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
