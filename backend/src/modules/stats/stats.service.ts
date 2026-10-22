import { Prisma, RequestStatus } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { orgService } from '../org/org.service';
import { LEAVE_TYPE } from '../leave/leave.service';
import { requestService } from '../requests/request.service';

const DAY = 86_400_000;
const MAX_ROWS = 20000;

export interface StatsUser { id: string; companyId: string; role: string }
export interface StatsFilter { from?: Date; to?: Date; typeCode?: string; status?: RequestStatus; orgUnitId?: string; agentId?: string; positionId?: string }

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const isAdmin = (u: StatsUser) => ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Pilotage. Un administrateur voit toute sa société ; tout autre responsable ne voit que les demandes
 * dans lesquelles il est impliqué (étape à son poste / délégation / assigné / acteur). Cartes et soldes : administrateurs seulement.
 */
export class StatsService {
  private async where(user: StatsUser, f: StatsFilter): Promise<Prisma.RequestWhereInput> {
    const and: Prisma.RequestWhereInput[] = [{ companyId: user.companyId }, { status: f.status ?? { not: 'DRAFT' } }];
    if (!isAdmin(user)) {
      const pos = await requestService.actablePositionIds(user.id);
      and.push({ steps: { some: { OR: [{ assigneeId: user.id }, { actorId: user.id }, ...(pos.length ? [{ positionId: { in: pos } }, { escalatePositionId: { in: pos } }] : [])] } } });
    }
    if (f.typeCode) and.push({ type: { code: f.typeCode } });
    if (f.agentId) and.push({ agentId: f.agentId });
    if (f.positionId) and.push({ steps: { some: { positionId: f.positionId } } });
    if (f.orgUnitId) {
      const ids = await orgService.subtreeIds(user.companyId, f.orgUnitId);
      and.push({ agent: { agentProfile: { orgUnitId: { in: ids } } } });
    }
    if (f.from || f.to) and.push({ submittedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
    return { AND: and };
  }

  private async load(user: StatsUser, f: StatsFilter) {
    const rows = await prisma.request.findMany({
      where: await this.where(user, f),
      include: { type: true, agent: { select: { firstName: true, lastName: true, agentProfile: { select: { matricule: true, orgUnit: { select: { id: true, name: true } } } } } }, steps: true },
      orderBy: { submittedAt: 'desc' },
      take: MAX_ROWS + 1
    });
    if (rows.length > MAX_ROWS) throw new AppError(`Trop de résultats (plus de ${MAX_ROWS}) : restreignez la période ou les filtres`, 422);
    return rows;
  }

  /** Demandes filtrées (liste de l'historique et export). */
  async requests(user: StatsUser, f: StatsFilter) {
    const rows = await this.load(user, f);
    return rows.map(r => {
      const d: any = r.data || {};
      const last = r.steps.filter(s => s.round === r.round).sort((a, b) => a.order - b.order).find(s => s.result === 'PENDING');
      return {
        id: r.id, reference: r.reference, type: r.type.name, typeCode: r.type.code, status: r.status,
        applicant: `${r.agent.firstName} ${r.agent.lastName}`, matricule: r.agent.agentProfile?.matricule ?? null, unit: r.agent.agentProfile?.orgUnit?.name ?? null,
        submittedAt: r.submittedAt, closedAt: r.closedAt, days: d.durationDays ?? d.days ?? null, from: d.startDate ?? null, to: d.endDate ?? null,
        currentStep: last?.label ?? null, delayDays: r.closedAt && r.submittedAt ? round1((+r.closedAt - +r.submittedAt) / DAY) : null
      };
    });
  }

  async overview(user: StatsUser, f: StatsFilter, now = new Date()) {
    const rows = await this.load(user, f);
    const byStatus: Record<string, number> = {}, byType: Record<string, { name: string; count: number; approved: number; rejected: number }> = {};
    const byUnit: Record<string, { name: string; count: number }> = {}, byMonth: Record<string, number> = {};
    const closedDurations: number[] = [], typeDur: Record<string, number[]> = {};
    const stepDur: Record<string, { label: string; days: number[]; late: number }> = {};
    let overdueNow = 0, lateDecisions = 0, escalated = 0, absenceDays = 0, leaveDays = 0;
    const absenceByType: Record<string, number> = {};

    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      const t = (byType[r.type.code] ||= { name: r.type.name, count: 0, approved: 0, rejected: 0 });
      t.count++; if (r.status === 'APPROVED') t.approved++; if (r.status === 'REJECTED') t.rejected++;
      const u = r.agent.agentProfile?.orgUnit;
      const uk = u?.id ?? '—'; (byUnit[uk] ||= { name: u?.name ?? 'Sans unité', count: 0 }).count++;
      if (r.submittedAt) byMonth[monthKey(r.submittedAt)] = (byMonth[monthKey(r.submittedAt)] || 0) + 1;
      if (r.closedAt && r.submittedAt && ['APPROVED', 'REJECTED'].includes(r.status)) {
        const days = (+r.closedAt - +r.submittedAt) / DAY; closedDurations.push(days); (typeDur[r.type.code] ||= []).push(days);
      }
      const d: any = r.data || {};
      if (r.status === 'APPROVED') {
        if (r.type.code === 'AUTORISATION_ABSENCE') { const n = Number(d.durationDays) || 0; absenceDays += n; const k = d.absenceTypeName || '—'; absenceByType[k] = (absenceByType[k] || 0) + n; }
        if (r.type.code === 'JOUISSANCE_CONGE') leaveDays += Number(d.durationDays) || 0;
      }
      for (const s of r.steps.filter(x => x.round === r.round)) {
        if (s.escalatedAt) escalated++;
        if (s.result === 'PENDING' && s.dueAt && s.dueAt < now && r.status === 'IN_PROGRESS' && s.activatedAt) overdueNow++;
        if (s.decidedAt && s.activatedAt && s.result !== 'PENDING') {
          const key = s.titleSnapshot || s.label; const e = (stepDur[key] ||= { label: key, days: [], late: 0 });
          e.days.push((+s.decidedAt - +s.activatedAt) / DAY);
          if (s.dueAt && s.decidedAt > s.dueAt) { e.late++; lateDecisions++; }
        }
      }
    }
    const submitted = rows.length;
    const result: any = {
      scope: isAdmin(user) ? 'COMPANY' : 'INVOLVED',
      filters: f,
      requests: {
        submitted, byStatus,
        pending: byStatus['IN_PROGRESS'] || 0, approved: byStatus['APPROVED'] || 0, rejected: byStatus['REJECTED'] || 0, returned: byStatus['RETURNED'] || 0, cancelled: byStatus['CANCELLED'] || 0,
        byType: Object.entries(byType).map(([code, v]) => ({ code, ...v, avgDays: avg(typeDur[code] || []) })),
        byUnit: Object.values(byUnit).sort((a, b) => b.count - a.count),
        byMonth: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
      },
      processing: {
        avgDays: avg(closedDurations),
        byStep: Object.values(stepDur).map(e => ({ authority: e.label, decided: e.days.length, avgDays: avg(e.days), late: e.late })).sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0))
      },
      delays: { overdueNow, lateDecisions, escalated },
      absences: { approvedAbsenceDays: round1(absenceDays), approvedLeaveEnjoymentDays: round1(leaveDays), byType: Object.entries(absenceByType).map(([name, days]) => ({ name, days: round1(days) })) }
    };
    if (isAdmin(user)) result.cards = await this.cards(user.companyId, now);
    return result;
  }

  async cards(companyId: string, now = new Date()) {
    const cards = await prisma.businessCard.findMany({ where: { user: { companyId }, cardNumber: { not: null } }, select: { status: true, expiresAt: true } });
    const byStatus: Record<string, number> = {};
    let expiringSoon = 0, expired = 0;
    for (const c of cards) {
      const lapsed = c.status === 'ACTIVE' && c.expiresAt && c.expiresAt < now;
      const st = lapsed ? 'EXPIRED' : c.status;
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (lapsed) expired++;
      else if (c.status === 'ACTIVE' && c.expiresAt && +c.expiresAt - +now < 30 * DAY) expiringSoon++;
    }
    return { total: cards.length, active: byStatus['ACTIVE'] || 0, suspended: byStatus['SUSPENDED'] || 0, revoked: byStatus['REVOKED'] || 0, expired: expired + (byStatus['EXPIRED'] || 0), expiringSoon, byStatus };
  }

  /** Droits acquis / consommés / autorisés par agent pour une année (administrateurs). */
  async balances(user: StatsUser, year: number, orgUnitId?: string) {
    if (!isAdmin(user)) throw new AppError('Réservé aux administrateurs', 403);
    const ids = orgUnitId ? await orgService.subtreeIds(user.companyId, orgUnitId) : null;
    const [profiles, ledger, absences] = await Promise.all([
      prisma.agentProfile.findMany({ where: { companyId: user.companyId, user: { isActive: true }, ...(ids ? { orgUnitId: { in: ids } } : {}) }, include: { user: { select: { id: true, firstName: true, lastName: true } }, orgUnit: { select: { name: true } } }, orderBy: { matricule: 'asc' } }),
      prisma.leaveLedger.groupBy({ by: ['agentId', 'leaveType', 'nature'], where: { companyId: user.companyId, year }, _sum: { days: true } }),
      prisma.leaveDecision.groupBy({ by: ['agentId'], where: { companyId: user.companyId, year, status: 'VALID' }, _sum: { days: true } })
    ]);
    const by = new Map<string, Record<string, number>>();
    for (const l of ledger) { const m = by.get(l.agentId) || {}; const k = `${l.leaveType}:${l.nature}`; m[k] = (m[k] || 0) + (l._sum.days || 0); by.set(l.agentId, m); }
    const decided = new Map(absences.map(a => [a.agentId, a._sum.days || 0]));
    return profiles.map(p => {
      const m = by.get(p.userId) || {};
      const sum = (nature: string, type = LEAVE_TYPE) => m[`${type}:${nature}`] || 0;
      const acquired = sum('ACQUIS') + sum('REPORT'), consumed = sum('CONSOMME'), adj = sum('REGULARISATION');
      const absenceUsed = Object.entries(m).filter(([k]) => !k.startsWith(LEAVE_TYPE + ':') && k.endsWith(':CONSOMME')).reduce((a, [, v]) => a + v, 0);
      return { agentId: p.userId, matricule: p.matricule, name: `${p.user.firstName} ${p.user.lastName}`, unit: p.orgUnit?.name ?? null, year, acquired, authorized: decided.get(p.userId) || 0, consumed, adjustments: adj, remaining: acquired - consumed + adj, absenceDays: absenceUsed };
    });
  }
}

export const statsService = new StatsService();
