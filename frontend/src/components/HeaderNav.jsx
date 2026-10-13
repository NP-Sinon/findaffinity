import React from 'react';
import { 
  Building2, 
  Database, 
  Layers,
  ShieldCheck,
  Plus,
  Trash2,
  LogOut,
  User as UserIcon
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
}) {
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';
  const isAdminView = currentView === 'admin';

  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-4">
          
          {/* Lado Izquierdo: Marca, Conmutador y Contexto de Trabajo */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Logo & App Name */}
            <div className="flex items-center gap-2.5 mr-1">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Layers className="h-4 w-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-white font-sans">
                FINDAFINITY
              </span>
            </div>

            {/* Selector de Vistas EXCLUSIVO para SUPERADMIN */}
            {isSuperAdmin && onToggleView && (
              <>
                <div className="hidden sm:block h-5 w-px bg-zinc-800" />
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md p-1">
                  <button
                    type="button"
                    onClick={() => onToggleView('radar')}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      !isAdminView
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Radar Conciliación
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleView('admin')}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isAdminView
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-blue-300'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Licencias & Empresas</span>
                  </button>
                </div>
              </>
            )}

            {/* CONTEXTO DE CONCILIACIÓN: Se oculta completamente cuando estamos en el Panel de Administrador Global */}
            {!isAdminView && (
              <>
                <div className="hidden sm:block h-5 w-px bg-zinc-800" />

                {/* Selector de Empresa Cliente con botones de Añadir (+) y Quitar (-) */}
                <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-md px-2.5 py-1.5">
                  <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  
                  {companies && companies.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-400 leading-none mb-0.5">
                          Empresa Cliente
                        </span>
                        <select
                          value={selectedCompany ? selectedCompany.id : ''}
                          onChange={(e) => {
                            const comp = companies.find(c => c.id === e.target.value);
                            if (comp && onSelectCompany) onSelectCompany(comp);
                          }}
                          className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-2 max-w-[210px] truncate"
                        >
                          {companies.map((c) => (
                            <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                              {c.name} {c.fiscalId ? `(${c.fiscalId})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Botón Añadir Empresa (+) */}
                      {onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          title="Añadir nueva Empresa Cliente"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Botón Quitar Empresa (-) */}
                      {selectedCompany && onOpenDeleteClientModal && (
                        <button
                          type="button"
                          onClick={() => onOpenDeleteClientModal(selectedCompany)}
                          className="p-1 rounded bg-zinc-800 hover:bg-rose-950/80 border border-transparent hover:border-rose-800/60 text-zinc-400 hover:text-rose-400 transition-colors"
                          title={`Eliminar empresa cliente ${selectedCompany.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 italic">
                        Sin empresas cliente
                      </span>
                      {onOpenAddClientModal && (
                        <button
                          type="button"
                          onClick={onOpenAddClientModal}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors shadow-sm"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Añadir Empresa</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Selector ERP Destino */}
                <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 rounded-md px-2.5 py-1.5">
                  <Database className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-400 leading-none mb-0.5">
                      Exportar a
                    </span>
                    <select
                      value={selectedErp}
                      onChange={(e) => onSelectErp && onSelectErp(e.target.value)}
                      className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-2"
                    >
                      <option value="A3" className="bg-zinc-900 text-zinc-200">
                        Wolters Kluwer A3
                      </option>
                      <option value="SAGE" className="bg-zinc-900 text-zinc-200">
                        Sage 50 / Despachos
                      </option>
                      <option value="CONTASOL" className="bg-zinc-900 text-zinc-200">
                        DELSOL Contasol
                      </option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Lado Derecho: Usuario y Salida */}
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2.5 pl-3 border-l border-zinc-800">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-medium text-zinc-200">
                    {currentUser.full_name || currentUser.email}
                  </span>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${
                    isSuperAdmin ? 'text-blue-400 font-bold' : 'text-zinc-400'
                  }`}>
                    {currentUser.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
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
