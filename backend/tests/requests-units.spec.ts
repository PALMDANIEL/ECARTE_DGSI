import { numberToFrench, fullDate, longDate, shortDate, inclusiveDays, addressTitle, salutationFromTitle, leaveDurationPhrase, quantityText, locativeStructure, parseIsoDate } from '../src/shared/utils/fr-format';
import { renderTemplate } from '../src/modules/requests/templates/engine';
import { DEFAULT_TEMPLATES } from '../src/modules/requests/templates/defaults';
import { sampleContext } from '../src/modules/requests/document.service';
import { evaluateCondition, headLabelFor } from '../src/modules/requests/workflow.service';

describe('nombres en toutes lettres', () => {
  it.each([[0, 'zéro'], [1, 'un'], [16, 'seize'], [17, 'dix-sept'], [21, 'vingt et un'], [24, 'vingt-quatre'], [30, 'trente'], [71, 'soixante et onze'], [72, 'soixante-douze'], [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [91, 'quatre-vingt-onze'], [100, 'cent'], [101, 'cent un'], [200, 'deux cents'], [250, 'deux cent cinquante'], [1000, 'mille'], [2026, 'deux mille vingt-six']])('%i → %s', (n, expected) => {
    expect(numberToFrench(n)).toBe(expected);
  });
  it('refuse les valeurs hors limites', () => {
    expect(() => numberToFrench(-1)).toThrow();
    expect(() => numberToFrench(1.5)).toThrow();
  });
});

describe('dates et durées', () => {
  it('formate comme les formulaires officiels', () => {
    expect(shortDate('2026-06-05')).toBe('05/06/2026');
    expect(longDate('2026-07-14')).toBe('14 juillet 2026');
    expect(longDate('2026-08-01')).toBe('1er août 2026');
    expect(fullDate('2026-04-20')).toBe('lundi 20 avril 2026');
    expect(fullDate('2026-07-16')).toBe('jeudi 16 juillet 2026');
  });
  it('compte les jours calendaires bornes incluses (20 avril → 19 mai = 30 jours)', () => {
    expect(inclusiveDays('2026-04-20', '2026-05-19')).toBe(30);
    expect(inclusiveDays('2026-07-16', '2026-07-16')).toBe(1);
  });
  it('rejette les dates inexistantes', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow();
    expect(() => parseIsoDate('pas-une-date')).toThrow();
  });
  it('décrit la durée d\'un congé', () => {
    expect(leaveDurationPhrase(30)).toBe("d'un mois");
    expect(leaveDurationPhrase(60)).toBe('de deux mois');
    expect(leaveDurationPhrase(15)).toBe('de quinze (15) jours');
    expect(leaveDurationPhrase(1)).toBe('de un (1) jour');
  });
  it('écrit les quantités en lettres et chiffres', () => {
    expect(quantityText(24, 'heure')).toBe('vingt-quatre (24) heures');
    expect(quantityText(1, 'jour')).toBe('un (1) jour');
  });
});

describe('titres et formules d\'appel', () => {
  it('accorde l\'article et la civilité', () => {
    expect(addressTitle('M', "Ministre de l'Économie et des Finances")).toBe("Monsieur le Ministre de l'Économie et des Finances");
    expect(addressTitle('MME', 'Directrice des Ressources Humaines')).toBe('Madame la Directrice des Ressources Humaines');
    expect(addressTitle('M', "Inspecteur général")).toBe("Monsieur l'Inspecteur général");
  });
  it('déduit la formule d\'appel', () => {
    expect(salutationFromTitle("Monsieur le Ministre de l'Économie et des Finances")).toBe('Monsieur le Ministre');
    expect(salutationFromTitle("Monsieur le Directeur de l'Ingénierie logicielle et de l'Exploitation")).toBe('Monsieur le Directeur');
    expect(salutationFromTitle('Monsieur le Directeur Général des Systèmes d\'Information')).toBe('Monsieur le Directeur Général');
    expect(salutationFromTitle('Madame la Directrice des Ressources Humaines')).toBe('Madame la Directrice');
    expect(salutationFromTitle('Monsieur le Chef de Service Développement des Applications')).toBe('Monsieur le Chef de Service');
  });
  it('place l\'affectation avec la bonne préposition', () => {
    expect(locativeStructure("Direction Générale des Systèmes d'Information")).toBe("à la Direction Générale des Systèmes d'Information");
    expect(locativeStructure('Service Développement des Applications')).toBe('au Service Développement des Applications');
  });
  it('déduit l\'intitulé du responsable d\'une unité', () => {
    expect(headLabelFor("Direction Générale des Systèmes d'Information")).toBe("Directeur Général des Systèmes d'Information");
    expect(headLabelFor("Direction de l'Ingénierie logicielle")).toBe("Directeur de l'Ingénierie logicielle");
    expect(headLabelFor('Service Développement des Applications')).toBe('Chef de Service Développement des Applications');
    expect(headLabelFor('Secrétariat Général')).toBe('Secrétaire Général');
    expect(headLabelFor('Inspection technique')).toBe('Responsable de Inspection technique');
  });
});

describe('conditions d\'étape', () => {
  it('évalue les opérateurs', () => {
    const d = { durationDays: 12, type: 'A' };
    expect(evaluateCondition({ field: 'durationDays', op: 'gt', value: 10 }, d)).toBe(true);
    expect(evaluateCondition({ field: 'durationDays', op: 'lte', value: 10 }, d)).toBe(false);
    expect(evaluateCondition({ field: 'type', op: 'in', value: ['A', 'B'] }, d)).toBe(true);
    expect(evaluateCondition({ field: 'type', op: 'ne', value: 'A' }, d)).toBe(false);
    expect(evaluateCondition(null, d)).toBe(true);
    expect(evaluateCondition({ field: 'absent', op: 'gt', value: 1 }, d)).toBe(false);
  });
});

describe('modèles de documents (fidélité aux formulaires officiels)', () => {
  const render = (code: string) => renderTemplate(DEFAULT_TEMPLATES[code].html, sampleContext(code));

  it('demande de décision de congé : mentions, destinataire, avis, décision et e-timbre', () => {
    const html = render('DECISION_CONGE');
    for (const s of ['PALM ROMEO DARATAGNAN', 'Matricule : 386239D', 'BURKINA FASO', 'La Patrie ou la Mort, Nous Vaincrons', 'Ouagadougou, le 05/06/2026', "Monsieur le Ministre de l'Économie et des Finances", 's/c voie hiérarchique', 'Objet', 'Demande de décision de congé administratif', 'Monsieur le Ministre,', "l’obtention d’une décision de congé administratif au titre de l’année 2026", "dans les pays de l'Afrique", 'N°2025-14-01049/MEF/SG/DRH du 30/04/2025', 'plus haute considération', 'E-timbre N° : 1790 8872 0082', "Avis de Monsieur le Directeur de l'Ingénierie logicielle et de l'Exploitation", 'Avis de Madame la Directrice des Ressources Humaines', "Décision de Monsieur le Ministre de l'Économie et des Finances"]) {
      expect(html.replace(/&#x27;|&#39;/g, "'")).toContain(s);
    }
  });

  it('jouissance : période en toutes lettres, référence de la décision, circuit court', () => {
    const html = render('JOUISSANCE_CONGE').replace(/&#x27;|&#39;/g, "'");
    for (const s of ['Jouissance de congé administratif', "l’obtention d'un mois de congé administratif", 'au titre de l’année 2025', 'pour la période du lundi 20 avril 2026 au mardi 19 mai 2026 inclus', "au Burkina Faso et en Côte d'Ivoire", 'décision de congé N°2025-14-01049/MEF/SG/DRH du 30/04/2025', 'Monsieur le Chef de Service Développement des Applications']) expect(html).toContain(s);
    expect(html).not.toContain('E-timbre');
  });

  it('autorisation d\'absence : en-tête administratif complet et formule de politesse spécifique', () => {
    const html = render('AUTORISATION_ABSENCE').replace(/&#x27;|&#39;/g, "'");
    for (const s of ["MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES", 'SECRÉTARIAT GÉNÉRAL', "DIRECTION GÉNÉRALE DES SYSTÈMES D'INFORMATION", 'BURKINA-FASO', 'Ouagadougou, le 14 juillet 2026', 'Mle 386239D, Agent de DLE/SDA', 'demande d’autorisation d’absence de vingt-quatre (24) heures', 'pour la journée du jeudi 16 juillet 2026 pour des raisons de famille', 'l’expression de mon profond respect', '-OUAGADOUGOU-']) expect(html).toContain(s);
  });

  it('échappe le HTML des données saisies (pas d\'injection de balises)', () => {
    const ctx: any = sampleContext('DECISION_CONGE');
    ctx.fields.destinations = '<script>alert(1)</script>';
    const html = renderTemplate(DEFAULT_TEMPLATES.DECISION_CONGE.html, ctx);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('affiche l\'espace de signature pour une étape non traitée et la mention électronique pour une étape traitée', () => {
    const html = render('DECISION_CONGE');
    expect(html).toContain('class="space'); // étapes en attente : cadre vide à signer
    expect(html).toContain('Signé électroniquement par Paul OUEDRAOGO');
    expect(html).toContain('Empreinte : a1b2c3d4e5f60718');
  });
});
