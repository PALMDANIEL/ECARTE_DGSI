/**
 * Jeu de démonstration, créé uniquement par l'API HTTP (comme un vrai utilisateur) sur un serveur démarré.
 *
 *   DATABASE_URL=…/ecarte_demo npx ts-node scripts/demo-seed.ts [http://localhost:3004/api]
 *
 * À lancer sur une base VIDE dédiée à la démonstration, jamais sur la base de production.
 * Les identifiants générés sont écrits dans backend/demo-credentials.local.txt (ignoré par git), jamais affichés.
 */
import 'dotenv/config';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../src/database/client';

const API = process.argv[2] || 'http://localhost:3004/api';
const pwd = () => crypto.randomBytes(9).toString('base64url') + '#9a';
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function call(method: string, p: string, token?: string, body?: unknown) {
  const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 300)}`);
  return data;
}

const ORG = `code;nom;type;code_parent
SG;Secrétariat Général;SG;
DGSI;Direction Générale des Systèmes d'Information;DG;SG
DLE;Direction de l'Ingénierie logicielle et de l'Exploitation;DIRECTION;DGSI
SDA;Service Développement des Applications;SERVICE;DLE
SIR;Service Infrastructures et Réseaux;SERVICE;DLE
DRH;Direction des Ressources Humaines;DIRECTION;SG`;

const AGENTS = `matricule;nom;prenom;email;telephone;civilite;grade;corps;date_integration;date_entree_service;code_unite;matricule_superieur;regime
D001;KABORE;Marie;ministre@demo.bf;;Mme;Ministre;;2010-01-01;2010-01-01;SG;;FONCTIONNAIRE
D002;SANOU;Samuel;sg@demo.bf;;M;Administrateur civil;;2010-01-01;2010-01-01;SG;D001;FONCTIONNAIRE
D003;OUATTARA;Diane;drh@demo.bf;;Mme;Administrateur civil;;2011-01-01;2011-01-01;DRH;D002;FONCTIONNAIRE
D004;ZONGO;Rachid;rh@demo.bf;;M;Attaché d'administration;;2012-01-01;2012-01-01;DRH;D003;FONCTIONNAIRE
D005;COMPAORE;Denis;dg@demo.bf;;M;Ingénieur;;2012-01-01;2012-01-01;DGSI;D002;FONCTIONNAIRE
D006;YAMEOGO;Didier;dir@demo.bf;;M;Ingénieur;;2013-01-01;2013-01-01;DLE;D005;FONCTIONNAIRE
D007;SAWADOGO;Serge;svc@demo.bf;;M;Ingénieur;;2014-01-01;2014-01-01;SDA;D006;FONCTIONNAIRE
D008;TRAORE;Awa;;;Mme;Ingénieur des travaux informatiques;Informaticiens;01/03/2016;01/03/2016;SDA;D007;FONCTIONNAIRE
D009;OUEDRAOGO;Issa;;;M;Technicien supérieur;Informaticiens;2019-06-01;2019-06-01;SIR;D006;FONCTIONNAIRE
D010;ILBOUDO;Fatimata;;;Mme;Ingénieur;Informaticiens;2025-09-01;2025-09-01;SDA;D007;FONCTIONNAIRE`;

const HOLDERS: Record<string, string> = { MINISTRE: 'D001', SECRETAIRE_GENERAL: 'D002', DRH: 'D003', CHEF_SERVICE_RH: 'D004', CHEF_DGSI: 'D005', CHEF_DLE: 'D006', CHEF_SDA: 'D007' };

async function main() {
  if ((await prisma.company.count()) > 0) throw new Error('La base n\'est pas vide : ce script ne s\'exécute que sur une base de démonstration vierge.');
  const lines: string[] = ['Identifiants de démonstration (base ecarte_demo uniquement)', ''];

  const adminPwd = pwd();
  await call('POST', '/auth/register', undefined, { firstName: 'Admin', lastName: 'Démo', email: 'admin@demo.bf', password: adminPwd, companyName: 'Ministère de la Transition Digitale (démo)' });
  const admin = (await call('POST', '/auth/login', undefined, { email: 'admin@demo.bf', password: adminPwd })).accessToken;
  lines.push(`Administrateur : admin@demo.bf / ${adminPwd}`);

  await call('POST', '/org-units/import', admin, { csv: ORG, dryRun: false });
  await call('POST', '/agents/import', admin, { csv: AGENTS, dryRun: false });
  const byMat: Record<string, string> = Object.fromEntries((await call('GET', '/agents?limit=100', admin)).items.map((a: any) => [a.profile.matricule, a.id]));
  await call('POST', '/workflows/bootstrap', admin);
  const positions: any[] = await call('GET', '/positions', admin);
  for (const [code, mat] of Object.entries(HOLDERS)) await call('POST', `/positions/${positions.find(p => p.code === code).id}/holders`, admin, { userId: byMat[mat] });

  // Poste d'escalade : le Secrétaire général pour les avis de la décision de congé
  const wf = (await call('GET', '/workflows/DECISION_CONGE', admin))[0];
  const sg = positions.find(p => p.code === 'SECRETAIRE_GENERAL').id;
  await call('POST', '/workflows/DECISION_CONGE', admin, { steps: wf.steps.map((s: any) => ({ kind: s.kind, resolution: s.resolution, positionId: s.positionId, unitType: s.unitType, level: s.level, deadlineDays: s.deadlineDays, isMandatory: s.isMandatory, allowReturn: s.allowReturn, rejectOnUnfavorable: s.rejectOnUnfavorable, escalatePositionId: s.kind === 'DECISION' ? null : sg })) });

  const tokens: Record<string, string> = {};
  lines.push('', 'Responsables :');
  for (const mat of Object.values(HOLDERS)) {
    const email = AGENTS.split('\n').find(l => l.startsWith(mat + ';'))!.split(';')[3];
    const p = pwd();
    await call('POST', `/agents/${byMat[mat]}/credentials`, admin, { email, password: p });
    tokens[mat] = (await call('POST', '/auth/login', undefined, { email, password: p })).accessToken;
    lines.push(`  ${mat} ${email} / ${p}`);
  }

  // Cartes et PIN des agents D008 (demandes en cours) et D009
  lines.push('', 'Agents (portail : ouvrir le lien puis saisir le PIN) :');
  const sessions: Record<string, string> = {};
  for (const mat of ['D008', 'D009']) {
    const card = await call('POST', '/cards', admin, { fullName: mat === 'D008' ? 'Awa TRAORE' : 'Issa OUEDRAOGO', agentId: byMat[mat] });
    await call('POST', `/cards/${card.id}/issue`, admin);
    const pin = (await call('POST', `/agents/${byMat[mat]}/pin/reset`, admin)).pin;
    const { cardLifecycleService } = await import('../src/modules/card-lifecycle/card-lifecycle.service');
    const company = await prisma.company.findFirstOrThrow();
    const url = (await cardLifecycleService.accessUrl(company.id, card.id))!;
    sessions[mat] = (await call('POST', `/access/${url.split('/q/')[1]}/pin`, undefined, { pin })).sessionToken;
    lines.push(`  ${mat} lien ${url}  PIN ${pin}`);
  }

  const act = async (mat: string, id: string, body: any) => {
    const item = (await call('GET', '/requests/inbox', tokens[mat])).find((r: any) => r.id === id);
    return call('POST', `/requests/${id}/steps/${item.activeStep.id}/act`, tokens[mat], body);
  };
  const year = new Date().getUTCFullYear();
  const submit = async (agent: string, typeCode: string, fields: any) => {
    const r = await call('POST', '/access/requests', sessions[agent], { typeCode, fields });
    return call('POST', `/access/requests/${r.id}/submit`, sessions[agent]);
  };

  // D008 : décision approuvée, jouissance approuvée, absence en cours
  const dc = await submit('D008', 'DECISION_CONGE', { year, destinations: 'au Burkina Faso et dans les pays de la CEDEAO', eStampNumber: '1790 8872 0082' });
  for (const m of ['D006', 'D005', 'D003', 'D002']) await act(m, dc.id, { action: 'FAVORABLE', comment: 'Avis favorable' });
  await act('D001', dc.id, { action: 'APPROVE', decisionNumber: `${year}-0042/MTD/SG/DRH` });
  const decision = (await call('GET', '/access/decisions', sessions.D008))[0];
  const jc = await submit('D008', 'JOUISSANCE_CONGE', { leaveDecisionId: decision.id, startDate: day(20), endDate: day(34), destination: 'au Burkina Faso' });
  await act('D004', jc.id, { action: 'FAVORABLE' });
  await act('D007', jc.id, { action: 'APPROVE' });
  const types: any[] = await call('GET', '/access/absence-types', sessions.D008);
  await submit('D008', 'AUTORISATION_ABSENCE', { absenceTypeId: types.find(t => t.code === 'EVENEMENT_FAMILIAL').id, startDate: day(5), endDate: day(7), motif: 'mariage de ma sœur' });

  // D009 : décision en retard à l'étape du directeur (pour montrer rappels et escalade)
  const late = await submit('D009', 'DECISION_CONGE', { year, destinations: 'au Burkina Faso', eStampNumber: '12345678' });
  const step = await prisma.requestStep.findFirstOrThrow({ where: { requestId: late.id, result: 'PENDING' }, orderBy: { order: 'asc' } });
  await prisma.requestStep.update({ where: { id: step.id }, data: { activatedAt: new Date(Date.now() - 9 * 86400000), dueAt: new Date(Date.now() - 4 * 86400000) } });
  await call('POST', '/escalations/run', admin);

  const file = path.join(__dirname, '..', 'demo-credentials.local.txt');
  await fs.writeFile(file, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`Démonstration prête. Identifiants : ${file}`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
