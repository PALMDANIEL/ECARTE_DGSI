const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Parse « AAAA-MM-JJ » en date UTC (aucun décalage de fuseau horaire). */
export function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Date invalide : ${iso}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`Date inexistante : ${iso}`);
  return d;
}

export const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);
const day = (d: Date) => (d.getUTCDate() === 1 ? '1er' : String(d.getUTCDate()));

/** 05/06/2026 */
export const shortDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? parseIsoDate(d) : d;
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
};

/** 14 juillet 2026 */
export const longDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? parseIsoDate(d) : d;
  return `${day(date)} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/** lundi 20 avril 2026 */
export const fullDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? parseIsoDate(d) : d;
  return `${WEEKDAYS[date.getUTCDay()]} ${longDate(date)}`;
};

/** Nombre de jours calendaires, bornes incluses. */
export const inclusiveDays = (start: string, end: string): number =>
  Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / 86400000) + 1;

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** Nombre en toutes lettres (orthographe de 1990 non appliquée : traits d'union usuels), de 0 à 999 999. */
export function numberToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999) throw new Error('Nombre hors limites');
  if (n < 17) return UNITS[n];
  if (n < 20) return 'dix-' + UNITS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    return TENS[t] + (u === 1 ? ' et un' : '-' + UNITS[u]);
  }
  if (n < 80) {
    const u = n - 60;
    return 'soixante' + (u === 11 ? ' et onze' : '-' + numberToFrench(u));
  }
  if (n < 100) {
    const u = n - 80;
    return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + numberToFrench(u);
  }
  if (n < 1000) {
    const c = Math.floor(n / 100), r = n % 100;
    const head = c === 1 ? 'cent' : UNITS[c] + ' cent';
    if (r === 0) return c === 1 ? 'cent' : UNITS[c] + ' cents';
    return head + ' ' + numberToFrench(r);
  }
  const k = Math.floor(n / 1000), r = n % 1000;
  const head = k === 1 ? 'mille' : numberToFrench(k) + ' mille';
  return r === 0 ? head : head + ' ' + numberToFrench(r);
}

export const upperFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const VOWEL = /^[aeiouyhàâäéèêëîïôöùûüœ]/i;

export const civilityLabel = (c?: string | null): string => (c === 'MME' ? 'Madame' : c === 'MLLE' ? 'Mademoiselle' : 'Monsieur');

/**
 * « Monsieur le Ministre de l'Économie… », « Madame la Directrice… », « Monsieur l'Inspecteur… ».
 * L'intitulé du poste doit être saisi au genre du titulaire (Directeur / Directrice).
 */
export function addressTitle(civility: string | null | undefined, positionLabel: string): string {
  const label = positionLabel.trim(); // la casse de l'intitulé est conservée (« Ministre », « Chef de Service »…)
  const feminine = civility === 'MME' || civility === 'MLLE';
  const article = VOWEL.test(label) ? "l'" : feminine ? 'la ' : 'le ';
  return `${civilityLabel(civility)} ${article}${label}`;
}

/** Durée d'un congé en jours calendaires : « un mois », « deux mois », sinon « trente (30) jours ». */
export function leaveDurationPhrase(days: number): string {
  if (days >= 28 && days % 30 === 0 && days <= 90) return days === 30 ? "d'un mois" : `de ${numberToFrench(days / 30)} mois`;
  return `de ${numberToFrench(days)} (${days}) jour${days > 1 ? 's' : ''}`;
}

/** « vingt-quatre (24) heures » / « un (1) jour » */
export function quantityText(n: number, unit: 'heure' | 'jour'): string {
  return `${numberToFrench(n)} (${n}) ${unit}${n > 1 ? 's' : ''}`;
}

/**
 * Formule d'appel déduite de l'intitulé : « Monsieur le Ministre de l'Économie… » → « Monsieur le Ministre »,
 * « Monsieur le Chef de Service Développement des Applications » → « Monsieur le Chef de Service ».
 */
export function salutationFromTitle(title: string): string {
  const m = /^(Monsieur|Madame|Mademoiselle)\s+(le |la |l')(.*)$/i.exec(title.trim());
  if (!m) return title;
  const [, civ, art, rest] = m;
  const chef = /^(chef (?:de|du|d')\s?(?:la |l')?\s?[^\s]+)/i.exec(rest);
  if (chef) return `${civ} ${art}${chef[1]}`;
  const cut = rest.search(/\s(?:des|du|de|d')\s?/i);
  return `${civ} ${art}${cut > 0 ? rest.slice(0, cut) : rest}`;
}

/** « à la Direction Générale… », « au Service… » */
export function locativeStructure(name: string): string {
  if (/^(direction|cellule|unité|inspection|agence)/i.test(name)) return `à la ${name}`;
  if (/^(service|secrétariat|cabinet|bureau|département)/i.test(name)) return `au ${name}`;
  return `à ${name}`;
}
