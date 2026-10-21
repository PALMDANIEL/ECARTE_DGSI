import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { countDays, daysByYear, hoursToDays } from '../leave/calendar';
import { countOptions, leaveService, loadRules } from '../leave/leave.service';
import { fullDate, longDate, leaveDurationPhrase, parseIsoDate, quantityText, shortDate, toIsoDate } from '../../shared/utils/fr-format';

export type FieldErrors = Record<string, string>;

export interface ValidatedFields {
  /** Données normalisées, stockées dans la demande. */
  data: Record<string, any>;
  leaveDecisionId?: string;
  /** Informations calculées affichées à l'agent (aperçu) : droit, durée décomptée, plafonds. */
  info?: Record<string, any>;
}

const fail = (errors: FieldErrors) => new AppError('Données invalides : ' + Object.values(errors).join(' ; '), 422, 'VALIDATION', { errors });

const text = (v: unknown, min: number, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s.length >= min && s.length <= max ? s : null;
};

const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  try { return toIsoDate(parseIsoDate(v)); } catch { return null; }
};

const today = () => toIsoDate(new Date());

/** Demandes (hors brouillon, rejetées, annulées) de l'agent dont la période chevauche [start, end]. */
async function findOverlap(agentId: string, start: string, end: string, excludeRequestId?: string) {
  const others = await prisma.request.findMany({
    where: { agentId, status: { in: ['IN_PROGRESS', 'RETURNED', 'APPROVED'] }, type: { code: { in: ['JOUISSANCE_CONGE', 'AUTORISATION_ABSENCE'] } }, ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}) },
    select: { reference: true, data: true }
  });
  return others.find(o => {
    const d = o.data as any;
    return d?.startDate && d?.endDate && d.startDate <= end && d.endDate >= start;
  });
}

/** Jours déjà engagés sur une décision de congé (jouissances approuvées ou en cours de traitement). */
export async function usedDays(decisionId: string, excludeRequestId?: string): Promise<number> {
  const used = await prisma.request.findMany({
    where: { leaveDecisionId: decisionId, status: { in: ['IN_PROGRESS', 'RETURNED', 'APPROVED'] }, ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}) },
    select: { data: true }
  });
  return used.reduce((sum, r) => sum + (Number((r.data as any)?.durationDays) || 0), 0);
}

export async function validateFields(args: { companyId: string; agentId: string; typeCode: string; fields: Record<string, any>; requestId?: string }): Promise<ValidatedFields> {
  const { companyId, agentId, typeCode, requestId } = args;
  const f = args.fields || {};
  const errors: FieldErrors = {};
  const year = new Date().getUTCFullYear();

  if (typeCode === 'DECISION_CONGE') {
    const y = Number(f.year);
    if (!Number.isInteger(y) || y < year - 1 || y > year + 1) errors.year = `Année invalide (${year - 1} à ${year + 1})`;
    const destinations = text(f.destinations, 3, 300);
    if (!destinations) errors.destinations = 'Précisez les destinations (3 à 300 caractères)';
    const stamp = typeof f.eStampNumber === 'string' ? f.eStampNumber.trim().replace(/\s+/g, ' ') : '';
    if (!/^[0-9 ]{8,24}$/.test(stamp) || stamp.replace(/ /g, '').length < 8) errors.eStampNumber = 'Numéro de timbre électronique invalide (8 à 20 chiffres)';
    const prevNumber = text(f.previousDecisionNumber, 1, 60);
    const prevDate = f.previousDecisionDate ? isoDate(f.previousDecisionDate) : null;
    if (f.previousDecisionDate && !prevDate) errors.previousDecisionDate = 'Date de la décision précédente invalide';
    let ent: Awaited<ReturnType<typeof leaveService.entitlement>> | null = null;
    if (!Object.keys(errors).length) {
      ent = await leaveService.entitlement(agentId, y);
      if (!ent.eligible) errors.year = ent.reason || 'Droit au congé non ouvert';
      else if (ent.days <= 0) errors.year = `Aucun jour de congé ouvert pour ${y}`;
    }
    if (!Object.keys(errors).length) {
      if (await prisma.leaveDecision.findFirst({ where: { agentId, year: y, status: 'VALID' } })) errors.year = `Une décision de congé valide existe déjà pour ${y}`;
      const pending = await prisma.request.findFirst({ where: { agentId, type: { code: 'DECISION_CONGE' }, status: { in: ['IN_PROGRESS', 'RETURNED'] }, ...(requestId ? { NOT: { id: requestId } } : {}) } });
      if (pending && (pending.data as any)?.year === y) errors.year = `Une demande de décision pour ${y} est déjà en cours (${pending.reference})`;
    }
    if (Object.keys(errors).length) throw fail(errors);
    return { data: { year: y, destinations, eStampNumber: stamp, previousDecisionNumber: prevNumber, previousDecisionDate: prevDate }, info: { entitlementDays: ent?.days, eligibleFrom: ent?.eligibleFrom } };
  }

  if (typeCode === 'JOUISSANCE_CONGE') {
    const start = isoDate(f.startDate), end = isoDate(f.endDate);
    if (!start) errors.startDate = 'Date de début invalide';
    if (!end) errors.endDate = 'Date de fin invalide';
    const destination = text(f.destination, 3, 300);
    if (!destination) errors.destination = 'Précisez le lieu de jouissance (3 à 300 caractères)';
    const decision = typeof f.leaveDecisionId === 'string' ? await prisma.leaveDecision.findFirst({ where: { id: f.leaveDecisionId, agentId, companyId } }) : null;
    if (!decision) errors.leaveDecisionId = 'Une décision de congé préalable est obligatoire';
    else if (decision.status !== 'VALID') errors.leaveDecisionId = 'Cette décision de congé n\'est plus valide';
    if (start && end) {
      if (end < start) errors.endDate = 'La date de fin précède la date de début';
      else if (start < today()) errors.startDate = 'La date de début ne peut pas être dans le passé';
    }
    let days = 0;
    let fractionInfo: Record<string, any> = {};
    if (start && end && !errors.endDate && !errors.startDate) {
      const profile = await prisma.agentProfile.findUnique({ where: { userId: agentId }, select: { regime: true } });
      const rules = await loadRules(companyId, profile?.regime);
      days = countDays(start, end, await countOptions(companyId, 'LEAVE', rules));
      if (days < 1) errors.endDate = 'La période ne comporte aucun jour décompté (week-end ou jour férié)';
      if (decision && decision.status === 'VALID' && days > 0) {
        const used = await usedDays(decision.id, requestId);
        const remaining = decision.days - used;
        // Fractionnement (loi 081-2015/CNT, art. 56) : examiné avant le solde, son message est plus explicite
        const previous = await prisma.request.count({ where: { leaveDecisionId: decision.id, status: { in: ['IN_PROGRESS', 'RETURNED', 'APPROVED'] }, ...(requestId ? { NOT: { id: requestId } } : {}) } });
        const isWhole = days >= decision.days;
        if (previous + 1 > rules.maxFractions) errors.endDate = `Le congé ne peut pas être fractionné en plus de ${rules.maxFractions} tranche(s)`;
        else if (!isWhole && days > rules.fractionMaxDays) errors.endDate = `Une tranche d'un congé fractionné ne peut excéder ${rules.fractionMaxDays} jours`;
        else if (days > remaining) errors.endDate = `Période de ${days} jour(s) supérieure aux ${remaining} jour(s) restant sur la décision ${decision.number}`;
        fractionInfo = { fraction: previous + 1, maxFractions: rules.maxFractions, remainingAfter: remaining - days };
        // L'éligibilité (mois de services accomplis) doit être atteinte au début du congé
        const ent = await leaveService.entitlement(agentId, decision.year);
        if (ent.eligibleFrom && start < ent.eligibleFrom) errors.startDate = `Congé impossible avant le ${shortDate(ent.eligibleFrom)} (${rules.eligibilityMonths} mois de services accomplis requis)`;
      }
      const overlap = await findOverlap(agentId, start, end, requestId);
      if (overlap) errors.startDate = `Cette période chevauche la demande ${overlap.reference}`;
    }
    if (Object.keys(errors).length) throw fail(errors);
    return { leaveDecisionId: decision!.id, data: { leaveDecisionId: decision!.id, startDate: start, endDate: end, destination, durationDays: days, year: decision!.year }, info: { durationDays: days, ...fractionInfo } };
  }

  if (typeCode === 'AUTORISATION_ABSENCE') {
    const type = typeof f.absenceTypeId === 'string' ? await prisma.absenceType.findFirst({ where: { id: f.absenceTypeId, companyId, isActive: true } }) : null;
    if (!type) errors.absenceTypeId = 'Type d\'absence invalide';
    const start = isoDate(f.startDate);
    const end = f.endDate ? isoDate(f.endDate) : start;
    if (!start) errors.startDate = 'Date de début invalide';
    if (f.endDate && !end) errors.endDate = 'Date de fin invalide';
    const motif = text(f.motif, 3, 200);
    if (!motif) errors.motif = 'Précisez le motif (3 à 200 caractères)';
    if (start && end) {
      if (end < start) errors.endDate = 'La date de fin précède la date de début';
      else if (start < today()) errors.startDate = 'La date de début ne peut pas être dans le passé';
    }
    let hours: number | null = null;
    const regimeRow = await prisma.agentProfile.findUnique({ where: { userId: agentId }, select: { regime: true } });
    const rules = await loadRules(companyId, regimeRow?.regime);
    const opts = await countOptions(companyId, 'ABSENCE', rules);
    const spanDays = start && end && !errors.endDate ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0;
    let days = start && end && !errors.endDate ? countDays(start, end, opts) : 0;
    if (spanDays && !days) errors.startDate = 'La période ne comporte aucun jour décompté (week-end ou jour férié)';
    if (type && spanDays) {
      const wantsHours = f.durationHours !== undefined && f.durationHours !== null && f.durationHours !== '';
      if (type.unit === 'HEURE' && !wantsHours) errors.durationHours = 'La durée en heures est obligatoire pour ce type d\'absence';
      if (wantsHours) {
        if (type.unit === 'JOUR') errors.durationHours = 'Ce type d\'absence se demande en jours entiers';
        else {
          const h = Number(f.durationHours);
          if (!Number.isInteger(h) || h < 1) errors.durationHours = 'Nombre d\'heures invalide';
          else if (h > spanDays * rules.hoursPerDay) errors.durationHours = `Durée supérieure à la période demandée (${rules.hoursPerDay} h par jour)`;
          else { hours = h; days = hoursToDays(h, rules.hoursPerDay); }
        }
      }
    }
    let byYear: Record<number, number> = {};
    const capInfo: Record<string, any> = {};
    if (start && end && days && !Object.keys(errors).length) {
      const overlap = await findOverlap(agentId, start, end, requestId);
      if (overlap) errors.startDate = `Cette période chevauche la demande ${overlap.reference}`;
      byYear = hours ? { [parseIsoDate(start).getUTCFullYear()]: days } : daysByYear(start, end, opts);
      if (type!.annualCap != null) {
        for (const [yr, d] of Object.entries(byYear)) {
          const u = await leaveService.absenceUsage(agentId, type!.code, type!.id, Number(yr), requestId);
          const total = u.consumed + u.reserved + d;
          capInfo[yr] = { cap: type!.annualCap, used: u.consumed, reserved: u.reserved, requested: d, remainingAfter: type!.annualCap - total };
          if (rules.enforceCap && total > type!.annualCap + 1e-9) {
            errors.absenceTypeId = `Plafond annuel de ${type!.annualCap} jour(s) dépassé en ${yr} : ${u.consumed + u.reserved} déjà utilisé(s) ou réservé(s), ${d} demandé(s)`;
          }
        }
      }
    }
    if (Object.keys(errors).length) throw fail(errors);
    return { data: { absenceTypeId: type!.id, absenceTypeName: type!.name, startDate: start, endDate: end, durationHours: hours, durationDays: days, daysByYear: byYear, motif }, info: { durationDays: days, cap: capInfo } };
  }

  throw new AppError('Type de demande inconnu', 400);
}

/** Variables « fields.* » des modèles de documents, calculées à partir des données validées. */
export function documentFields(typeCode: string, data: Record<string, any>) {
  if (typeCode === 'DECISION_CONGE') {
    return { year: data.year, destinations: data.destinations };
  }
  if (typeCode === 'JOUISSANCE_CONGE') {
    return {
      year: data.year, destination: data.destination, durationPhrase: leaveDurationPhrase(data.durationDays),
      startFull: fullDate(data.startDate), endFull: fullDate(data.endDate)
    };
  }
  const single = data.startDate === data.endDate;
  const qty = data.durationHours ? quantityText(data.durationHours, 'heure') : quantityText(data.durationDays, 'jour');
  return {
    quantityText: qty,
    motif: data.motif,
    periodText: single ? `pour la journée du ${fullDate(data.startDate)}` : `du ${fullDate(data.startDate)} au ${fullDate(data.endDate)} inclus`,
    startShort: shortDate(data.startDate), endShort: shortDate(data.endDate), startLong: longDate(data.startDate)
  };
}
