import React from 'react';
import { 
  Building2, 
  Database, 
  CheckCircle2, 
  Layers,
  ShieldCheck,
  Server
} from 'lucide-react';
import { formatEuro, formatPercent } from '../utils/formatters';

export function HeaderNav({
  companies,
  selectedCompany,
  onSelectCompany,
  selectedErp,
  onSelectErp,
  metrics,
  backendStatus,
  onOpenAuditModal,
}) {
  return (
    <header className="border-b border-zinc-800 bg-[#0c0c0e] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-3 gap-4">
          
          {/* Brand Identity & Context Selectors */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Logo & App Name */}
            <div className="flex items-center gap-2.5 mr-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Layers className="h-4 w-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-white font-sans">
                FINDAFINITY
              </span>
            </div>

            {/* Separador sutil */}
            <div className="hidden sm:block h-6 w-px bg-zinc-800" />

            {/* Empresa Selector */}
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 rounded-md px-3 py-1.5">
              <Building2 className="h-3.5 w-3.5 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-zinc-400">
                  Empresa
                </span>
                <select
                  value={selectedCompany ? selectedCompany.id : ''}
                  onChange={(e) => {
                    const c = companies.find((item) => item.id === e.target.value);
                    if (c) onSelectCompany(c);
                  }}
                  className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-3"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ERP Destino Selector */}
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 rounded-md px-3 py-1.5">
              <Database className="h-3.5 w-3.5 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-zinc-400">
                  Exportar a
                </span>
                <select
                  value={selectedErp}
                  onChange={(e) => onSelectErp(e.target.value)}
                  className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-3"
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
          </div>

          {/* Real-time Financial Balance Indicators & Action Buttons */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
            {/* Total Procesado */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3.5 py-1.5 min-w-[130px]">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                Total Procesado
              </div>
              <div className="font-mono tabular-nums text-xs font-semibold text-zinc-100">
                {formatEuro(metrics.totalNetVolumeEur)}
              </div>
            </div>

            {/* Porcentaje Conciliado */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3.5 py-1.5 min-w-[110px]">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                Conciliado
              </div>
              <div className="font-mono tabular-nums text-xs font-semibold text-emerald-400">
                {formatPercent(metrics.reconciliationRate)}
              </div>
            </div>

            {/* Cuadre a Cero */}
            <div className={`rounded-md px-3.5 py-1.5 min-w-[140px] border flex items-center justify-between ${
              metrics.globalImbalanceEur === 0
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
            }`}>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Cuadre Contable
                </div>
                <div className="font-mono tabular-nums text-xs font-bold text-zinc-100">
                  Descuadre: {formatEuro(metrics.globalImbalanceEur)}
                </div>
              </div>
            </div>

            {/* Botón Auditoría SHA-256 */}
            <button
              type="button"
              onClick={onOpenAuditModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-emerald-400 transition-colors cursor-pointer shadow-sm"
              title="Ver Certificado Legal de Auditoría con Cadena de Custodia SHA-256"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="hidden sm:inline">Auditoría SHA-256</span>
            </button>

            {/* Backend Connectivity Status Dot */}
            <div 
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono border ${
                backendStatus && backendStatus.online 
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
              title={backendStatus && backendStatus.online ? 'Conectado a FastAPI en 127.0.0.1:8000' : 'Modo Autónomo Local'}
            >
              <span className={`h-2 w-2 rounded-full ${backendStatus && backendStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              <span className="hidden md:inline">{backendStatus && backendStatus.online ? 'En Línea' : 'Local'}</span>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}
