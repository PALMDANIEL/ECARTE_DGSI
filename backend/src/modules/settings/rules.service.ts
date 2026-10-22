import { prisma } from '../../database/client';
import { AppError } from '../../shared/errors/app-error';
import { auditService } from '../audit/audit.service';

type RuleType = 'number' | 'boolean' | 'string' | 'enum';

export interface RuleDef {
  value: number | string | boolean;
  description: string;
  group: string;
  type: RuleType;
  options?: { value: string; label: string }[];
  pattern?: RegExp;
  min?: number;
  /** Référence réglementaire quand elle a été vérifiée dans un texte officiel. */
  legal?: string;
}

/** Régimes pouvant surcharger un paramètre : `leave.annual_days@CONTRACTUEL`. */
export const REGIMES = ['FONCTIONNAIRE', 'CONTRACTUEL', 'ENSEIGNANT'];

/**
 * Paramètres de l'application. Les valeurs par défaut du régime des fonctionnaires reprennent la loi 081-2015/CNT lorsqu'un
 * article la fonde (champ `legal`) ; les autres sont des choix d'organisation, modifiables sans toucher au code.
 */
export const RULE_DEFAULTS: Record<string, RuleDef> = {
  // --- Cartes et accès ---
  'card.validity_years': { group: 'Cartes et accès', type: 'number', min: 1, value: 5, description: 'Durée de validité d\'une carte professionnelle (années)' },
  'access.pin_length': { group: 'Cartes et accès', type: 'number', min: 4, value: 6, description: 'Longueur du PIN agent' },
  'access.pin_max_attempts': { group: 'Cartes et accès', type: 'number', min: 1, value: 5, description: 'Échecs de PIN avant verrouillage' },
  'access.pin_lock_minutes': { group: 'Cartes et accès', type: 'number', min: 1, value: 15, description: 'Durée de verrouillage après échecs de PIN (minutes)' },
  'access.session_minutes': { group: 'Cartes et accès', type: 'number', min: 1, value: 20, description: 'Durée de la session agent après scan + PIN (minutes)' },

  // --- Congé annuel ---
  'leave.annual_days': { group: 'Congé annuel', type: 'number', min: 0, value: 30, description: 'Droit annuel au congé administratif (jours consécutifs)', legal: 'Loi 081-2015/CNT, art. 53' },
  'leave.eligibility_months': { group: 'Congé annuel', type: 'number', min: 0, value: 11, description: 'Mois de services accomplis ouvrant droit au congé', legal: 'Loi 081-2015/CNT, art. 53' },
  'leave.eligibility_basis': { group: 'Congé annuel', type: 'enum', value: 'PERIOD_END', description: 'Moment où l\'éligibilité est appréciée pour une année de référence',
    options: [{ value: 'PERIOD_END', label: 'Fin de la période de référence (les 11 mois sont accomplis dans l\'année)' }, { value: 'AT_REQUEST', label: 'Date de la demande (11 mois déjà accomplis)' }] },
  'leave.reference_period_start': { group: 'Congé annuel', type: 'string', pattern: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, value: '01-01', description: 'Début de la période de référence (MM-JJ) — 01-01 = année civile' },
  'leave.proration_enabled': { group: 'Congé annuel', type: 'boolean', value: false, description: 'Proratiser le droit selon les mois de service dans la période (non prévu par l\'art. 53 : désactivé par défaut)' },
  'leave.proration_rounding': { group: 'Congé annuel', type: 'enum', value: 'FLOOR', description: 'Arrondi du prorata', options: [{ value: 'FLOOR', label: 'Inférieur' }, { value: 'ROUND', label: 'Au plus proche' }, { value: 'CEIL', label: 'Supérieur' }] },
  'leave.carry_over_max_days': { group: 'Congé annuel', type: 'number', min: 0, value: 0, description: 'Jours non pris reportables sur l\'année suivante (0 = aucun report ; à confirmer avec le décret d\'application de l\'art. 56)' },
  'leave.max_fractions': { group: 'Congé annuel', type: 'number', min: 1, value: 2, description: 'Nombre maximal de tranches d\'un congé', legal: 'Loi 081-2015/CNT, art. 56' },
  'leave.fraction_max_days': { group: 'Congé annuel', type: 'number', min: 1, value: 15, description: 'Durée maximale d\'une tranche lorsque le congé est fractionné', legal: 'Loi 081-2015/CNT, art. 56' },
  'leave.count_mode': { group: 'Congé annuel', type: 'enum', value: 'CALENDAR', description: 'Décompte des jours de congé', options: [{ value: 'CALENDAR', label: 'Jours calendaires consécutifs' }, { value: 'WORKING', label: 'Jours ouvrés (hors week-ends)' }] },
  'leave.exclude_holidays': { group: 'Congé annuel', type: 'boolean', value: false, description: 'Ne pas décompter les jours fériés du congé' },
  'leave.require_service_date': { group: 'Congé annuel', type: 'boolean', value: true, description: 'Exiger la date d\'entrée en service pour calculer les droits' },

  // --- Autorisations d'absence ---
  'absence.count_mode': { group: 'Autorisations d\'absence', type: 'enum', value: 'CALENDAR', description: 'Décompte des jours d\'absence', options: [{ value: 'CALENDAR', label: 'Jours calendaires' }, { value: 'WORKING', label: 'Jours ouvrés (hors week-ends)' }] },
  'absence.exclude_holidays': { group: 'Autorisations d\'absence', type: 'boolean', value: false, description: 'Ne pas décompter les jours fériés des absences' },
  'absence.hours_per_day': { group: 'Autorisations d\'absence', type: 'number', min: 1, value: 24, description: 'Heures équivalant à un jour (le formulaire officiel emploie « 24 heures » pour une journée ; mettre 8 pour une journée de travail)' },
  'absence.enforce_cap': { group: 'Autorisations d\'absence', type: 'boolean', value: true, description: 'Refuser les demandes qui dépassent le plafond annuel du type d\'absence' },

  // --- Notifications et délais ---
  'notify.email_enabled': { group: 'Notifications et délais', type: 'boolean', value: false, description: 'Envoyer aussi les notifications par email (aux agents ayant un email réel ; nécessite la configuration SMTP du serveur)' },
  'escalation.reminder_enabled': { group: 'Notifications et délais', type: 'boolean', value: true, description: 'Envoyer un rappel au responsable quand l\'échéance d\'une étape est dépassée' },
  'escalation.escalate_after_days': { group: 'Notifications et délais', type: 'number', min: 0, value: 1, description: 'Jours de retard avant l\'escalade vers le poste d\'escalade de l\'étape' },
  'escalation.substitute_can_act': { group: 'Notifications et délais', type: 'boolean', value: true, description: 'Le poste d\'escalade peut traiter l\'étape en retard à la place du responsable' },

  // --- Calendrier ---
  'calendar.weekend_days': { group: 'Calendrier', type: 'string', pattern: /^[0-6](,[0-6])*$/, value: '0,6', description: 'Jours de week-end (0 = dimanche … 6 = samedi), séparés par des virgules' }
};

export const isKnownKey = (key: string) => key.split('@')[0] in RULE_DEFAULTS;

function checkValue(def: RuleDef, value: unknown) {
  if (def.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new AppError('La valeur doit être un nombre', 400);
    if (value < (def.min ?? 0)) throw new AppError(`La valeur doit être supérieure ou égale à ${def.min ?? 0}`, 400);
  } else if (def.type === 'boolean') {
    if (typeof value !== 'boolean') throw new AppError('La valeur doit être vrai ou faux', 400);
  } else if (def.type === 'enum') {
    if (typeof value !== 'string' || !def.options!.some(o => o.value === value)) throw new AppError(`Valeur invalide (${def.options!.map(o => o.value).join(', ')})`, 400);
  } else {
    if (typeof value !== 'string' || !value.trim()) throw new AppError('La valeur doit être un texte non vide', 400);
    if (def.pattern && !def.pattern.test(value)) throw new AppError('Format invalide', 400);
  }
}

export class RulesService {
  /** Valeur en vigueur à une date ; avec `regime`, une surcharge `key@REGIME` prime sur la valeur de base. */
  async get<T = number | string | boolean>(companyId: string, key: string, at = new Date(), regime?: string | null): Promise<T> {
    const candidates = regime && regime !== 'FONCTIONNAIRE' ? [`${key}@${regime}`, key] : [key];
    for (const k of candidates) {
      const row = await prisma.ruleParameter.findFirst({
        where: { companyId, key: k, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
        orderBy: { validFrom: 'desc' }
      });
      if (row) return row.value as T;
    }
    if (!(key in RULE_DEFAULTS)) throw new AppError(`Paramètre inconnu : ${key}`, 400);
    return RULE_DEFAULTS[key].value as T;
  }

  /** Charge d'un coup plusieurs paramètres (une seule requête) pour un régime donné. */
  async getMany(companyId: string, keys: string[], at = new Date(), regime?: string | null): Promise<Record<string, any>> {
    const rows = await prisma.ruleParameter.findMany({
      where: { companyId, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
      orderBy: { validFrom: 'desc' }
    });
    const out: Record<string, any> = {};
    for (const key of keys) {
      const override = regime && regime !== 'FONCTIONNAIRE' ? rows.find(r => r.key === `${key}@${regime}`) : undefined;
      const base = rows.find(r => r.key === key);
      out[key] = (override ?? base)?.value ?? RULE_DEFAULTS[key]?.value;
    }
    return out;
  }

  /** Valeurs en vigueur + historique, pour l'écran d'administration (avec les surcharges par régime). */
  async list(companyId: string) {
    const now = new Date();
    const history = await prisma.ruleParameter.findMany({ where: { companyId }, orderBy: [{ key: 'asc' }, { validFrom: 'desc' }] });
    const current = (rows: typeof history) => rows.find(r => r.validFrom <= now && (!r.validTo || r.validTo > now));
    const base = Object.entries(RULE_DEFAULTS).map(([key, def]) => {
      const rows = history.filter(h => h.key === key);
      const cur = current(rows);
      return {
        key, group: def.group, type: def.type, options: def.options ?? null, min: def.min ?? null, description: def.description,
        defaultValue: def.value, value: cur ? cur.value : def.value, isCustom: !!cur, legalReference: cur?.legalReference ?? def.legal ?? null, history: rows
      };
    });
    const overrides = [...new Set(history.filter(h => h.key.includes('@')).map(h => h.key))].map(key => {
      const rows = history.filter(h => h.key === key);
      const cur = current(rows);
      const [baseKey, regime] = key.split('@');
      return { key, baseKey, regime, description: RULE_DEFAULTS[baseKey]?.description ?? baseKey, value: cur ? cur.value : null, history: rows };
    });
    return { rules: base, overrides, regimes: REGIMES };
  }

  /**
   * Ne réécrit jamais l'historique : la valeur en vigueur est clôturée (validTo) et une nouvelle ligne est créée.
   * Les décisions déjà rendues restent attachées à la valeur qui s'appliquait à leur date (instantané des règles).
   */
  async set(companyId: string, key: string, value: unknown, opts: { validFrom?: Date; legalReference?: string; comment?: string }, actor: { id: string; email?: string }, req?: any) {
    if (!isKnownKey(key)) throw new AppError(`Paramètre inconnu : ${key}`, 400);
    const [baseKey, regime] = key.split('@');
    if (regime && !REGIMES.includes(regime)) throw new AppError(`Régime inconnu : ${regime}`, 400);
    const def = RULE_DEFAULTS[baseKey];
    if (typeof value !== typeof def.value && !(def.type === 'enum' && typeof value === 'string')) throw new AppError(`Type invalide pour ${key} (attendu : ${typeof def.value})`, 400);
    checkValue(def, value);

    const validFrom = opts.validFrom || new Date();
    const before = regime ? (await prisma.ruleParameter.findFirst({ where: { companyId, key, validTo: null }, orderBy: { validFrom: 'desc' } }))?.value ?? null : await this.get(companyId, key);
    const created = await prisma.$transaction(async tx => {
      await tx.ruleParameter.updateMany({ where: { companyId, key, validTo: null, validFrom: { lte: validFrom } }, data: { validTo: validFrom } });
      return tx.ruleParameter.create({ data: { companyId, key, value: value as any, validFrom, legalReference: opts.legalReference ?? def.legal, comment: opts.comment, createdById: actor.id } });
    });
    await auditService.log({ companyId, actor, action: 'RULE_CHANGED', entity: 'RuleParameter', entityId: created.id, before: { key, value: before }, after: { key, value, validFrom }, req });
    return created;
  }

  /** Supprime une surcharge de régime en la clôturant (retour à la valeur de base) ; l'historique est conservé. */
  async clearOverride(companyId: string, key: string, actor: { id: string; email?: string }, req?: any) {
    if (!key.includes('@')) throw new AppError('Seules les surcharges par régime peuvent être retirées', 400);
    const { count } = await prisma.ruleParameter.updateMany({ where: { companyId, key, validTo: null }, data: { validTo: new Date() } });
    if (!count) throw new AppError('Aucune surcharge en vigueur', 404);
    await auditService.log({ companyId, actor, action: 'RULE_OVERRIDE_CLEARED', entity: 'RuleParameter', after: { key }, req });
  }
}

export const rulesService = new RulesService();
