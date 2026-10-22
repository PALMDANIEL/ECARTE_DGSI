import { prisma } from '../../database/client';
import { auditService } from '../audit/audit.service';
import { notifyService } from '../notifications/notify.service';
import { rulesService } from '../settings/rules.service';
import { workflowService } from './workflow.service';

const DAY = 86_400_000;

export interface EscalationReport { reminders: number; escalations: number; checked: number }

/**
 * Délais : pour chaque étape active en retard, un rappel au responsable (une seule fois), puis — après un délai de grâce
 * paramétrable — une escalade vers le poste d'escalade du circuit (une seule fois). Idempotent : peut être relancé à volonté.
 */
export class EscalationService {
  /** Étapes actives (première en attente du tour courant) d'une société dont l'échéance est dépassée. */
  async overdueSteps(companyId: string, now = new Date()) {
    const pending = await prisma.requestStep.findMany({
      where: { result: 'PENDING', dueAt: { lt: now }, request: { companyId, status: 'IN_PROGRESS' } },
      include: { request: { include: { type: true, agent: { select: { firstName: true, lastName: true } } } } },
      orderBy: { dueAt: 'asc' }
    });
    const active: typeof pending = [];
    for (const s of pending) {
      if (s.round !== s.request.round) continue;
      const first = await prisma.requestStep.findFirst({ where: { requestId: s.requestId, round: s.round, result: 'PENDING' }, orderBy: { order: 'asc' }, select: { id: true } });
      if (first?.id === s.id) active.push(s);
    }
    return active;
  }

  async list(companyId: string, now = new Date()) {
    return (await this.overdueSteps(companyId, now)).map(s => ({
      requestId: s.requestId, reference: s.request.reference, type: s.request.type.name, applicant: `${s.request.agent.firstName} ${s.request.agent.lastName}`,
      step: s.label, titleSnapshot: s.titleSnapshot, dueAt: s.dueAt, daysLate: Math.floor((+now - +s.dueAt!) / DAY),
      reminderSentAt: s.reminderSentAt, escalatedAt: s.escalatedAt
    }));
  }

  async run(companyId: string, now = new Date()): Promise<EscalationReport> {
    const rules = await rulesService.getMany(companyId, ['escalation.reminder_enabled', 'escalation.escalate_after_days']);
    const graceMs = Number(rules['escalation.escalate_after_days']) * DAY;
    const steps = await this.overdueSteps(companyId, now);
    const report: EscalationReport = { reminders: 0, escalations: 0, checked: steps.length };
    for (const s of steps) {
      const typeCode = s.request.type.code;
      const link = `/requests?open=${s.requestId}`;
      const holders = async (positionId: string | null, assigneeId: string | null) => {
        if (assigneeId) return [assigneeId];
        if (!positionId) return [];
        const a = await workflowService.actingUsers(positionId, typeCode, now);
        return [...a.holders, ...a.delegates].map(u => u.id);
      };
      if (rules['escalation.reminder_enabled'] && !s.reminderSentAt) {
        // marquer d'abord (conditionnel) : deux balayages simultanés n'enverront qu'un seul rappel
        const { count } = await prisma.requestStep.updateMany({ where: { id: s.id, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (count) {
          await notifyService.notify({ companyId, userIds: await holders(s.positionId, s.assigneeId), type: 'REQUEST_OVERDUE', requestId: s.requestId, link, message: `Délai dépassé : la demande ${s.request.reference} attend votre traitement (échéance du ${s.dueAt!.toLocaleDateString('fr-FR')}).` });
          report.reminders++;
        }
      }
      if (!s.escalatedAt && s.escalatePositionId && +now - +s.dueAt! >= graceMs) {
        const { count } = await prisma.requestStep.updateMany({ where: { id: s.id, escalatedAt: null }, data: { escalatedAt: now } });
        if (count) {
          const targets = await holders(s.escalatePositionId, null);
          await notifyService.notify({ companyId, userIds: targets, type: 'REQUEST_ESCALATED', requestId: s.requestId, link, message: `Escalade : la demande ${s.request.reference} (${s.request.type.name}) est en retard à l'étape « ${s.label} ».` });
          await notifyService.notify({ companyId, userIds: [s.request.agentId], type: 'REQUEST_UPDATE', requestId: s.requestId, message: `Votre demande ${s.request.reference} est en retard de traitement ; elle a été signalée à l'autorité supérieure.` });
          await auditService.log({ companyId, actor: { id: 'system', email: 'système' }, action: 'REQUEST_ESCALATED', entity: 'Request', entityId: s.requestId, after: { step: s.label, escalatePositionId: s.escalatePositionId, notified: targets.length } });
          report.escalations++;
        }
      }
    }
    return report;
  }

  /** Balaye toutes les sociétés (planificateur). */
  async runAll(now = new Date()) {
    const companies = await prisma.company.findMany({ select: { id: true } });
    const total: EscalationReport = { reminders: 0, escalations: 0, checked: 0 };
    for (const c of companies) { const r = await this.run(c.id, now); total.reminders += r.reminders; total.escalations += r.escalations; total.checked += r.checked; }
    return total;
  }
}

export const escalationService = new EscalationService();
