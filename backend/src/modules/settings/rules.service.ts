import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { auditService } from '../audit/audit.service';

/** Paramètres connus (phase 1) avec leur valeur par défaut. D'autres clés seront ajoutées avec les droits de congé. */
export const RULE_DEFAULTS: Record<string, { value: number | string | boolean; description: string }> = {
  'card.validity_years': { value: 5, description: 'Durée de validité d\'une carte professionnelle (années)' },
  'access.pin_length': { value: 6, description: 'Longueur du PIN agent' },
  'access.pin_max_attempts': { value: 5, description: 'Échecs de PIN avant verrouillage' },
  'access.pin_lock_minutes': { value: 15, description: 'Durée de verrouillage après échecs de PIN (minutes)' },
  'leave.annual_days': { value: 30, description: 'Droit annuel au congé administratif (jours consécutifs) — loi 081-2015/CNT, art. 53' },
  'absence.hours_per_day': { value: 8, description: 'Heures par jour pour convertir une absence en heures en jours' },
  'access.session_minutes': { value: 20, description: 'Durée de la session agent après scan + PIN (minutes)' }
};

export class RulesService {
  async get<T = number | string | boolean>(companyId: string, key: string, at = new Date()): Promise<T> {
    const row = await prisma.ruleParameter.findFirst({
      where: { companyId, key, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
      orderBy: { validFrom: 'desc' }
    });
    if (row) return row.value as T;
    if (!(key in RULE_DEFAULTS)) throw new AppError(`Paramètre inconnu : ${key}`, 400);
    return RULE_DEFAULTS[key].value as T;
  }

  /** Valeurs en vigueur + historique, pour l'écran d'administration. */
  async list(companyId: string) {
    const now = new Date();
    const history = await prisma.ruleParameter.findMany({ where: { companyId }, orderBy: [{ key: 'asc' }, { validFrom: 'desc' }] });
    return Object.entries(RULE_DEFAULTS).map(([key, def]) => {
      const rows = history.filter(h => h.key === key);
      const current = rows.find(r => r.validFrom <= now && (!r.validTo || r.validTo > now));
      return { key, description: def.description, defaultValue: def.value, value: current ? current.value : def.value, isCustom: !!current, legalReference: current?.legalReference ?? null, history: rows };
    });
  }

  /**
   * Ne réécrit jamais l'historique : la valeur en vigueur est clôturée (validTo) et une nouvelle ligne est créée.
   * Les décisions déjà rendues restent attachées à la valeur qui s'appliquait à leur date.
   */
  async set(companyId: string, key: string, value: unknown, opts: { validFrom?: Date; legalReference?: string; comment?: string }, actor: { id: string; email?: string }, req?: any) {
    const def = RULE_DEFAULTS[key];
    if (!def) throw new AppError(`Paramètre inconnu : ${key}`, 400);
    if (typeof value !== typeof def.value) throw new AppError(`Type invalide pour ${key} (attendu : ${typeof def.value})`, 400);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw new AppError('La valeur doit être un nombre positif', 400);

    const validFrom = opts.validFrom || new Date();
    const before = await this.get(companyId, key);
    const created = await prisma.$transaction(async tx => {
      await tx.ruleParameter.updateMany({ where: { companyId, key, validTo: null, validFrom: { lte: validFrom } }, data: { validTo: validFrom } });
      return tx.ruleParameter.create({ data: { companyId, key, value: value as any, validFrom, legalReference: opts.legalReference, comment: opts.comment, createdById: actor.id } });
    });
    await auditService.log({ companyId, actor, action: 'RULE_CHANGED', entity: 'RuleParameter', entityId: created.id, before: { key, value: before }, after: { key, value, validFrom }, req });
    return created;
  }
}

export const rulesService = new RulesService();
