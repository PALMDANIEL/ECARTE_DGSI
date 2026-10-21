import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { shortDate, toIsoDate } from '../../shared/utils/fr-format';
import { RULE_DEFAULTS, rulesService } from '../settings/rules.service';
import { CountMode, CountOptions, addMonths, eligibilityDate, parseWeekend, referencePeriod, roundDays, wholeMonths } from './calendar';

type Db = Prisma.TransactionClient | typeof prisma;

export const LEAVE_TYPE = 'CONGE_ANNUEL';

export interface LeaveRules {
  annualDays: number; eligibilityMonths: number; eligibilityBasis: 'PERIOD_END' | 'AT_REQUEST'; referenceStart: string;
  prorationEnabled: boolean; prorationRounding: 'FLOOR' | 'ROUND' | 'CEIL'; carryOverMax: number; maxFractions: number; fractionMaxDays: number;
  leaveCountMode: CountMode; leaveExcludeHolidays: boolean; requireServiceDate: boolean;
  absenceCountMode: CountMode; absenceExcludeHolidays: boolean; hoursPerDay: number; enforceCap: boolean; weekend: number[];
}

export interface Entitlement {
  eligible: boolean;
  reason: string | null;
  year: number;
  serviceStart: string | null;
  eligibleFrom: string | null;
  days: number;
  period: { from: string; to: string };
  rules: Pick<LeaveRules, 'annualDays' | 'eligibilityMonths' | 'eligibilityBasis' | 'referenceStart' | 'prorationEnabled' | 'carryOverMax'>;
}

const KEYS = ['leave.annual_days', 'leave.eligibility_months', 'leave.eligibility_basis', 'leave.reference_period_start', 'leave.proration_enabled', 'leave.proration_rounding', 'leave.carry_over_max_days', 'leave.max_fractions', 'leave.fraction_max_days', 'leave.count_mode', 'leave.exclude_holidays', 'leave.require_service_date', 'absence.count_mode', 'absence.exclude_holidays', 'absence.hours_per_day', 'absence.enforce_cap', 'calendar.weekend_days'];

export async function loadRules(companyId: string, regime?: string | null, at = new Date()): Promise<LeaveRules> {
  const v = await rulesService.getMany(companyId, KEYS, at, regime);
  return {
    annualDays: v['leave.annual_days'], eligibilityMonths: v['leave.eligibility_months'], eligibilityBasis: v['leave.eligibility_basis'], referenceStart: v['leave.reference_period_start'],
    prorationEnabled: v['leave.proration_enabled'], prorationRounding: v['leave.proration_rounding'], carryOverMax: v['leave.carry_over_max_days'], maxFractions: v['leave.max_fractions'],
    fractionMaxDays: v['leave.fraction_max_days'], leaveCountMode: v['leave.count_mode'], leaveExcludeHolidays: v['leave.exclude_holidays'], requireServiceDate: v['leave.require_service_date'],
    absenceCountMode: v['absence.count_mode'], absenceExcludeHolidays: v['absence.exclude_holidays'], hoursPerDay: v['absence.hours_per_day'], enforceCap: v['absence.enforce_cap'], weekend: parseWeekend(v['calendar.weekend_days'])
  };
}

export async function loadHolidays(companyId: string): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ where: { companyId }, select: { date: true } });
  return new Set(rows.map(r => toIsoDate(r.date)));
}

export async function countOptions(companyId: string, kind: 'LEAVE' | 'ABSENCE', rules: LeaveRules): Promise<CountOptions> {
  const exclude = kind === 'LEAVE' ? rules.leaveExcludeHolidays : rules.absenceExcludeHolidays;
  return { mode: kind === 'LEAVE' ? rules.leaveCountMode : rules.absenceCountMode, excludeHolidays: exclude, holidays: exclude ? await loadHolidays(companyId) : undefined, weekend: rules.weekend };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class LeaveService {
  // ------------------------------------------------------------------ droits
  /**
   * Droit au congé annuel d'un agent pour une année de référence (loi 081-2015/CNT, art. 53 : 30 jours consécutifs
   * pour 11 mois de services accomplis). Aucune proratisation sauf paramétrage explicite.
   */
  async entitlement(agentId: string, year: number, at = new Date()): Promise<Entitlement> {
    const profile = await prisma.agentProfile.findUnique({ where: { userId: agentId } });
    if (!profile) throw new AppError('Agent introuvable', 404);
    const rules = await loadRules(profile.companyId, profile.regime, at);
    const period = referencePeriod(year, rules.referenceStart);
    const base = { year, period: { from: toIsoDate(period.from), to: toIsoDate(period.to) }, rules: { annualDays: rules.annualDays, eligibilityMonths: rules.eligibilityMonths, eligibilityBasis: rules.eligibilityBasis, referenceStart: rules.referenceStart, prorationEnabled: rules.prorationEnabled, carryOverMax: rules.carryOverMax } };

    // Les régimes autres que fonctionnaire n'ont pas de droit tant qu'ils ne sont pas paramétrés explicitement
    if (profile.regime !== 'FONCTIONNAIRE') {
      const configured = await prisma.ruleParameter.findFirst({ where: { companyId: profile.companyId, key: `leave.annual_days@${profile.regime}`, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] } });
      if (!configured) return { ...base, eligible: false, reason: `Le régime « ${profile.regime} » n'est pas paramétré : les droits ne peuvent pas être calculés`, serviceStart: null, eligibleFrom: null, days: 0 };
    }
    const start = profile.serviceStartDate ?? profile.hireDate;
    if (!start) {
      return rules.requireServiceDate
        ? { ...base, eligible: false, reason: "La date d'entrée en service de l'agent n'est pas renseignée : contactez les ressources humaines", serviceStart: null, eligibleFrom: null, days: 0 }
        : { ...base, eligible: true, reason: null, serviceStart: null, eligibleFrom: null, days: rules.annualDays };
    }
    const eligibleFrom = eligibilityDate(start, rules.eligibilityMonths);
    const reached = rules.eligibilityBasis === 'AT_REQUEST' ? eligibleFrom <= at : eligibleFrom <= period.to;
    if (!reached) {
      return { ...base, eligible: false, serviceStart: toIsoDate(start), eligibleFrom: toIsoDate(eligibleFrom), days: 0,
        reason: `${rules.eligibilityMonths} mois de services accomplis requis : droit ouvert à partir du ${shortDate(eligibleFrom)}` };
    }
    let days = rules.annualDays;
    if (rules.prorationEnabled) {
      const months = Math.min(12, wholeMonths(start > period.from ? start : period.from, period.to));
      days = roundDays((rules.annualDays * months) / 12, rules.prorationRounding);
    }
    return { ...base, eligible: true, reason: null, serviceStart: toIsoDate(start), eligibleFrom: toIsoDate(eligibleFrom), days };
  }

  /**
   * Inscrit au registre le droit acquis de l'année (une seule fois : l'écriture est figée, un changement ultérieur de paramètre
   * ne la modifie pas) et le report éventuel de l'année précédente.
   */
  async ensureAcquired(db: Db, agentId: string, year: number): Promise<void> {
    const ent = await this.entitlement(agentId, year);
    const profile = await db.agentProfile.findUniqueOrThrow({ where: { userId: agentId } });
    if (!ent.eligible || ent.days <= 0) return;
    await db.$executeRaw`
      INSERT INTO "leave_ledger" ("id", "companyId", "agentId", "leaveType", "year", "nature", "days", "ruleSnapshot", "reason")
      VALUES (${crypto.randomUUID()}, ${profile.companyId}, ${agentId}, ${LEAVE_TYPE}, ${year}, 'ACQUIS'::"LedgerNature", ${ent.days}, ${JSON.stringify(ent.rules)}::jsonb, ${`Droit annuel ${year}`})
      ON CONFLICT DO NOTHING`;
    if (ent.rules.carryOverMax > 0) {
      const prev = await this.balance(agentId, year - 1, LEAVE_TYPE, db);
      const carry = Math.min(Math.max(prev.remaining, 0), ent.rules.carryOverMax);
      if (carry > 0) {
        await db.$executeRaw`
          INSERT INTO "leave_ledger" ("id", "companyId", "agentId", "leaveType", "year", "nature", "days", "ruleSnapshot", "reason")
          VALUES (${crypto.randomUUID()}, ${profile.companyId}, ${agentId}, ${LEAVE_TYPE}, ${year}, 'REPORT'::"LedgerNature", ${carry}, ${JSON.stringify(ent.rules)}::jsonb, ${`Report de ${year - 1}`})
          ON CONFLICT DO NOTHING`;
      }
    }
  }

  // ------------------------------------------------------------------ soldes
  async balance(agentId: string, year: number, leaveType = LEAVE_TYPE, db: Db = prisma) {
    const rows = await db.leaveLedger.groupBy({ by: ['nature'], where: { agentId, year, leaveType }, _sum: { days: true } });
    const sum = (n: string) => rows.find(r => r.nature === n)?._sum.days ?? 0;
    const acquired = sum('ACQUIS'), carried = sum('REPORT'), adjusted = sum('REGULARISATION'), consumed = -sum('CONSOMME');
    return { leaveType, year, acquired: round2(acquired), carriedOver: round2(carried), adjustments: round2(adjusted), consumed: round2(consumed), remaining: round2(acquired + carried + adjusted - consumed) };
  }

  /** Jours déjà ouverts par des décisions de congé valides pour une année. */
  async decidedDays(db: Db, agentId: string, year: number, excludeDecisionId?: string): Promise<number> {
    const rows = await db.leaveDecision.findMany({ where: { agentId, year, status: 'VALID', ...(excludeDecisionId ? { NOT: { id: excludeDecisionId } } : {}) }, select: { days: true } });
    return rows.reduce((s, r) => s + r.days, 0);
  }

  /** Jours qu'une nouvelle décision de congé peut ouvrir : droit brut de l'année moins les décisions déjà délivrées. */
  async decisionCapacity(db: Db, agentId: string, year: number): Promise<number> {
    await this.ensureAcquired(db, agentId, year);
    const b = await this.balance(agentId, year, LEAVE_TYPE, db);
    const gross = b.acquired + b.carriedOver + b.adjustments;
    return Math.max(0, round2(gross - (await this.decidedDays(db, agentId, year))));
  }

  async consume(db: Db, input: { companyId: string; agentId: string; leaveType: string; year: number; days: number; requestId: string; decisionId?: string | null; reason: string; snapshot?: unknown; createdById?: string }) {
    if (input.days <= 0) return;
    await db.$executeRaw`
      INSERT INTO "leave_ledger" ("id", "companyId", "agentId", "leaveType", "year", "nature", "days", "requestId", "decisionId", "reason", "ruleSnapshot", "createdById")
      VALUES (${crypto.randomUUID()}, ${input.companyId}, ${input.agentId}, ${input.leaveType}, ${input.year}, 'CONSOMME'::"LedgerNature", ${-input.days}, ${input.requestId}, ${input.decisionId ?? null}, ${input.reason}, ${JSON.stringify(input.snapshot ?? null)}::jsonb, ${input.createdById ?? null})
      ON CONFLICT DO NOTHING`;
  }

  // ---------------------------------------------------------------- absences
  /** Jours déjà consommés (registre) et réservés (demandes en cours) pour un type d'absence et une année. */
  async absenceUsage(agentId: string, typeCode: string, typeId: string, year: number, excludeRequestId?: string) {
    const consumed = -(((await prisma.leaveLedger.aggregate({ where: { agentId, leaveType: typeCode, year, nature: 'CONSOMME' }, _sum: { days: true } }))._sum.days) ?? 0);
    const adjustments = ((await prisma.leaveLedger.aggregate({ where: { agentId, leaveType: typeCode, year, nature: 'REGULARISATION' }, _sum: { days: true } }))._sum.days) ?? 0;
    const inFlight = await prisma.request.findMany({ where: { agentId, status: { in: ['IN_PROGRESS', 'RETURNED'] }, type: { code: 'AUTORISATION_ABSENCE' }, ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}) }, select: { data: true } });
    const reserved = inFlight.reduce((s, r) => { const d: any = r.data; return d?.absenceTypeId === typeId ? s + (Number(d?.daysByYear?.[year]) || 0) : s; }, 0);
    return { consumed: round2(consumed - adjustments), reserved: round2(reserved) };
  }

  // ----------------------------------------------------------- régularisation
  async regularise(db: Db, input: { companyId: string; agentId: string; leaveType: string; year: number; days: number; reason: string; actorId: string }) {
    if (!Number.isFinite(input.days) || input.days === 0 || Math.abs(input.days) > 365) throw new AppError('Nombre de jours invalide (non nul, 365 maximum)', 400);
    if ((input.reason || '').trim().length < 5) throw new AppError('Le motif de la régularisation est obligatoire (5 caractères minimum)', 400);
    const thisYear = new Date().getUTCFullYear();
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > thisYear + 1) throw new AppError('Année invalide', 400);
    if (input.leaveType !== LEAVE_TYPE && !(await db.absenceType.findFirst({ where: { companyId: input.companyId, code: input.leaveType } }))) throw new AppError('Type de droit inconnu', 400);
    if (!(await db.agentProfile.findFirst({ where: { userId: input.agentId, companyId: input.companyId } }))) throw new AppError('Agent introuvable', 404);
    return db.leaveLedger.create({ data: { companyId: input.companyId, agentId: input.agentId, leaveType: input.leaveType, year: input.year, nature: 'REGULARISATION', days: round2(input.days), reason: input.reason.trim(), createdById: input.actorId } });
  }

  // ----------------------------------------------------------------- lecture
  async ledger(agentId: string, filters: { year?: number; leaveType?: string } = {}) {
    return prisma.leaveLedger.findMany({ where: { agentId, ...(filters.year ? { year: filters.year } : {}), ...(filters.leaveType ? { leaveType: filters.leaveType } : {}) }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  /** Vue complète des droits d'un agent pour une année : congé annuel, décisions, absences par type. */
  async overview(agentId: string, year: number) {
    const ent = await this.entitlement(agentId, year);
    const profile = await prisma.agentProfile.findUniqueOrThrow({ where: { userId: agentId } });
    await this.ensureAcquired(prisma, agentId, year);
    const annual = await this.balance(agentId, year);
    const decisions = await prisma.leaveDecision.findMany({ where: { agentId, year }, orderBy: { issuedAt: 'desc' } });
    const decided = decisions.filter(d => d.status === 'VALID').reduce((s, d) => s + d.days, 0);
    const types = await prisma.absenceType.findMany({ where: { companyId: profile.companyId, isActive: true }, orderBy: { name: 'asc' } });
    const absences: any[] = [];
    for (const t of types) {
      const u = await this.absenceUsage(agentId, t.code, t.id, year);
      absences.push({ code: t.code, name: t.name, cap: t.annualCap, consumed: u.consumed, reserved: u.reserved, remaining: t.annualCap == null ? null : round2(t.annualCap - u.consumed - u.reserved), legalReference: t.legalReference });
    }
    return { year, entitlement: ent, annual: { ...annual, decided, takeable: round2(decided - annual.consumed) }, decisions: decisions.map(d => ({ id: d.id, number: d.number, days: d.days, status: d.status, issuedAt: d.issuedAt })), absences };
  }

  /** Situations nécessitant un contrôle administratif. */
  async controls(companyId: string) {
    const out: { type: string; agentId: string; label: string; detail: string }[] = [];
    const agents = await prisma.agentProfile.findMany({ where: { companyId, user: { isActive: true } }, include: { user: { select: { firstName: true, lastName: true } } } });
    const name = (a: (typeof agents)[number]) => `${a.user.lastName} ${a.user.firstName} (${a.matricule})`;
    for (const a of agents) {
      if (!a.serviceStartDate && !a.hireDate) out.push({ type: 'SERVICE_DATE_MISSING', agentId: a.userId, label: name(a), detail: "Aucune date d'entrée en service ou d'intégration : droits impossibles à calculer" });
      if (a.regime !== 'FONCTIONNAIRE') {
        const configured = await prisma.ruleParameter.findFirst({ where: { companyId, key: `leave.annual_days@${a.regime}`, validTo: null } });
        if (!configured) out.push({ type: 'REGIME_NOT_CONFIGURED', agentId: a.userId, label: name(a), detail: `Régime ${a.regime} sans paramétrage des droits` });
      }
    }
    const negatives = await prisma.leaveLedger.groupBy({ by: ['agentId', 'leaveType', 'year'], where: { companyId }, _sum: { days: true }, having: { days: { _sum: { lt: 0 } } } });
    for (const n of negatives) {
      const a = agents.find(x => x.userId === n.agentId);
      out.push({ type: 'NEGATIVE_BALANCE', agentId: n.agentId, label: a ? name(a) : n.agentId, detail: `Solde négatif de ${round2(n._sum.days ?? 0)} jour(s) — ${n.leaveType} ${n.year}` });
    }
    return out;
  }
}

export const leaveService = new LeaveService();
export { RULE_DEFAULTS, addMonths };
