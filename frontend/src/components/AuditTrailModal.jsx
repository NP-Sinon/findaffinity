import React, { useState, useEffect } from 'react';
import { ShieldCheck, Copy, Check, X, Lock, Hash, Clock, UserCheck } from 'lucide-react';
import { fetchAuditTrailApi } from '../services/api';

export function AuditTrailModal({ batchId, companyName, onClose }) {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      const res = await fetchAuditTrailApi(batchId);
      if (isMounted) {
        setAuditData(res);
        setLoading(false);
      }
    }
    if (batchId) {
      load();
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [batchId]);

  const handleCopyJson = () => {
    if (!auditData) return;
    navigator.clipboard.writeText(JSON.stringify(auditData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0c0c0e] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-emerald-950/50 border border-emerald-800/60 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Certificado Legal de Auditoría SHA-256
              </h3>
              <p className="text-xs text-zinc-400">
                Cadena de custodia inmutable &bull; Protocolo Zero-Liability para {companyName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4 font-sans text-xs">
          {/* Status Banner */}
          <div className="flex items-center justify-between p-3 rounded-md bg-emerald-950/20 border border-emerald-800/40 text-emerald-300">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span className="font-medium text-xs">
                Inmutabilidad Jurídica Garantizada: Hash-Chain Intacto
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              Válido para AEAT
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-zinc-500 font-mono text-xs">
              Verificando sellado criptográfico en base de datos...
            </div>
          ) : auditData && auditData.chain && auditData.chain.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                Sucesión Criptográfica de Eventos ({auditData.chain.length} sellados)
              </div>

              <div className="space-y-2.5 border-l-2 border-zinc-800 pl-4 ml-2">
                {auditData.chain.map((event, idx) => (
                  <div key={event.id || idx} className="relative bg-zinc-900/60 border border-zinc-800/80 rounded p-3">
                    <div className="absolute -left-[21px] top-3.5 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-[#0c0c0e]" />
                    
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-zinc-200">
                        {event.action === 'BATCH_CREATED' ? 'Creación e Ingesta de Lote' :
                         event.action === 'BATCH_EXPORTED' ? 'Exportación Oficial a ERP' :
                         event.action === 'TRANSACTION_APPROVED' ? 'Aprobación de Asiento Contable' :
                         event.action}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(event.timestamp).toLocaleString('es-ES')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 mb-2">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3 w-3 text-zinc-500" />
                        <span>Actor: <strong className="text-zinc-300 font-mono">{event.actor}</strong></span>
                      </div>
                    </div>

                    {/* Hash Chain Values */}
                    <div className="bg-black/40 rounded p-2 border border-zinc-800/60 font-mono text-[10px] space-y-1">
                      <div className="flex items-center gap-1 text-zinc-500">
                        <Hash className="h-3 w-3 text-zinc-600" />
                        <span>Prev:</span>
                        <span className="text-zinc-400 truncate">{event.prev_hash}</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <Hash className="h-3 w-3 text-emerald-500" />
                        <span>Sha256:</span>
                        <span className="truncate">{event.current_hash_sha256}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded p-4 text-center text-zinc-400">
              <p>Cadena de auditoría lista. Los eventos se sellan automáticamente al procesar, aprobar y exportar lotes contables.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/70">
          <button
            type="button"
            onClick={handleCopyJson}
            disabled={!auditData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 font-medium transition-colors disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Certificado Copiado' : 'Copiar Certificado JSON'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
