/**
 * FICHERO: frontend/src/utils/exporters.js
 * Generadores oficiales de ficheros de intercambio contable para ERPs españoles
 */
import * as XLSX from 'xlsx';
import { formatAccountCode } from './formatters';

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

export function getContasolRows(journals, accountLength = 9) {
  const rows = [];
  journals.forEach((journal, idx) => {
    const [year, month, day] = (journal.date || '2026-01-01').split('-');
    const dateFormatted = `${day}/${month}/${year}`;
    const entryNum = journal.entryNumber || idx + 1;

    (journal.lines || []).forEach((line) => {
      rows.push({
        Diario: 1,
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

export function generateContasolXlsx(journals, accountLength = 9) {
  const rows = getContasolRows(journals, accountLength);
  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 40 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asientos Contables');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

/**
 * Codifica un string JS a bytes Windows-1252 reales para que A3 y Sage 50
 * lean correctamente tildes y la letra Ñ sin depender de UTF-8.
 */
function encodeWindows1252(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0xff) {
      bytes[i] = code;
    } else if (code === 0x20ac) {
      bytes[i] = 0x80; // Símbolo € en Windows-1252
    } else {
      bytes[i] = 0x3f; // '?'
    }
  }
  return bytes;
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=windows-1252') {
  const isWin1252 = mimeType.toLowerCase().includes('windows-1252');
  const payload = isWin1252 ? encodeWindows1252(content) : new TextEncoder().encode('\uFEFF' + content);
  const blob = new Blob([payload], { type: mimeType });
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
