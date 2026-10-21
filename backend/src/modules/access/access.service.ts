import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { agentJwtSecret, hashToken, verifyPin } from '../../shared/utils/crypto';
import { auditService } from '../audit/audit.service';
import { orgService } from '../org/org.service';
import { rulesService } from '../settings/rules.service';
import { ScanService } from '../scans/services/scan.service';
import { ScanRepository } from '../scans/repositories/scan.repository';
import { BusinessCardRepository } from '../business-cards/repositories/card.repository';

const scanService = new ScanService(new ScanRepository(), new BusinessCardRepository());

/** Message volontairement identique pour un jeton inconnu, révoqué, expiré ou une carte suspendue : on ne renseigne pas un fraudeur. */
const invalid = () => new AppError('Carte invalide ou non utilisable', 404, 'CARD_INVALID');

const mask = (firstName: string, lastName: string) => `${firstName.split(/\s+/)[0]} ${lastName.charAt(0).toUpperCase()}.`;

export interface AgentSession { scope: 'agent'; sub: string; cardId: string; companyId: string }

export class AccessService {
  /**
   * Résout un QR : renvoie la carte et l'agent si (et seulement si) le jeton est actif, la carte active et non expirée,
   * et l'agent actif avec un profil administratif.
   */
  async resolve(token: string, ctx?: { ip?: string; userAgent?: string }) {
    const credential = await prisma.cardCredential.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { card: { include: { agent: { include: { agentProfile: { include: { orgUnit: true } } } } } } }
    });
    if (!credential) throw invalid(); // jeton inconnu : pas d'écriture en base (évite de saturer le journal)

    const { card } = credential;
    const agent = card.agent;
    const reason =
      credential.revokedAt ? 'TOKEN_REVOKED' :
      card.status !== 'ACTIVE' ? `CARD_${card.status}` :
      card.expiresAt && card.expiresAt < new Date() ? 'CARD_EXPIRED' :
      !agent || !agent.isActive || !agent.agentProfile ? 'AGENT_UNAVAILABLE' : null;

    if (reason) {
      await auditService.log({ companyId: card.companyId, action: 'ACCESS_DENIED', entity: 'BusinessCard', entityId: card.id, after: { reason, tokenPrefix: credential.tokenPrefix, ip: ctx?.ip } });
      throw invalid();
    }
    return { card, agent: agent!, profile: agent!.agentProfile! };
  }

  /** Étape 1 : le scan identifie l'agent (nom masqué seulement) et journalise le passage. Rien de confidentiel n'est renvoyé. */
  async scan(token: string, ctx: { ip: string; userAgent: string }) {
    const { card, agent, profile } = await this.resolve(token, ctx);
    scanService.recordScanForCard(card, ctx.ip, ctx.userAgent).catch(() => undefined);
    return {
      valid: true,
      agent: { displayName: mask(agent.firstName, agent.lastName), photo: card.photo ?? agent.photo ?? null, unit: profile.orgUnit?.name ?? null },
      pinRequired: true,
      pinConfigured: !!profile.pinHash
    };
  }

  /** Étape 2 : le PIN personnel ouvre une session « agent » courte, limitée aux démarches de cet agent. */
  async verifyPin(token: string, pin: string, ctx: { ip: string; userAgent: string }) {
    const { card, agent, profile } = await this.resolve(token, ctx);
    const companyId = card.companyId;
    if (!profile.pinHash) throw new AppError('Votre code PIN n\'a pas encore été remis. Contactez le service des ressources humaines.', 409, 'PIN_NOT_SET');

    const now = new Date();
    if (profile.pinLockedUntil && profile.pinLockedUntil > now) {
      throw new AppError('Trop de tentatives. Réessayez plus tard.', 423, 'PIN_LOCKED', { lockedUntil: profile.pinLockedUntil });
    }

    if (!(await verifyPin(String(pin ?? ''), profile.pinHash))) {
      const [maxAttempts, lockMinutes] = await Promise.all([
        rulesService.get<number>(companyId, 'access.pin_max_attempts'),
        rulesService.get<number>(companyId, 'access.pin_lock_minutes')
      ]);
      // Si un verrou précédent est expiré, le compteur repart de zéro
      const attempts = (profile.pinLockedUntil && profile.pinLockedUntil <= now ? 0 : profile.pinFailedAttempts) + 1;
      const locked = attempts >= maxAttempts;
      await prisma.agentProfile.update({
        where: { userId: agent.id },
        data: { pinFailedAttempts: locked ? 0 : attempts, pinLockedUntil: locked ? new Date(now.getTime() + lockMinutes * 60000) : null }
      });
      await auditService.log({ companyId, actor: { id: agent.id }, action: locked ? 'PIN_LOCKED' : 'PIN_FAILED', entity: 'Agent', entityId: agent.id, after: { attempts, ip: ctx.ip } });
      if (locked) throw new AppError('Trop de tentatives. Compte verrouillé temporairement.', 423, 'PIN_LOCKED', { lockedUntil: new Date(now.getTime() + lockMinutes * 60000) });
      throw new AppError('Code PIN incorrect', 401, 'PIN_INVALID', { remainingAttempts: maxAttempts - attempts });
    }

    await prisma.agentProfile.update({ where: { userId: agent.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
    const minutes = await rulesService.get<number>(companyId, 'access.session_minutes');
    const payload: AgentSession = { scope: 'agent', sub: agent.id, cardId: card.id, companyId };
    const sessionToken = jwt.sign(payload, agentJwtSecret(), { expiresIn: `${minutes}m` } as SignOptions);
    await auditService.log({ companyId, actor: { id: agent.id, email: agent.email }, action: 'AGENT_SESSION_OPENED', entity: 'Agent', entityId: agent.id, after: { cardId: card.id, ip: ctx.ip } });
    return { sessionToken, expiresInMinutes: minutes, ...(await this.me(agent.id, card.id)) };
  }

  /** Dossier de l'agent connecté par QR + PIN : lecture seule de ses propres informations. */
  async me(agentId: string, cardId: string) {
    const user = await prisma.user.findUnique({ where: { id: agentId }, include: { agentProfile: { include: { supervisor: { select: { firstName: true, lastName: true } } } }, company: { select: { name: true } } } });
    const card = await prisma.businessCard.findUnique({ where: { id: cardId }, select: { cardNumber: true, status: true, expiresAt: true } });
    if (!user || !user.isActive || !user.agentProfile || !card || card.status !== 'ACTIVE') throw invalid();
    const p = user.agentProfile;
    return {
      agent: {
        civility: p.civility, firstName: user.firstName, lastName: user.lastName, matricule: p.matricule, grade: p.grade, corps: p.corps,
        hireDate: p.hireDate, serviceStartDate: p.serviceStartDate, administration: user.company.name,
        orgChain: await orgService.chain(user.companyId, p.orgUnitId),
        supervisor: p.supervisor ? `${p.supervisor.firstName} ${p.supervisor.lastName}` : null
      },
      card: { number: card.cardNumber, expiresAt: card.expiresAt },
      // Les démarches (congé, jouissance, absence) seront ajoutées avec le moteur de demandes (phase 2)
      services: [] as { code: string; label: string }[]
    };
  }
}

export const accessService = new AccessService();
