import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  CreditCard, 
  Users, 
  Database, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  RefreshCw, 
  Check, 
  Layers, 
  Sparkles,
  Edit2
} from 'lucide-react';
import { fetchAdminCompanies, fetchPlatformStats, updateCompanyPlanApi } from '../services/api';
import { formatEuro } from '../utils/formatters';

export function AdminPanel({ onNavigateToRadar, currentUser }) {
  if (currentUser?.role !== 'SUPERADMIN') {
    return (
      <div className="bg-[#101013] border border-rose-900/50 rounded-lg p-8 text-center max-w-xl mx-auto my-12 shadow-2xl">
        <ShieldCheck className="h-12 w-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-zinc-100 mb-2">Acceso Exclusivo a Administrador Global</h2>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          El Panel de Licencias & Empresas SaaS está reservado exclusivamente para la cuenta maestra SUPERADMIN de la plataforma. Como usuario de despacho o empresa, su gestión contable se realiza desde el Radar de Conciliación.
        </p>
        <button
          type="button"
          onClick={onNavigateToRadar}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm"
        >
          Volver al Radar de Conciliación
        </button>
      </div>
    );
  }

  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('ALL');
  const [editingCompany, setEditingCompany] = useState(null);
  const [editPlan, setEditPlan] = useState('PROFESSIONAL');
  const [editExtraBlocks, setEditExtraBlocks] = useState(0);
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);
  const [actionErrorMsg, setActionErrorMsg] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [comps, st] = await Promise.all([
        fetchAdminCompanies(),
        fetchPlatformStats(),
      ]);
      setCompanies(comps || []);
      setStats(st);
    } catch (err) {
      console.error('Error cargando datos de administración:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtrado de compañías
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (selectedPlanFilter !== 'ALL' && c.plan !== selectedPlanFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name?.toLowerCase().includes(q);
        const matchesFiscal = c.fiscal_id?.toLowerCase().includes(q);
        const matchesEmail = c.email?.toLowerCase().includes(q);
        return matchesName || matchesFiscal || matchesEmail;
      }
      return true;
    });
  }, [companies, selectedPlanFilter, searchQuery]);

  // Cálculo de MRR agregado
  const totalMrr = useMemo(() => {
    return companies.reduce((acc, c) => acc + (Number(c.monthly_price_eur) || 0), 0);
  }, [companies]);

  const handleOpenEdit = (c) => {
    setEditingCompany(c);
    setEditPlan(c.plan || 'PROFESSIONAL');
    setEditExtraBlocks(c.extra_blocks || 0);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!editingCompany) return;

    const res = await updateCompanyPlanApi(editingCompany.id, editPlan, editExtraBlocks);
    if (res.success) {
      setActionSuccessMsg(`Licencia de ${editingCompany.name} actualizada con éxito a ${editPlan}.`);
      setEditingCompany(null);
      await loadData();
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } else {
      setActionErrorMsg(res.error || 'Error al actualizar la licencia');
    }
  };

  const getPlanBadge = (plan) => {
    switch (plan) {
      case 'PYME_DIRECTO':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">
            Pyme Directo (39 €)
          </span>
        );
      case 'STARTER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950/60 border border-blue-800/60 text-blue-300">
            Gestoría Starter (49 €)
          </span>
        );
      case 'PROFESSIONAL':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
            Gestoría Professional (119 €)
          </span>
        );
      case 'ENTERPRISE':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950/60 border border-purple-800/60 text-purple-300">
            Despacho Enterprise (249 €)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            {plan}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner de Cabecera del Panel ADMIN */}
      <div className="bg-[#101013] border border-zinc-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-base font-semibold text-zinc-100">
              Panel de Control Global & Licencias SaaS
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60 font-mono font-semibold">
              CUENTA ADMIN
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Supervisión integral de todas las compañías y despachos registrados en FINDAFINITY, sus tipos de licencia, cuotas contratadas y actividad.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToRadar}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
          >
            <span>Ir al Radar de Conciliación</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas de Plataforma (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#101013] border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] uppercase tracking-wider font-medium">Compañías Registradas</span>
            <Building2 className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-zinc-100 mt-2">
            {companies.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Despachos y empresas con cuenta activa
          </div>
        </div>

        <div className="bg-[#101013] border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] uppercase tracking-wider font-medium">Facturación Estimada (MRR)</span>
            <CreditCard className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-emerald-400 mt-2">
            {formatEuro(totalMrr)} / mes
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Ingresos recurrentes por suscripciones
          </div>
        </div>

        <div className="bg-[#101013] border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] uppercase tracking-wider font-medium">Total Clientes Gestionados</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-zinc-100 mt-2">
            {companies.reduce((acc, c) => acc + (c.clients_count || 0), 0)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Empresas auditadas bajo los despachos
          </div>
        </div>

        <div className="bg-[#101013] border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] uppercase tracking-wider font-medium">Lotes Conciliados</span>
            <Database className="h-4 w-4 text-purple-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-zinc-100 mt-2">
            {companies.reduce((acc, c) => acc + (c.batches_count || 0), 0)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Lotes procesados con cuadre exacto
          </div>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Contenedor de Tabla de Compañías Registradas */}
      <div className="bg-[#101013] border border-zinc-800 rounded-lg overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-zinc-800/60 bg-[#0c0c0e] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, CIF/NIF o correo..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider">Plan:</span>
            <select
              value={selectedPlanFilter}
              onChange={(e) => setSelectedPlanFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos los Planes</option>
              <option value="PYME_DIRECTO">Pyme Directo (39 €)</option>
              <option value="STARTER">Gestoría Starter (49 €)</option>
              <option value="PROFESSIONAL">Gestoría Professional (119 €)</option>
              <option value="ENTERPRISE">Despacho Enterprise (249 €)</option>
            </select>
          </div>
        </div>

        {/* Tabla de Compañías */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-[#09090b] text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Compañía / Despacho</th>
                <th className="py-3 px-3">CIF / NIF</th>
                <th className="py-3 px-3">Contacto</th>
                <th className="py-3 px-3">Tipo de Licencia</th>
                <th className="py-3 px-3 text-right">Precio / Mes</th>
                <th className="py-3 px-3 text-center">Cuota Clientes</th>
                <th className="py-3 px-3 text-center">Cuota Transacciones</th>
                <th className="py-3 px-3 text-center">Lotes</th>
                <th className="py-3 px-3 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-xs">
              {filteredCompanies.length > 0 ? (
                filteredCompanies.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-100">{c.name}</div>
                      <div className="font-mono text-[10px] text-zinc-500 mt-0.5">ID: {c.id}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-300">
                      {c.fiscal_id}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      <div>{c.email}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {c.users_count} {c.users_count === 1 ? 'usuario' : 'usuarios'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {getPlanBadge(c.plan)}
                      {c.extra_blocks > 0 && (
                        <div className="text-[10px] text-amber-400 mt-0.5 font-mono">
                          +{c.extra_blocks} bloque(s) expansión
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-zinc-100">
                      {formatEuro(c.monthly_price_eur)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-zinc-300">
                      <span className="text-zinc-100 font-semibold">{c.clients_count}</span>
                      <span className="text-zinc-500"> / {c.max_clients}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-zinc-300">
                      <span>Hasta {c.max_transactions_month?.toLocaleString('es-ES')} tx/mes</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-zinc-300">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[11px]">
                        {c.batches_count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Activa
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-200 transition-colors"
                        title="Modificar Licencia o Cuotas"
                      >
                        <Edit2 className="h-3 w-3 text-zinc-400" />
                        <span>Licencia</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-400 text-xs">
                    No se encontraron compañías con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Modificar Licencia y Cuota */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121215] border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-sm font-semibold text-zinc-100">
              Modificar Licencia de Compañía
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {editingCompany.name} ({editingCompany.fiscal_id})
            </p>

            {actionErrorMsg && (
              <div className="mt-3 p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {actionErrorMsg}
              </div>
            )}

            <form onSubmit={handleSavePlan} className="space-y-4 mt-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Plan de Licencia
                </label>
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                >
                  <option value="PYME_DIRECTO">Plan Pyme Directo — 39 € / mes (1 cliente, 2.000 tx)</option>
                  <option value="STARTER">Plan Gestoría Starter — 49 € / mes (10 clientes, 2.500 tx)</option>
                  <option value="PROFESSIONAL">Plan Gestoría Professional — 119 € / mes (30 clientes, 12.000 tx, SHA-256)</option>
                  <option value="ENTERPRISE">Plan Despacho Enterprise — 249 € / mes (100 clientes, 50.000 tx)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Bloques Extra de Expansión (+25 €/mes por bloque)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={editExtraBlocks}
                    onChange={(e) => setEditExtraBlocks(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-700"
                  />
                  <span className="text-xs text-zinc-400">
                    +{editExtraBlocks * 10} clientes, +{editExtraBlocks * 5000} tx/mes
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
