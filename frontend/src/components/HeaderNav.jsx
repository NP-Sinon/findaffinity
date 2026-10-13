import React from 'react';
import { 
  Building2, 
  Database, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  Activity, 
  ArrowRightLeft,
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
}) {
  return (
    <header className="border-b border-zinc-800/80 bg-[#0c0c0e] sticky top-0 z-40 backdrop-blur-md">
      {/* Top Bar: Multi-Tenancy & Security Notice */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-2.5 border-b border-zinc-800/40 gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-zinc-900 border border-zinc-700/70 flex items-center justify-center text-zinc-200">
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs tracking-wider text-zinc-100 uppercase">
                  KÖNIG STAGING RADAR
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/40 font-mono">
                  v1.4 PGC
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Despacho Auditor &bull; Reconciliación & Desambiguación B2B2B
              </p>
            </div>
          </div>

          {/* Staging Zero-Liability Badge & Backend Status */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px]">
              <Lock className="h-3 w-3 text-zinc-400" />
              <span className="font-medium text-zinc-300">Staging Area:</span>
              <span className="text-zinc-400">Solo Lectura (Zero-Liability)</span>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] ${
              backendStatus.online 
                ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' 
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-400'
            }`}>
              <Server className={`h-3 w-3 ${backendStatus.online ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span className="font-mono text-[10px]">
                {backendStatus.online ? 'FastAPI Online (127.0.0.1:8000)' : 'Autómata Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Second Row: Accounting Context Selector & Live Financial Metrics */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-3 gap-4">
          {/* Multi-Tenancy & Target ERP Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Empresa Cliente Selector */}
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800/90 rounded-md px-2.5 py-1.5">
              <Building2 className="h-3.5 w-3.5 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-zinc-400">
                  Empresa Contable
                </span>
                <select
                  value={selectedCompany.id}
                  onChange={(e) => {
                    const c = companies.find((item) => item.id === e.target.value);
                    if (c) onSelectCompany(c);
                  }}
                  className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-4"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                      {c.name} ({c.fiscalId})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target ERP Selector */}
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800/90 rounded-md px-2.5 py-1.5">
              <Database className="h-3.5 w-3.5 text-zinc-400" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-zinc-400">
                  ERP Destino
                </span>
                <select
                  value={selectedErp}
                  onChange={(e) => onSelectErp(e.target.value)}
                  className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer pr-4"
                >
                  <option value="A3" className="bg-zinc-900 text-zinc-200">
                    Wolters Kluwer A3 (Suenlace)
                  </option>
                  <option value="SAGE" className="bg-zinc-900 text-zinc-200">
                    Sage 50 / Despachos (XDIARIO)
                  </option>
                  <option value="CONTASOL" className="bg-zinc-900 text-zinc-200">
                    DELSOL Contasol (XLSX)
                  </option>
                </select>
              </div>
            </div>

            {/* Ejercicio Fiscal Badge */}
            <div className="hidden sm:flex items-center px-2 py-1.5 rounded bg-zinc-900/50 border border-zinc-800/60 text-zinc-400 text-xs font-mono">
              Año: {selectedCompany.fiscalYear}
            </div>
          </div>

          {/* Real-time Balance Indicators */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
            {/* Volumen Liquidado */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-md px-3 py-1.5 min-w-[130px]">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                Volumen Liquidado
              </div>
              <div className="font-mono tabular-nums text-xs font-semibold text-zinc-100">
                {formatEuro(metrics.totalNetVolumeEur)}
              </div>
            </div>

            {/* Porcentaje Conciliado */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-md px-3 py-1.5 min-w-[110px]">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                % Conciliado
              </div>
              <div className="font-mono tabular-nums text-xs font-semibold text-emerald-400">
                {formatPercent(metrics.reconciliationRate)}
              </div>
            </div>

            {/* Indicador Crítico: Descuadre 0.00 € */}
            <div className={`rounded-md px-3.5 py-1.5 min-w-[150px] border flex items-center justify-between ${
              metrics.globalImbalanceEur === 0
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
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
          </div>
        </div>
      </div>
    </header>
  );
}
