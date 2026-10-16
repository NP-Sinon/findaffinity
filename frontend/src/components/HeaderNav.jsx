/**
 * FICHERO: frontend/src/components/HeaderNav.jsx
 * Barra de Comando Superior Corporativa con Medidor Persistente de Cuota
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
  const isNearLimit = usagePct >= 80;

  return (
    <header className="border-b border-[#1e232d] bg-[#0f1218] sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between min-h-13 py-2 gap-3">
          {/* Izquierda: Identidad y Contexto Sociedad / ERP */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-[11px]">
                FA
              </div>
              <span className="font-semibold text-sm tracking-tight text-white">FINDAFINITY</span>
            </div>

            {isSuperAdmin && onToggleView && (
              <div className="flex items-center gap-1 bg-[#0b0d11] border border-[#222834] rounded p-0.5 ml-2">
                <button
                  type="button"
                  onClick={() => onToggleView('radar')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    !isAdminView ? 'bg-[#181c26] text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Mesa de Conciliación
                </button>
                <button
                  type="button"
                  onClick={() => onToggleView('admin')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isAdminView ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Administración de Licencias</span>
                </button>
              </div>
            )}

            {!isAdminView && (
              <>
                <div className="hidden sm:block h-4 w-px bg-[#1e232d]" />

                {/* Selector de Sociedad Cliente */}
                <div className="flex items-center gap-2 bg-[#0b0d11] border border-[#222834] rounded px-2.5 py-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  {companies && companies.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedCompany ? selectedCompany.id : ''}
                        onChange={(e) => {
                          const comp = companies.find((c) => c.id === e.target.value);
                          if (comp && onSelectCompany) onSelectCompany(comp);
                        }}
                        className="bg-transparent text-xs text-slate-100 font-medium focus:outline-none cursor-pointer pr-2 max-w-[220px] truncate"
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#10131a] text-slate-200">
                            {c.name} {c.fiscalId ? `— ${c.fiscalId}` : ''}
                          </option>
                        ))}
                      </select>

                      {onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="p-1 rounded bg-[#161a23] hover:bg-[#1f2532] text-slate-300 hover:text-white border border-[#262c3a] transition-colors"
                          title="Dar de alta nueva sociedad"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}

                      {selectedCompany && onOpenDeleteClientModal && (
                        <button
                          type="button"
                          onClick={() => onOpenDeleteClientModal(selectedCompany)}
                          className="p-1 rounded bg-[#161a23] hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-[#262c3a] transition-colors"
                          title={`Eliminar sociedad ${selectedCompany.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Sin sociedades activas</span>
                      {onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Alta Sociedad</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Selector ERP */}
                <div className="flex items-center gap-2 bg-[#0b0d11] border border-[#222834] rounded px-2.5 py-1">
                  <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] text-slate-400">ERP:</span>
                  <select
                    value={selectedErp}
                    onChange={(e) => onSelectErp && onSelectErp(e.target.value)}
                    className="bg-transparent text-xs text-slate-100 font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="A3" className="bg-[#10131a] text-slate-200">
                      Wolters Kluwer A3 (Suenlace)
                    </option>
                    <option value="SAGE" className="bg-[#10131a] text-slate-200">
                      Sage 50 (XDIARIO)
                    </option>
                    <option value="CONTASOL" className="bg-[#10131a] text-slate-200">
                      DELSOL Contasol (.xlsx)
                    </option>
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Derecha: Cuota Mensual Persistente, Certificado SHA-256 y Usuario */}
          <div className="flex items-center gap-2.5">
            {!isAdminView && onOpenPaywall && (
              <button
                type="button"
                onClick={onOpenPaywall}
                className="flex items-center gap-2.5 px-3 py-1 rounded bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs transition-colors"
                title="Consumo mensual acumulado del plan y ampliación de licencia"
              >
                <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-200">
                      {planCode === 'FREE' ? 'Licencia Evaluación' : `Licencia ${planCode}`}
                    </span>
                    <span className={`font-mono text-[11px] font-semibold ${isNearLimit ? 'text-amber-400' : 'text-slate-300'}`}>
                      {usedTx} / {maxTx} partidas
                    </span>
                  </div>
                  <div className="w-32 h-1 bg-[#1e232d] rounded-full overflow-hidden mt-0.5">
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

            {!isAdminView && onOpenAuditModal && (
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#0b0d11] hover:bg-[#161a23] border border-[#222834] text-xs text-slate-300 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Registro SHA-256</span>
              </button>
            )}

            {currentUser && (
              <div className="flex items-center gap-2.5 pl-2.5 border-l border-[#1e232d]">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-medium text-slate-200 leading-tight">
                    {currentUser.full_name || currentUser.email}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {currentUser.company_name || 'Despacho Contable'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-[#161a23] transition-colors"
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
