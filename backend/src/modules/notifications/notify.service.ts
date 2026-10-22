import { prisma } from '../../database/client';
import { config } from '../../infrastructure/config';
import { EmailService } from '../../infrastructure/email';
import { logger } from '../../infrastructure/logger';
import { AppError } from '../../shared/errors/app-error';
import { rulesService } from '../settings/rules.service';

export interface NotifyInput {
  companyId: string;
  userIds: string[];
  type: 'REQUEST_ASSIGNED' | 'REQUEST_UPDATE' | 'REQUEST_OVERDUE' | 'REQUEST_ESCALATED' | string;
  message: string;
  requestId?: string;
  /** Chemin dans l'application (ex. /requests?open=…) ; joint à l'email. */
  link?: string;
}

type Sender = (to: string, subject: string, text: string) => Promise<void>;

/**
 * Notifications : toujours enregistrées dans l'application ; en plus par email si le paramètre `notify.email_enabled` est actif
 * et que le destinataire a un email réel (les agents créés sans email ont une adresse technique « @agents.invalid »).
 * Un échec d'envoi ne bloque jamais l'opération métier.
 */
export class NotifyService {
  private send: Sender = (to, subject, text) => new EmailService().send(to, subject, text);

  /** Remplace l'expéditeur (tests). */
  setSender(fn: Sender) { this.send = fn; }

  async notify(input: NotifyInput) {
    const ids = [...new Set(input.userIds)];
    if (!ids.length) return 0;
    await prisma.notification.createMany({ data: ids.map(userId => ({ userId, type: input.type, message: input.message, requestId: input.requestId, link: input.link })) });
    try {
      if (await rulesService.get<boolean>(input.companyId, 'notify.email_enabled')) {
        const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { email: true } });
        const body = `${input.message}${input.link ? `\n\nOuvrir : ${config.frontendUrl}${input.link}` : ''}`;
        for (const u of users) if (u.email && !u.email.endsWith('@agents.invalid')) await this.send(u.email, 'ECARTE — ' + input.message.slice(0, 80), body);
      }
    } catch (e) { logger.error('Notification email échouée', { error: (e as Error).message }); }
    return ids.length;
  }

  async list(userId: string, opts: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
    const page = Math.max(1, opts.page || 1), limit = Math.min(100, Math.max(1, opts.limit || 20));
    const where = { userId, ...(opts.unreadOnly ? { isRead: false } : {}) };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } })
    ]);
    return { items, total, unread, page, limit };
  }

  unreadCount(userId: string) { return prisma.notification.count({ where: { userId, isRead: false } }); }

  async markRead(userId: string, id: string) {
    const { count } = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    if (!count) throw new AppError('Notification introuvable', 404);
  }

  async markAllRead(userId: string) { return (await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })).count; }
}

export const notifyService = new NotifyService();
