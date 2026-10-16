/**
 * FICHERO: frontend/src/services/api.js
 * Cliente API de Producción con normalización estricta de esquemas contables
 */

const getBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (port === '5173' || port === '3000') {
      return 'http://127.0.0.1:8000';
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  }
  return '';
};

export const BASE_URL = getBaseUrl();
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

export function getAuthHeaders(includeJsonContentType = true) {
  const session = getStoredAuthSession();
  const headers = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (session && session.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  return headers;
}

export function getCurrentActorEmail() {
  const session = getStoredAuthSession();
  return session?.user?.email || 'auditor@despacho.es';
}

/**
 * Normaliza cualquier objeto de transacción proveniente del backend (snake_case o camelCase)
 * evitando errores de propiedades indefinidas en TransactionRow y DoubleEntryViewer.
 */
export function normalizeTransaction(tx) {
  if (!tx) return null;

  const rawJournal = tx.journal || null;
  const normalizedLines = rawJournal
    ? (rawJournal.lines || []).map((l) => ({
        accountCode: l.accountCode || l.account_code || '555000000',
        accountName: l.accountName || l.account_name || '',
        concept: l.concept || '',
        documentNumber: l.documentNumber || l.document_number || '',
        debitEur:
          l.debitEur !== undefined
            ? Number(l.debitEur)
            : Number(l.debit_cents || 0) / 100.0,
        creditEur:
          l.creditEur !== undefined
            ? Number(l.creditEur)
            : Number(l.credit_cents || 0) / 100.0,
        contrapartida: l.contrapartida || '',
      }))
    : [];

  const bankLine = normalizedLines.find((l) => l.accountCode.startsWith('572'));
  const customerLines = normalizedLines.filter((l) => l.accountCode.startsWith('430'));

  return {
    id: tx.id,
    externalId: tx.externalId ?? tx.external_id ?? tx.id,
    type:
      tx.type ||
      (customerLines.length > 1
        ? 'BATCH_PAYOUT'
        : tx.status === 'RED'
        ? 'EXCEPTION'
        : 'TRANSFER'),
    source: tx.source || 'Extracto Bancario',
    date: tx.date || '',
    valueDate: tx.valueDate || tx.value_date || tx.date || '',
    bankAccountCode: tx.bankAccountCode || tx.bank_account_code || bankLine?.accountCode || '572000001',
    concept: tx.concept || '',
    netAmountEur: Number(tx.netAmountEur ?? tx.net_amount_eur ?? 0),
    grossAmountEur: Number(tx.grossAmountEur ?? tx.gross_amount_eur ?? 0),
    feeAmountEur: Number(tx.feeAmountEur ?? tx.fee_amount_eur ?? 0),
    status: tx.status || 'RED',
    confidenceScore: Number(tx.confidenceScore ?? tx.confidence_score ?? 0),
    dimensions: tx.dimensions || {
      s_importe: 1.0,
      s_fecha: 0.9,
      s_texto: 0.85,
      s_fiscal: 0.9,
    },
    solverUsed: tx.solverUsed ?? tx.solver_used ?? 'Conciliación directa',
    matchedCount:
      tx.matchedCount ??
      tx.matched_count ??
      (customerLines.length > 0 ? customerLines.length : tx.status === 'RED' ? 0 : 1),
    auditExplanation: tx.auditExplanation ?? tx.audit_explanation ?? '',
    isApproved: Boolean(tx.isApproved ?? tx.is_approved ?? false),
    journal: rawJournal
      ? {
          entryNumber: rawJournal.entryNumber ?? rawJournal.entry_number ?? 1,
          date: rawJournal.date || tx.date || '',
          isBalanced: Boolean(rawJournal.isBalanced ?? rawJournal.is_balanced ?? true),
          entryHashSha256: rawJournal.entryHashSha256 ?? rawJournal.entry_hash_sha256 ?? '',
          lines: normalizedLines,
        }
      : null,
  };
}

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

export async function fetchMeApi() {
  const { ok, status, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (ok && data && data.id) {
    return { success: true, status, user: data };
  }
  return { success: false, status, error: data?.detail || 'Sesión no válida o expirada' };
}

export async function registerApi({
  email,
  password,
  fullName,
  companyName,
  fiscalId,
  role = 'ADMIN',
  plan = 'FREE',
}) {
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
      plan,
    }),
  });

  if (ok) {
    return await loginApi(email, password);
  }
  return { success: false, error: data?.detail || 'Error al registrar la cuenta' };
}

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

export async function fetchTenantSubscription(tenantId) {
  if (!tenantId) return null;
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/tenants/${tenantId}/subscription`, {
    headers: getAuthHeaders(),
  });
  return ok ? data : null;
}

export async function upgradeTenantPlanApi(tenantId, plan, extraBlocks = 0) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/tenants/${tenantId}/upgrade`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ plan, extra_blocks: extraBlocks }),
  });
  return { success: ok, data, error: ok ? null : (data?.detail || 'Error al actualizar el plan') };
}

export async function syncStripePayoutsApi({
  tenantId,
  clientId,
  stripeRestrictedKey,
  year = 2026,
  startMonth = 1,
  endMonth = 12,
  ephemeralMode = false,
}) {
  const { ok, status, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/stripe-sync`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      tenant_id: tenantId,
      client_id: clientId,
      stripe_restricted_key: stripeRestrictedKey,
      period_year: year,
      start_month: startMonth,
      end_month: endMonth,
      ephemeral_mode: ephemeralMode,
    }),
  });

  if (ok && data) {
    const normalizedData = {
      ...data,
      transactions: (data.transactions || []).map(normalizeTransaction).filter(Boolean),
    };
    return { success: true, data: normalizedData };
  }
  return {
    success: false,
    paywallTriggered: status === 402,
    error: typeof data?.detail === 'object' ? data.detail.message : (data?.detail || 'Error al sincronizar con Stripe'),
    quota: typeof data?.detail === 'object' ? data.detail.quota : null,
  };
}

export async function fetchAdminCompanies() {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies`, {
    headers: getAuthHeaders(),
  });
  return ok && Array.isArray(data) ? data : [];
}

export async function fetchPlatformStats() {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/stats`, {
    headers: getAuthHeaders(),
  });
  return ok ? data : null;
}

export async function updateCompanyPlanApi(tenantId, plan, extraBlocks = 0) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies/${tenantId}/plan`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ plan, extra_blocks: extraBlocks }),
  });
  return { success: ok, data, error: ok ? null : (data?.detail || 'Error al actualizar plan') };
}

export async function deleteCompanyApi(tenantId) {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/admin/companies/${tenantId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar compañía') };
}

export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE_URL}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { online: true, ...data };
    }
    return { online: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { online: false, reason: err.message || 'Sin conexión' };
  }
}

export async function fetchTenants() {
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/tenants`, {
    headers: getAuthHeaders(),
  });
  return ok && Array.isArray(data) ? data : [];
}

export async function fetchClients(tenantId) {
  if (!tenantId) return [];
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/clients?tenant_id=${encodeURIComponent(tenantId)}`, {
    headers: getAuthHeaders(),
  });
  if (ok && Array.isArray(data)) {
    return data.map((c) => ({
      id: c.id,
      tenantId: c.tenant_id,
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

export async function createClientApi({
  tenantId,
  name,
  fiscalId,
  defaultErp = 'A3',
  accountLength = 9,
  bankAccountCode = '572000001',
  feeAccountCode = '626000001',
}) {
  const { ok, status, data } = await safeJsonFetch(`${BASE_URL}/api/v1/clients`, {
    method: 'POST',
    headers: getAuthHeaders(),
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
        tenantId: data.tenant_id,
        name: data.name,
        fiscalId: data.fiscal_id,
        defaultErp: data.default_erp,
        accountLength: data.account_length,
        bankAccountCode: data.bank_account_code,
        feeAccountCode: data.fee_account_code,
      },
    };
  }
  return {
    success: false,
    paywallTriggered: status === 402,
    error: typeof data?.detail === 'object' ? data.detail.message : (data?.detail || 'Error al crear empresa cliente'),
  };
}

export async function deleteClientApi(clientId) {
  if (!clientId) return { success: false, error: 'ID no especificado' };
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/clients/${clientId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar empresa cliente') };
}

export async function deleteBatchApi(batchId) {
  if (!batchId) return { success: false, error: 'ID de lote no especificado' };
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar lote') };
}

export async function deleteTransactionApi(batchId, transactionId) {
  if (!batchId || !transactionId) return { success: false, error: 'IDs no especificados' };
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return { success: ok, error: ok ? null : (data?.detail || 'Error al eliminar partida') };
}

export async function fetchBatches(clientId, year, startMonth, endMonth) {
  if (!clientId) return [];
  let url = `${BASE_URL}/api/v1/batches?client_id=${encodeURIComponent(clientId)}`;
  if (year) url += `&year=${year}`;
  if (startMonth) url += `&start_month=${startMonth}`;
  if (endMonth) url += `&end_month=${endMonth}`;

  const { ok, data } = await safeJsonFetch(url, { headers: getAuthHeaders() });
  return ok && Array.isArray(data) ? data : [];
}

export async function fetchBatchDetails(batchId) {
  if (!batchId) return null;
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}`, {
    headers: getAuthHeaders(),
  });
  if (ok && data) {
    return {
      ...data,
      transactions: (data.transactions || []).map(normalizeTransaction).filter(Boolean),
    };
  }
  return null;
}

export async function uploadBatchFile({
  tenantId,
  clientId,
  year = 2026,
  periodType = 'ALL',
  startMonth = 1,
  endMonth = 12,
  file,
  invoicesFile = null,
  gatewayName = 'Stripe',
  ephemeralMode = false,
}) {
  try {
    const formData = new FormData();
    formData.append('tenant_id', tenantId);
    formData.append('client_id', clientId);
    formData.append('period_year', year);
    formData.append('period_type', periodType);
    formData.append('start_month', startMonth);
    formData.append('end_month', endMonth);

    const mainFilesList = Array.isArray(file) ? file : file ? [file] : [];
    if (mainFilesList.length > 0) {
      formData.append('file', mainFilesList[0]);
      mainFilesList.forEach((f) => {
        formData.append('files', f);
      });
    }

    const portfolioList = Array.isArray(invoicesFile)
      ? invoicesFile
      : invoicesFile
      ? [invoicesFile]
      : [];

    if (portfolioList.length > 0) {
      formData.append('invoices_file', portfolioList[0]);
      portfolioList.forEach((pf) => {
        formData.append('invoices_files', pf);
      });
    }

    if (gatewayName) formData.append('gateway_name', gatewayName);
    formData.append('ephemeral_mode', ephemeralMode ? 'true' : 'false');

    const res = await fetch(`${BASE_URL}/api/v1/batches`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: formData,
    });

    const rawText = await res.text();
    if (res.ok) {
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (data.transactions) {
        data.transactions = data.transactions.map(normalizeTransaction).filter(Boolean);
      }
      return { success: true, fromBackend: true, data };
    } else {
      const isPaywall = res.status === 402;
      let errDetail = '';
      try {
        const errJson = JSON.parse(rawText);
        if (typeof errJson.detail === 'string') {
          errDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errDetail = errJson.detail.map((e) => e.msg || JSON.stringify(e)).join(', ');
        } else if (errJson.detail && typeof errJson.detail === 'object') {
          errDetail = errJson.detail.message || JSON.stringify(errJson.detail);
        } else if (errJson.message) {
          errDetail = errJson.message;
        }
      } catch {
        errDetail = rawText && rawText.length < 200 ? rawText.trim() : `Error del servidor (código ${res.status})`;
      }
      if (!errDetail) {
        errDetail = `Error al procesar lote contable (HTTP ${res.status})`;
      }
      return { success: false, fromBackend: true, paywallTriggered: isPaywall, error: errDetail };
    }
  } catch (err) {
    return { success: false, fromBackend: false, error: err.message || 'Sin conexión con el servidor backend' };
  }
}

export async function approveTransactionApi(batchId, transactionId, note = 'Aprobado por el Auditor') {
  const actor = getCurrentActorEmail();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}/approve/${transactionId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ approved_by: actor, note }),
  });
  return ok ? data : { status: 'error' };
}

export async function bulkApproveYellowsApi(batchId) {
  const actor = getCurrentActorEmail();
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}/approve-all-yellows`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ approved_by: actor, note: 'Aprobación masiva certificada' }),
  });
  return ok ? data : { status: 'error' };
}

export async function fetchAuditTrailApi(batchId) {
  if (!batchId) return null;
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/batches/${batchId}/audit-trail`, {
    headers: getAuthHeaders(),
  });
  return ok ? data : null;
}

export async function downloadBackendExportBlob(batchId, erp) {
  const actor = encodeURIComponent(getCurrentActorEmail());
  const url = `${BASE_URL}/api/v1/batches/${batchId}/export/${erp}?actor=${actor}`;
  const res = await fetch(url, { headers: getAuthHeaders(false) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Error HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  return { blob, disposition };
}
