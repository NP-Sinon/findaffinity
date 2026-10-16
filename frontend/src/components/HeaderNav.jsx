/**
 * FICHERO: frontend/src/components/HeaderNav.jsx
 * Cabecera ejecutiva de baja altura para software contable B2B
 */
import React from 'react';
import {
  Building2,
  Plus,
  Trash2,
  LogOut,
  FileCheck2,
} from 'lucide-react';

export function HeaderNav({
  companies = [],
  selectedCompany = null,
  onSelectCompany,
  selectedErp = 'A3',
  onSelectErp,
  currentUser,
  onLogout,
  currentView = 'radar',
  onToggleView,
  onOpenAddClientModal,
  onOpenDeleteClientModal,
  subscriptionInfo,
  onOpenPaywall,
  onOpenAuditModal,
}) {
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';
  const isAdminView = currentView === 'admin';

  const planCode = subscriptionInfo?.plan || currentUser?.plan || 'FREE';
  const usedTx = subscriptionInfo?.current_month_transactions ?? 0;
  const maxTx = subscriptionInfo?.max_monthly_transactions ?? 25;
  const usagePct = Math.min(100, Math.round((usedTx / Math.max(1, maxTx)) * 100));

  return (
    <header className="border-b border-[#1e222a] bg-[#0d0f14] sticky top-0 z-40">
      <div className="max-w-[1640px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
        {/* Izquierda: Marca + Selector de Sociedad + Selector ERP */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-5 w-5 rounded-xs bg-slate-100 text-[#090a0d] flex items-center justify-center font-mono font-bold text-[11px] tracking-tighter">
              FA
            </div>
            <span className="font-semibold text-xs tracking-wider uppercase text-slate-200">
              Findafinity
            </span>
          </div>

          {isSuperAdmin && onToggleView && (
            <div className="flex items-center bg-[#090a0d] border border-[#1e222a] rounded p-0.5 ml-1">
              <button
                type="button"
                onClick={() => onToggleView('radar')}
                className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition-colors ${
                  !isAdminView ? 'bg-[#1a1e26] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Diario de Conciliación
              </button>
              <button
                type="button"
                onClick={() => onToggleView('admin')}
                className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition-colors ${
                  isAdminView ? 'bg-[#1a1e26] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Licencias
              </button>
            </div>
          )}

          {!isAdminView && (
            <>
              <span className="text-[#2a303c] select-none">/</span>

              {/* Selector de Sociedad */}
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                {companies && companies.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedCompany ? selectedCompany.id : ''}
                      onChange={(e) => {
                        const comp = companies.find((c) => c.id === e.target.value);
                        if (comp && onSelectCompany) onSelectCompany(comp);
                      }}
                      className="bg-[#111318] hover:bg-[#161920] border border-[#1e222a] rounded px-2.5 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-slate-600 cursor-pointer max-w-[260px] truncate"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#111318] text-slate-200">
                          {c.name} {c.fiscalId ? `(${c.fiscalId})` : ''}
                        </option>
                      ))}
                    </select>

                    {onOpenAddClientModal && (
                      <button
                        type="button"
                        onClick={onOpenAddClientModal}
                        className="p-1 rounded hover:bg-[#1a1e26] text-slate-400 hover:text-slate-200 transition-colors"
                        title="Nueva sociedad"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {selectedCompany && onOpenDeleteClientModal && (
                      <button
                        type="button"
                        onClick={() => onOpenDeleteClientModal(selectedCompany)}
                        className="p-1 rounded hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 transition-colors"
                        title={`Eliminar ${selectedCompany.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenAddClientModal}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-white text-slate-950 text-[11px] font-medium transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Alta Sociedad</span>
                  </button>
                )}
              </div>

              {/* Selector de Destino Contable */}
              <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-[#1e222a]">
                <span className="text-[11px] text-slate-500">Formato ERP:</span>
                <select
                  value={selectedErp}
                  onChange={(e) => onSelectErp && onSelectErp(e.target.value)}
                  className="bg-[#111318] border border-[#1e222a] rounded px-2 py-1 text-xs text-slate-300 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="A3">Wolters Kluwer A3</option>
                  <option value="SAGE">Sage 50</option>
                  <option value="CONTASOL">DELSOL Contasol</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Derecha: Cuota, Trazabilidad y Usuario */}
        <div className="flex items-center gap-3 shrink-0">
          {!isAdminView && onOpenPaywall && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#111318] hover:bg-[#161920] border border-[#1e222a] text-[11px] transition-colors"
              title="Capacidad mensual del despacho"
            >
              <span className="text-slate-400">{planCode}</span>
              <span className="text-[#2a303c]">|</span>
              <span className="font-mono text-slate-200">
                {usedTx}/{maxTx}
              </span>
              <div className="w-12 h-1 bg-[#1e222a] rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    usagePct >= 100 ? 'bg-rose-500' : usagePct >= 80 ? 'bg-amber-400' : 'bg-slate-300'
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </button>
          )}

          {!isAdminView && onOpenAuditModal && (
            <button
              type="button"
              onClick={onOpenAuditModal}
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111318] hover:bg-[#161920] border border-[#1e222a] text-[11px] text-slate-300 transition-colors"
            >
              <FileCheck2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Trazabilidad SHA-256</span>
            </button>
          )}

          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-[#1e222a]">
              <span className="hidden sm:inline text-xs text-slate-400 truncate max-w-[160px]">
                {currentUser.full_name || currentUser.email}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-[#161920] transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
