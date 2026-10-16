/**
 * FICHERO: frontend/src/components/GestorModal.jsx
 * Creación rápida de cuentas Gestor para miembros del despacho
 */
import React, { useState } from 'react';
import { UserPlus, X, Trash2, Mail, Lock, User, CheckCircle2 } from 'lucide-react';

export function GestorModal({
  isOpen,
  onClose,
  gestores = [],
  onCreateGestor,
  onDeleteGestor,
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setError('Introduce el correo y la contraseña para el gestor.');
      return;
    }
    if (password.trim().length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await onCreateGestor({
        fullName: fullName.trim() || 'Gestor Contable',
        email: email.trim(),
        password: password.trim(),
      });
      setSuccessMsg(`Cuenta creada. Ya puede entrar con ${email.trim()}`);
      setFullName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#10131a] border border-[#222834] rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Crear Cuenta Gestor</h3>
            <p className="text-[11px] text-slate-400">
              Tendrá acceso directo a las empresas del despacho para procesar archivos, sin poder añadir ni eliminar sociedades.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1">
              Nombre del Gestor
            </label>
            <div className="relative">
              <User className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Laura Gómez"
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1">
              Correo Electrónico de Acceso
            </label>
            <div className="relative">
              <Mail className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gestor@despacho.es"
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1">
              Contraseña Asignada
            </label>
            <div className="relative">
              <Lock className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#0b0d11] border border-[#222834] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? 'Creando cuenta...' : 'Crear Cuenta Gestor'}
          </button>
        </form>

        {/* Lista de gestores creados */}
        <div className="mt-5 pt-4 border-t border-[#1e232d]">
          <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
            Cuentas Gestor Activas ({gestores.length})
          </span>
          {gestores.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has creado cuentas para gestores de tu equipo.
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {gestores.map((g) => (
                <div
                  key={g.email}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0b0d11] border border-[#1e232d] text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">{g.fullName}</div>
                    <div className="font-mono text-[11px] text-slate-400 truncate">
                      {g.email} &bull; Clave: {g.password}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteGestor && onDeleteGestor(g.email)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Eliminar acceso"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
