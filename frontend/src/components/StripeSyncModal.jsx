/**
 * FICHERO: frontend/src/components/StripeSyncModal.jsx
 * Conexión Directa con Stripe API (RAM Efímera Siempre Activa)
 */
import React, { useState } from 'react';
import { Zap, AlertCircle, X, KeyRound, ArrowRight } from 'lucide-react';

export function StripeSyncModal({
  isOpen,
  onClose,
  onSyncStripe,
}) {
  const [restrictedKey, setRestrictedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const cleanKey = restrictedKey.trim();
    if (!cleanKey.startsWith('rk_') && !cleanKey.startsWith('sk_')) {
      setError('Introduce una clave válida de Stripe (rk_live_... o rk_test_...).');
      return;
    }
    setLoading(true);
    try {
      await onSyncStripe({
        stripeRestrictedKey: cleanKey,
        ephemeralMode: true,
      });
      setRestrictedKey('');
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo conectar con Stripe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#10131a] border border-[#222834] rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-8 w-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Zap className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">Importar desde Stripe API</h3>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1.5">
              Clave Restringida de Lectura (rk_live_... / rk_test_...)
            </label>
            <div className="relative">
              <KeyRound className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={restrictedKey}
                onChange={(e) => setRestrictedKey(e.target.value)}
                placeholder="rk_live_..."
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#161a23] hover:bg-[#1e2430] border border-[#262c3a] text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>{loading ? 'Importando...' : 'Sincronizar'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
