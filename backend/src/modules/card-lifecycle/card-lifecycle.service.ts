import { CardStatus } from '@prisma/client';
import { prisma } from '../../database/client';
import { config } from '../../infrastructure/config';
import { AppError } from '../../shared/errors/app-error';
import { decryptToken, encryptToken, generateToken, hashToken } from '../../shared/utils/crypto';
import { auditService } from '../audit/audit.service';
import { rulesService } from '../settings/rules.service';
import { generateAccessQrPng } from '../business-cards/services/card-qr.util';

type Actor = { id: string; email?: string };

const addYears = (d: Date, years: number) => { const r = new Date(d); r.setFullYear(r.getFullYear() + years); return r; };

/**
 * Cycle de vie de la carte professionnelle : émission, suspension, révocation, renouvellement, remplacement.
 * Le QR imprimé = URL + jeton opaque (128 bits). Le jeton est stocké haché (recherche) et chiffré (ré-impression).
 */
export class CardLifecycleService {
  private async load(companyId: string, id: string) {
    const card = await prisma.businessCard.findFirst({ where: { id, companyId } });
    if (!card) throw new AppError('Carte introuvable', 404);
    return card;
  }

  private async event(cardId: string, type: string, actor: Actor | null, reason?: string | null, metadata?: object) {
    await prisma.cardEvent.create({ data: { cardId, type, actorId: actor?.id, reason: reason ?? undefined, metadata: metadata as any } });
  }

  /** Crée un nouveau jeton et révoque les précédents (rotation). Retourne le jeton en clair, à utiliser immédiatement. */
  private async rotateCredential(cardId: string, reason: string) {
    const token = generateToken();
    await prisma.$transaction([
      prisma.cardCredential.updateMany({ where: { cardId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } }),
      prisma.cardCredential.create({ data: { cardId, tokenHash: hashToken(token), tokenEnc: encryptToken(token), tokenPrefix: token.slice(0, 4) } })
    ]);
    return token;
  }

  private async nextCardNumber(): Promise<string> {
    const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('card_number_seq')`;
    return `CP-${new Date().getFullYear()}-${String(nextval).padStart(6, '0')}`;
  }

  async issue(companyId: string, id: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (!card.agentId) throw new AppError('Associez d\'abord la carte à un agent', 409);
    const profile = await prisma.agentProfile.findUnique({ where: { userId: card.agentId }, include: { user: { select: { isActive: true } } } });
    if (!profile || !profile.user.isActive) throw new AppError('L\'agent n\'a pas de profil administratif actif (matricule requis)', 409);
    if (card.status === 'ACTIVE' || card.status === 'SUSPENDED') throw new AppError('Cette carte est déjà émise', 409);
    if (card.status === 'REVOKED') throw new AppError('Une carte révoquée ne peut pas être ré-émise : créez une nouvelle carte', 409);
    // Un agent ne peut détenir qu'une seule carte en cours de validité
    const other = await prisma.businessCard.findFirst({ where: { agentId: card.agentId, id: { not: id }, status: { in: ['ACTIVE', 'SUSPENDED'] } } });
    if (other) throw new AppError(`L'agent possède déjà la carte ${other.cardNumber} : révoquez-la ou remplacez-la`, 409);

    const years = await rulesService.get<number>(companyId, 'card.validity_years');
    const now = new Date();
    const cardNumber = await this.nextCardNumber();
    await prisma.businessCard.update({ where: { id }, data: { cardNumber, status: 'ACTIVE', issuedAt: now, expiresAt: addYears(now, years) } });
    await this.rotateCredential(id, 'Émission');
    await this.event(id, 'ISSUED', actor, null, { cardNumber });
    await auditService.log({ companyId, actor, action: 'CARD_ISSUED', entity: 'BusinessCard', entityId: id, after: { cardNumber, agentId: card.agentId }, req });
    return this.summary(companyId, id);
  }

  async suspend(companyId: string, id: string, reason: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (card.status !== 'ACTIVE') throw new AppError('Seule une carte active peut être suspendue', 409);
    await prisma.businessCard.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await this.event(id, 'SUSPENDED', actor, reason);
    await auditService.log({ companyId, actor, action: 'CARD_SUSPENDED', entity: 'BusinessCard', entityId: id, before: { status: card.status }, after: { status: 'SUSPENDED', reason }, req });
    return this.summary(companyId, id);
  }

  async reactivate(companyId: string, id: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (card.status !== 'SUSPENDED') throw new AppError('Seule une carte suspendue peut être réactivée', 409);
    await prisma.businessCard.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.event(id, 'REACTIVATED', actor);
    await auditService.log({ companyId, actor, action: 'CARD_REACTIVATED', entity: 'BusinessCard', entityId: id, req });
    return this.summary(companyId, id);
  }

  /** Révocation définitive : le jeton est invalidé immédiatement, le QR imprimé ne donne plus accès à rien. */
  async revoke(companyId: string, id: string, reason: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (card.status === 'REVOKED') throw new AppError('Carte déjà révoquée', 409);
    if (card.status === 'PENDING') throw new AppError('Cette carte n\'a pas été émise', 409);
    await prisma.$transaction([
      prisma.businessCard.update({ where: { id }, data: { status: 'REVOKED' } }),
      prisma.cardCredential.updateMany({ where: { cardId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } })
    ]);
    await this.event(id, 'REVOKED', actor, reason);
    await auditService.log({ companyId, actor, action: 'CARD_REVOKED', entity: 'BusinessCard', entityId: id, before: { status: card.status }, after: { status: 'REVOKED', reason }, req });
    return this.summary(companyId, id);
  }

  /** Renouvellement : nouvelle échéance (à partir de l'ancienne si elle n'est pas dépassée) et nouveau jeton. */
  async renew(companyId: string, id: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (!['ACTIVE', 'EXPIRED'].includes(card.status)) throw new AppError('Seule une carte active ou expirée peut être renouvelée', 409);
    const years = await rulesService.get<number>(companyId, 'card.validity_years');
    const now = new Date();
    const base = card.expiresAt && card.expiresAt > now ? card.expiresAt : now;
    const expiresAt = addYears(base, years);
    await prisma.businessCard.update({ where: { id }, data: { status: 'ACTIVE', expiresAt } });
    await this.rotateCredential(id, 'Renouvellement');
    await this.event(id, 'RENEWED', actor, null, { previousExpiresAt: card.expiresAt, expiresAt });
    await auditService.log({ companyId, actor, action: 'CARD_RENEWED', entity: 'BusinessCard', entityId: id, before: { expiresAt: card.expiresAt }, after: { expiresAt }, req });
    return this.summary(companyId, id);
  }

  /** Remplacement (perte, vol, détérioration) : nouveau numéro, ancien jeton révoqué ; l'ancien numéro reste dans l'historique. */
  async replace(companyId: string, id: string, reason: string, actor: Actor, req?: any) {
    const card = await this.load(companyId, id);
    if (!['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(card.status)) throw new AppError('Cette carte ne peut pas être remplacée', 409);
    const newNumber = await this.nextCardNumber();
    await prisma.businessCard.update({ where: { id }, data: { cardNumber: newNumber, status: 'ACTIVE', issuedAt: new Date() } });
    await this.rotateCredential(id, `Remplacement : ${reason}`);
    await this.event(id, 'REPLACED', actor, reason, { previousCardNumber: card.cardNumber, cardNumber: newNumber });
    await auditService.log({ companyId, actor, action: 'CARD_REPLACED', entity: 'BusinessCard', entityId: id, before: { cardNumber: card.cardNumber }, after: { cardNumber: newNumber, reason }, req });
    return this.summary(companyId, id);
  }

  async history(companyId: string, id: string) {
    await this.load(companyId, id);
    const [events, credentials] = await Promise.all([
      prisma.cardEvent.findMany({ where: { cardId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.cardCredential.findMany({ where: { cardId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, tokenPrefix: true, createdAt: true, revokedAt: true, revokeReason: true } })
    ]);
    return { events, credentials };
  }

  async summary(companyId: string, id: string) {
    const card = await prisma.businessCard.findFirst({
      where: { id, companyId },
      select: { id: true, fullName: true, cardNumber: true, status: true, issuedAt: true, expiresAt: true, agentId: true, agent: { select: { id: true, firstName: true, lastName: true, agentProfile: { select: { matricule: true } } } } }
    });
    if (!card) throw new AppError('Carte introuvable', 404);
    return { ...card, effectiveStatus: this.effectiveStatus(card.status, card.expiresAt) };
  }

  effectiveStatus(status: CardStatus, expiresAt: Date | null): CardStatus {
    return status === 'ACTIVE' && expiresAt && expiresAt < new Date() ? 'EXPIRED' : status;
  }

  /** URL encodée dans le QR (carte active uniquement). Le jeton en clair n'est jamais renvoyé séparément. */
  async accessUrl(companyId: string, id: string): Promise<string | null> {
    const card = await this.load(companyId, id);
    if (card.status !== 'ACTIVE') return null;
    const credential = await prisma.cardCredential.findFirst({ where: { cardId: id, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    return credential ? config.accessBaseUrl + decryptToken(credential.tokenEnc) : null;
  }

  async accessQr(companyId: string, id: string, actor: Actor, req?: any): Promise<Buffer> {
    const url = await this.accessUrl(companyId, id);
    if (!url) throw new AppError('Aucun QR d\'accès actif : la carte doit être émise et active', 409);
    await auditService.log({ companyId, actor, action: 'CARD_ACCESS_QR_VIEWED', entity: 'BusinessCard', entityId: id, req });
    return generateAccessQrPng(url);
  }
}

export const cardLifecycleService = new CardLifecycleService();
