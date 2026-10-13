import React, { useState } from 'react';
import { Building2, X, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';

export function ClientModal({
  isOpen,
  mode = 'add', // 'add' | 'delete'
  company = null,
  onClose,
  onAddClient,
  onDeleteClient,
}) {
  const [name, setName] = useState('');
  const [fiscalId, setFiscalId] = useState('');
  const [defaultErp, setDefaultErp] = useState('A3');
  const [accountLength, setAccountLength] = useState(9);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la empresa es obligatorio.');
      return;
    }
    if (!fiscalId.trim()) {
      setError('El CIF / NIF es obligatorio.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onAddClient({
        name: name.trim(),
        fiscalId: fiscalId.trim().toUpperCase(),
        defaultErp,
        accountLength: parseInt(accountLength, 10) || 9,
      });
      setName('');
      setFiscalId('');
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar la empresa cliente');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      await onDeleteClient(company.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al eliminar la empresa cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#121215] border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {mode === 'add' ? (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Añadir Empresa Cliente
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Nueva sociedad o negocio para gestionar su contabilidad
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  Razón Social / Nombre Comercial
                </label>
                <input
                  type="text"
                  placeholder="ej. Distribuciones Mediterráneo SL"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  NIF / CIF Fiscal
                </label>
                <input
                  type="text"
                  placeholder="ej. B-88776655"
                  value={fiscalId}
                  onChange={(e) => setFiscalId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono uppercase focus:outline-none focus:border-zinc-700"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    ERP Contable
                  </label>
                  <select
                    value={defaultErp}
                    onChange={(e) => setDefaultErp(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="A3">Wolters Kluwer A3</option>
                    <option value="SAGE">Sage 50</option>
                    <option value="CONTASOL">DELSOL Contasol</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    Dígitos Subcuenta
                  </label>
                  <select
                    value={accountLength}
                    onChange={(e) => setAccountLength(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                  >
                    <option value={8}>8 dígitos</option>
                    <option value={9}>9 dígitos</option>
                    <option value={10}>10 dígitos</option>
                    <option value={12}>12 dígitos</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  {loading ? 'Guardando...' : 'Crear Empresa Cliente'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Eliminar Empresa Cliente
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Acción irreversible de supresión contable
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 mb-4">
              <div className="text-xs font-semibold text-zinc-200">
                {company?.name}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                CIF: {company?.fiscalId || '—'} • ERP: {company?.defaultErp || 'A3'}
              </div>
            </div>

            <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
              ¿Estás seguro de que deseas eliminar esta empresa cliente? Se borrarán todos los lotes de conciliación, movimientos y asientos exportables asociados a ella.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={loading}
                className="px-4 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{loading ? 'Eliminando...' : 'Eliminar Empresa'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
