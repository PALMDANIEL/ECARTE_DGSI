import path from 'path';
import { deleteFile, getFile, putFile } from '../../infrastructure/storage';
import crypto from 'crypto';
import { prisma } from '../../database/client';
import { htmlPdfService } from '../../infrastructure/pdf/html-pdf.service';
import { AppError } from '../../shared/errors/app-error';
import { canonicalJson, sha256 } from '../../shared/utils/crypto';
import { civilityLabel, locativeStructure, longDate, salutationFromTitle, shortDate } from '../../shared/utils/fr-format';
import { renderTemplate } from './templates/engine';
import { documentFields } from './request-fields';
import { ensureDefaults } from './request-defaults';

const RESULT_LABEL: Record<string, string> = {
  FAVORABLE: 'Avis favorable', UNFAVORABLE: 'Avis défavorable', APPROVED: 'Approuvé', REJECTED: 'Rejeté', RETURNED: 'Retourné pour correction'
};

export const stepFingerprint = (reference: string, s: { order: number; round: number; result: string; comment: string | null; actorId: string | null; decidedAt: Date | null }) =>
  sha256(canonicalJson([reference, s.round, s.order, s.result, s.comment, s.actorId, s.decidedAt?.toISOString()])).slice(0, 16);

/** Fichiers privés (PDF, pièces) : disque local ou base selon STORAGE_DRIVER (voir infrastructure/storage). */
export const writePrivate = (rel: string, data: Buffer) => putFile('private', rel, data);
export const readPrivate = (rel: string) => getFile('private', rel);
export const removePrivate = (rel: string) => deleteFile('private', rel);

export class DocumentService {
  /** Contexte complet des modèles : identité, structure, destinataire, champs de la demande, état de chaque étape. */
  async buildContext(requestId: string, version: number) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: { type: true, company: true, issuedDecision: true, steps: { orderBy: [{ round: 'asc' }, { order: 'asc' }] }, leaveDecision: true, agent: { include: { agentProfile: true, heldCards: { where: { status: 'ACTIVE' }, select: { cardNumber: true } } } } }
    });
    if (!request) throw new AppError('Demande introuvable', 404);
    const snap: any = request.snapshot || {};
    const data = request.data as Record<string, any>;
    const date = request.submittedAt ?? request.createdAt;

    const chain: { type: string; name: string; code: string }[] = snap.orgChain || [];
    const unit = (t: string) => chain.find(c => c.type === t);
    const steps = request.steps.filter(s => s.round === request.round && s.result !== 'SKIPPED');
    const decisionStep = [...steps].reverse().find(s => s.kind === 'DECISION');

    // Destinataire = l'autorité de décision de ce circuit
    const recipientTitle = decisionStep?.titleSnapshot || 'Monsieur le Supérieur hiérarchique';
    const greeting = salutationFromTitle(recipientTitle);

    const fields: Record<string, any> = documentFields(request.type.code, data);
    let previousDecision: any = null;
    if (request.type.code === 'DECISION_CONGE' && data.previousDecisionNumber) {
      previousDecision = { number: data.previousDecisionNumber, date: data.previousDecisionDate ? shortDate(data.previousDecisionDate) : '' };
    }
    const decision = request.leaveDecision ? { number: request.leaveDecision.number, date: shortDate(request.leaveDecision.issuedAt) } : null;

    const unitCode = (t: string) => unit(t)?.code;
    const affectationCode = [unitCode('DIRECTION') || unitCode('DG'), unitCode('SERVICE')].filter(Boolean).join('/') || unitCode('UNITE') || '';
    const place = request.company.city || snap.place || 'Ouagadougou';
    const structureUnit = unit('DG') || unit('DIRECTION') || unit('SERVICE') || unit('SG');

    return {
      reference: request.reference, version, status: request.status, place, dateShort: shortDate(date), dateLong: longDate(date),
      company: { name: request.company.name, nameUpper: request.company.name.toUpperCase() },
      header: { left: [request.company.name, unit('SG')?.name, unit('DG')?.name].filter(Boolean).map(s => (s as string).toUpperCase()) },
      agent: {
        fullName: `${snap.agent?.lastName ?? request.agent.lastName} ${snap.agent?.firstName ?? request.agent.firstName}`.toUpperCase(),
        displayName: `${(snap.agent?.firstName ?? request.agent.firstName)} ${(snap.agent?.lastName ?? request.agent.lastName).toUpperCase()}`,
        civility: civilityLabel(snap.agent?.civility ?? request.agent.agentProfile?.civility),
        matricule: snap.agent?.matricule ?? request.agent.agentProfile?.matricule, grade: snap.agent?.grade ?? request.agent.agentProfile?.grade ?? '',
        structure: structureUnit ? locativeStructure(structureUnit.name) : '',
        affectationCode, cardNumber: snap.cardNumber ?? request.agent.heldCards[0]?.cardNumber ?? ''
      },
      recipient: { title: recipientTitle, greeting, city: (place as string).toUpperCase() },
      eStampNumber: data.eStampNumber ?? '',
      fields, previousDecision, decision,
      steps: steps.map(s => {
        const done = s.result !== 'PENDING';
        return {
          order: s.order, kind: s.kind, heading: s.label, isDecision: s.kind === 'DECISION', done,
          result: s.result, resultLabel: RESULT_LABEL[s.result] || '', resultClass: s.result.toLowerCase(),
          comment: s.comment, actorName: s.actorName, actorTitle: s.actorTitle, decidedAt: s.decidedAt ? shortDate(s.decidedAt) : '',
          decisionNumber: s.kind === 'DECISION' && s.result === 'APPROVED' ? request.issuedDecision?.number ?? null : null,
          hash: done ? stepFingerprint(request.reference, { order: s.order, round: s.round, result: s.result, comment: s.comment, actorId: s.actorId, decidedAt: s.decidedAt }) : ''
        };
      })
    };
  }

  async activeTemplate(companyId: string, typeCode: string) {
    await ensureDefaults(companyId);
    const tpl = await prisma.formTemplate.findFirst({ where: { companyId, typeCode, isActive: true }, orderBy: { version: 'desc' } });
    if (!tpl) throw new AppError(`Aucun modèle de document pour ${typeCode}`, 500);
    return tpl;
  }

  /** HTML complet d'un document (testable sans navigateur). */
  async renderHtml(requestId: string, version: number): Promise<string> {
    const request = await prisma.request.findUnique({ where: { id: requestId }, select: { companyId: true, type: { select: { code: true } } } });
    if (!request) throw new AppError('Demande introuvable', 404);
    const tpl = await this.activeTemplate(request.companyId, request.type.code);
    const ctx = await this.buildContext(requestId, version);
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${tpl.css}</style></head><body>${renderTemplate(tpl.html, ctx)}</body></html>`;
  }

  /** Génère une nouvelle version du PDF (les versions précédentes sont conservées) et enregistre son empreinte. */
  async generate(requestId: string, reason: string, createdById?: string) {
    const request = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, reference: true } });
    if (!request) throw new AppError('Demande introuvable', 404);
    const last = await prisma.requestDocument.findFirst({ where: { requestId }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    const html = await this.renderHtml(requestId, version);
    const pdf = await htmlPdfService.render(html, `Référence ${request.reference} — version ${version}`);
    const rel = path.join('requests', requestId, `v${version}-${crypto.randomBytes(4).toString('hex')}.pdf`);
    await writePrivate(rel, pdf);
    return prisma.requestDocument.create({ data: { requestId, version, path: rel, sha256: sha256(pdf.toString('binary')), size: pdf.length, reason, createdById } });
  }

  async read(requestId: string, version?: number) {
    const doc = await prisma.requestDocument.findFirst({ where: { requestId, ...(version ? { version } : {}) }, orderBy: { version: 'desc' } });
    if (!doc) throw new AppError('Document introuvable', 404);
    return { doc, buffer: await readPrivate(doc.path) };
  }
}

export const documentService = new DocumentService();

/** Données d'exemple (tirées des formulaires officiels) pour l'aperçu d'un modèle dans l'administration. */
export function sampleContext(typeCode: string) {
  const base = {
    reference: 'XX-2026-000001', version: 1, status: 'IN_PROGRESS', place: 'Ouagadougou', dateShort: '05/06/2026', dateLong: '5 juin 2026',
    company: { name: "Ministère de l'Économie et des Finances", nameUpper: "MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES" },
    header: { left: ["MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES", 'SECRÉTARIAT GÉNÉRAL', "DIRECTION GÉNÉRALE DES SYSTÈMES D'INFORMATION"] },
    agent: { fullName: 'PALM ROMEO DARATAGNAN', displayName: 'Romeo Daratagnan PALM', civility: 'Monsieur', matricule: '386239D', grade: 'Ingénieur de Travaux en Informatique', structure: "à la Direction Générale des Systèmes d'Information", affectationCode: 'DLE/SDA', cardNumber: 'CP-2026-000001' },
    recipient: { title: "Monsieur le Ministre de l'Économie et des Finances", greeting: 'Monsieur le Ministre', city: 'OUAGADOUGOU' },
    eStampNumber: '1790 8872 0082', previousDecision: { number: '2025-14-01049/MEF/SG/DRH', date: '30/04/2025' },
    decision: { number: '2025-14-01049/MEF/SG/DRH', date: '30/04/2025' },
    steps: [
      { order: 1, kind: 'AVIS', heading: "Avis de Monsieur le Directeur de l'Ingénierie logicielle et de l'Exploitation", isDecision: false, done: true, result: 'FAVORABLE', resultLabel: 'Avis favorable', resultClass: 'favorable', comment: null, actorName: 'Paul OUEDRAOGO', actorTitle: "Directeur de l'Ingénierie logicielle", decidedAt: '06/06/2026', hash: 'a1b2c3d4e5f60718' },
      { order: 2, kind: 'AVIS', heading: 'Avis de Madame la Directrice des Ressources Humaines', isDecision: false, done: false },
      { order: 3, kind: 'DECISION', heading: "Décision de Monsieur le Ministre de l'Économie et des Finances", isDecision: true, done: false }
    ]
  };
  if (typeCode === 'JOUISSANCE_CONGE') return { ...base, recipient: { title: 'Monsieur le Chef de Service Développement des Applications', greeting: 'Monsieur le Chef de Service', city: 'OUAGADOUGOU' }, fields: { year: 2025, destination: "au Burkina Faso et en Côte d'Ivoire", durationPhrase: "d'un mois", startFull: 'lundi 20 avril 2026', endFull: 'mardi 19 mai 2026' } };
  if (typeCode === 'AUTORISATION_ABSENCE') return { ...base, recipient: { title: 'Monsieur le Chef de Service SDA', greeting: 'Monsieur le Chef de Service SDA', city: 'OUAGADOUGOU' }, dateLong: '14 juillet 2026', fields: { quantityText: 'vingt-quatre (24) heures', periodText: 'pour la journée du jeudi 16 juillet 2026', motif: 'des raisons de famille' } };
  return { ...base, fields: { year: 2026, destinations: "dans les pays de l'Afrique, aux USA et dans les pays membres de l'union Européenne" } };
}
