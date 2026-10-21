import { parseIsoDate, toIsoDate } from '../../shared/utils/fr-format';

export type CountMode = 'CALENDAR' | 'WORKING';

export interface CountOptions {
  mode: CountMode;
  /** Jours fériés (AAAA-MM-JJ) à ne pas décompter ; ignoré si excludeHolidays est faux. */
  holidays?: Set<string>;
  excludeHolidays?: boolean;
  /** Jours de week-end (0 = dimanche … 6 = samedi). */
  weekend?: number[];
}

export const parseWeekend = (csv: string): number[] =>
  csv.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);

/** Ajoute des mois à une date en conservant le jour ; si le jour n'existe pas dans le mois d'arrivée, on prend le dernier jour du mois. */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Date à laquelle `months` mois de services sont accomplis (ex. entrée le 01/03/2025 + 11 mois = 01/02/2026). */
export const eligibilityDate = (serviceStart: Date, months: number): Date => addMonths(serviceStart, months);

/**
 * Décompte des jours entre deux dates incluses.
 * CALENDAR : tous les jours (congé « consécutif », art. 53). WORKING : hors week-ends.
 * Les jours fériés sont retirés seulement si excludeHolidays est actif.
 */
export function countDays(start: string, end: string, opts: CountOptions): number {
  const from = parseIsoDate(start), to = parseIsoDate(end);
  if (to < from) throw new Error('La date de fin précède la date de début');
  const weekend = opts.weekend ?? [0, 6];
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (opts.mode === 'WORKING' && weekend.includes(d.getUTCDay())) continue;
    if (opts.excludeHolidays && opts.holidays?.has(toIsoDate(d))) continue;
    n++;
  }
  return n;
}

/** Répartit une période sur les années civiles (pour imputer les plafonds annuels). */
export function daysByYear(start: string, end: string, opts: CountOptions): Record<number, number> {
  const from = parseIsoDate(start), to = parseIsoDate(end);
  const weekend = opts.weekend ?? [0, 6];
  const out: Record<number, number> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (opts.mode === 'WORKING' && weekend.includes(d.getUTCDay())) continue;
    if (opts.excludeHolidays && opts.holidays?.has(toIsoDate(d))) continue;
    out[d.getUTCFullYear()] = (out[d.getUTCFullYear()] || 0) + 1;
  }
  return out;
}

/** Période de référence « année Y » : de MM-JJ de l'année Y au jour précédent MM-JJ de l'année Y+1 (01-01 → année civile). */
export function referencePeriod(year: number, startMmDd: string): { from: Date; to: Date } {
  const [mm, dd] = startMmDd.split('-').map(Number);
  const from = new Date(Date.UTC(year, mm - 1, dd));
  const nextStart = new Date(Date.UTC(year + 1, mm - 1, dd));
  return { from, to: addDays(nextStart, -1) };
}

/** Mois entiers accomplis entre deux dates incluses (ex. 15/03 → 31/12 = 9 mois et 16 jours → 9). */
export function wholeMonths(from: Date, toInclusive: Date): number {
  const end = addDays(toInclusive, 1);
  if (end <= from) return 0;
  let m = (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + (end.getUTCMonth() - from.getUTCMonth());
  while (m > 0 && addMonths(from, m) > end) m--;
  return m;
}

export const roundDays = (n: number, mode: 'FLOOR' | 'ROUND' | 'CEIL') => (mode === 'CEIL' ? Math.ceil(n) : mode === 'ROUND' ? Math.round(n) : Math.floor(n));

/** Heures → jours (décimal à 2 chiffres) selon le nombre d'heures par jour paramétré. */
export const hoursToDays = (hours: number, hoursPerDay: number): number => Math.round((hours / hoursPerDay) * 100) / 100;
