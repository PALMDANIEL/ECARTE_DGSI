import { addMonths, countDays, daysByYear, eligibilityDate, hoursToDays, parseWeekend, referencePeriod, roundDays, wholeMonths } from '../src/modules/leave/calendar';

const d = (s: string) => new Date(s + 'T00:00:00Z');
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('calendrier : mois et éligibilité', () => {
  it('ajoute des mois en conservant le jour, ou le dernier jour du mois', () => {
    expect(iso(addMonths(d('2025-03-01'), 11))).toBe('2026-02-01');
    expect(iso(addMonths(d('2025-03-31'), 11))).toBe('2026-02-28');
    expect(iso(addMonths(d('2024-03-31'), 11))).toBe('2025-02-28');
    expect(iso(addMonths(d('2023-08-31'), 6))).toBe('2024-02-29'); // année bissextile
    expect(iso(addMonths(d('2025-11-15'), 3))).toBe('2026-02-15');
  });
  it('donne la date d\'ouverture du droit (11 mois accomplis)', () => {
    expect(iso(eligibilityDate(d('2025-09-01'), 11))).toBe('2026-08-01');
    expect(iso(eligibilityDate(d('2015-01-01'), 11))).toBe('2015-12-01');
  });
  it('compte les mois entiers accomplis (dates incluses)', () => {
    expect(wholeMonths(d('2025-01-01'), d('2025-12-31'))).toBe(12);
    expect(wholeMonths(d('2025-03-15'), d('2025-12-31'))).toBe(9);
    expect(wholeMonths(d('2025-04-01'), d('2025-12-31'))).toBe(9);
    expect(wholeMonths(d('2025-12-31'), d('2025-12-31'))).toBe(0);
    expect(wholeMonths(d('2026-01-01'), d('2025-12-31'))).toBe(0);
  });
  it('délimite la période de référence', () => {
    expect([iso(referencePeriod(2026, '01-01').from), iso(referencePeriod(2026, '01-01').to)]).toEqual(['2026-01-01', '2026-12-31']);
    expect([iso(referencePeriod(2026, '07-01').from), iso(referencePeriod(2026, '07-01').to)]).toEqual(['2026-07-01', '2027-06-30']);
  });
  it('arrondit les prorata et convertit les heures', () => {
    expect(roundDays(22.5, 'FLOOR')).toBe(22);
    expect(roundDays(22.5, 'CEIL')).toBe(23);
    expect(roundDays(22.4, 'ROUND')).toBe(22);
    expect(hoursToDays(24, 24)).toBe(1);
    expect(hoursToDays(12, 24)).toBe(0.5);
    expect(hoursToDays(12, 8)).toBe(1.5);
    expect(hoursToDays(5, 8)).toBe(0.63);
  });
});

describe('calendrier : décompte des durées', () => {
  // lundi 20 avril 2026 → mardi 19 mai 2026 : 30 jours calendaires (exemple du formulaire de jouissance)
  it('décompte calendaire consécutif : le congé du 20 avril au 19 mai 2026 = 30 jours', () => {
    expect(countDays('2026-04-20', '2026-05-19', { mode: 'CALENDAR' })).toBe(30);
    expect(countDays('2026-07-16', '2026-07-16', { mode: 'CALENDAR' })).toBe(1);
  });
  it('décompte en jours ouvrés (hors week-end), semaine du lundi 20 au dimanche 26 avril 2026', () => {
    expect(countDays('2026-04-20', '2026-04-26', { mode: 'WORKING' })).toBe(5);
    expect(countDays('2026-04-25', '2026-04-26', { mode: 'WORKING' })).toBe(0);
    expect(countDays('2026-04-20', '2026-04-26', { mode: 'WORKING', weekend: [5, 6] })).toBe(5); // week-end vendredi-samedi
    expect(countDays('2026-04-20', '2026-04-26', { mode: 'WORKING', weekend: [] })).toBe(7);
  });
  it('retire les jours fériés seulement si l\'option est active', () => {
    const holidays = new Set(['2026-05-01']);
    expect(countDays('2026-04-30', '2026-05-04', { mode: 'CALENDAR', holidays, excludeHolidays: false })).toBe(5);
    expect(countDays('2026-04-30', '2026-05-04', { mode: 'CALENDAR', holidays, excludeHolidays: true })).toBe(4);
    expect(countDays('2026-04-30', '2026-05-04', { mode: 'WORKING', holidays, excludeHolidays: true })).toBe(2); // jeu 30, lun 4 ; ven 1er férié
  });
  it('refuse une période inversée', () => {
    expect(() => countDays('2026-05-02', '2026-05-01', { mode: 'CALENDAR' })).toThrow();
  });
  it('répartit une période à cheval sur deux années', () => {
    expect(daysByYear('2026-12-30', '2027-01-02', { mode: 'CALENDAR' })).toEqual({ 2026: 2, 2027: 2 });
    expect(daysByYear('2026-06-01', '2026-06-03', { mode: 'CALENDAR' })).toEqual({ 2026: 3 });
  });
  it('lit la définition du week-end', () => {
    expect(parseWeekend('0,6')).toEqual([0, 6]);
    expect(parseWeekend('5, 6')).toEqual([5, 6]);
    expect(parseWeekend('x,9')).toEqual([]);
  });
});
