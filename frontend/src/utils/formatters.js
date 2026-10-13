/**
 * Formateadores contables de alta precisión institucional
 * Estándar PGC / Normativa Bancaria Española
 */

export function formatEuro(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0,00 €';
  }
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatEuroNoSymbol(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0,00';
  }
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,0%';
  }
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numeric > 1 ? numeric / 100 : numeric);
}

export function formatDateSpanish(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatAccountCode(code, length = 9) {
  if (!code) return '—';
  const clean = code.replace(/\./g, '').trim();
  if (clean.length < length) {
    const prefix = clean.slice(0, 3);
    const suffix = clean.slice(3);
    return prefix + suffix.padStart(length - 3, '0');
  }
  return clean.slice(0, length);
}
