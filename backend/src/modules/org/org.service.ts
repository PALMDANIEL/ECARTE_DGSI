import { OrgUnitType } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { parseCsv } from '../../shared/utils/csv';
import { auditService } from '../audit/audit.service';

type Actor = { id: string; email?: string };

/** Rang hiérarchique : une unité enfant doit être de rang strictement supérieur à son parent (ex. DIRECTION sous DG). */
export const TYPE_RANK: Record<OrgUnitType, number> = { SG: 1, DG: 2, DIRECTION: 3, SERVICE: 4, UNITE: 5 };

export interface ImportReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
}

export class OrgService {
  // ------------------------------------------------------------------ unités
  list(companyId: string) {
    return prisma.orgUnit.findMany({ where: { companyId }, orderBy: [{ code: 'asc' }] });
  }

  /** Chaîne des ancêtres, du plus haut (ministère / SG) jusqu'à l'unité elle-même. */
  async chain(companyId: string, orgUnitId: string | null | undefined) {
    const chain: { id: string; code: string; name: string; type: OrgUnitType }[] = [];
    let currentId = orgUnitId;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const unit = await prisma.orgUnit.findFirst({ where: { id: currentId, companyId } });
      if (!unit) break;
      chain.unshift({ id: unit.id, code: unit.code, name: unit.name, type: unit.type });
      currentId = unit.parentId;
    }
    return chain;
  }

  /** Identifiants de l'unité et de tous ses descendants. */
  async subtreeIds(companyId: string, rootId: string): Promise<string[]> {
    const all = await prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, parentId: true } });
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) all.filter(u => u.parentId === ids[i]).forEach(u => ids.push(u.id));
    return ids;
  }

  private async assertParent(companyId: string, type: OrgUnitType, parentId?: string | null, selfId?: string) {
    if (!parentId) return;
    const parent = await prisma.orgUnit.findFirst({ where: { id: parentId, companyId } });
    if (!parent) throw new AppError('Unité parente introuvable', 400);
    if (TYPE_RANK[type] <= TYPE_RANK[parent.type]) {
      throw new AppError(`Une unité de type ${type} ne peut pas dépendre d'une unité de type ${parent.type}`, 400);
    }
    if (selfId) {
      const ancestors = await this.chain(companyId, parentId);
      if (ancestors.some(a => a.id === selfId)) throw new AppError('Cycle détecté dans l\'organigramme', 400);
    }
  }

  async createUnit(companyId: string, data: { code: string; name: string; type: OrgUnitType; parentId?: string | null }, actor: Actor, req?: any) {
    const code = data.code.trim().toUpperCase();
    if (await prisma.orgUnit.findUnique({ where: { companyId_code: { companyId, code } } })) throw new AppError(`Le code ${code} existe déjà`, 409);
    await this.assertParent(companyId, data.type, data.parentId);
    const unit = await prisma.orgUnit.create({ data: { companyId, code, name: data.name.trim(), type: data.type, parentId: data.parentId || null } });
    await auditService.log({ companyId, actor, action: 'ORG_UNIT_CREATED', entity: 'OrgUnit', entityId: unit.id, after: unit, req });
    return unit;
  }

  async updateUnit(companyId: string, id: string, data: Partial<{ code: string; name: string; type: OrgUnitType; parentId: string | null; isActive: boolean }>, actor: Actor, req?: any) {
    const before = await prisma.orgUnit.findFirst({ where: { id, companyId } });
    if (!before) throw new AppError('Unité introuvable', 404);
    const type = data.type ?? before.type;
    const parentId = data.parentId === undefined ? before.parentId : data.parentId;
    await this.assertParent(companyId, type, parentId, id);
    const children = await prisma.orgUnit.findMany({ where: { parentId: id } });
    if (data.type && children.some(c => TYPE_RANK[c.type] <= TYPE_RANK[type])) throw new AppError('Ce type est incompatible avec les unités rattachées', 400);
    if (data.code) {
      const code = data.code.trim().toUpperCase();
      const clash = await prisma.orgUnit.findFirst({ where: { companyId, code, NOT: { id } } });
      if (clash) throw new AppError(`Le code ${code} existe déjà`, 409);
      data.code = code;
    }
    const after = await prisma.orgUnit.update({ where: { id }, data: { ...data, ...(data.name ? { name: data.name.trim() } : {}) } });
    await auditService.log({ companyId, actor, action: 'ORG_UNIT_UPDATED', entity: 'OrgUnit', entityId: id, before, after, req });
    return after;
  }

  async deleteUnit(companyId: string, id: string, actor: Actor, req?: any) {
    const unit = await prisma.orgUnit.findFirst({ where: { id, companyId }, include: { _count: { select: { children: true, agents: true, positions: true } } } });
    if (!unit) throw new AppError('Unité introuvable', 404);
    const { children, agents, positions } = unit._count;
    if (children || agents || positions) {
      throw new AppError(`Suppression impossible : ${children} sous-unité(s), ${agents} agent(s), ${positions} poste(s) rattachés. Désactivez l'unité à la place.`, 409);
    }
    await prisma.orgUnit.delete({ where: { id } });
    await auditService.log({ companyId, actor, action: 'ORG_UNIT_DELETED', entity: 'OrgUnit', entityId: id, before: unit, req });
  }

  /**
   * Import CSV : code ; nom ; type ; code_parent. Les parents peuvent apparaître après leurs enfants dans le fichier.
   * Toujours validé d'abord ; rien n'est écrit s'il y a la moindre erreur (tout ou rien).
   */
  async importUnits(companyId: string, csv: string, dryRun: boolean, actor: Actor, req?: any): Promise<ImportReport> {
    const { headers, rows } = parseCsv(csv);
    const report: ImportReport = { dryRun, total: rows.length, created: 0, updated: 0, errors: [] };
    const missing = ['code', 'nom', 'type'].filter(h => !headers.includes(h));
    if (missing.length) { report.errors.push({ line: 1, message: `Colonne(s) obligatoire(s) absente(s) : ${missing.join(', ')}` }); return report; }

    const existing = await prisma.orgUnit.findMany({ where: { companyId } });
    const byCode = new Map(existing.map(u => [u.code, u]));
    type Row = { line: number; code: string; name: string; type: OrgUnitType; parentCode: string };
    const parsed: Row[] = [];
    const seen = new Set<string>();

    for (const r of rows) {
      const code = (r.values.code || '').toUpperCase();
      const type = (r.values.type || '').toUpperCase() as OrgUnitType;
      if (!code) { report.errors.push({ line: r.line, message: 'code vide' }); continue; }
      if (!r.values.nom) { report.errors.push({ line: r.line, message: `${code} : nom vide` }); continue; }
      if (!(type in TYPE_RANK)) { report.errors.push({ line: r.line, message: `${code} : type « ${r.values.type} » invalide (${Object.keys(TYPE_RANK).join(', ')})` }); continue; }
      if (seen.has(code)) { report.errors.push({ line: r.line, message: `${code} : code en double dans le fichier` }); continue; }
      seen.add(code);
      parsed.push({ line: r.line, code, name: r.values.nom, type, parentCode: (r.values.code_parent || '').toUpperCase() });
    }

    const fileByCode = new Map(parsed.map(p => [p.code, p]));
    for (const p of parsed) {
      if (!p.parentCode) continue;
      const parentType = fileByCode.get(p.parentCode)?.type ?? byCode.get(p.parentCode)?.type;
      if (!parentType) report.errors.push({ line: p.line, message: `${p.code} : parent « ${p.parentCode} » introuvable` });
      else if (TYPE_RANK[p.type] <= TYPE_RANK[parentType]) report.errors.push({ line: p.line, message: `${p.code} : ${p.type} ne peut pas dépendre d'un ${parentType}` });
    }
    // Détection des cycles dans le fichier
    for (const p of parsed) {
      const walk = new Set<string>([p.code]);
      let cur = fileByCode.get(p.parentCode);
      while (cur) { if (walk.has(cur.code)) { report.errors.push({ line: p.line, message: `${p.code} : cycle dans la hiérarchie` }); break; } walk.add(cur.code); cur = fileByCode.get(cur.parentCode); }
    }
    report.created = parsed.filter(p => !byCode.has(p.code)).length;
    report.updated = parsed.length - report.created;
    if (report.errors.length || dryRun) return report;

    await prisma.$transaction(async tx => {
      const ids = new Map(existing.map(u => [u.code, u.id]));
      // Création / mise à jour sans parent d'abord, puis rattachement
      for (const p of parsed) {
        const unit = await tx.orgUnit.upsert({
          where: { companyId_code: { companyId, code: p.code } },
          update: { name: p.name, type: p.type },
          create: { companyId, code: p.code, name: p.name, type: p.type }
        });
        ids.set(p.code, unit.id);
      }
      for (const p of parsed) {
        await tx.orgUnit.update({ where: { id: ids.get(p.code)! }, data: { parentId: p.parentCode ? ids.get(p.parentCode)! : null } });
      }
    });
    await auditService.log({ companyId, actor, action: 'ORG_UNITS_IMPORTED', entity: 'OrgUnit', after: { created: report.created, updated: report.updated }, req });
    return report;
  }

  // ------------------------------------------------------------------ postes
  async listPositions(companyId: string) {
    const now = new Date();
    const positions = await prisma.position.findMany({
      where: { companyId },
      orderBy: [{ level: 'asc' }, { label: 'asc' }],
      include: {
        orgUnit: { select: { id: true, code: true, name: true } },
        holders: { where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        delegations: { where: { startsAt: { lte: now }, endsAt: { gt: now } }, include: { delegate: { select: { id: true, firstName: true, lastName: true } } } }
      }
    });
    return positions.map(({ holders, delegations, ...p }) => ({ ...p, holder: holders[0]?.user ?? null, activeDelegations: delegations }));
  }

  async createPosition(companyId: string, data: { code: string; label: string; civility?: string; level?: number; orgUnitId?: string }, actor: Actor, req?: any) {
    const code = data.code.trim().toUpperCase();
    if (await prisma.position.findUnique({ where: { companyId_code: { companyId, code } } })) throw new AppError(`Le code ${code} existe déjà`, 409);
    if (data.orgUnitId && !(await prisma.orgUnit.findFirst({ where: { id: data.orgUnitId, companyId } }))) throw new AppError('Unité introuvable', 400);
    const position = await prisma.position.create({ data: { companyId, code, label: data.label.trim(), civility: data.civility, level: data.level ?? 0, orgUnitId: data.orgUnitId } });
    await auditService.log({ companyId, actor, action: 'POSITION_CREATED', entity: 'Position', entityId: position.id, after: position, req });
    return position;
  }

  async updatePosition(companyId: string, id: string, data: Partial<{ label: string; civility: string | null; level: number; orgUnitId: string | null; isActive: boolean }>, actor: Actor, req?: any) {
    const before = await prisma.position.findFirst({ where: { id, companyId } });
    if (!before) throw new AppError('Poste introuvable', 404);
    if (data.orgUnitId && !(await prisma.orgUnit.findFirst({ where: { id: data.orgUnitId, companyId } }))) throw new AppError('Unité introuvable', 400);
    const after = await prisma.position.update({ where: { id }, data });
    await auditService.log({ companyId, actor, action: 'POSITION_UPDATED', entity: 'Position', entityId: id, before, after, req });
    return after;
  }

  async deletePosition(companyId: string, id: string, actor: Actor, req?: any) {
    const position = await prisma.position.findFirst({ where: { id, companyId }, include: { _count: { select: { holders: true, delegations: true } } } });
    if (!position) throw new AppError('Poste introuvable', 404);
    if (position._count.holders || position._count.delegations) throw new AppError('Suppression impossible : le poste a un historique de titulaires ou de délégations. Désactivez-le.', 409);
    await prisma.position.delete({ where: { id } });
    await auditService.log({ companyId, actor, action: 'POSITION_DELETED', entity: 'Position', entityId: id, before: position, req });
  }

  /** Affecte un titulaire : le titulaire en cours est clôturé à la date de début du nouveau (historique conservé). */
  async assignHolder(companyId: string, positionId: string, userId: string, startsAt: Date, actor: Actor, req?: any) {
    const position = await prisma.position.findFirst({ where: { id: positionId, companyId } });
    if (!position) throw new AppError('Poste introuvable', 404);
    const user = await prisma.user.findFirst({ where: { id: userId, companyId, isActive: true } });
    if (!user) throw new AppError('Agent introuvable ou inactif', 400);
    const holder = await prisma.$transaction(async tx => {
      await tx.positionHolder.updateMany({ where: { positionId, endsAt: null }, data: { endsAt: startsAt } });
      return tx.positionHolder.create({ data: { positionId, userId, startsAt } });
    });
    await auditService.log({ companyId, actor, action: 'POSITION_HOLDER_ASSIGNED', entity: 'Position', entityId: positionId, after: { userId, startsAt }, req });
    return holder;
  }

  async endHolder(companyId: string, positionId: string, endsAt: Date, actor: Actor, req?: any) {
    const position = await prisma.position.findFirst({ where: { id: positionId, companyId } });
    if (!position) throw new AppError('Poste introuvable', 404);
    const { count } = await prisma.positionHolder.updateMany({ where: { positionId, endsAt: null }, data: { endsAt } });
    if (!count) throw new AppError('Aucun titulaire en cours', 409);
    await auditService.log({ companyId, actor, action: 'POSITION_HOLDER_ENDED', entity: 'Position', entityId: positionId, after: { endsAt }, req });
  }

  async holderHistory(companyId: string, positionId: string) {
    if (!(await prisma.position.findFirst({ where: { id: positionId, companyId } }))) throw new AppError('Poste introuvable', 404);
    return prisma.positionHolder.findMany({ where: { positionId }, orderBy: { startsAt: 'desc' }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
  }

  // ------------------------------------------------------------- délégations
  listDelegations(companyId: string) {
    return prisma.delegation.findMany({
      where: { position: { companyId } }, orderBy: { startsAt: 'desc' },
      include: { position: { select: { id: true, code: true, label: true } }, delegate: { select: { id: true, firstName: true, lastName: true } } }
    });
  }

  async createDelegation(companyId: string, data: { positionId: string; delegateId: string; startsAt: Date; endsAt: Date; requestTypes?: string[]; reason?: string }, actor: Actor, req?: any) {
    if (data.endsAt <= data.startsAt) throw new AppError('La date de fin doit être postérieure à la date de début', 400);
    const position = await prisma.position.findFirst({ where: { id: data.positionId, companyId }, include: { holders: { where: { endsAt: null } } } });
    if (!position) throw new AppError('Poste introuvable', 404);
    if (!(await prisma.user.findFirst({ where: { id: data.delegateId, companyId, isActive: true } }))) throw new AppError('Délégataire introuvable ou inactif', 400);
    if (position.holders.some(h => h.userId === data.delegateId)) throw new AppError('Le titulaire du poste ne peut pas être son propre délégataire', 400);
    const delegation = await prisma.delegation.create({ data: { ...data, requestTypes: data.requestTypes ?? [], createdById: actor.id } });
    await auditService.log({ companyId, actor, action: 'DELEGATION_CREATED', entity: 'Delegation', entityId: delegation.id, after: delegation, req });
    return delegation;
  }

  async deleteDelegation(companyId: string, id: string, actor: Actor, req?: any) {
    const delegation = await prisma.delegation.findFirst({ where: { id, position: { companyId } } });
    if (!delegation) throw new AppError('Délégation introuvable', 404);
    await prisma.delegation.delete({ where: { id } });
    await auditService.log({ companyId, actor, action: 'DELEGATION_DELETED', entity: 'Delegation', entityId: id, before: delegation, req });
  }
}

export const orgService = new OrgService();
