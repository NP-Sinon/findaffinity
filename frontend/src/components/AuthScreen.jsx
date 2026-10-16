/**
 * FICHERO: frontend/src/components/AuthScreen.jsx
 * Portal Corporativo de Acceso y Alta de Despacho B2B
 */
import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Database,
  Scale,
} from 'lucide-react';
import { loginApi, registerApi, forgotPasswordApi, resetPasswordApi } from '../services/api';

const INITIAL_PLANS = [
  {
    code: 'FREE',
    name: 'Evaluación Técnica',
    price: '0 €',
    desc: '25 partidas mensuales • 1 sociedad',
  },
  {
    code: 'PYME_DIRECTO',
    name: 'Pyme Directo',
    price: '39 €/mes',
    desc: '2.000 partidas/mes • 1 sociedad',
  },
  {
    code: 'STARTER',
    name: 'Despacho Starter',
    price: '49 €/mes',
    desc: '2.500 partidas/mes • 10 sociedades',
  },
  {
    code: 'PROFESSIONAL',
    name: 'Despacho Profesional',
    price: '119 €/mes',
    desc: '12.000 partidas/mes • 30 sociedades',
  },
];

export function AuthScreen({ onAuthSuccess, backendOnline }) {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regFiscalId, setRegFiscalId] = useState('');
  const [regPlan, setRegPlan] = useState('FREE');

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const clearMessages = () => {
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleTabChange = (tab) => {
    clearMessages();
    setActiveTab(tab);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await loginApi(loginEmail, loginPassword);
    setLoading(false);

    if (res.success) {
      onAuthSuccess(res.user);
    } else {
      setErrorMessage(res.error || 'Credenciales incorrectas.');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    const res = await registerApi({
      email: regEmail,
      password: regPassword,
      fullName: regFullName,
      companyName: regCompanyName,
      fiscalId: regFiscalId,
      role: 'ADMIN',
      plan: regPlan,
    });
    setLoading(false);

    if (res.success) {
      onAuthSuccess(res.user, regPlan !== 'FREE');
    } else {
      setErrorMessage(res.error || 'Error al completar el alta del despacho.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await forgotPasswordApi(forgotEmail);
    setLoading(false);

    if (res.success) {
      setInfoMessage(res.message || 'Instrucciones enviadas.');
      if (res.demoToken) {
        setResetToken(res.demoToken);
        setActiveTab('reset');
      }
    } else {
      setErrorMessage(res.error || 'No se pudo procesar la solicitud.');
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await resetPasswordApi(resetToken, resetNewPassword);
    setLoading(false);

    if (res.success) {
      setInfoMessage('Contraseña actualizada correctamente.');
      setActiveTab('login');
    } else {
      setErrorMessage(res.error || 'Código inválido o expirado.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col justify-between font-sans">
      {/* Barra Institucional Superior */}
      <header className="h-14 border-b border-[#1e232d] bg-[#0f1218] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-xs tracking-tighter">
            FA
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">FINDAFINITY</span>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline border-l border-[#1e232d] pl-3">
            SISTEMA DE CONCILIACIÓN Y DESAMBIGUACIÓN CONTABLE PGC
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-400 font-mono text-[11px]">
            {backendOnline ? 'SERVICIO OPERATIVO' : 'CONECTANDO'}
          </span>
        </div>
      </header>

      {/* Cuerpo Principal a Dos Columnas */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Columna Izquierda: Especificaciones Técnicas B2B */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#131720] border border-[#222834] text-[11px] font-mono text-slate-300">
            <span>NORMA 43 AEB</span>
            <span>&bull;</span>
            <span>STRIPE & REDSYS TPV</span>
            <span>&bull;</span>
            <span>PGC ESPAÑA</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-snug">
            Conciliación algorítmica de liquidaciones agrupadas y generación de diario contable.
          </h1>

          <p className="text-sm text-slate-400 leading-relaxed">
            Entorno intermedio de preparación contable en modo de solo lectura para asesorías fiscales y departamentos de administración. Desglosa remesas netas de pasarelas de pago, contabiliza gastos bancarios en origen y exporta pre-asientos cerrados a céntimo cero.
          </p>

          <div className="space-y-4 pt-2 border-t border-[#1e232d]">
            <div className="flex items-start gap-3">
              <Scale className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Descomposición Combinatoria de Liquidaciones (Batch Payouts)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Cruza abonos netos bancarios frente a múltiples facturas emitidas deduciendo comisiones en la subcuenta 626 y cuadrando las cuentas 572 y 430.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Database className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Exportación Nativa sin Alteración de Libros Oficiales
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Generación directa de ficheros con estructura oficial para Wolters Kluwer A3 (Suenlace), Sage 50 (XDIARIO.csv) y DELSOL Contasol (.xlsx).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileCheck2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Trazabilidad y Cadena de Custodia SHA-256
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Cada lote procesado y aprobado queda registrado mediante firma criptográfica verificable para soporte documental ante auditoría.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Formulario de Acceso / Registro */}
        <div className="lg:col-span-6">
          <div className="bg-[#10131a] border border-[#1e232d] rounded-lg p-6 sm:p-8 shadow-xl">
            {(activeTab === 'login' || activeTab === 'register') && (
              <div className="grid grid-cols-2 p-1 bg-[#0b0d11] border border-[#1e232d] rounded mb-6 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className={`py-2 rounded transition-colors ${
                    activeTab === 'login'
                      ? 'bg-[#181c26] text-white border border-[#282f3d]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Acceso Clientes
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('register')}
                  className={`py-2 rounded transition-colors ${
                    activeTab === 'register'
                      ? 'bg-[#181c26] text-white border border-[#282f3d]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Alta de Despacho / Empresa
                </button>
              </div>
            )}

            {errorMessage && (
              <div className="mb-5 p-3 rounded bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {infoMessage && (
              <div className="mb-5 p-3 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{infoMessage}</span>
              </div>
            )}

            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1.5">
                    Correo Electrónico Profesional
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="usuario@despacho.es"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTabChange('forgot')}
                      className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors"
                    >
                      Recuperar contraseña
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{loading ? 'Autenticando...' : 'Iniciar Sesión'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            )}

            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                    Responsable / Titular de la Cuenta
                  </label>
                  <div className="relative">
                    <User className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Nombre y Apellidos"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                      Razón Social / Despacho
                    </label>
                    <div className="relative">
                      <Building2 className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={regCompanyName}
                        onChange={(e) => setRegCompanyName(e.target.value)}
                        placeholder="Asesoría Fiscal S.L.P."
                        className="w-full bg-[#0b0d11] border border-[#222834] rounded pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                      NIF / CIF
                    </label>
                    <input
                      type="text"
                      required
                      value={regFiscalId}
                      onChange={(e) => setRegFiscalId(e.target.value.toUpperCase())}
                      placeholder="B12345678"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                      Correo Corporativo
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="direccion@despacho.es"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
                    Modalidad de Suscripción Inicial
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INITIAL_PLANS.map((p) => {
                      const active = regPlan === p.code;
                      return (
                        <div
                          key={p.code}
                          onClick={() => setRegPlan(p.code)}
                          className={`p-2.5 rounded border cursor-pointer transition-colors ${
                            active
                              ? 'bg-blue-950/30 border-blue-500 text-white'
                              : 'bg-[#0b0d11] border-[#222834] text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className={active ? 'text-blue-300' : 'text-slate-200'}>{p.name}</span>
                            <span className="font-mono text-white">{p.price}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{loading ? 'Registrando entidad...' : 'Completar Alta y Acceder'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            )}

            {activeTab === 'forgot' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Introduzca su dirección de correo electrónico para generar un código de restablecimiento.
                </p>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="usuario@despacho.es"
                  className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTabChange('login')}
                    className="w-1/3 py-2 rounded bg-[#161a23] border border-[#222834] text-xs text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    {loading ? 'Enviando...' : 'Solicitar Código'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'reset' && (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                    Código de Verificación
                  </label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  {loading ? 'Actualizando...' : 'Confirmar Contraseña'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-[#1e232d] bg-[#0f1218] py-3.5 px-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
          <span>FINDAFINITY &bull; Entorno de Conciliación Contable &bull; Plan General de Contabilidad</span>
          <span>Formatos Soportados: Wolters Kluwer A3 &bull; Sage 50 &bull; DELSOL Contasol</span>
        </div>
      </footer>
    </div>
  );
}
