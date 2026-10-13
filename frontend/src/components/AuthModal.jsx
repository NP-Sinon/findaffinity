import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Building2,
  User,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  X,
  FileText,
  BadgePercent,
  Sparkles,
} from 'lucide-react';
import {
  loginApi,
  registerApi,
  forgotPasswordApi,
  resetPasswordApi,
} from '../services/api';

export default function AuthModal({ isOpen, onClose, initialView = 'login', onAuthSuccess }) {
  if (!isOpen) return null;

  const [view, setView] = useState(initialView); // 'login' | 'register' | 'forgot' | 'reset'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fiscalId, setFiscalId] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const clearMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const handleQuickDemoLogin = async () => {
    setLoading(true);
    clearMessages();
    const res = await loginApi('auditor@konigpartners.es', 'AuditPass2026!');
    setLoading(false);
    if (res.success) {
      if (onAuthSuccess) onAuthSuccess(res.user);
      onClose();
    } else {
      setError(res.error);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    const res = await loginApi(email, password);
    setLoading(false);
    if (res.success) {
      if (onAuthSuccess) onAuthSuccess(res.user);
      onClose();
    } else {
      setError(res.error);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    const res = await registerApi({
      email,
      password,
      fullName,
      companyName,
      fiscalId,
      role,
    });
    setLoading(false);
    if (res.success) {
      if (onAuthSuccess) onAuthSuccess(res.user);
      onClose();
    } else {
      setError(res.error);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    const res = await forgotPasswordApi(email);
    setLoading(false);
    if (res.success) {
      setSuccessMsg(res.message);
      if (res.demoToken) {
        setResetToken(res.demoToken);
        setView('reset');
      }
    } else {
      setError(res.error);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    const res = await resetPasswordApi(resetToken, newPassword);
    setLoading(false);
    if (res.success) {
      setSuccessMsg(res.message);
      setTimeout(() => {
        setView('login');
        setPassword(newPassword);
        clearMessages();
      }, 1500);
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabecera modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">FINDAFINITY</h3>
              <p className="text-[11px] text-zinc-400">Acceso Seguro de Despacho & Pyme</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notificaciones de error o éxito */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-start gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contenido según vista */}
        <div className="p-6">
          {/* ======================= VISTA LOGIN ======================= */}
          {view === 'login' && (
            <div>
              <div className="mb-5 text-center">
                <h4 className="text-base font-semibold text-zinc-100">Iniciar Sesión</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Accede a tu Staging Radar de conciliación contable
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Correo Electrónico Profesional
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="auditor@despacho.es"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-zinc-400">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => { setView('forgot'); clearMessages(); }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Validando credenciales...' : 'Iniciar Sesión'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Botón de Acceso Rápido con Cuenta Demo */}
              <div className="mt-4 pt-4 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 rounded-lg text-xs text-zinc-300 font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Acceso Rápido con Despacho Demo (König & Asoc.)
                </button>
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs text-zinc-500">
                  ¿Aún no tienes cuenta?{' '}
                  <button
                    onClick={() => { setView('register'); clearMessages(); }}
                    className="text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Registrar nuevo despacho o pyme
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ======================= VISTA REGISTER ======================= */}
          {view === 'register' && (
            <div>
              <div className="mb-4 text-center">
                <h4 className="text-base font-semibold text-zinc-100">Crear Cuenta Profesional</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Alta inmediata de despacho contable o empresa
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Nombre Completo del Auditor / Administrador
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Carlos Méndez"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Despacho / Razón Social
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Méndez Auditores SL"
                        className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      CIF / NIF Fiscal
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        required
                        value={fiscalId}
                        onChange={(e) => setFiscalId(e.target.value.toUpperCase())}
                        placeholder="B-99881122"
                        className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Correo Electrónico Corporativo
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="auditor@mendezaudit.es"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Contraseña (mínimo 6 caracteres)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Perfil Operativo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('ADMIN')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-colors ${
                        role === 'ADMIN'
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Socio / Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('AUDITOR')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-colors ${
                        role === 'AUDITOR'
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Auditor Contable
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creando cuenta...' : 'Registrar Despacho & Acceder'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="text-xs text-zinc-500">
                  ¿Ya tienes cuenta?{' '}
                  <button
                    onClick={() => { setView('login'); clearMessages(); }}
                    className="text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Iniciar sesión
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ======================= VISTA FORGOT PASSWORD ======================= */}
          {view === 'forgot' && (
            <div>
              <div className="mb-4 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h4 className="text-base font-semibold text-zinc-100">Recuperar Contraseña</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Introduce tu correo registrado para restablecer tus credenciales
                </p>
              </div>

              <form onSubmit={handleForgotSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="auditor@despacho.es"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Generando solicitud...' : 'Enviar Instrucciones'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setView('login'); clearMessages(); }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ← Volver al inicio de sesión
                </button>
              </div>
            </div>
          )}

          {/* ======================= VISTA RESET PASSWORD ======================= */}
          {view === 'reset' && (
            <div>
              <div className="mb-4 text-center">
                <h4 className="text-base font-semibold text-zinc-100">Nueva Contraseña</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Introduce el token y tu nueva clave de acceso
                </p>
              </div>

              <form onSubmit={handleResetSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Token de Recuperación
                  </label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Pega aquí el token recibido"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Actualizando...' : 'Guardar Nueva Contraseña'}
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
