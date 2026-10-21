import { prisma } from '../../database/client';
import { DEFAULT_TEMPLATES } from './templates/defaults';

export const REQUEST_TYPES = {
  DECISION_CONGE: 'DECISION_CONGE',
  JOUISSANCE_CONGE: 'JOUISSANCE_CONGE',
  AUTORISATION_ABSENCE: 'AUTORISATION_ABSENCE'
} as const;
export type RequestTypeCode = keyof typeof REQUEST_TYPES;

const TYPE_DEFAULTS: Record<RequestTypeCode, { name: string; prefix: string; requiresPriorDecision: boolean; attachmentRules: { code: string; label: string; required: boolean }[] }> = {
  DECISION_CONGE: { name: 'Demande de décision de congé administratif', prefix: 'DC', requiresPriorDecision: false, attachmentRules: [{ code: 'DERNIERE_DECISION', label: 'Copie de la dernière décision de congé', required: false }, { code: 'ETIMBRE', label: 'Reçu du timbre électronique', required: false }] },
  JOUISSANCE_CONGE: { name: 'Demande de jouissance de congé administratif', prefix: 'JC', requiresPriorDecision: true, attachmentRules: [] },
  AUTORISATION_ABSENCE: { name: "Demande d'autorisation d'absence", prefix: 'AA', requiresPriorDecision: false, attachmentRules: [{ code: 'JUSTIFICATIF', label: 'Pièce justificative', required: false }] }
};

// Types d'autorisation d'absence (loi 081-2015/CNT) ; plafonds et références modifiables dans l'administration.
const ABSENCE_DEFAULTS = [
  { code: 'EVENEMENT_FAMILIAL', name: 'Événement familial', unit: 'BOTH', annualCap: 10, deductsFromLeave: false, legalReference: 'Loi 081-2015/CNT, art. 58-59 : 10 jours maximum par an, non déduits du congé annuel' },
  { code: 'ACTIVITE_SYNDICALE', name: 'Activité syndicale', unit: 'BOTH', annualCap: null, deductsFromLeave: false, legalReference: 'Loi 081-2015/CNT, art. 57 : accordée par le ministre, hors plafond' },
  { code: 'MISSION_INTERET_NATIONAL', name: "Action ou mission d'intérêt national / public", unit: 'BOTH', annualCap: null, deductsFromLeave: false, legalReference: 'Loi 081-2015/CNT, art. 57 : accordée par le ministre, hors plafond' },
  { code: 'AUTRE', name: 'Autre motif', unit: 'BOTH', annualCap: null, deductsFromLeave: false, legalReference: null as string | null }
];

/** Crée, sans jamais écraser, les types de demande, types d'absence et modèles de documents d'une société. */
export async function ensureDefaults(companyId: string) {
  for (const [code, d] of Object.entries(TYPE_DEFAULTS)) {
    await prisma.requestType.upsert({
      where: { companyId_code: { companyId, code } },
      update: {},
      create: { companyId, code, name: d.name, prefix: d.prefix, requiresPriorDecision: d.requiresPriorDecision, attachmentRules: d.attachmentRules }
    });
  }
  for (const a of ABSENCE_DEFAULTS) {
    await prisma.absenceType.upsert({ where: { companyId_code: { companyId, code: a.code } }, update: {}, create: { companyId, ...a } });
  }
  for (const [typeCode, t] of Object.entries(DEFAULT_TEMPLATES)) {
    const exists = await prisma.formTemplate.findFirst({ where: { companyId, typeCode } });
    if (!exists) await prisma.formTemplate.create({ data: { companyId, typeCode, version: 1, html: t.html, css: t.css } });
  }
}
