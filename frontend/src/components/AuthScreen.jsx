/**
 * FICHERO: frontend/src/components/AuthScreen.jsx
 * Pantalla Corporativa de Acceso y Registro B2B con Selección de Plan Inicial
 * (Sin credenciales expuestas ni botones de cuentas demo)
 */
import React, { useState } from 'react';
import {
  Layers,
  ShieldCheck,
  Lock,
  Mail,
  User,
  Building2,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { loginApi, registerApi, forgotPasswordApi, resetPasswordApi } from '../services/api';

const INITIAL_PLANS = [
  {
    code: 'FREE',
    name: 'Evaluación Gratuita',
    price: '0 €',
    desc: 'Hasta 25 facturas/mes • 1 empresa',
  },
  {
    code: 'PYME_DIRECTO',
    name: 'Pyme Directo',
    price: '39 €/mes',
    desc: 'Hasta 2.000 facturas/mes • 1 empresa',
  },
  {
    code: 'STARTER',
    name: 'Gestoría Starter',
    price: '49 €/mes',
    desc: 'Hasta 10 empresas • 2.500 tx/mes',
  },
  {
    code: 'PROFESSIONAL',
    name: 'Gestoría Pro',
    price: '119 €/mes',
    desc: 'Hasta 30 empresas • 12.000 tx/mes',
  },
];

export function AuthScreen({ onAuthSuccess, backendOnline }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registro con selección de plan
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regFiscalId, setRegFiscalId] = useState('');
  const [regPlan, setRegPlan] = useState('FREE');

  // Recuperación
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
      setErrorMessage(res.error || 'Error al completar el registro.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await forgotPasswordApi(forgotEmail);
    setLoading(false);

    if (res.success) {
      setInfoMessage(res.message || 'Se han enviado las instrucciones de recuperación.');
      if (res.demoToken) {
        setResetToken(res.demoToken);
        setActiveTab('reset');
      }
    } else {
      setErrorMessage(res.error || 'Error en la solicitud.');
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await resetPasswordApi(resetToken, resetNewPassword);
    setLoading(false);

    if (res.success) {
      setInfoMessage('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      setActiveTab('login');
    } else {
      setErrorMessage(res.error || 'Error al restablecer la contraseña.');
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] flex flex-col justify-between text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Cabecera Institucional */}
      <header className="border-b border-zinc-800/80 bg-[#0c0c0e]/90 backdrop-blur px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">FINDAFINITY</span>
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline ml-1 border-l border-zinc-800 pl-2">
            CONCILIACIÓN ALGORÍTMICA & DESAMBIGUACIÓN CONTABLE
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-amber-500'}`} />
          <span className="text-zinc-400 font-mono text-[11px]">
            {backendOnline ? ' Cloud Activo' : 'Conectando...'}
          </span>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-[520px] w-full bg-[#101013] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-400 mb-3 shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">FINDAFINITY</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Puente algorítmico entre Norma 43, Stripe, Redsys y tu ERP contable (A3, Sage 50, Contasol)
            </p>
          </div>

          {(activeTab === 'login' || activeTab === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg mb-6 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'login' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'register' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Crear Cuenta / Elegir Plan
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 p-3 rounded-md bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-5 p-3 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* VISTA LOGIN */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Correo Electrónico Corporativo
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nombre@despacho.es"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => handleTabChange('forgot')}
                    className="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors"
                  >
                    ¿Has olvidado tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <span>{loading ? 'Verificando acceso...' : 'Acceder al Panel Contable'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          {/* VISTA REGISTRO CON SELECCIÓN DE PLAN */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  Nombre y Apellidos
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Laura Gómez"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    Despacho o Razón Social
                  </label>
                  <div className="relative">
                    <Building2 className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regCompanyName}
                      onChange={(e) => setRegCompanyName(e.target.value)}
                      placeholder="Asesoría Fiscal Gómez SLP"
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    NIF / CIF Fiscal
                  </label>
                  <input
                    type="text"
                    required
                    value={regFiscalId}
                    onChange={(e) => setRegFiscalId(e.target.value.toUpperCase())}
                    placeholder="B-12345678"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    Correo Profesional
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="laura@asesoriagomez.es"
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    Contraseña (mín. 6 caracteres)
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Selector de Plan Inicial */}
              <div className="pt-1">
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-2">
                  Selecciona tu Plan Inicial (Puedes cambiarlo en cualquier momento)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {INITIAL_PLANS.map((p) => {
                    const active = regPlan === p.code;
                    return (
                      <div
                        key={p.code}
                        onClick={() => setRegPlan(p.code)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                          active
                            ? 'bg-emerald-950/30 border-emerald-500 text-zinc-100'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className={active ? 'text-emerald-300' : 'text-zinc-200'}>{p.name}</span>
                          <span className="font-mono text-white">{p.price}</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{p.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <span>{loading ? 'Creando espacio contable...' : 'Crear Cuenta y Empezar'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          {/* VISTA RECUPERAR CONTRASEÑA */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <p className="text-xs text-zinc-400">
                Introduce tu correo electrónico corporativo para restablecer tu contraseña.
              </p>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="nombre@despacho.es"
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="w-1/3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  {loading ? 'Enviando...' : 'Solicitar Restablecimiento'}
                </button>
              </div>
            </form>
          )}

          {/* VISTA RESET PASSWORD */}
          {activeTab === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Código de Verificación
                </label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                {loading ? 'Actualizando...' : 'Guardar Nueva Contraseña'}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-800/80 bg-[#0c0c0e]/80 py-3.5 text-center text-xs text-zinc-500">
        <div className="max-w-[1200px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
          <span>FINDAFINITY &bull; Protocolo Zero-Liability &bull; Cuadre PGC a 0,00 €</span>
          <span>Compatible con Wolters Kluwer A3 &bull; Sage 50 &bull; DELSOL Contasol</span>
        </div>
      </footer>
    </div>
  );
}
