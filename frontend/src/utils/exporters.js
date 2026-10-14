/**
 * FICHERO: frontend/src/utils/exporters.js
 * Generadores oficiales de ficheros de intercambio contable para ERPs españoles
 * - Wolters Kluwer A3 (Suenlace / a3conv)
 * - Sage 50 / Sage Despachos (XDIARIO.csv)
 * - DELSOL Contasol (XLSX nativo / CSV)
 */
import * as XLSX from 'xlsx';
import { formatAccountCode } from './formatters';

/**
 * Genera fichero Suenlace para Wolters Kluwer A3.
 * Estructura: Asiento;Fecha;Cuenta;Signo;Importe;Concepto;Documento;Contrapartida
 */
export function generateA3Suenlace(journals, accountLength = 9) {
  const lines = [];

  journals.forEach((journal, idx) => {
    const [year, month, day] = (journal.date || '2026-01-01').split('-');
    const dateFormatted = `${day}${month}${year}`;
    const entryFormatted = String(journal.entryNumber || idx + 1).padStart(6, '0');

    (journal.lines || []).forEach((line) => {
      const acct = formatAccountCode(line.accountCode, accountLength);
      const concept = (line.concept || '').replace(/;/g, ' ').trim().slice(0, 30);
      const doc = (line.documentNumber || '').replace(/;/g, ' ').trim().slice(0, 10);
      const contra = line.contrapartida
        ? formatAccountCode(line.contrapartida, accountLength)
        : '';

      const isDebit = Number(line.debitEur) > 0;
      const sign = isDebit ? 'D' : 'H';
      const amountVal = isDebit ? Number(line.debitEur) : Number(line.creditEur);
      const amountFormatted = amountVal.toFixed(2);

      lines.push(
        `${entryFormatted};${dateFormatted};${acct};${sign};${amountFormatted};${concept};${doc};${contra}`
      );
    });
  });

  return lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
}

/**
 * Genera fichero XDIARIO.csv para Sage 50 y Sage Despachos.
 * Cabecera oficial de 9 columnas: Asiento;Fecha;Cuenta;Concepto;Documento;Debe;Haber;Factura;Contrapartida
 */
export function generateSageXdiario(journals, accountLength = 9) {
  const lines = ['Asiento;Fecha;Cuenta;Concepto;Documento;Debe;Haber;Factura;Contrapartida'];

  journals.forEach((journal, idx) => {
    const [year, month, day] = (journal.date || '2026-01-01').split('-');
    const dateFormatted = `${day}/${month}/${year}`;
    const entryNum = journal.entryNumber || idx + 1;

    (journal.lines || []).forEach((line) => {
      const acct = formatAccountCode(line.accountCode, accountLength);
      const concept = (line.concept || '').replace(/;/g, ' ').trim().slice(0, 40);
      const doc = (line.documentNumber || '').replace(/;/g, ' ').trim().slice(0, 15);
      const debitFormatted = Number(line.debitEur || 0).toFixed(2);
      const creditFormatted = Number(line.creditEur || 0).toFixed(2);
      const contra = line.contrapartida
        ? formatAccountCode(line.contrapartida, accountLength)
        : '';

      lines.push(
        `${entryNum};${dateFormatted};${acct};${concept};${doc};${debitFormatted};${creditFormatted};${doc};${contra}`
      );
    });
  });

  return lines.join('\r\n') + '\r\n';
}

/**
 * Genera filas de diario para DELSOL Contasol con las 9 columnas oficiales
 */
export function getContasolRows(journals, accountLength = 9) {
  const rows = [];
  journals.forEach((journal, idx) => {
    const [year, month, day] = (journal.date || '2026-01-01').split('-');
    const dateFormatted = `${day}/${month}/${year}`;
    const entryNum = journal.entryNumber || idx + 1;

    (journal.lines || []).forEach((line) => {
      rows.push({
        Diario: 1, // Diario 1 General en Contasol
        Fecha: dateFormatted,
        Asiento: entryNum,
        Subcuenta: formatAccountCode(line.accountCode, accountLength),
        Concepto: (line.concept || '').trim().slice(0, 50),
        Documento: (line.documentNumber || '').trim().slice(0, 15),
        Debe: Number(Number(line.debitEur || 0).toFixed(2)),
        Haber: Number(Number(line.creditEur || 0).toFixed(2)),
        Contrapartida: line.contrapartida
          ? formatAccountCode(line.contrapartida, accountLength)
          : '',
      });
    });
  });
  return rows;
}

/**
 * Genera fichero Excel .xlsx nativo para Contasol
 */
export function generateContasolXlsx(journals, accountLength = 9) {
  const rows = getContasolRows(journals, accountLength);
  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 8 },  // Diario
    { wch: 12 }, // Fecha
    { wch: 10 }, // Asiento
    { wch: 14 }, // Subcuenta
    { wch: 40 }, // Concepto
    { wch: 16 }, // Documento
    { wch: 14 }, // Debe
    { wch: 14 }, // Haber
    { wch: 14 }, // Contrapartida
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asientos Contables');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadBinaryFile(arrayBuffer, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
