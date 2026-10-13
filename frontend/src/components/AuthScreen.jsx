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
  Sparkles,
  Server
} from 'lucide-react';
import { loginApi, registerApi, forgotPasswordApi, resetPasswordApi } from '../services/api';

export function AuthScreen({ onAuthSuccess, backendOnline }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  // Formulario Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Formulario Registro
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regFiscalId, setRegFiscalId] = useState('');

  // Formulario Recuperación
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
      setErrorMessage(res.error || 'Credenciales no válidas.');
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
    });
    setLoading(false);

    if (res.success) {
      onAuthSuccess(res.user);
    } else {
      setErrorMessage(res.error || 'Error al completar el registro.');
    }
  };

  const handleQuickLoginAdmin = async () => {
    clearMessages();
    setLoginEmail('admin@findaffinity.com');
    setLoginPassword('AdminPass2026!');
    setLoading(true);

    const res = await loginApi('admin@findaffinity.com', 'AdminPass2026!');
    setLoading(false);
    if (res.success) {
      onAuthSuccess(res.user);
    } else {
      setErrorMessage(res.error || 'No se pudo iniciar sesión con la cuenta de administrador.');
    }
  };

  const handleQuickLoginDemo = async () => {
    clearMessages();
    setLoginEmail('auditor@konigpartners.es');
    setLoginPassword('AuditPass2026!');
    setLoading(true);

    const res = await loginApi('auditor@konigpartners.es', 'AuditPass2026!');
    setLoading(false);
    if (res.success) {
      onAuthSuccess(res.user);
    } else {
      setErrorMessage(res.error || 'No se pudo iniciar sesión con el despacho demo.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    const res = await forgotPasswordApi(forgotEmail);
    setLoading(false);

    if (res.success) {
      setInfoMessage(res.message || 'Se ha generado un token de recuperación.');
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
      setInfoMessage('Contraseña restablecida exitosamente. Inicia sesión con tu nueva clave.');
      setActiveTab('login');
    } else {
      setErrorMessage(res.error || 'Error al restablecer contraseña.');
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] flex flex-col justify-between text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Top Brand Nav */}
      <header className="border-b border-zinc-800/80 bg-[#0c0c0e]/90 backdrop-blur px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-white font-sans">
            FINDAFINITY
          </span>
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline ml-1 border-l border-zinc-800 pl-2">
            CONCILIACIÓN CONTABLE B2B
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <span className="text-zinc-400 font-mono text-[11px]">
            {backendOnline ? 'Servidor Conectado' : 'Modo Autónomo'}
          </span>
        </div>
      </header>

      {/* Main Centered Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-[480px] w-full bg-[#101013] border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-2xl relative">
          
          {/* Logo & Headline */}
          <div className="text-center mb-6">
            <div className="inline-flex h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-400 mb-3 shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white font-sans">
              FINDAFINITY
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Plataforma de Conciliación Contable, Bancaria y Pasarelas
            </p>
          </div>

          {/* Large Tab Switcher */}
          {(activeTab === 'login' || activeTab === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg mb-6 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'login'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'register'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Registrar Despacho / Empresa
              </button>
            </div>
          )}

          {/* Messages */}
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

          {/* VISTA 1: INICIAR SESIÓN */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="auditor@tudespacho.es"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
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
                    ¿Olvidaste tu contraseña?
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
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? 'Accediendo...' : 'Iniciar Sesión en el Despacho'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              {/* Botones de Acceso Rápido */}
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center font-medium">
                  Accesos Directos de Evaluación
                </div>

                <button
                  type="button"
                  onClick={handleQuickLoginAdmin}
                  disabled={loading}
                  className="w-full py-1.5 px-3 rounded-md bg-zinc-900 hover:bg-zinc-800/80 border border-blue-900/50 text-[11px] font-medium text-blue-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                  <span>Acceso Rápido: Cuenta ADMIN (Ver Todas las Compañías)</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickLoginDemo}
                  disabled={loading}
                  className="w-full py-1.5 px-3 rounded-md bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>Acceso Rápido: Despacho Auditor Demo (KÖNIG & ASOCIADOS)</span>
                </button>
              </div>
            </form>
          )}

          {/* VISTA 2: REGISTRAR DESPACHO / EMPRESA */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  Nombre Completo del Auditor / Administrador
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Carlos Méndez"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  Correo Electrónico Profesional
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="carlos@despachomendez.es"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                  Contraseña (mínimo 6 caracteres)
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
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    Nombre del Despacho / Empresa
                  </label>
                  <div className="relative">
                    <Building2 className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regCompanyName}
                      onChange={(e) => setRegCompanyName(e.target.value)}
                      placeholder="Méndez & Asociados SLP"
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1">
                    CIF / NIF Fiscal
                  </label>
                  <input
                    type="text"
                    required
                    value={regFiscalId}
                    onChange={(e) => setRegFiscalId(e.target.value.toUpperCase())}
                    placeholder="B-12345678"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? 'Creando Despacho...' : 'Crear Cuenta y Acceder a FINDAFINITY'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <div className="text-[11px] text-zinc-500 text-center mt-2">
                Al registrarte se crea automáticamente tu inquilino con rol de Administrador.
              </div>
            </form>
          )}

          {/* VISTA 3: RECUPERAR CONTRASEÑA */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="text-xs text-zinc-400 mb-2">
                Introduce el correo electrónico asociado a tu cuenta para recibir las instrucciones de restablecimiento.
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="auditor@tudespacho.es"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="w-1/3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Solicitar Token'}
                </button>
              </div>
            </form>
          )}

          {/* VISTA 4: RESTABLECER CONTRASEÑA */}
          {activeTab === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Token de Restablecimiento
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Pega el token recibido"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-medium mb-1.5">
                  Nueva Contraseña
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="w-1/3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Restableciendo...' : 'Guardar Nueva Contraseña'}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#0c0c0e]/80 py-3.5 text-center text-xs text-zinc-500">
        <div className="max-w-[1200px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
          <span>FINDAFINITY &bull; Zero-Liability Audit Engine &bull; Cuadre PGC a 0.00 €</span>
          <span>Soporte Oficial: Wolters Kluwer A3 &bull; Sage 50 &bull; DELSOL Contasol</span>
        </div>
      </footer>
    </div>
  );
}
