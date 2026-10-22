import { OrgUnitType, StepKind, StepResolution, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { addressTitle, lowerFirst } from '../../shared/utils/fr-format';
import { auditService } from '../audit/audit.service';
import { orgService } from '../org/org.service';
import { REQUEST_TYPES, ensureDefaults } from './request-defaults';

type Actor = { id: string; email?: string };

export interface StepInput {
  kind: StepKind;
  label?: string | null;
  resolution: StepResolution;
  positionId?: string | null;
  level?: number | null;
  unitType?: OrgUnitType | null;
  isMandatory?: boolean;
  condition?: { field: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'; value: unknown } | null;
  deadlineDays?: number | null;
  escalatePositionId?: string | null;
  allowReturn?: boolean;
  rejectOnUnfavorable?: boolean;
}

export interface ResolvedStep {
  order: number;
  kind: StepKind;
  label: string;
  heading: string;
  positionId: string | null;
  assigneeId: string | null;
  titleSnapshot: string;
  approverName: string | null;
  allowReturn: boolean;
  rejectOnUnfavorable: boolean;
  deadlineDays: number | null;
  escalatePositionId: string | null;
  skippedReason?: string;
}

export interface Unresolved { order: number; label: string; reason: string }

const KIND_PREFIX: Record<StepKind, string> = { AVIS: 'Avis', VISA: 'Visa', TRAITEMENT: 'Traitement', DECISION: 'Décision' };

/** Évalue la condition d'une étape sur les données de la demande (ex. durée > 10 jours). */
export function evaluateCondition(cond: StepInput['condition'] | null | undefined, data: Record<string, any>): boolean {
  if (!cond) return true;
  const v = data?.[cond.field];
  switch (cond.op) {
    case 'eq': return v === cond.value;
    case 'ne': return v !== cond.value;
    case 'gt': return Number(v) > Number(cond.value);
    case 'gte': return Number(v) >= Number(cond.value);
    case 'lt': return Number(v) < Number(cond.value);
    case 'lte': return Number(v) <= Number(cond.value);
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
    default: return false;
  }
}

/** Mots-clés de tête des noms d'unités → intitulé de poste (ex. « Direction Générale des SI » → « Directeur Général des SI »). */
const HEAD_TITLES: [RegExp, string][] = [
  [/^direction g[ée]n[ée]rale\b/i, 'Directeur Général'],
  [/^direction\b/i, 'Directeur'],
  [/^secr[ée]tariat g[ée]n[ée]ral\b/i, 'Secrétaire Général'],
  [/^service\b/i, 'Chef de Service'],
  [/^cellule\b/i, 'Chef de la Cellule'],
  [/^unit[ée]\b/i, "Chef de l'Unité"]
];
export function headLabelFor(unitName: string): string {
  for (const [re, title] of HEAD_TITLES) if (re.test(unitName)) return unitName.replace(re, title);
  return `Responsable de ${unitName}`;
}

export class WorkflowService {
  // ---------------------------------------------------------------- lecture
  async types(companyId: string) {
    await ensureDefaults(companyId);
    return prisma.requestType.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
  }

  async updateType(companyId: string, id: string, data: { name?: string; isActive?: boolean; attachmentRules?: unknown }, actor: Actor, req?: any) {
    const before = await prisma.requestType.findFirst({ where: { id, companyId } });
    if (!before) throw new AppError('Type de demande introuvable', 404);
    const after = await prisma.requestType.update({ where: { id }, data: { ...(data.name ? { name: data.name.trim() } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}), ...(data.attachmentRules ? { attachmentRules: data.attachmentRules as Prisma.InputJsonValue } : {}) } });
    await auditService.log({ companyId, actor, action: 'REQUEST_TYPE_UPDATED', entity: 'RequestType', entityId: id, before, after, req });
    return after;
  }

  async definitions(companyId: string, typeCode: string) {
    await ensureDefaults(companyId);
    const type = await prisma.requestType.findFirst({ where: { companyId, code: typeCode } });
    if (!type) throw new AppError('Type de demande introuvable', 404);
    return prisma.workflowDefinition.findMany({ where: { companyId, requestTypeId: type.id }, orderBy: { version: 'desc' }, include: { steps: { orderBy: { order: 'asc' } } } });
  }

  /** Circuit en vigueur pour un type de demande (le plus récent actif). */
  async current(companyId: string, requestTypeId: string) {
    return prisma.workflowDefinition.findFirst({ where: { companyId, requestTypeId, isActive: true }, orderBy: { version: 'desc' }, include: { steps: { orderBy: { order: 'asc' } } } });
  }

  // -------------------------------------------------------------- écriture
  private async validateSteps(companyId: string, steps: StepInput[]) {
    if (!steps.length) throw new AppError('Un circuit doit comporter au moins une étape', 400);
    const decisions = steps.filter(s => s.kind === 'DECISION');
    if (decisions.length !== 1 || steps[steps.length - 1].kind !== 'DECISION') throw new AppError('Un circuit doit se terminer par une et une seule étape de décision', 400);
    if (!steps[steps.length - 1].isMandatory && steps[steps.length - 1].isMandatory !== undefined) throw new AppError('L\'étape de décision est obligatoire', 400);
    for (const [i, s] of steps.entries()) {
      const where = `Étape ${i + 1}`;
      if (s.resolution === 'POSITION') {
        if (!s.positionId || !(await prisma.position.findFirst({ where: { id: s.positionId, companyId } }))) throw new AppError(`${where} : poste introuvable`, 400);
      } else if (s.resolution === 'SUPERVISOR_LEVEL') {
        if (!s.level || s.level < 1 || s.level > 10) throw new AppError(`${where} : niveau hiérarchique invalide (1 à 10)`, 400);
      } else if (s.resolution === 'UNIT_TYPE_HEAD') {
        if (!s.unitType) throw new AppError(`${where} : type d'unité manquant`, 400);
      }
      if (s.escalatePositionId && !(await prisma.position.findFirst({ where: { id: s.escalatePositionId, companyId } }))) throw new AppError(`${where} : poste d'escalade introuvable`, 400);
      if (s.condition && !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'].includes(s.condition.op)) throw new AppError(`${where} : opérateur de condition invalide`, 400);
      if (s.condition && s.kind === 'DECISION') throw new AppError('L\'étape de décision ne peut pas être conditionnelle', 400);
    }
  }

  /** Crée une nouvelle version du circuit ; les demandes en cours restent attachées à la version de leur dépôt. */
  async publish(companyId: string, typeCode: string, steps: StepInput[], name: string | undefined, actor: Actor, req?: any) {
    await ensureDefaults(companyId);
    const type = await prisma.requestType.findFirst({ where: { companyId, code: typeCode } });
    if (!type) throw new AppError('Type de demande introuvable', 404);
    await this.validateSteps(companyId, steps);

    const created = await prisma.$transaction(async tx => {
      const last = await tx.workflowDefinition.findFirst({ where: { requestTypeId: type.id }, orderBy: { version: 'desc' } });
      const now = new Date();
      await tx.workflowDefinition.updateMany({ where: { requestTypeId: type.id, isActive: true }, data: { isActive: false, validTo: now } });
      return tx.workflowDefinition.create({
        data: {
          companyId, requestTypeId: type.id, version: (last?.version ?? 0) + 1, name, createdById: actor.id, validFrom: now,
          steps: {
            create: steps.map((s, i) => ({
              order: i + 1, kind: s.kind, label: s.label || null, resolution: s.resolution, positionId: s.positionId || null, level: s.level ?? null, unitType: s.unitType ?? null,
              isMandatory: s.isMandatory ?? true, conditionJson: (s.condition ?? undefined) as Prisma.InputJsonValue | undefined, deadlineDays: s.deadlineDays ?? null,
              escalatePositionId: s.escalatePositionId || null, allowReturn: s.allowReturn ?? true, rejectOnUnfavorable: s.rejectOnUnfavorable ?? (s.kind === 'DECISION')
            }))
          }
        },
        include: { steps: { orderBy: { order: 'asc' } } }
      });
    });
    await auditService.log({ companyId, actor, action: 'WORKFLOW_PUBLISHED', entity: 'WorkflowDefinition', entityId: created.id, after: { typeCode, version: created.version, steps: created.steps.length }, req });
    return created;
  }

  // ------------------------------------------------------------ résolution
  /** Titulaire en fonction d'un poste à une date, ou à défaut le délégataire d'une délégation active. */
  async actingUsers(positionId: string, typeCode: string, at = new Date()) {
    const [holders, delegations] = await Promise.all([
      prisma.positionHolder.findMany({ where: { positionId, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, include: { user: { select: { id: true, firstName: true, lastName: true, isActive: true } } } }),
      prisma.delegation.findMany({ where: { positionId, startsAt: { lte: at }, endsAt: { gt: at } }, include: { delegate: { select: { id: true, firstName: true, lastName: true, isActive: true } } } })
    ]);
    return {
      holders: holders.map(h => h.user).filter(u => u.isActive),
      delegates: delegations.filter(d => d.requestTypes.length === 0 || d.requestTypes.includes(typeCode)).map(d => d.delegate).filter(u => u.isActive)
    };
  }

  async canActOnPosition(userId: string, positionId: string, typeCode: string, at = new Date()): Promise<boolean> {
    const { holders, delegates } = await this.actingUsers(positionId, typeCode, at);
    return [...holders, ...delegates].some(u => u.id === userId);
  }

  private async resolveOne(companyId: string, agentId: string, typeCode: string, step: { resolution: StepResolution; positionId: string | null; level: number | null; unitType: OrgUnitType | null }, chainUnitIds: { id: string; type: OrgUnitType }[]) {
    if (step.resolution === 'POSITION') {
      const position = await prisma.position.findFirst({ where: { id: step.positionId!, companyId, isActive: true } });
      return position ? { position } : { error: 'poste introuvable ou inactif' };
    }
    if (step.resolution === 'UNIT_TYPE_HEAD') {
      const unit = chainUnitIds.find(u => u.type === step.unitType);
      if (!unit) return { error: `l'agent n'a pas d'unité de type ${step.unitType} dans son affectation` };
      const candidates = await prisma.position.findMany({ where: { companyId, orgUnitId: unit.id, isActive: true }, orderBy: [{ level: 'asc' }, { code: 'asc' }] });
      for (const c of candidates) {
        const { holders, delegates } = await this.actingUsers(c.id, typeCode);
        if (holders.length || delegates.length) return { position: c };
      }
      return candidates[0] ? { position: candidates[0] } : { error: `aucun poste de responsable défini pour l'unité ${unit.id}` };
    }
    // SUPERVISOR_LEVEL : n-ième supérieur dans la chaîne hiérarchique de l'agent
    let cursor: string | null | undefined = agentId;
    const seen = new Set<string>();
    for (let i = 0; i < (step.level || 1); i++) {
      if (!cursor || seen.has(cursor)) return { error: 'chaîne hiérarchique incomplète' };
      seen.add(cursor);
      cursor = (await prisma.agentProfile.findUnique({ where: { userId: cursor }, select: { supervisorId: true } }))?.supervisorId;
    }
    if (!cursor) return { error: `pas de supérieur de niveau ${step.level}` };
    const user = await prisma.user.findFirst({ where: { id: cursor, companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, jobTitle: true, agentProfile: { select: { civility: true } } } });
    return user ? { user } : { error: 'supérieur introuvable ou inactif' };
  }

  /**
   * Transforme un circuit en étapes concrètes pour un agent donné (à l'instant du dépôt).
   * Une étape obligatoire non résolue bloque le dépôt (la demande ne restera jamais coincée) ;
   * une étape non obligatoire non résolue, conditionnelle fausse, ou dont l'approbateur serait l'agent lui-même, est ignorée.
   */
  async resolve(companyId: string, workflowId: string, agentId: string, typeCode: string, data: Record<string, any>): Promise<{ steps: ResolvedStep[]; unresolved: Unresolved[]; skipped: Unresolved[] }> {
    const wf = await prisma.workflowDefinition.findFirst({ where: { id: workflowId, companyId }, include: { steps: { orderBy: { order: 'asc' } } } });
    if (!wf) throw new AppError('Circuit introuvable', 404);
    const profile = await prisma.agentProfile.findUnique({ where: { userId: agentId } });
    const chain = (await orgService.chain(companyId, profile?.orgUnitId)).map(u => ({ id: u.id, type: u.type }));

    const steps: ResolvedStep[] = [];
    const unresolved: Unresolved[] = [];
    const skipped: Unresolved[] = [];
    for (const s of wf.steps) {
      const label = s.label || `${KIND_PREFIX[s.kind]} (étape ${s.order})`;
      if (!evaluateCondition(s.conditionJson as any, data)) { skipped.push({ order: s.order, label, reason: 'condition non remplie' }); continue; }
      const r: any = await this.resolveOne(companyId, agentId, typeCode, s, chain);
      if (r.error) {
        if (s.isMandatory) unresolved.push({ order: s.order, label, reason: r.error });
        else skipped.push({ order: s.order, label, reason: r.error });
        continue;
      }
      let positionId: string | null = null, assigneeId: string | null = null, title: string, approverName: string | null = null;
      if (r.position) {
        positionId = r.position.id;
        title = addressTitle(r.position.civility, r.position.label);
        const { holders, delegates } = await this.actingUsers(r.position.id, typeCode);
        const acting = holders[0] || delegates[0];
        if (!acting && s.isMandatory) { unresolved.push({ order: s.order, label: title, reason: `le poste « ${r.position.label} » est vacant` }); continue; }
        if (!acting) { skipped.push({ order: s.order, label: title, reason: 'poste vacant' }); continue; }
        if ([...holders, ...delegates].some(u => u.id === agentId)) { skipped.push({ order: s.order, label: title, reason: 'l\'agent est lui-même titulaire du poste' }); continue; }
        approverName = `${acting.firstName} ${acting.lastName}`;
        (r.position as any).__title = title;
      } else {
        assigneeId = r.user.id;
        title = addressTitle(r.user.agentProfile?.civility, r.user.jobTitle || 'Supérieur hiérarchique');
        approverName = `${r.user.firstName} ${r.user.lastName}`;
      }
      const heading = s.label || `${KIND_PREFIX[s.kind]} ${/^[aeiouyh]/i.test(lowerFirst(title)) ? "d'" : 'de '}${title}`.replace(/ d'(Monsieur|Madame)/, ' de $1');
      steps.push({ order: s.order, kind: s.kind, label, heading, positionId, assigneeId, titleSnapshot: title!, approverName, allowReturn: s.allowReturn, rejectOnUnfavorable: s.rejectOnUnfavorable, deadlineDays: s.deadlineDays, escalatePositionId: s.escalatePositionId });
    }
    // L'étape de décision doit rester présente (sinon la demande n'aurait pas d'issue)
    if (!steps.some(s => s.kind === 'DECISION') && !unresolved.some(u => wf.steps.find(w => w.order === u.order)?.kind === 'DECISION')) {
      const dec = wf.steps.find(s => s.kind === 'DECISION')!;
      unresolved.push({ order: dec.order, label: dec.label || 'Décision', reason: 'l\'autorité de décision ne peut pas être déterminée pour cet agent' });
    }
    return { steps, unresolved, skipped };
  }

  /** Simulation pour l'écran d'administration : qui validerait quoi pour un agent donné. */
  async simulate(companyId: string, typeCode: string, agentId: string, data: Record<string, any>) {
    const type = await prisma.requestType.findFirst({ where: { companyId, code: typeCode } });
    if (!type) throw new AppError('Type de demande introuvable', 404);
    const wf = await this.current(companyId, type.id);
    if (!wf) throw new AppError('Aucun circuit défini pour ce type de demande', 409);
    if (!(await prisma.user.findFirst({ where: { id: agentId, companyId } }))) throw new AppError('Agent introuvable', 404);
    return { workflowVersion: wf.version, ...(await this.resolve(companyId, wf.id, agentId, typeCode, data)) };
  }

  // ------------------------------------------------- circuits d'après les formulaires
  /**
   * Génère les circuits des trois formulaires fournis. Les postes manquants sont créés **vacants** (à pourvoir depuis l'écran des postes),
   * y compris les postes de responsable des unités (Direction, DG, Service) déduits des noms d'unités.
   */
  async bootstrapFromForms(companyId: string, actor: Actor, req?: any) {
    await ensureDefaults(companyId);
    const createdPositions: string[] = [];
    const ensurePosition = async (code: string, label: string, level: number, orgUnitId?: string) => {
      const existing = await prisma.position.findUnique({ where: { companyId_code: { companyId, code } } });
      if (existing) return existing;
      const p = await prisma.position.create({ data: { companyId, code, label, level, orgUnitId: orgUnitId ?? null, civility: 'M' } });
      createdPositions.push(`${p.code} — ${p.label}`);
      return p;
    };
    const minister = await ensurePosition('MINISTRE', 'Ministre', 0);
    const sg = await ensurePosition('SECRETAIRE_GENERAL', 'Secrétaire Général', 1);
    const drh = await ensurePosition('DRH', 'Directeur des Ressources Humaines', 2);
    const rh = await ensurePosition('CHEF_SERVICE_RH', 'Chef du Service des Ressources Humaines', 3);

    for (const u of await prisma.orgUnit.findMany({ where: { companyId, isActive: true, type: { in: ['DG', 'DIRECTION', 'SERVICE'] } } })) {
      await ensurePosition(`CHEF_${u.code}`, headLabelFor(u.name), u.type === 'DG' ? 1 : u.type === 'DIRECTION' ? 2 : 3, u.id);
    }

    const defs: Record<string, StepInput[]> = {
      DECISION_CONGE: [
        { kind: 'AVIS', resolution: 'UNIT_TYPE_HEAD', unitType: 'DIRECTION', deadlineDays: 5 },
        { kind: 'AVIS', resolution: 'UNIT_TYPE_HEAD', unitType: 'DG', deadlineDays: 5 },
        { kind: 'AVIS', resolution: 'POSITION', positionId: drh.id, deadlineDays: 5 },
        { kind: 'AVIS', resolution: 'POSITION', positionId: sg.id, deadlineDays: 5 },
        { kind: 'DECISION', resolution: 'POSITION', positionId: minister.id, deadlineDays: 15 }
      ],
      JOUISSANCE_CONGE: [
        { kind: 'AVIS', resolution: 'POSITION', positionId: rh.id, deadlineDays: 3 },
        { kind: 'DECISION', resolution: 'UNIT_TYPE_HEAD', unitType: 'SERVICE', deadlineDays: 5 }
      ],
      AUTORISATION_ABSENCE: [
        { kind: 'AVIS', resolution: 'POSITION', positionId: rh.id, deadlineDays: 2 },
        { kind: 'DECISION', resolution: 'UNIT_TYPE_HEAD', unitType: 'SERVICE', deadlineDays: 2 }
      ]
    };
    const published: { type: string; version: number }[] = [];
    for (const code of Object.keys(REQUEST_TYPES)) {
      const type = await prisma.requestType.findFirst({ where: { companyId, code } });
      if (type && (await this.current(companyId, type.id))) continue; // on ne remplace jamais un circuit existant
      const wf = await this.publish(companyId, code, defs[code], 'Circuit du formulaire officiel', actor, req);
      published.push({ type: code, version: wf.version });
    }
    return { createdPositions, published };
  }
}

export const workflowService = new WorkflowService();
