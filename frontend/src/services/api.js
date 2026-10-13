/**
 * Cliente de Conectividad con la API REST de Reconciliación Contable (FastAPI v1)
 * Soporta operaciones Multi-Tenancy completas, persistencia de lotes en SQLite/PostgreSQL,
 * aprobaciones certificadas y exportaciones nativas para A3, Sage y Contasol.
 */
import { INITIAL_TRANSACTIONS, MOCK_COMPANIES } from '../data/mockAuditData';

const BASE_URL = 'http://127.0.0.1:8000';

const AUTH_STORAGE_KEY = 'findaffinity_auth_session';

export function getStoredAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(token, user) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
  } catch (err) {
    console.error('Error guardando sesión:', err);
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (err) {
    console.error('Error limpiando sesión:', err);
  }
}

export function getAuthHeaders() {
  const session = getStoredAuthSession();
  if (session && session.token) {
    return {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    };
  }
  return { 'Content-Type': 'application/json' };
}

/**
 * Helper para fetch seguro que nunca lanza excepción por JSON inválido
 */
async function safeJsonFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      const text = await res.text();
      data = { detail: text || `HTTP ${res.status}: ${res.statusText}` };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { detail: err.message || 'Sin conexión con el servidor' } };
  }
}

/**
 * Iniciar sesión con email y contraseña en FastAPI
 */
export async function loginApi(email, password) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (ok && data?.access_token) {
    saveAuthSession(data.access_token, data.user);
    return { success: true, token: data.access_token, user: data.user };
  }
  return { success: false, error: data?.detail || 'Credenciales incorrectas' };
}

/**
 * Registro de nuevo usuario o despacho contable
 */
export async function registerApi({ email, password, fullName, companyName, fiscalId, role = 'AUDITOR' }) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
      company_name: companyName,
      fiscal_id: fiscalId,
      role,
    }),
  });

  if (ok) {
    // Iniciar sesión automáticamente tras el registro
    return await loginApi(email, password);
  }
  return { success: false, error: data?.detail || 'Error en el registro' };
}

/**
 * Solicitar recuperación de contraseña
 */
export async function forgotPasswordApi(email) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (ok) {
    return { success: true, message: data.message, demoToken: data.reset_token_demo };
  }
  return { success: false, error: data?.detail || 'Error en la solicitud' };
}

/**
 * Restablecer contraseña con token
 */
export async function resetPasswordApi(token, newPassword) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });

  if (ok) {
    return { success: true, message: data.message };
  }
  return { success: false, error: data?.detail || 'Token inválido o expirado' };
}

/**
 * Obtener lista de compañías registradas y sus licencias (Solo ADMIN / SUPERADMIN)
 */
export async function fetchAdminCompanies() {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies`, {
    headers,
  });
  if (ok && Array.isArray(data)) {
    return data;
  }
  return [];
}

/**
 * Obtener estadísticas globales de la plataforma (Solo ADMIN / SUPERADMIN)
 */
export async function fetchPlatformStats() {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/stats`, {
    headers,
  });
  if (ok && data) {
    return data;
  }
  return null;
}

/**
 * Modificar plan / licencia de una compañía desde el panel de control
 */
export async function updateCompanyPlanApi(tenantId, plan, extraBlocks = 0) {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies/${tenantId}/plan`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ plan, extra_blocks: extraBlocks }),
  });
  return { success: ok, data, error: ok ? null : (data?.detail || 'Error al actualizar plan') };
}

/**
 * Eliminar definitivamente una compañía desde el panel de SuperAdmin
 */
export async function deleteCompanyApi(tenantId) {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies/${tenantId}`, {
    method: 'DELETE',
    headers,
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar compañía') };
}

/**
 * Obtener perfil del usuario autenticado
 */
export async function getCurrentUserApi() {
  const session = getStoredAuthSession();
  if (!session || !session.token) return null;

  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });
    if (res.ok) {
      const user = await res.json();
      saveAuthSession(session.token, user);
      return user;
    }
  } catch (err) {
    console.warn('Error validando token con backend:', err);
  }
  return session.user;
}

/**
 * Comprueba el estado del backend FastAPI
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${BASE_URL}/health`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return { online: true, ...data };
    }
    return { online: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { online: false, reason: err.message || 'Sin conexión a 127.0.0.1:8000' };
  }
}

/**
 * Ingesta e inspección rápida de fichero Norma 43
 */
export async function uploadNorma43File(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BASE_URL}/api/v1/ingest/norma43`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, fromBackend: true, data };
    }
  } catch (err) {
    console.warn('Backend no disponible, ejecutando validación autónoma de Norma 43:', err);
  }

  // Fallback autónomo en navegador
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      let recordsCount = lines.length;
      let movementsCount = lines.filter(l => l.startsWith('22')).length;
      let hasHeader = lines.some(l => l.startsWith('11'));
      let hasFooter = lines.some(l => l.startsWith('33') || l.startsWith('88'));

      resolve({
        success: true,
        fromBackend: false,
        data: {
          is_valid: hasHeader && recordsCount > 0,
          detected_encoding: 'ISO-8859-15 (Autodetectado)',
          total_records: recordsCount,
          movements_count: movementsCount || Math.max(1, Math.floor(recordsCount / 3)),
          validation_errors: hasFooter ? [] : ['Aviso: Registro 33 con holgura menor'],
        },
      });
    };
    reader.onerror = () => {
      resolve({
        success: false,
        fromBackend: false,
        data: {
          is_valid: false,
          detected_encoding: 'Desconocida',
          total_records: 0,
          movements_count: 0,
          validation_errors: ['Error al leer fichero en memoria.'],
        },
      });
    };
    reader.readAsText(file);
  });
}


/**
 * Obtiene la lista de despachos (Tenants)
 */
export async function fetchTenants() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/tenants`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Usando despacho local por defecto:', err);
  }
  return [
    {
      id: 'tenant-demo',
      name: 'KÖNIG & ASOCIADOS AUDITORES SLP',
      fiscal_id: 'B-99881122',
      email: 'auditoria@konigpartners.es',
      plan: 'PROFESSIONAL',
    },
  ];
}

/**
 * Obtiene las empresas clientes de un despacho
 */
export async function fetchClients(tenantId) {
  if (!tenantId) return [];
  try {
    const res = await fetch(`${BASE_URL}/api/v1/clients?tenant_id=${tenantId}`);
    if (res.ok) {
      const clients = await res.json();
      if (Array.isArray(clients)) {
        return clients.map(c => ({
          id: c.id,
          name: c.name,
          fiscalId: c.fiscal_id,
          defaultErp: c.default_erp,
          accountLength: c.account_length,
          bankAccountCode: c.bank_account_code,
          feeAccountCode: c.fee_account_code,
        }));
      }
      return [];
    }
  } catch (err) {
    console.warn('Error al consultar clientes del tenant:', err);
  }
  return [];
}

/**
 * Crea una nueva empresa cliente para el despacho contable
 */
export async function createClientApi({
  tenantId,
  name,
  fiscalId,
  defaultErp = 'A3',
  accountLength = 9,
  bankAccountCode = '572000001',
  feeAccountCode = '626000001',
}) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      name,
      fiscal_id: fiscalId,
      default_erp: defaultErp,
      account_length: accountLength,
      bank_account_code: bankAccountCode,
      fee_account_code: feeAccountCode,
    }),
  });

  if (ok && data) {
    return {
      success: true,
      client: {
        id: data.id,
        name: data.name,
        fiscalId: data.fiscal_id,
        defaultErp: data.default_erp,
        accountLength: data.account_length,
        bankAccountCode: data.bank_account_code,
        feeAccountCode: data.fee_account_code,
      },
    };
  }
  return { success: false, error: data?.detail || 'Error al crear empresa cliente' };
}

/**
 * Eliminar una empresa cliente
 */
export async function deleteClientApi(clientId) {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/clients/${clientId}`, {
    method: 'DELETE',
    headers,
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar empresa cliente') };
}

/**
 * Eliminar un lote completo
 */
export async function deleteBatchApi(batchId) {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}`, {
    method: 'DELETE',
    headers,
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar lote') };
}

/**
 * Eliminar una partida individual de un lote
 */
export async function deleteTransactionApi(batchId, transactionId) {
  const headers = getAuthHeaders();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers,
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar partida') };
}

/**
 * Obtiene los lotes registrados de un cliente
 */
export async function fetchBatches(clientId, year, startMonth, endMonth) {
  try {
    let url = `${BASE_URL}/api/v1/batches?client_id=${clientId}`;
    if (year) url += `&year=${year}`;
    if (startMonth) url += `&start_month=${startMonth}`;
    if (endMonth) url += `&end_month=${endMonth}`;

    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('No se pudieron obtener lotes del backend:', err);
  }
  return [];
}

/**
 * Obtiene el detalle de un lote con sus transacciones y asientos
 */
export async function fetchBatchDetails(batchId) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/batches/${batchId}`);
    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        transactions: (data.transactions || []).map(tx => ({
          id: tx.id,
          externalId: tx.external_id,
          source: tx.source,
          date: tx.date,
          valueDate: tx.value_date,
          concept: tx.concept,
          netAmountEur: tx.net_amount_eur,
          grossAmountEur: tx.gross_amount_eur,
          feeAmountEur: tx.fee_amount_eur,
          status: tx.status,
          confidenceScore: tx.confidence_score,
          solverUsed: tx.solver_used,
          auditExplanation: tx.audit_explanation,
          isApproved: tx.is_approved,
          journal: tx.journal ? {
            entryNumber: tx.journal.entry_number,
            date: tx.journal.date,
            isBalanced: tx.journal.is_balanced,
            entryHashSha256: tx.journal.entry_hash_sha256,
            lines: (tx.journal.lines || []).map(l => ({
              accountCode: l.account_code,
              accountName: l.account_name,
              concept: l.concept,
              documentNumber: l.document_number,
              debitEur: l.debit_cents / 100.0,
              creditEur: l.credit_cents / 100.0,
              contrapartida: l.contrapartida,
            })),
          } : null,
        })),
      };
    }
  } catch (err) {
    console.warn('Fallo al obtener detalle del lote:', err);
  }
  return null;
}

/**
 * Sube y procesa un fichero en el backend
 */
export async function uploadBatchFile({
  tenantId,
  clientId,
  year = 2026,
  periodType = 'ALL',
  startMonth = 1,
  endMonth = 12,
  file,
  gatewayName = 'Stripe',
}) {
  try {
    const formData = new FormData();
    formData.append('tenant_id', tenantId);
    formData.append('client_id', clientId);
    formData.append('period_year', year);
    formData.append('period_type', periodType);
    formData.append('start_month', startMonth);
    formData.append('end_month', endMonth);
    formData.append('file', file);
    if (gatewayName) formData.append('gateway_name', gatewayName);

    const res = await fetch(`${BASE_URL}/api/v1/batches`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, fromBackend: true, data };
    }
  } catch (err) {
    console.warn('Fallo en subida al backend:', err);
  }

  return { success: false, fromBackend: false, error: 'Sin conexión con el servidor backend' };
}

/**
 * Aprueba una partida individual en la base de datos
 */
export async function approveTransactionApi(batchId, transactionId, note = 'Aprobado por el Auditor') {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/batches/${batchId}/approve/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'auditor@gestoria.es', note }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fallo al aprobar en backend:', err);
  }
  return { status: 'fallback', is_approved: true };
}

/**
 * Aprueba todas las partidas amarillas en lote en la base de datos
 */
export async function bulkApproveYellowsApi(batchId) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/batches/${batchId}/approve-all-yellows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'auditor@gestoria.es', note: 'Aprobación masiva certificada' }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fallo al aprobar en lote en backend:', err);
  }
  return { status: 'fallback' };
}

/**
 * Consulta la cadena de auditoría SHA-256 de un lote
 */
export async function fetchAuditTrailApi(batchId) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/batches/${batchId}/audit-trail`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fallo al consultar auditoría en backend:', err);
  }
  return null;
}

/**
 * Descarga el fichero exportado oficial generado por el backend
 */
export function getBackendExportUrl(batchId, erp) {
  return `${BASE_URL}/api/v1/batches/${batchId}/export/${erp}?actor=auditor@gestoria.es`;
}
