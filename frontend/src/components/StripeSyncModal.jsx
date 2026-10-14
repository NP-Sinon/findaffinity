/**
 * FICHERO: frontend/src/components/StripeSyncModal.jsx
 * Modal para sincronizar liquidaciones agrupadas (Payouts) directamente desde la API de Stripe
 */
import React, { useState } from 'react';
import { Zap, Lock, ShieldCheck, CheckCircle2, AlertCircle, X, KeyRound, ArrowRight } from 'lucide-react';

export function StripeSyncModal({
  isOpen,
  onClose,
  onSyncStripe,
  selectedCompany,
  selectedYear,
  startMonth,
  endMonth,
}) {
  const [restrictedKey, setRestrictedKey] = useState('');
  const [ephemeralMode, setEphemeralMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const cleanKey = restrictedKey.trim();
    if (!cleanKey.startsWith('rk_') && !cleanKey.startsWith('sk_')) {
      setError('Introduce una clave restringida válida de Stripe (empieza por rk_live_ o rk_test_).');
      return;
    }
    setLoading(true);
    try {
      await onSyncStripe({
        stripeRestrictedKey: cleanKey,
        ephemeralMode,
      });
      setRestrictedKey('');
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar con la API de Stripe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#121215] border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Conectar API de Stripe (100% Determinista)
            </h3>
            <p className="text-[11px] text-zinc-400">
              Extrae transferencias bancarias (<code className="text-indigo-300">/v1/payouts</code>), ventas y comisiones exactas al céntimo
            </p>
          </div>
        </div>

        {/* Tutorial de 3 pasos para crear Restricted Key de Solo Lectura */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3.5 mb-4 text-xs space-y-1.5">
          <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Cómo obtener una Clave de Solo Lectura Segura (30 seg):</span>
          </div>
          <ol className="list-decimal list-inside text-[11px] text-zinc-400 space-y-1 pl-1">
            <li>Entra en tu panel de Stripe: <strong>Desarrolladores &rarr; Claves API</strong>.</li>
            <li>Pulsa en <strong>"Crear clave restringida"</strong> y activa permiso <strong>Read (Lectura)</strong> solo en <em>Balance</em>, <em>Payouts</em> y <em>Charges</em>.</li>
            <li>Pega la clave <code className="text-emerald-300">rk_live_...</code> abajo. Con ella es imposible realizar cargos ni mover fondos.</li>
          </ol>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
              Clave Restringida de Solo Lectura (Stripe API)
            </label>
            <div className="relative">
              <KeyRound className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={restrictedKey}
                onChange={(e) => setRestrictedKey(e.target.value)}
                placeholder="rk_live_51Ox98aK2..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              La clave se usa únicamente en memoria durante esta petición y jamás se guarda en base de datos.
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 cursor-pointer">
            <input
              type="checkbox"
              checked={ephemeralMode}
              onChange={(e) => setEphemeralMode(e.target.checked)}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
            />
            <div className="text-xs">
              <span className="font-semibold text-emerald-300 block">
                Modo Efímero en RAM (Privacidad Zero-Storage)
              </span>
              <span className="text-[11px] text-zinc-400">
                Procesa los cobros en la memoria volátil y destruye los datos al descargar tu fichero contable para {selectedCompany?.name || 'el cliente'}.
              </span>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{loading ? 'Sincronizando Payouts...' : 'Importar y Conciliar desde Stripe'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
