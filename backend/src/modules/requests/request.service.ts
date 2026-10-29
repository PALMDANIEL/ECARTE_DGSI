import { notifyService } from '../notifications/notify.service';
import crypto from 'crypto';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { sha256 } from '../../shared/utils/crypto';
import { auditService } from '../audit/audit.service';
import { orgService } from '../org/org.service';
import { rulesService } from '../settings/rules.service';
import { documentService, readPrivate, removePrivate, writePrivate } from './document.service';
import { ensureDefaults } from './request-defaults';
import { validateFields, usedDays } from './request-fields';
import { workflowService } from './workflow.service';
import { logger } from '../../infrastructure/logger';
import { LEAVE_TYPE, leaveService } from '../leave/leave.service';

type Actor = { id: string; email?: string };
export type ActAction = 'FAVORABLE' | 'UNFAVORABLE' | 'APPROVE' | 'REJECT' | 'RETURN';

const EDITABLE: string[] = ['DRAFT', 'RETURNED'];
const MAX_ATTACHMENTS = 10;
// 5 Mo par défaut ; MAX_UPLOAD_MB=4 sur Vercel, dont les fonctions refusent les requêtes de plus de 4,5 Mo
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 5;
const MAX_ATTACHMENT_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export class RequestService {
  // ------------------------------------------------------------- utilitaires
  private async nextReference(tx: Prisma.TransactionClient, companyId: string, prefix: string) {
    const year = new Date().getUTCFullYear();
    const rows = await tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "request_counters" ("id", "companyId", "prefix", "year", "last")
      VALUES (${crypto.randomUUID()}, ${companyId}, ${prefix}, ${year}, 1)
      ON CONFLICT ("companyId", "prefix", "year") DO UPDATE SET "last" = "request_counters"."last" + 1
      RETURNING "last"`;
    return `${prefix}-${year}-${String(rows[0].last).padStart(6, '0')}`;
  }

  private notify(companyId: string, userIds: string[], message: string, requestId: string, type: string, link?: string) {
    return notifyService.notify({ companyId, userIds, message, requestId, type, link });
  }

  /** Utilisateurs pouvant agir sur une étape (titulaires + délégataires du poste, ou assigné direct). */
  private async approversOf(step: { positionId: string | null; assigneeId: string | null }, typeCode: string): Promise<string[]> {
    if (step.assigneeId) return [step.assigneeId];
    if (!step.positionId) return [];
    const { holders, delegates } = await workflowService.actingUsers(step.positionId, typeCode);
    return [...holders, ...delegates].map(u => u.id);
  }

  private async ownRequest(requestId: string, agentId: string) {
    const r = await prisma.request.findFirst({ where: { id: requestId, agentId }, include: { type: true } });
    if (!r) throw new AppError('Demande introuvable', 404);
    return r;
  }

  /** Aperçu pour l'agent (sans rien enregistrer) : erreurs par champ, ou durée décomptée, droit et plafonds. */
  async preview(agentId: string, companyId: string, typeCode: string, fields: Record<string, any>) {
    try {
      const { info } = await validateFields({ companyId, agentId, typeCode, fields });
      return { ok: true, errors: {}, info: info ?? {} };
    } catch (e) {
      if (e instanceof AppError && e.code === 'VALIDATION') return { ok: false, errors: (e.details?.errors as Record<string, string>) ?? {}, info: {} };
      throw e;
    }
  }

  // ------------------------------------------------------------ services agent
  /** Démarches proposées à l'agent selon sa situation (la décision préalable conditionne la jouissance). */
  async servicesFor(agentId: string, companyId: string) {
    await ensureDefaults(companyId);
    const types = await prisma.requestType.findMany({ where: { companyId, isActive: true }, orderBy: { code: 'asc' } });
    const decisions = await this.availableDecisions(agentId, companyId);
    const out: any[] = [];
    for (const t of types) {
      const wf = await workflowService.current(companyId, t.id);
      let available = true, reason: string | null = null;
      if (!wf) { available = false; reason = 'Circuit de validation non configuré'; }
      else if (t.code === 'JOUISSANCE_CONGE' && !decisions.length) { available = false; reason = 'Aucune décision de congé valide disponible'; }
      out.push({ code: t.code, name: t.name, available, reason, attachmentRules: t.attachmentRules });
    }
    return out;
  }

  /** Décisions de congé valides avec leur solde de jours restant. */
  async availableDecisions(agentId: string, companyId: string) {
    const decisions = await prisma.leaveDecision.findMany({ where: { agentId, companyId, status: 'VALID' }, orderBy: { issuedAt: 'desc' } });
    const out: any[] = [];
    for (const d of decisions) {
      const used = await usedDays(d.id);
      if (d.days - used > 0) out.push({ id: d.id, number: d.number, year: d.year, issuedAt: d.issuedAt, days: d.days, remainingDays: d.days - used });
    }
    return out;
  }

  async createDraft(agentId: string, companyId: string, typeCode: string, fields: Record<string, any>) {
    await ensureDefaults(companyId);
    const type = await prisma.requestType.findFirst({ where: { companyId, code: typeCode, isActive: true } });
    if (!type) throw new AppError('Type de demande inconnu ou désactivé', 404);
    if (!(await workflowService.current(companyId, type.id))) throw new AppError('Le circuit de validation de cette démarche n\'est pas encore configuré', 409);
    const { data, leaveDecisionId } = await validateFields({ companyId, agentId, typeCode, fields });
    const request = await prisma.$transaction(async tx => {
      const reference = await this.nextReference(tx, companyId, type.prefix);
      return tx.request.create({ data: { companyId, reference, typeId: type.id, agentId, status: 'DRAFT', data, leaveDecisionId: leaveDecisionId ?? null } });
    });
    await auditService.log({ companyId, actor: { id: agentId }, action: 'REQUEST_CREATED', entity: 'Request', entityId: request.id, after: { reference: request.reference, type: typeCode } });
    return this.agentView(request.id, agentId);
  }

  async updateDraft(requestId: string, agentId: string, fields: Record<string, any>) {
    const r = await this.ownRequest(requestId, agentId);
    if (!EDITABLE.includes(r.status)) throw new AppError('Cette demande ne peut plus être modifiée', 409);
    const { data, leaveDecisionId } = await validateFields({ companyId: r.companyId, agentId, typeCode: r.type.code, fields, requestId });
    await prisma.request.update({ where: { id: requestId }, data: { data, leaveDecisionId: leaveDecisionId ?? null } });
    await auditService.log({ companyId: r.companyId, actor: { id: agentId }, action: 'REQUEST_UPDATED', entity: 'Request', entityId: requestId, before: r.data as any, after: data });
    return this.agentView(requestId, agentId);
  }

  async cancel(requestId: string, agentId: string) {
    const r = await this.ownRequest(requestId, agentId);
    if (!['DRAFT', 'IN_PROGRESS', 'RETURNED'].includes(r.status)) throw new AppError('Cette demande ne peut plus être annulée', 409);
    await prisma.$transaction(async tx => {
      await tx.request.update({ where: { id: requestId }, data: { status: 'CANCELLED', closedAt: new Date() } });
      await tx.requestStep.updateMany({ where: { requestId, result: 'PENDING' }, data: { result: 'SKIPPED', note: 'Demande annulée par l\'agent' } });
    });
    await auditService.log({ companyId: r.companyId, actor: { id: agentId }, action: 'REQUEST_CANCELLED', entity: 'Request', entityId: requestId, before: { status: r.status } });
    return this.agentView(requestId, agentId);
  }

  async submit(requestId: string, agentId: string) {
    const r = await this.ownRequest(requestId, agentId);
    if (!EDITABLE.includes(r.status)) throw new AppError('Cette demande a déjà été déposée', 409);
    const companyId = r.companyId;
    // Revalidation complète au dépôt : la situation a pu changer depuis la saisie
    const { data, leaveDecisionId } = await validateFields({ companyId, agentId, typeCode: r.type.code, fields: r.data as any, requestId });

    const attachments = await prisma.requestAttachment.findMany({ where: { requestId } });
    const rules = (r.type.attachmentRules as any[]) || [];
    const missing = rules.filter(a => a.required && !attachments.some(x => x.code === a.code));
    if (missing.length) throw new AppError(`Pièce(s) justificative(s) obligatoire(s) manquante(s) : ${missing.map(m => m.label).join(', ')}`, 422, 'ATTACHMENTS_MISSING', { missing });

    const wf = await workflowService.current(companyId, r.typeId);
    if (!wf) throw new AppError('Le circuit de validation de cette démarche n\'est pas configuré', 409);
    const { steps, unresolved } = await workflowService.resolve(companyId, wf.id, agentId, r.type.code, data);
    if (unresolved.length) {
      throw new AppError(`Le circuit ne peut pas être résolu : ${unresolved.map(u => `${u.label} (${u.reason})`).join(' ; ')}. Contactez l'administration.`, 409, 'WORKFLOW_UNRESOLVED', { unresolved });
    }

    const agent = await prisma.user.findUniqueOrThrow({ where: { id: agentId }, include: { agentProfile: { include: { supervisor: { select: { firstName: true, lastName: true } } } }, company: true, heldCards: { where: { status: 'ACTIVE' }, select: { cardNumber: true } } } });
    const orgChain = await orgService.chain(companyId, agent.agentProfile?.orgUnitId);
    const snapshot = {
      agent: { firstName: agent.firstName, lastName: agent.lastName, civility: agent.agentProfile?.civility, matricule: agent.agentProfile?.matricule, grade: agent.agentProfile?.grade, corps: agent.agentProfile?.corps },
      orgChain, supervisor: agent.agentProfile?.supervisor ? `${agent.agentProfile.supervisor.firstName} ${agent.agentProfile.supervisor.lastName}` : null,
      place: agent.company.city || 'Ouagadougou', cardNumber: agent.heldCards[0]?.cardNumber ?? null, workflowVersion: wf.version
    };

    const now = new Date();
    const resubmission = r.status === 'RETURNED';
    const round = resubmission ? r.round + 1 : r.round;
    await prisma.$transaction(async tx => {
      await tx.requestStep.updateMany({ where: { requestId, result: 'PENDING' }, data: { result: 'SKIPPED', note: 'Remplacée par un nouveau dépôt' } });
      await tx.request.update({ where: { id: requestId }, data: { status: 'IN_PROGRESS', round, workflowId: wf.id, data, snapshot: snapshot as any, leaveDecisionId: leaveDecisionId ?? null, submittedAt: now } });
      for (const [i, s] of steps.entries()) {
        await tx.requestStep.create({
          data: {
            requestId, round, order: s.order, kind: s.kind, label: s.heading, positionId: s.positionId, assigneeId: s.assigneeId, titleSnapshot: s.titleSnapshot,
            allowReturn: s.allowReturn, rejectOnUnfavorable: s.rejectOnUnfavorable, deadlineDays: s.deadlineDays, escalatePositionId: s.escalatePositionId,
            ...(i === 0 ? { activatedAt: now, dueAt: s.deadlineDays ? addDays(now, s.deadlineDays) : null } : {})
          }
        });
      }
    });
    await auditService.log({ companyId, actor: { id: agentId, email: agent.email }, action: resubmission ? 'REQUEST_RESUBMITTED' : 'REQUEST_SUBMITTED', entity: 'Request', entityId: requestId, after: { reference: r.reference, round, workflowVersion: wf.version } });
    await this.generatePdfSafely(requestId, resubmission ? 'RESUBMITTED' : 'SUBMITTED', agentId);
    const first = await prisma.requestStep.findFirst({ where: { requestId, round }, orderBy: { order: 'asc' } });
    if (first) await this.notify(companyId, await this.approversOf(first, r.type.code), `Nouvelle demande à traiter : ${r.reference}`, requestId, 'REQUEST_ASSIGNED', `/requests?open=${requestId}`);
    return this.agentView(requestId, agentId);
  }

  private async generatePdfSafely(requestId: string, reason: string, by?: string) {
    try { await documentService.generate(requestId, reason, by); }
    catch (e) { logger.error('Génération PDF échouée', { requestId, error: (e as Error).message }); }
  }

  // ---------------------------------------------------- traitement par étape
  /**
   * Traite l'étape active d'une demande. Verrou de ligne : deux validations simultanées ne peuvent pas passer,
   * et seule l'étape active (la première en attente) est traitable — aucun saut ni double validation possible.
   */
  async act(requestId: string, stepId: string, user: { id: string; email?: string; companyId: string }, input: { action: ActAction; comment?: string; decisionNumber?: string }, req?: any) {
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "requests" WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.request.findFirst({ where: { id: requestId, companyId: user.companyId }, include: { type: true, agent: { select: { id: true, firstName: true, lastName: true } } } });
      if (!request) throw new AppError('Demande introuvable', 404);
      if (request.status !== 'IN_PROGRESS') throw new AppError('Cette demande n\'est plus en cours de traitement', 409, 'NOT_IN_PROGRESS');
      const steps = await tx.requestStep.findMany({ where: { requestId, round: request.round }, orderBy: { order: 'asc' } });
      const active = steps.find(s => s.result === 'PENDING');
      if (!active) throw new AppError('Aucune étape en attente', 409);
      if (active.id !== stepId) throw new AppError('Cette étape n\'est pas (ou n\'est plus) l\'étape active de la demande', 409, 'NOT_ACTIVE_STEP');
      if (request.agentId === user.id) throw new AppError('Vous ne pouvez pas traiter votre propre demande', 403);

      let allowed = active.assigneeId ? active.assigneeId === user.id : active.positionId ? await workflowService.canActOnPosition(user.id, active.positionId, request.type.code) : false;
      // Étape escaladée : le poste d'escalade peut traiter à la place du responsable en retard (si le paramètre l'autorise)
      if (!allowed && active.escalatedAt && active.escalatePositionId && await rulesService.get<boolean>(request.companyId, 'escalation.substitute_can_act')) {
        allowed = await workflowService.canActOnPosition(user.id, active.escalatePositionId, request.type.code);
      }
      if (!allowed) throw new AppError('Vous n\'êtes pas habilité à traiter cette étape', 403);

      const isDecision = active.kind === 'DECISION';
      const valid: ActAction[] = isDecision ? ['APPROVE', 'REJECT', 'RETURN'] : ['FAVORABLE', 'UNFAVORABLE', 'RETURN'];
      if (!valid.includes(input.action)) throw new AppError(`Action invalide pour cette étape (${valid.join(', ')})`, 400);
      if (input.action === 'RETURN' && !active.allowReturn) throw new AppError('Le retour pour correction n\'est pas autorisé à cette étape', 409);
      const comment = (input.comment || '').trim();
      if (['UNFAVORABLE', 'REJECT', 'RETURN'].includes(input.action) && comment.length < 3) throw new AppError('Un commentaire est obligatoire (3 caractères minimum)', 422, 'COMMENT_REQUIRED');
      if (comment.length > 1000) throw new AppError('Commentaire trop long (1000 caractères maximum)', 422);

      let decisionNumber: string | null = null;
      if (isDecision && input.action === 'APPROVE' && request.type.code === 'DECISION_CONGE') {
        decisionNumber = (input.decisionNumber || '').trim();
        if (!decisionNumber || decisionNumber.length > 60) throw new AppError('Le numéro de la décision de congé est obligatoire', 422, 'DECISION_NUMBER_REQUIRED');
        if (await tx.leaveDecision.findFirst({ where: { companyId: request.companyId, number: decisionNumber } })) throw new AppError(`Le numéro de décision ${decisionNumber} existe déjà`, 409);
      }

      const now = new Date();
      const result = { FAVORABLE: 'FAVORABLE', UNFAVORABLE: 'UNFAVORABLE', APPROVE: 'APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' }[input.action] as 'FAVORABLE' | 'UNFAVORABLE' | 'APPROVED' | 'REJECTED' | 'RETURNED';
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { firstName: true, lastName: true, jobTitle: true } });
      await tx.requestStep.update({
        where: { id: active.id },
        data: { result, comment: comment || null, actorId: user.id, actorName: `${actor.firstName} ${actor.lastName}`, actorTitle: active.titleSnapshot || actor.jobTitle, decidedAt: now }
      });

      const remaining = steps.filter(s => s.id !== active.id && s.result === 'PENDING');
      let status: 'IN_PROGRESS' | 'RETURNED' | 'REJECTED' | 'APPROVED' = 'IN_PROGRESS';
      let nextStepId: string | null = null;

      if (input.action === 'RETURN') status = 'RETURNED';
      else if (input.action === 'REJECT' || (input.action === 'UNFAVORABLE' && active.rejectOnUnfavorable)) status = 'REJECTED';
      else if (!remaining.length) status = 'APPROVED';
      else nextStepId = remaining[0].id;

      if (status === 'RETURNED' || status === 'REJECTED') {
        await tx.requestStep.updateMany({ where: { requestId, round: request.round, result: 'PENDING' }, data: { result: 'SKIPPED', note: status === 'RETURNED' ? 'Retour pour correction' : 'Demande rejetée' } });
      }
      if (nextStepId) {
        const next = remaining[0];
        await tx.requestStep.update({ where: { id: next.id }, data: { activatedAt: now, dueAt: next.deadlineDays ? addDays(now, next.deadlineDays) : null } });
      }

      let issuedDecision: { id: string; number: string } | null = null;
      if (status === 'APPROVED') {
        const d: any = request.data;
        if (request.type.code === 'DECISION_CONGE') {
          // Les jours ouverts viennent du droit réel de l'agent (éligibilité, règles en vigueur), plus d'une valeur fixe
          const days = await leaveService.decisionCapacity(tx, request.agentId, d.year);
          if (days <= 0) throw new AppError(`Aucun jour de congé n'est ouvert pour ${d.year} : décision impossible`, 409, 'NO_ENTITLEMENT');
          issuedDecision = await tx.leaveDecision.create({ data: { companyId: request.companyId, agentId: request.agentId, number: decisionNumber!, year: d.year, days, requestId: request.id }, select: { id: true, number: true } });
        } else if (request.type.code === 'JOUISSANCE_CONGE') {
          await leaveService.consume(tx, { companyId: request.companyId, agentId: request.agentId, leaveType: LEAVE_TYPE, year: d.year, days: Number(d.durationDays) || 0, requestId: request.id, decisionId: request.leaveDecisionId, reason: `Jouissance du ${d.startDate} au ${d.endDate}`, snapshot: { countMode: 'rules-at-validation' }, createdById: user.id });
        } else if (request.type.code === 'AUTORISATION_ABSENCE') {
          const type = await tx.absenceType.findUnique({ where: { id: d.absenceTypeId } });
          for (const [yr, days] of Object.entries((d.daysByYear || {}) as Record<string, number>)) {
            await leaveService.consume(tx, { companyId: request.companyId, agentId: request.agentId, leaveType: type?.code ?? 'ABSENCE', year: Number(yr), days: Number(days), requestId: request.id, reason: `Absence du ${d.startDate} au ${d.endDate}`, createdById: user.id });
          }
        }
      }
      await tx.request.update({ where: { id: requestId }, data: { status, ...(['APPROVED', 'REJECTED'].includes(status) ? { closedAt: now } : {}) } });
      return { request, active, result, status, nextStepId, issuedDecision, comment };
    }, { timeout: 30000 });

    const { request, active, result, status, nextStepId } = outcome;
    await auditService.log({ companyId: user.companyId, actor: { id: user.id, email: user.email }, action: 'REQUEST_STEP_ACTED', entity: 'Request', entityId: requestId, before: { status: 'IN_PROGRESS', step: active.order }, after: { result, status, comment: outcome.comment || undefined, decisionNumber: outcome.issuedDecision?.number }, req });
    await this.generatePdfSafely(requestId, status === 'IN_PROGRESS' ? 'STEP' : 'FINAL', user.id);

    // Notifications : agent informé à chaque étape décisive, prochain approbateur prévenu
    if (status === 'IN_PROGRESS' && nextStepId) {
      const next = await prisma.requestStep.findUniqueOrThrow({ where: { id: nextStepId } });
      await this.notify(user.companyId, await this.approversOf(next, request.type.code), `Demande à traiter : ${request.reference}`, requestId, 'REQUEST_ASSIGNED', `/requests?open=${requestId}`);
      await this.notify(user.companyId, [request.agentId], `Votre demande ${request.reference} a franchi une étape (${result === 'UNFAVORABLE' ? 'avis défavorable' : 'avis favorable'}).`, requestId, 'REQUEST_UPDATE');
    } else {
      const text = { APPROVED: 'approuvée', REJECTED: 'rejetée', RETURNED: 'retournée pour correction' }[status as 'APPROVED' | 'REJECTED' | 'RETURNED'];
      await this.notify(user.companyId, [request.agentId], `Votre demande ${request.reference} a été ${text}.`, requestId, 'REQUEST_UPDATE');
    }
    return this.detail(requestId, { id: user.id, companyId: user.companyId, role: 'ADMIN' }, true);
  }

  // ------------------------------------------------------ pièces justificatives
  async addAttachment(requestId: string, agentId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, code?: string) {
    const r = await this.ownRequest(requestId, agentId);
    if (!EDITABLE.includes(r.status)) throw new AppError('Les pièces ne peuvent plus être modifiées', 409);
    if (!ALLOWED_MIME.includes(file.mimetype)) throw new AppError('Format non accepté (PDF, JPG ou PNG)', 415);
    if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError(`Fichier trop volumineux (${MAX_UPLOAD_MB} Mo maximum)`, 413);
    if (await prisma.requestAttachment.count({ where: { requestId } }) >= MAX_ATTACHMENTS) throw new AppError(`${MAX_ATTACHMENTS} pièces maximum par demande`, 409);
    if (code && !((r.type.attachmentRules as any[]) || []).some(a => a.code === code)) throw new AppError('Type de pièce inconnu', 400);
    const rel = path.join('attachments', requestId, crypto.randomBytes(12).toString('hex'));
    await writePrivate(rel, file.buffer);
    const att = await prisma.requestAttachment.create({ data: { requestId, code: code || null, name: file.originalname.slice(0, 200), mime: file.mimetype, size: file.size, sha256: sha256(file.buffer.toString('binary')), path: rel, uploadedById: agentId } });
    await auditService.log({ companyId: r.companyId, actor: { id: agentId }, action: 'REQUEST_ATTACHMENT_ADDED', entity: 'Request', entityId: requestId, after: { name: att.name, size: att.size } });
    return { id: att.id, code: att.code, name: att.name, mime: att.mime, size: att.size };
  }

  async removeAttachment(requestId: string, agentId: string, attachmentId: string) {
    const r = await this.ownRequest(requestId, agentId);
    if (!EDITABLE.includes(r.status)) throw new AppError('Les pièces ne peuvent plus être modifiées', 409);
    const att = await prisma.requestAttachment.findFirst({ where: { id: attachmentId, requestId } });
    if (!att) throw new AppError('Pièce introuvable', 404);
    await prisma.requestAttachment.delete({ where: { id: att.id } });
    await removePrivate(att.path);
    await auditService.log({ companyId: r.companyId, actor: { id: agentId }, action: 'REQUEST_ATTACHMENT_REMOVED', entity: 'Request', entityId: requestId, before: { name: att.name } });
  }

  async readAttachment(requestId: string, attachmentId: string) {
    const att = await prisma.requestAttachment.findFirst({ where: { id: attachmentId, requestId } });
    if (!att) throw new AppError('Pièce introuvable', 404);
    return { att, buffer: await readPrivate(att.path) };
  }

  // ----------------------------------------------------------- lecture agent
  private baseInclude = {
    type: { select: { code: true, name: true, attachmentRules: true } },
    steps: { orderBy: [{ round: 'asc' as const }, { order: 'asc' as const }] },
    documents: { orderBy: { version: 'desc' as const }, select: { id: true, version: true, reason: true, createdAt: true, size: true, sha256: true } },
    attachments: { select: { id: true, code: true, name: true, mime: true, size: true, createdAt: true } },
    agent: { select: { id: true, firstName: true, lastName: true, agentProfile: { select: { matricule: true, grade: true, orgUnit: { select: { id: true, name: true, code: true } } } } } },
    issuedDecision: { select: { id: true, number: true, year: true, days: true } }
  };

  /** Vue d'une demande : étapes du tour courant d'abord, historique des tours précédents ensuite. */
  private shape(r: any) {
    const stepsNow = r.steps.filter((s: any) => s.round === r.round && s.result !== 'SKIPPED');
    const active = r.status === 'IN_PROGRESS' ? stepsNow.find((s: any) => s.result === 'PENDING') : null;
    const history = r.steps.filter((s: any) => s.round < r.round && s.result !== 'SKIPPED');
    return { ...r, steps: undefined, progress: stepsNow.map((s: any) => ({ id: s.id, order: s.order, kind: s.kind, label: s.label, result: s.result, actorName: s.actorName, comment: s.comment, decidedAt: s.decidedAt, dueAt: s.dueAt, isActive: s.id === active?.id })), previousRounds: history.map((s: any) => ({ round: s.round, label: s.label, result: s.result, actorName: s.actorName, comment: s.comment, decidedAt: s.decidedAt })) };
  }

  async agentView(requestId: string, agentId: string) {
    const r = await prisma.request.findFirst({ where: { id: requestId, agentId }, include: this.baseInclude });
    if (!r) throw new AppError('Demande introuvable', 404);
    return this.shape(r);
  }

  async agentList(agentId: string) {
    const rows = await prisma.request.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, include: this.baseInclude, take: 100 });
    return rows.map(r => this.shape(r));
  }

  async agentDocument(requestId: string, agentId: string, version?: number) {
    await this.ownRequest(requestId, agentId);
    const { doc, buffer } = await documentService.read(requestId, version);
    await auditService.log({ actor: { id: agentId }, action: 'REQUEST_DOCUMENT_DOWNLOADED', entity: 'Request', entityId: requestId, after: { version: doc.version } });
    return { doc, buffer };
  }

  // ---------------------------------------------------- responsables et admin
  async actablePositionIds(userId: string, at = new Date()): Promise<string[]> {
    const [held, delegated] = await Promise.all([
      prisma.positionHolder.findMany({ where: { userId, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, select: { positionId: true } }),
      prisma.delegation.findMany({ where: { delegateId: userId, startsAt: { lte: at }, endsAt: { gt: at } }, select: { positionId: true } })
    ]);
    return [...new Set([...held, ...delegated].map(x => x.positionId))];
  }

  /** Demandes dont l'étape active est à traiter par cet utilisateur. */
  async inbox(user: { id: string; companyId: string }) {
    const positionIds = await this.actablePositionIds(user.id);
    const steps = await prisma.requestStep.findMany({
      where: { result: 'PENDING', request: { companyId: user.companyId, status: 'IN_PROGRESS', NOT: { agentId: user.id } }, OR: [{ assigneeId: user.id }, ...(positionIds.length ? [{ positionId: { in: positionIds } }, { escalatedAt: { not: null }, escalatePositionId: { in: positionIds } }] : [])] },
      include: { request: { include: this.baseInclude } }
    });
    const mine: any[] = [];
    for (const s of steps) {
      const r = s.request;
      if (s.round !== r.round) continue;
      const first = r.steps.filter(x => x.round === r.round && x.result === 'PENDING').sort((a, b) => a.order - b.order)[0];
      if (first?.id !== s.id) continue; // pas encore l'étape active
      if (s.positionId) {
        const t = await prisma.requestType.findUnique({ where: { id: r.typeId } });
        let ok = await workflowService.canActOnPosition(user.id, s.positionId, t!.code);
        if (!ok && s.escalatedAt && s.escalatePositionId && await rulesService.get<boolean>(user.companyId, 'escalation.substitute_can_act')) ok = await workflowService.canActOnPosition(user.id, s.escalatePositionId, t!.code);
        if (!ok) continue;
      }
      mine.push({ ...this.shape(r), activeStep: { id: s.id, label: s.label, kind: s.kind, dueAt: s.dueAt, overdue: !!s.dueAt && s.dueAt < new Date() } });
    }
    return mine.sort((a, b) => +new Date(a.activeStep.dueAt ?? a.submittedAt ?? 0) - +new Date(b.activeStep.dueAt ?? b.submittedAt ?? 0));
  }

  /** Droit de consultation : administrateurs de la société, ou personne impliquée dans le circuit de la demande. */
  private async canView(user: { id: string; companyId: string; role: string }, r: { companyId: string; steps: { positionId: string | null; escalatePositionId: string | null; assigneeId: string | null; actorId: string | null }[] }) {
    if (r.companyId !== user.companyId) return false;
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
    const positionIds = await this.actablePositionIds(user.id);
    return r.steps.some(s => s.assigneeId === user.id || s.actorId === user.id || (s.positionId && positionIds.includes(s.positionId)) || (s.escalatePositionId && positionIds.includes(s.escalatePositionId)));
  }

  async detail(requestId: string, user: { id: string; companyId: string; role: string }, quiet = false, req?: any) {
    const r = await prisma.request.findFirst({ where: { id: requestId, companyId: user.companyId }, include: this.baseInclude });
    if (!r || !(await this.canView(user, r))) throw new AppError('Demande introuvable', 404);
    if (!quiet) await auditService.log({ companyId: user.companyId, actor: { id: user.id }, action: 'REQUEST_VIEWED', entity: 'Request', entityId: requestId, req });
    return this.shape(r);
  }

  async document(requestId: string, user: { id: string; companyId: string; role: string }, version?: number, req?: any) {
    const r = await prisma.request.findFirst({ where: { id: requestId, companyId: user.companyId }, include: { steps: true } });
    if (!r || !(await this.canView(user, r))) throw new AppError('Demande introuvable', 404);
    const { doc, buffer } = await documentService.read(requestId, version);
    await auditService.log({ companyId: user.companyId, actor: { id: user.id }, action: 'REQUEST_DOCUMENT_DOWNLOADED', entity: 'Request', entityId: requestId, after: { version: doc.version }, req });
    return { doc, buffer, reference: r.reference };
  }

  async attachment(requestId: string, attachmentId: string, user: { id: string; companyId: string; role: string }, req?: any) {
    const r = await prisma.request.findFirst({ where: { id: requestId, companyId: user.companyId }, include: { steps: true } });
    if (!r || !(await this.canView(user, r))) throw new AppError('Demande introuvable', 404);
    const out = await this.readAttachment(requestId, attachmentId);
    await auditService.log({ companyId: user.companyId, actor: { id: user.id }, action: 'REQUEST_ATTACHMENT_DOWNLOADED', entity: 'Request', entityId: requestId, after: { name: out.att.name }, req });
    return out;
  }

  /** Recherche multicritère : agent, matricule, unité (sous-arbre), type, période, statut, référence. */
  async search(user: { id: string; companyId: string; role: string }, f: { q?: string; typeCode?: string; status?: string; orgUnitId?: string; from?: Date; to?: Date; page?: number; limit?: number }) {
    const page = Math.max(1, f.page || 1);
    const limit = Math.min(100, Math.max(1, f.limit || 25));
    const where: Prisma.RequestWhereInput = { companyId: user.companyId, status: { not: 'DRAFT' } };
    const and: Prisma.RequestWhereInput[] = [];
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      const positionIds = await this.actablePositionIds(user.id);
      and.push({ steps: { some: { OR: [{ assigneeId: user.id }, { actorId: user.id }, ...(positionIds.length ? [{ positionId: { in: positionIds } }] : [])] } } });
    }
    if (f.q) {
      const q = f.q.trim();
      and.push({ OR: [{ reference: { contains: q, mode: 'insensitive' } }, { agent: { firstName: { contains: q, mode: 'insensitive' } } }, { agent: { lastName: { contains: q, mode: 'insensitive' } } }, { agent: { agentProfile: { matricule: { contains: q, mode: 'insensitive' } } } }] });
    }
    if (f.typeCode) and.push({ type: { code: f.typeCode } });
    if (f.status) and.push({ status: f.status as any });
    if (f.orgUnitId) and.push({ agent: { agentProfile: { orgUnitId: { in: await orgService.subtreeIds(user.companyId, f.orgUnitId) } } } });
    if (f.from || f.to) and.push({ submittedAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } });
    if (and.length) where.AND = and;
    const [rows, total] = await Promise.all([
      prisma.request.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: this.baseInclude }),
      prisma.request.count({ where })
    ]);
    return { total, page, limit, items: rows.map(r => this.shape(r)) };
  }

  /** Régénère le PDF courant (ex. après modification d'un modèle ou échec de génération). */
  async regenerate(requestId: string, user: { id: string; companyId: string; email?: string }, req?: any) {
    const r = await prisma.request.findFirst({ where: { id: requestId, companyId: user.companyId } });
    if (!r) throw new AppError('Demande introuvable', 404);
    if (r.status === 'DRAFT') throw new AppError('Aucun document avant le dépôt', 409);
    const doc = await documentService.generate(requestId, 'REGENERATED', user.id);
    await auditService.log({ companyId: user.companyId, actor: user, action: 'REQUEST_DOCUMENT_REGENERATED', entity: 'Request', entityId: requestId, after: { version: doc.version }, req });
    return doc;
  }
}

export const requestService = new RequestService();
