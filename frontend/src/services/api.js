/**
 * FICHERO: frontend/src/services/api.js
 * Cliente API con soporte multi-archivo real, motor PDF y gestión de cuentas Gestor
 */
import {
  getFileExtension,
  parsePdfInvoiceFile,
  buildTransactionFromInvoice,
  classifyUploadedFiles,
} from '../utils/pdfAndFileParser';

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
const TEAM_STORAGE_KEY = 'findaffinity_team_gestores';

export function getStoredTeamAccounts() {
  try {
    const raw = localStorage.getItem(TEAM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredTeamAccounts(list) {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Error guardando cuentas gestor:', err);
  }
}

function applyTeamOverrideIfGestor(user) {
  if (!user || !user.email) return user;
  const teamList = getStoredTeamAccounts();
  const match = teamList.find((g) => g.email.toLowerCase() === user.email.toLowerCase());
  if (match) {
    return {
      ...user,
      role: 'GESTOR',
      tenant_id: match.tenantId || user.tenant_id,
      company_name: match.companyName || user.company_name,
      full_name: match.fullName || user.full_name,
    };
  }
  return user;
}

export function getStoredAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.user) {
      parsed.user = applyTeamOverrideIfGestor(parsed.user);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(token, user) {
  try {
    const normalizedUser = applyTeamOverrideIfGestor(user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user: normalizedUser }));
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

export function normalizeTransaction(tx, fallbackIdx = 1) {
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

  const bankLine = normalizedLines.find((l) => String(l.accountCode).startsWith('572'));
  const customerLines = normalizedLines.filter((l) => String(l.accountCode).startsWith('430'));

  return {
    id: tx.id || `TX-${fallbackIdx}`,
    externalId: tx.externalId ?? tx.external_id ?? tx.id,
    type:
      tx.type ||
      (customerLines.length > 1
        ? 'BATCH_PAYOUT'
        : tx.status === 'RED'
        ? 'EXCEPTION'
        : 'TRANSFER'),
    source: tx.source || 'Extracto',
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
    solverUsed: tx.solverUsed ?? tx.solver_used ?? 'Conciliación automática',
    matchedCount:
      tx.matchedCount ??
      tx.matched_count ??
      (customerLines.length > 0 ? customerLines.length : tx.status === 'RED' ? 0 : 1),
    auditExplanation: tx.auditExplanation ?? tx.audit_explanation ?? '',
    isApproved: Boolean(tx.isApproved ?? tx.is_approved ?? false),
    journal: rawJournal
      ? {
          entryNumber: rawJournal.entryNumber ?? rawJournal.entry_number ?? fallbackIdx,
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
  const cleanEmail = email.trim();
  let { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, password }),
  });

  // Si es una cuenta Gestor creada por el Admin y la BD se reinició, la sincronizamos
  if (!ok) {
    const teamList = getStoredTeamAccounts();
    const matchGestor = teamList.find(
      (g) => g.email.toLowerCase() === cleanEmail.toLowerCase() && g.password === password
    );
    if (matchGestor) {
      await safeJsonFetch(`${BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: matchGestor.email,
          password: matchGestor.password,
          full_name: matchGestor.fullName || 'Gestor Contable',
          company_name: matchGestor.companyName || 'Despacho',
          fiscal_id: `G-${Date.now().toString().slice(-8)}`,
          role: 'AUDITOR',
          plan: 'PROFESSIONAL',
        }),
      });
      const retry = await safeJsonFetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      ok = retry.ok;
      data = retry.data;
    }
  }

  if (ok && data?.access_token) {
    const finalUser = applyTeamOverrideIfGestor(data.user);
    saveAuthSession(data.access_token, finalUser);
    return { success: true, token: data.access_token, user: finalUser };
  }
  return { success: false, error: data?.detail || 'Credenciales incorrectas' };
}

export async function fetchMeApi() {
  const { ok, status, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (ok && data && data.id) {
    const finalUser = applyTeamOverrideIfGestor(data);
    return { success: true, status, user: finalUser };
  }
  return { success: false, status, error: data?.detail || 'Sesión no válida o expirada' };
}

/**
 * Crea una cuenta Gestor vinculada al despacho del Admin actual sin cerrar la sesión del Admin
 * y sin requerir pago ni registro externo.
 */
export async function createGestorAccountApi({
  adminUser,
  tenantId,
  fullName,
  email,
  password,
}) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (fullName || 'Gestor Contable').trim();

  // Intentamos registrar las credenciales en el backend para que obtenga JWT al iniciar sesión
  const randomFiscalSuffix = `G${Math.floor(10000000 + Math.random() * 90000000)}`;
  const { ok, data } = await safeJsonFetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cleanEmail,
      password,
      full_name: cleanName,
      company_name: adminUser?.company_name || 'Despacho Contable',
      fiscal_id: randomFiscalSuffix,
      role: 'AUDITOR',
      plan: 'PROFESSIONAL',
    }),
  });

  if (!ok && data?.detail && !String(data.detail).toLowerCase().includes('ya está registrado')) {
    return { success: false, error: data.detail || 'No se pudo crear la cuenta Gestor' };
  }

  const existing = getStoredTeamAccounts().filter((g) => g.email.toLowerCase() !== cleanEmail);
  const newGestor = {
    id: `GESTOR-${Date.now()}`,
    fullName: cleanName,
    email: cleanEmail,
    password,
    role: 'GESTOR',
    tenantId,
    companyName: adminUser?.company_name || 'Despacho Contable',
    createdAt: new Date().toISOString(),
  };

  const updated = [...existing, newGestor];
  saveStoredTeamAccounts(updated);

  return { success: true, gestor: newGestor, list: updated };
}

export function listGestorAccountsForTenant(tenantId) {
  const all = getStoredTeamAccounts();
  if (!tenantId) return all;
  return all.filter((g) => !g.tenantId || g.tenantId === tenantId);
}

export function deleteGestorAccount(email) {
  const updated = getStoredTeamAccounts().filter(
    (g) => g.email.toLowerCase() !== email.toLowerCase()
  );
  saveStoredTeamAccounts(updated);
  return updated;
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
  ephemeralMode = true,
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
    return {
      success: true,
      data: {
        ...data,
        transactions: (data.transactions || []).map((t, i) => normalizeTransaction(t, i + 1)).filter(Boolean),
      },
    };
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
      transactions: (data.transactions || [])
        .map((tx, idx) => normalizeTransaction(tx, idx + 1))
        .filter(Boolean),
    };
  }
  return null;
}

async function sendSingleBatchRequest({
  tenantId,
  clientId,
  year,
  periodType,
  startMonth,
  endMonth,
  mainFile,
  portfolioFile,
  ephemeralMode = true,
}) {
  const formData = new FormData();
  formData.append('tenant_id', tenantId);
  formData.append('client_id', clientId);
  formData.append('period_year', year);
  formData.append('period_type', periodType);
  formData.append('start_month', startMonth);
  formData.append('end_month', endMonth);
  formData.append('file', mainFile);
  formData.append('files', mainFile);
  if (portfolioFile) {
    formData.append('invoices_file', portfolioFile);
    formData.append('invoices_files', portfolioFile);
  }
  formData.append('gateway_name', 'Stripe');
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
    return { ok: true, status: res.status, data };
  }

  let errDetail = '';
  try {
    const errJson = JSON.parse(rawText);
    errDetail =
      typeof errJson.detail === 'string'
        ? errJson.detail
        : errJson.detail?.message || errJson.message || `Error HTTP ${res.status}`;
  } catch {
    errDetail = rawText && rawText.length < 200 ? rawText.trim() : `Error HTTP ${res.status}`;
  }
  return { ok: false, status: res.status, paywallTriggered: res.status === 402, error: errDetail };
}

/**
 * Procesa cualquier combinación de archivos (1 o 20+ PDFs, múltiples extractos .n43/.csv/.xlsx,
 * o mezcla de extractos + facturas) y devuelve TODAS las transacciones juntas.
 */
export async function uploadBatchFile({
  tenantId,
  clientId,
  year = 2026,
  periodType = 'ALL',
  startMonth = 1,
  endMonth = 12,
  file,
  invoicesFile = null,
  ephemeralMode = true,
}) {
  try {
    const rawMain = Array.isArray(file) ? file : file ? [file] : [];
    const rawInv = Array.isArray(invoicesFile) ? invoicesFile : invoicesFile ? [invoicesFile] : [];

    // Unificamos todos los archivos subidos sin duplicados
    const seen = new Set();
    const allFiles = [];
    for (const f of [...rawMain, ...rawInv]) {
      const key = `${f.name}_${f.size}`;
      if (!seen.has(key)) {
        seen.add(key);
        allFiles.push(f);
      }
    }

    const { statementFiles, portfolioFiles } = await classifyUploadedFiles(allFiles);

    // Extraemos todas las facturas de cualquier archivo .pdf o .json en cartera
    const pdfFiles = portfolioFiles.filter((f) => getFileExtension(f.name) === '.pdf');
    const nonPdfPortfolioFiles = portfolioFiles.filter((f) => getFileExtension(f.name) !== '.pdf');

    const extractedPdfInvoices = [];
    for (let i = 0; i < pdfFiles.length; i++) {
      const parsed = await parsePdfInvoiceFile(pdfFiles[i], i + 1);
      if (parsed) extractedPdfInvoices.push(parsed);
    }

    // Si hay JSONs en cartera, también leemos sus facturas para consolidar
    for (const jf of nonPdfPortfolioFiles) {
      if (getFileExtension(jf.name) === '.json') {
        try {
          const txt = await jf.text();
          const parsedJson = JSON.parse(txt);
          if (Array.isArray(parsedJson)) {
            extractedPdfInvoices.push(...parsedJson);
          }
        } catch {
          // Ignorar JSON malformado
        }
      }
    }

    // Crear un único archivo JSON de cartera consolidada si hay PDFs/JSONs
    let consolidatedPortfolioFile = nonPdfPortfolioFiles[0] || null;
    if (extractedPdfInvoices.length > 0) {
      const jsonBlob = new Blob([JSON.stringify(extractedPdfInvoices, null, 2)], {
        type: 'application/json',
      });
      consolidatedPortfolioFile = new File([jsonBlob], 'cartera_consolidada.json', {
        type: 'application/json',
      });
    }

    // CASO 1: Hay extractos bancarios/pasarelas (.n43, .csv, .xlsx) -> Procesar TODOS los extractos y unirlos
    if (statementFiles.length > 0) {
      const combinedTransactions = [];
      let lastBatchId = null;

      for (const stFile of statementFiles) {
        const res = await sendSingleBatchRequest({
          tenantId,
          clientId,
          year,
          periodType,
          startMonth,
          endMonth,
          mainFile: stFile,
          portfolioFile: consolidatedPortfolioFile,
          ephemeralMode,
        });

        if (!res.ok) {
          if (res.paywallTriggered) {
            return { success: false, fromBackend: true, paywallTriggered: true, error: res.error };
          }
          // Si hay más archivos, continuamos o reportamos si es el único
          if (statementFiles.length === 1) {
            return { success: false, fromBackend: true, error: res.error };
          }
          continue;
        }

        if (res.data?.batch_id || res.data?.id) {
          lastBatchId = res.data.batch_id || res.data.id;
        }
        const txs = (res.data?.transactions || [])
          .map((t, idx) => normalizeTransaction(t, combinedTransactions.length + idx + 1))
          .filter(Boolean);
        combinedTransactions.push(...txs);
      }

      return {
        success: true,
        fromBackend: true,
        data: {
          batch_id: lastBatchId,
          total_movements: combinedTransactions.length,
          transactions: combinedTransactions,
        },
      };
    }

    // CASO 2: El usuario subió SOLO facturas (ej. 1 PDF, 20 PDFs, o un Excel/CSV de cartera)
    const combinedInvoiceTransactions = [];

    // 2A. Si subió archivos Excel/CSV de cartera (no PDF), los enviamos uno por uno al backend
    for (const pf of nonPdfPortfolioFiles) {
      if (getFileExtension(pf.name) !== '.json') {
        const res = await sendSingleBatchRequest({
          tenantId,
          clientId,
          year,
          periodType,
          startMonth,
          endMonth,
          mainFile: pf,
          portfolioFile: pf,
          ephemeralMode,
        });
        if (res.ok && res.data?.transactions?.length > 0) {
          const txs = res.data.transactions
            .map((t, idx) => normalizeTransaction(t, combinedInvoiceTransactions.length + idx + 1))
            .filter(Boolean);
          combinedInvoiceTransactions.push(...txs);
        } else if (res.paywallTriggered) {
          return { success: false, fromBackend: true, paywallTriggered: true, error: res.error };
        }
      }
    }

    // 2B. Si subió PDFs o JSONs, generamos las partidas completas para TODOS los PDFs (los 20 juntos, no solo 1)
    if (extractedPdfInvoices.length > 0) {
      extractedPdfInvoices.forEach((inv, idx) => {
        const tx = buildTransactionFromInvoice(inv, combinedInvoiceTransactions.length + idx + 1);
        combinedInvoiceTransactions.push(tx);
      });
    }

    if (combinedInvoiceTransactions.length > 0) {
      return {
        success: true,
        fromBackend: true,
        data: {
          batch_id: null,
          total_movements: combinedInvoiceTransactions.length,
          transactions: combinedInvoiceTransactions,
        },
      };
    }

    return {
      success: false,
      fromBackend: true,
      error: 'No se encontraron partidas válidas en los archivos seleccionados.',
    };
  } catch (err) {
    return {
      success: false,
      fromBackend: false,
      error: err.message || 'Error procesando los archivos.',
    };
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
