import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { generatePin, hashPin } from '../../shared/utils/crypto';
import { parseCsv, parseDate } from '../../shared/utils/csv';
import { auditService } from '../audit/audit.service';
import { orgService, ImportReport } from '../org/org.service';
import { rulesService } from '../settings/rules.service';

type Actor = { id: string; email?: string };

export interface AgentInput {
  matricule: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  civility?: string | null;
  grade?: string | null;
  corps?: string | null;
  hireDate?: Date | null;
  serviceStartDate?: Date | null;
  regime?: string;
  orgUnitId?: string | null;
  supervisorId?: string | null;
}

const CIVILITIES: Record<string, string> = { M: 'M', MR: 'M', MONSIEUR: 'M', MME: 'MME', MADAME: 'MME', MLLE: 'MLLE', MADEMOISELLE: 'MLLE' };

const publicUser = { id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, photo: true, isActive: true, companyId: true } as const;

export class AgentService {
  /** Les agents n'ont pas forcément de compte de connexion : mot de passe aléatoire inutilisable + email technique. */
  private technicalEmail(matricule: string, companyId: string) {
    return `${matricule.toLowerCase().replace(/[^a-z0-9]/g, '')}.${companyId.slice(-6)}@agents.invalid`;
  }
  private unusablePassword() {
    return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  }

  private async assertOrgUnit(companyId: string, id?: string | null) {
    if (id && !(await prisma.orgUnit.findFirst({ where: { id, companyId } }))) throw new AppError('Unité d\'affectation introuvable', 400);
  }

  /** Le supérieur doit exister dans la société, ne pas être l'agent lui-même, et ne pas créer de boucle hiérarchique. */
  private async assertSupervisor(companyId: string, userId: string | null, supervisorId?: string | null) {
    if (!supervisorId) return;
    if (supervisorId === userId) throw new AppError('Un agent ne peut pas être son propre supérieur', 400);
    if (!(await prisma.user.findFirst({ where: { id: supervisorId, companyId } }))) throw new AppError('Supérieur hiérarchique introuvable', 400);
    let cursor: string | null | undefined = supervisorId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === userId) throw new AppError('Boucle hiérarchique détectée', 400);
      seen.add(cursor);
      cursor = (await prisma.agentProfile.findUnique({ where: { userId: cursor }, select: { supervisorId: true } }))?.supervisorId;
    }
  }

  async create(companyId: string, input: AgentInput, actor: Actor, req?: any) {
    const matricule = input.matricule.trim().toUpperCase();
    if (await prisma.agentProfile.findUnique({ where: { companyId_matricule: { companyId, matricule } } })) throw new AppError(`Le matricule ${matricule} existe déjà`, 409);
    const email = (input.email?.trim() || this.technicalEmail(matricule, companyId)).toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) throw new AppError('Cet email est déjà utilisé', 409);
    await this.assertOrgUnit(companyId, input.orgUnitId);

    const created = await prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email, password: await this.unusablePassword(), phone: input.phone, jobTitle: input.jobTitle, companyId, role: 'EMPLOYEE', isVerified: false }
      });
      await tx.agentProfile.create({
        data: { userId: user.id, companyId, matricule, civility: input.civility ?? null, grade: input.grade ?? null, corps: input.corps ?? null, hireDate: input.hireDate ?? null, serviceStartDate: input.serviceStartDate ?? null, regime: input.regime || 'FONCTIONNAIRE', orgUnitId: input.orgUnitId ?? null }
      });
      return user;
    });
    // Le supérieur est vérifié après création (l'identifiant de l'agent est alors connu, pour détecter une boucle)
    if (input.supervisorId) {
      try { await this.assertSupervisor(companyId, created.id, input.supervisorId); await prisma.agentProfile.update({ where: { userId: created.id }, data: { supervisorId: input.supervisorId } }); }
      catch (e) { await prisma.user.delete({ where: { id: created.id } }); throw e; }
    }
    await auditService.log({ companyId, actor, action: 'AGENT_CREATED', entity: 'Agent', entityId: created.id, after: { matricule, name: `${input.firstName} ${input.lastName}` }, req });
    return this.get(companyId, created.id);
  }

  async updateProfile(companyId: string, userId: string, input: Partial<AgentInput>, actor: Actor, req?: any) {
    const user = await prisma.user.findFirst({ where: { id: userId, companyId }, include: { agentProfile: true } });
    if (!user) throw new AppError('Agent introuvable', 404);
    if (input.orgUnitId !== undefined) await this.assertOrgUnit(companyId, input.orgUnitId);
    if (input.supervisorId !== undefined) await this.assertSupervisor(companyId, userId, input.supervisorId);

    const profileData: Prisma.AgentProfileUncheckedUpdateInput = {};
    if (input.matricule !== undefined) {
      const matricule = input.matricule.trim().toUpperCase();
      const clash = await prisma.agentProfile.findFirst({ where: { companyId, matricule, NOT: { userId } } });
      if (clash) throw new AppError(`Le matricule ${matricule} existe déjà`, 409);
      profileData.matricule = matricule;
    }
    for (const k of ['civility', 'grade', 'corps', 'hireDate', 'serviceStartDate', 'regime', 'orgUnitId', 'supervisorId'] as const) {
      if (input[k] !== undefined) (profileData as any)[k] = input[k];
    }
    const userData: Prisma.UserUpdateInput = {};
    for (const k of ['firstName', 'lastName', 'phone', 'jobTitle'] as const) if (input[k] !== undefined) (userData as any)[k] = input[k];

    const before = user.agentProfile;
    await prisma.$transaction(async tx => {
      if (Object.keys(userData).length) await tx.user.update({ where: { id: userId }, data: userData });
      if (before) await tx.agentProfile.update({ where: { userId }, data: profileData });
      else {
        if (!input.matricule) throw new AppError('Le matricule est obligatoire pour créer le profil agent', 400);
        await tx.agentProfile.create({ data: { userId, companyId, matricule: input.matricule.trim().toUpperCase(), ...(profileData as any) } });
      }
    });
    await auditService.log({ companyId, actor, action: before ? 'AGENT_UPDATED' : 'AGENT_PROFILE_CREATED', entity: 'Agent', entityId: userId, before: before && { ...before, pinHash: undefined }, after: input, req });
    return this.get(companyId, userId);
  }

  async list(companyId: string, q: { search?: string; orgUnitId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(200, Math.max(1, q.limit || 25));
    const where: Prisma.UserWhereInput = { companyId, agentProfile: { isNot: null } };
    const and: Prisma.UserWhereInput[] = [];
    if (q.search) {
      const s = q.search.trim();
      and.push({ OR: [
        { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } },
        { agentProfile: { matricule: { contains: s, mode: 'insensitive' } } }
      ] });
    }
    if (q.orgUnitId) and.push({ agentProfile: { orgUnitId: { in: await orgService.subtreeIds(companyId, q.orgUnitId) } } });
    if (and.length) where.AND = and;
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (page - 1) * limit, take: limit,
        select: { ...publicUser, agentProfile: { select: { matricule: true, grade: true, civility: true, orgUnitId: true, supervisorId: true, regime: true, pinHash: true, orgUnit: { select: { id: true, code: true, name: true } } } } }
      }),
      prisma.user.count({ where })
    ]);
    return {
      total, page, limit,
      items: items.map(({ agentProfile, ...u }) => ({ ...u, profile: agentProfile && { ...agentProfile, pinHash: undefined, hasPin: !!agentProfile.pinHash } }))
    };
  }

  async get(companyId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: {
        ...publicUser, createdAt: true,
        agentProfile: { include: { orgUnit: true, supervisor: { select: { id: true, firstName: true, lastName: true } } } },
        heldCards: { select: { id: true, cardNumber: true, status: true, issuedAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }
      }
    });
    if (!user || !user.agentProfile) throw new AppError('Agent introuvable', 404);
    const { pinHash, pinFailedAttempts, pinLockedUntil, ...profile } = user.agentProfile;
    return { ...user, agentProfile: undefined, profile: { ...profile, hasPin: !!pinHash, pinLocked: !!pinLockedUntil && pinLockedUntil > new Date() }, orgChain: await orgService.chain(companyId, profile.orgUnitId) };
  }

  /** Génère un nouveau PIN. Il n'est renvoyé qu'une seule fois (remise à l'agent) et n'est jamais stocké en clair. */
  async resetPin(companyId: string, userId: string, actor: Actor, req?: any) {
    const profile = await prisma.agentProfile.findFirst({ where: { userId, companyId } });
    if (!profile) throw new AppError('Agent introuvable', 404);
    const pin = generatePin(await rulesService.get<number>(companyId, 'access.pin_length'));
    await prisma.agentProfile.update({ where: { userId }, data: { pinHash: await hashPin(pin), pinFailedAttempts: 0, pinLockedUntil: null } });
    await auditService.log({ companyId, actor, action: 'AGENT_PIN_RESET', entity: 'Agent', entityId: userId, req });
    return { pin };
  }

  async setActive(companyId: string, userId: string, isActive: boolean, actor: Actor, req?: any) {
    const user = await prisma.user.findFirst({ where: { id: userId, companyId, agentProfile: { isNot: null } } });
    if (!user) throw new AppError('Agent introuvable', 404);
    if (userId === actor.id && !isActive) throw new AppError('Vous ne pouvez pas désactiver votre propre compte', 400);
    await prisma.user.update({ where: { id: userId }, data: { isActive } });
    await auditService.log({ companyId, actor, action: isActive ? 'AGENT_ACTIVATED' : 'AGENT_DEACTIVATED', entity: 'Agent', entityId: userId, req });
  }

  /** Historique des cartes de l'agent (toutes les cartes qui lui ont été attribuées, avec leurs événements). */
  async cardHistory(companyId: string, userId: string) {
    if (!(await prisma.user.findFirst({ where: { id: userId, companyId } }))) throw new AppError('Agent introuvable', 404);
    return prisma.businessCard.findMany({
      where: { agentId: userId, companyId }, orderBy: { createdAt: 'desc' },
      select: { id: true, cardNumber: true, status: true, issuedAt: true, expiresAt: true, createdAt: true, events: { orderBy: { createdAt: 'desc' }, select: { type: true, reason: true, createdAt: true, metadata: true } } }
    });
  }

  // ------------------------------------------------------------------ import
  /**
   * Colonnes : matricule ; nom ; prenom ; email ; telephone ; civilite ; grade ; corps ; date_integration ;
   * date_entree_service ; code_unite ; matricule_superieur ; regime. Seuls matricule, nom et prenom sont obligatoires.
   * Validation complète d'abord (dryRun = true par défaut) ; écriture tout ou rien.
   */
  async importCsv(companyId: string, csv: string, dryRun: boolean, actor: Actor, req?: any): Promise<ImportReport> {
    const { headers, rows } = parseCsv(csv);
    const report: ImportReport = { dryRun, total: rows.length, created: 0, updated: 0, errors: [] };
    const missing = ['matricule', 'nom', 'prenom'].filter(h => !headers.includes(h));
    if (missing.length) { report.errors.push({ line: 1, message: `Colonne(s) obligatoire(s) absente(s) : ${missing.join(', ')}` }); return report; }

    const units = new Map((await prisma.orgUnit.findMany({ where: { companyId } })).map(u => [u.code, u.id]));
    const profiles = await prisma.agentProfile.findMany({ where: { companyId }, select: { matricule: true, userId: true } });
    const existingByMatricule = new Map(profiles.map(p => [p.matricule, p.userId]));
    const usedEmails = new Map((await prisma.user.findMany({ select: { email: true, id: true } })).map(u => [u.email, u.id]));

    type Row = { line: number; matricule: string; firstName: string; lastName: string; email?: string; phone?: string; civility: string | null; grade: string | null; corps: string | null; hireDate: Date | null; serviceStartDate: Date | null; orgCode: string; supervisorMat: string; regime: string };
    const parsed: Row[] = [];
    const seen = new Set<string>();

    for (const r of rows) {
      const v = r.values;
      const fail = (message: string) => report.errors.push({ line: r.line, message: `${v.matricule || '?'} : ${message}` });
      const matricule = (v.matricule || '').toUpperCase();
      if (!matricule) { report.errors.push({ line: r.line, message: 'matricule vide' }); continue; }
      if (seen.has(matricule)) { fail('matricule en double dans le fichier'); continue; }
      seen.add(matricule);
      if (!v.nom || !v.prenom) { fail('nom ou prénom vide'); continue; }
      let hireDate: Date | null = null, serviceStartDate: Date | null = null;
      try { hireDate = parseDate(v.date_integration || ''); serviceStartDate = parseDate(v.date_entree_service || ''); } catch (e: any) { fail(e.message); continue; }
      if (hireDate && serviceStartDate && serviceStartDate < hireDate) { fail('la date d\'entrée en service précède la date d\'intégration'); continue; }
      let civility: string | null = null;
      if (v.civilite) { civility = CIVILITIES[v.civilite.toUpperCase().replace('.', '')] ?? null; if (!civility) { fail(`civilité « ${v.civilite} » invalide (M, MME, MLLE)`); continue; } }
      const orgCode = (v.code_unite || '').toUpperCase();
      if (orgCode && !units.has(orgCode)) { fail(`unité « ${orgCode} » introuvable (importez d'abord l'organigramme)`); continue; }
      const email = v.email?.toLowerCase();
      if (email) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fail(`email « ${v.email} » invalide`); continue; }
        const owner = usedEmails.get(email);
        if (owner && owner !== existingByMatricule.get(matricule)) { fail(`email « ${email} » déjà utilisé par un autre compte`); continue; }
      }
      parsed.push({ line: r.line, matricule, firstName: v.prenom, lastName: v.nom, email, phone: v.telephone || undefined, civility, grade: v.grade || null, corps: v.corps || null, hireDate, serviceStartDate, orgCode, supervisorMat: (v.matricule_superieur || '').toUpperCase(), regime: (v.regime || 'FONCTIONNAIRE').toUpperCase() });
    }

    const inFile = new Set(parsed.map(p => p.matricule));
    for (const p of parsed) {
      if (!p.supervisorMat) continue;
      if (p.supervisorMat === p.matricule) report.errors.push({ line: p.line, message: `${p.matricule} : supérieur = lui-même` });
      else if (!inFile.has(p.supervisorMat) && !existingByMatricule.has(p.supervisorMat)) report.errors.push({ line: p.line, message: `${p.matricule} : supérieur « ${p.supervisorMat} » introuvable` });
    }
    // Boucles hiérarchiques dans le fichier
    const supOf = new Map(parsed.map(p => [p.matricule, p.supervisorMat]));
    for (const p of parsed) {
      const walk = new Set([p.matricule]);
      let cur = p.supervisorMat;
      while (cur && supOf.has(cur)) { if (walk.has(cur)) { report.errors.push({ line: p.line, message: `${p.matricule} : boucle hiérarchique` }); break; } walk.add(cur); cur = supOf.get(cur)!; }
    }
    report.created = parsed.filter(p => !existingByMatricule.has(p.matricule)).length;
    report.updated = parsed.length - report.created;
    if (report.errors.length || dryRun) return report;

    await prisma.$transaction(async tx => {
      const idByMatricule = new Map(existingByMatricule);
      for (const p of parsed) {
        const common = { civility: p.civility, grade: p.grade, corps: p.corps, hireDate: p.hireDate, serviceStartDate: p.serviceStartDate, regime: p.regime, orgUnitId: p.orgCode ? units.get(p.orgCode)! : null };
        const existingId = existingByMatricule.get(p.matricule);
        if (existingId) {
          await tx.user.update({ where: { id: existingId }, data: { firstName: p.firstName, lastName: p.lastName, ...(p.phone ? { phone: p.phone } : {}), ...(p.email ? { email: p.email } : {}) } });
          await tx.agentProfile.update({ where: { userId: existingId }, data: common });
        } else {
          const user = await tx.user.create({ data: { firstName: p.firstName, lastName: p.lastName, email: p.email || this.technicalEmail(p.matricule, companyId), password: await this.unusablePassword(), phone: p.phone, companyId, role: 'EMPLOYEE', isVerified: false } });
          await tx.agentProfile.create({ data: { userId: user.id, companyId, matricule: p.matricule, ...common } });
          idByMatricule.set(p.matricule, user.id);
        }
      }
      for (const p of parsed) {
        await tx.agentProfile.update({ where: { userId: idByMatricule.get(p.matricule)! }, data: { supervisorId: p.supervisorMat ? idByMatricule.get(p.supervisorMat)! : null } });
      }
    }, { timeout: 60000 });
    await auditService.log({ companyId, actor, action: 'AGENTS_IMPORTED', entity: 'Agent', after: { created: report.created, updated: report.updated }, req });
    return report;
  }
}

export const agentService = new AgentService();
