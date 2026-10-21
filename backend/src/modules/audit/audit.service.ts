import { Request } from 'express';
import { prisma } from '../../database/client';
import { canonicalJson, sha256 } from '../../shared/utils/crypto';

export interface AuditEntry {
  companyId?: string | null;
  actor?: { id?: string; email?: string } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Pick<Request, 'ip' | 'headers'>;
}

const ADVISORY_LOCK_KEY = 727001;

const entryHash = (prevHash: string | null, e: { companyId: string | null; actorId: string | null; action: string; entity: string; entityId: string | null; before: unknown; after: unknown; createdAt: Date }) =>
  sha256(canonicalJson([prevHash, e.companyId, e.actorId, e.action, e.entity, e.entityId, e.before ?? null, e.after ?? null, e.createdAt.toISOString()]));

/**
 * Journal d'audit à chaîne d'empreintes : chaque ligne contient le hash de la précédente.
 * Toute modification ou suppression a posteriori rompt la chaîne et est détectée par verify().
 */
export class AuditService {
  async log(entry: AuditEntry) {
    return prisma.$transaction(async tx => {
      // Verrou transactionnel : sérialise les écritures pour garantir une chaîne sans fourche.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;
      const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
      const createdAt = new Date();
      const data = {
        companyId: entry.companyId ?? null,
        actorId: entry.actor?.id ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before === undefined ? null : JSON.parse(JSON.stringify(entry.before)),
        after: entry.after === undefined ? null : JSON.parse(JSON.stringify(entry.after)),
        createdAt
      };
      const prevHash = last?.hash ?? null;
      return tx.auditLog.create({
        data: {
          ...data,
          before: data.before ?? undefined,
          after: data.after ?? undefined,
          actorEmail: entry.actor?.email ?? null,
          ip: entry.req?.ip ?? null,
          userAgent: (entry.req?.headers?.['user-agent'] as string) ?? null,
          prevHash,
          hash: entryHash(prevHash, data)
        }
      });
    });
  }

  async list(companyId: string, filters: { entity?: string; entityId?: string; action?: string; actorId?: string; from?: Date; to?: Date; page?: number; limit?: number }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const where: any = { companyId };
    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.from || filters.to) where.createdAt = { ...(filters.from && { gte: filters.from }), ...(filters.to && { lte: filters.to }) };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.auditLog.count({ where })
    ]);
    return { items, total, page, limit };
  }

  /** Vérifie l'intégrité de toute la chaîne (toutes sociétés : la chaîne est globale). */
  async verify(): Promise<{ ok: boolean; checked: number; brokenAtSeq?: number }> {
    const batch = 500;
    let prev: string | null = null;
    let checked = 0;
    let cursor = 0;
    for (;;) {
      const rows = await prisma.auditLog.findMany({ where: { seq: { gt: cursor } }, orderBy: { seq: 'asc' }, take: batch });
      if (!rows.length) break;
      for (const r of rows) {
        const expected = entryHash(prev, { companyId: r.companyId, actorId: r.actorId, action: r.action, entity: r.entity, entityId: r.entityId, before: r.before, after: r.after, createdAt: r.createdAt });
        if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked, brokenAtSeq: r.seq };
        prev = r.hash;
        checked++;
        cursor = r.seq;
      }
    }
    return { ok: true, checked };
  }
}

export const auditService = new AuditService();
