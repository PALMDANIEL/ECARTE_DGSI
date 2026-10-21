export interface ParsedCsv {
  headers: string[];
  rows: { line: number; values: Record<string, string> }[];
}

const normalizeHeader = (h: string) =>
  h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Parseur CSV (RFC 4180) : guillemets, virgules ou points-virgules (Excel français), BOM, retours chariot.
 * Les en-têtes sont normalisés (sans accents, minuscules, « _ »).
 */
export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] || '';
  const candidates = [';', ',', '\t'];
  const delimiter = candidates.reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ';');

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => {
    endCell();
    if (cells.some(c => c.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    recordLine = line + 1;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else { if (c === '\n') line++; cell += c; }
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) endCell();
    else if (c === '\n') { endRecord(); line++; recordLine = line; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || cells.length) endRecord();

  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].cells.map(normalizeHeader);
  const rows = records.slice(1).map(r => ({
    line: r.line,
    values: headers.reduce((acc: Record<string, string>, h, idx) => { acc[h] = (r.cells[idx] ?? '').trim(); return acc; }, {})
  }));
  return { headers, rows };
}

/** Accepte AAAA-MM-JJ ou JJ/MM/AAAA. Retourne null si vide, lève une erreur si invalide. */
export function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else throw new Error(`date invalide « ${v} » (formats : AAAA-MM-JJ ou JJ/MM/AAAA)`);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error(`date inexistante « ${v} »`);
  return date;
}
