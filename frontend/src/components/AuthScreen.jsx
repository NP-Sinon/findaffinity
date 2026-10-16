/**
 * FICHERO: frontend/src/components/AuthScreen.jsx
 * Acceso Corporativo Minimalista (Estilo Linear / Mercury)
 */
import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { loginApi, registerApi, forgotPasswordApi, resetPasswordApi } from '../services/api';

const INITIAL_PLANS = [
  { code: 'FREE', name: 'Evaluación', price: '0 €', desc: '25 partidas/mes' },
  { code: 'PYME_DIRECTO', name: 'Pyme', price: '39 €', desc: '2.000 partidas/mes' },
  { code: 'STARTER', name: 'Starter', price: '49 €', desc: '10 empresas' },
  { code: 'PROFESSIONAL', name: 'Pro', price: '119 €', desc: '30 empresas' },
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
      setErrorMessage(res.error || 'Error al crear la cuenta.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const res = await forgotPasswordApi(forgotEmail);
    setLoading(false);
    if (res.success) {
      setInfoMessage('Código enviado.');
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
      setInfoMessage('Contraseña actualizada.');
      setActiveTab('login');
    } else {
      setErrorMessage(res.error || 'Código inválido.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col justify-between font-sans">
      <header className="h-14 border-b border-[#1e232d] bg-[#0f1218] px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center text-white font-mono font-bold text-xs">
            FA
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">FINDAFINITY</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-400 font-mono text-[11px]">
            {backendOnline ? 'ONLINE' : 'CONECTANDO'}
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-[#10131a] border border-[#1e232d] rounded-xl p-6 sm:p-7 shadow-2xl">
          <div className="mb-6 text-center">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              {activeTab === 'register' ? 'Crear Cuenta Corporativa' : 'Iniciar Sesión'}
            </h1>
          </div>

          {(activeTab === 'login' || activeTab === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-[#0b0d11] border border-[#1e232d] rounded-lg mb-5 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'login'
                    ? 'bg-[#181c26] text-white border border-[#282f3d]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Acceder
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`py-2 rounded-md transition-colors ${
                  activeTab === 'register'
                    ? 'bg-[#181c26] text-white border border-[#282f3d]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Registrarse
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Email</label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nombre@empresa.es"
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-400 font-medium">Contraseña</label>
                  <button
                    type="button"
                    onClick={() => handleTabChange('forgot')}
                    className="text-[11px] text-slate-500 hover:text-blue-400"
                  >
                    ¿Olvidaste tu clave?
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
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Entrando...' : 'Entrar'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Nombre</label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Despacho / Empresa</label>
                  <div className="relative">
                    <Building2 className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regCompanyName}
                      onChange={(e) => setRegCompanyName(e.target.value)}
                      placeholder="Empresa S.L."
                      className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">NIF / CIF</label>
                  <input
                    type="text"
                    required
                    value={regFiscalId}
                    onChange={(e) => setRegFiscalId(e.target.value.toUpperCase())}
                    placeholder="B12345678"
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="email@empresa.es"
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="block text-[11px] text-slate-400 font-medium mb-1.5">Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {INITIAL_PLANS.map((p) => {
                    const active = regPlan === p.code;
                    return (
                      <div
                        key={p.code}
                        onClick={() => setRegPlan(p.code)}
                        className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                          active
                            ? 'bg-blue-950/30 border-blue-500 text-white'
                            : 'bg-[#0b0d11] border-[#222834] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className={active ? 'text-blue-300' : 'text-slate-200'}>{p.name}</span>
                          <span className="font-mono text-white">{p.price}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{p.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{loading ? 'Creando cuenta...' : 'Crear Cuenta'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="Tu correo electrónico"
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2.5 text-xs text-slate-100"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="w-1/3 py-2.5 rounded-lg bg-[#161a23] border border-[#222834] text-xs text-slate-300"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  {loading ? 'Enviando...' : 'Enviar Código'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-3.5">
              <input
                type="text"
                required
                placeholder="Código de verificación"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2.5 text-xs text-slate-100 font-mono"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Nueva contraseña"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg px-3 py-2.5 text-xs text-slate-100"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                {loading ? 'Guardando...' : 'Actualizar Contraseña'}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="border-t border-[#1e232d] bg-[#0f1218] py-3 px-6 text-center text-[11px] text-slate-500">
        FINDAFINITY &bull; A3 &bull; Sage 50 &bull; Contasol
      </footer>
    </div>
  );
}
