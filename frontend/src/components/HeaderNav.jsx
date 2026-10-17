/**
 * FICHERO: frontend/src/components/HeaderNav.jsx
 * Barra Superior con Plan Compartido visible para Admin y Gestor
 */
import React from 'react';
import {
  Building2,
  Database,
  ShieldCheck,
  Plus,
  Trash2,
  LogOut,
  CreditCard,
  UserPlus,
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
  onOpenGestorModal,
  subscriptionInfo,
  onOpenPaywall,
}) {
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';
  const isGestor = currentUser?.role === 'GESTOR' || currentUser?.role === 'AUDITOR' || currentUser?.is_gestor;
  const isAdminView = currentView === 'admin';

  const planCode = subscriptionInfo?.plan || currentUser?.plan || 'FREE';
  const usedTx = subscriptionInfo?.current_month_transactions ?? 0;
  const maxTx = subscriptionInfo?.max_monthly_transactions ?? 25;
  const usagePct = Math.min(100, Math.round((usedTx / Math.max(1, maxTx)) * 100));
  const isNearLimit = usagePct >= 80;

  return (
    <header className="border-b border-[#1e232d] bg-[#0f1218] sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between min-h-14 py-2 gap-3">
          {/* Izquierda: Marca y Selector de Empresa */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-xs">
                FA
              </div>
              <span className="font-semibold text-sm tracking-tight text-white">FINDAFINITY</span>
            </div>

            {isSuperAdmin && onToggleView && (
              <div className="flex items-center gap-1 bg-[#0b0d11] border border-[#222834] rounded-lg p-0.5 ml-2">
                <button
                  type="button"
                  onClick={() => onToggleView('radar')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    !isAdminView ? 'bg-[#181c26] text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Mesa de Conciliación
                </button>
                <button
                  type="button"
                  onClick={() => onToggleView('admin')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isAdminView ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Licencias</span>
                </button>
              </div>
            )}

            {!isAdminView && (
              <>
                <div className="hidden sm:block h-4 w-px bg-[#1e232d]" />

                {/* Selector de Empresa Cliente: Gestor ve todas las empresas del Admin, pero sin + ni papelera */}
                <div className="flex items-center gap-2 bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-1.5">
                  <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
                  {companies && companies.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedCompany ? selectedCompany.id : ''}
                        onChange={(e) => {
                          const comp = companies.find((c) => c.id === e.target.value);
                          if (comp && onSelectCompany) onSelectCompany(comp);
                        }}
                        className="bg-transparent text-xs text-slate-100 font-medium focus:outline-none cursor-pointer pr-2 max-w-[240px] truncate"
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#10131a] text-slate-200">
                            {c.name} {c.fiscalId ? `— ${c.fiscalId}` : ''}
                          </option>
                        ))}
                      </select>

                      {!isGestor && onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="p-1 rounded bg-[#161a23] hover:bg-[#1f2532] text-slate-300 hover:text-white border border-[#262c3a] transition-colors"
                          title="Añadir nueva empresa"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {!isGestor && selectedCompany && onOpenDeleteClientModal && (
                        <button
                          type="button"
                          onClick={() => onOpenDeleteClientModal(selectedCompany)}
                          className="p-1 rounded bg-[#161a23] hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-[#262c3a] transition-colors"
                          title={`Eliminar empresa ${selectedCompany.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Sin empresas</span>
                      {!isGestor && onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Nueva Empresa</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Selector ERP */}
                <div className="flex items-center gap-2 bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-1.5">
                  <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-400">ERP:</span>
                  <select
                    value={selectedErp}
                    onChange={(e) => onSelectErp && onSelectErp(e.target.value)}
                    className="bg-transparent text-xs text-slate-100 font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="A3" className="bg-[#10131a] text-slate-200">
                      Wolters Kluwer A3
                    </option>
                    <option value="SAGE" className="bg-[#10131a] text-slate-200">
                      Sage 50
                    </option>
                    <option value="CONTASOL" className="bg-[#10131a] text-slate-200">
                      DELSOL Contasol
                    </option>
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Derecha: Crear Gestor (solo Admin), Plan vinculado (visible para ambos) y Usuario */}
          <div className="flex items-center gap-2.5">
            {!isAdminView && !isGestor && onOpenGestorModal && (
              <button
                type="button"
                onClick={onOpenGestorModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-xs font-medium text-blue-300 transition-colors cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5 text-blue-400" />
                <span>Crear Cuenta Gestor</span>
              </button>
            )}

            {!isAdminView && (
              <button
                type="button"
                onClick={() => {
                  if (!isGestor && onOpenPaywall) onOpenPaywall();
                }}
                className={`flex items-center gap-2.5 px-3 py-1 rounded-lg bg-[#0b0d11] border border-[#222834] text-xs transition-colors ${
                  !isGestor ? 'hover:bg-[#161a23] cursor-pointer' : 'cursor-default'
                }`}
                title={isGestor ? 'Plan compartido del despacho' : 'Gestionar licencia y capacidad'}
              >
                <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-200">
                      {planCode === 'FREE' ? 'Plan Evaluación' : `Plan ${planCode}`}
                    </span>
                    <span className={`font-mono text-[11px] font-semibold ${isNearLimit ? 'text-amber-400' : 'text-slate-300'}`}>
                      {usedTx} / {maxTx}
                    </span>
                  </div>
                  <div className="w-24 h-1 bg-[#1e232d] rounded-full overflow-hidden mt-0.5">
                    <div
                      className={`h-full transition-all ${
                        usagePct >= 100 ? 'bg-rose-500' : isNearLimit ? 'bg-amber-400' : 'bg-blue-500'
                      }`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                </div>
              </button>
            )}

            {currentUser && (
              <div className="flex items-center gap-2.5 pl-2.5 border-l border-[#1e232d]">
                <div className="hidden sm:flex flex-col text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-medium text-slate-200 leading-tight">
                      {currentUser.full_name || currentUser.email}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        isGestor
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                          : 'bg-blue-950/60 text-blue-300 border border-blue-800/60'
                      }`}
                    >
                      {isGestor ? 'GESTOR' : 'ADMIN'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {currentUser.company_name || 'Despacho Contable'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#161a23] transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
