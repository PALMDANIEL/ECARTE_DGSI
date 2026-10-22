import { app, prisma, request, resetDb, auth } from './helpers';
import { inDays } from './requests-helpers';
import { EmailService } from '../src/infrastructure/email';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

/**
 * Parcours de bout en bout, uniquement par l'API publique, comme dans la vraie vie :
 * une administration s'inscrit, se paramètre par imports CSV, ouvre des comptes à ses responsables,
 * émet une carte ; l'agent scanne, saisit son PIN et mène ses trois démarches jusqu'au bout.
 * Aucun raccourci en base (seules quelques lectures de contrôle).
 */
beforeEach(resetDb);
beforeEach(() => { jest.spyOn(EmailService.prototype, 'sendVerificationEmail').mockResolvedValue(); });
afterEach(() => jest.restoreAllMocks());

const get = (p: string, h: any = {}) => request(app).get(p).set(h);
const post = (p: string, h: any = {}, b?: any) => request(app).post(p).set(h).send(b ?? {});
const put = (p: string, h: any = {}, b?: any) => request(app).put(p).set(h).send(b ?? {});
const ok = (res: any, status = 200) => { if (res.status !== status) throw new Error(`${res.req?.method} ${res.req?.path} → ${res.status} ${JSON.stringify(res.body)}`); return res.body; };

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
function readQr(buf: Buffer): string {
  const img = PNG.sync.read(buf);
  const code = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  if (!code) throw new Error('QR illisible');
  return code.data;
}

const ORG = [
  'code;nom;type;code_parent',
  'SG;Secrétariat Général;SG;',
  'DGSI;Direction Générale des Systèmes d\'Information;DG;SG',
  'DLE;Direction de l\'Ingénierie logicielle et de l\'Exploitation;DIRECTION;DGSI',
  'SDA;Service Développement des Applications;SERVICE;DLE',
  'DRH;Direction des Ressources Humaines;DIRECTION;SG'
].join('\n');

const AGENTS = [
  'matricule;nom;prenom;email;telephone;civilite;grade;corps;date_integration;date_entree_service;code_unite;matricule_superieur;regime',
  'A001;KABORE;Marie;ministre@exemple.bf;;Mme;Ministre;;2010-01-01;2010-01-01;SG;;FONCTIONNAIRE',
  'A002;SANOU;Samuel;sg@exemple.bf;;M;Administrateur civil;;2010-01-01;2010-01-01;SG;A001;FONCTIONNAIRE',
  'A003;OUATTARA;Diane;drh@exemple.bf;;Mme;Administrateur civil;;2011-01-01;2011-01-01;DRH;A002;FONCTIONNAIRE',
  'A004;ZONGO;Rachid;rh@exemple.bf;;M;Attaché;;2012-01-01;2012-01-01;DRH;A003;FONCTIONNAIRE',
  'A005;COMPAORE;Denis;dg@exemple.bf;;M;Ingénieur;;2012-01-01;2012-01-01;DGSI;A002;FONCTIONNAIRE',
  'A006;YAMEOGO;Didier;dir@exemple.bf;;M;Ingénieur;;2013-01-01;2013-01-01;DLE;A005;FONCTIONNAIRE',
  'A007;SAWADOGO;Serge;svc@exemple.bf;;M;Ingénieur;;2014-01-01;2014-01-01;SDA;A006;FONCTIONNAIRE',
  'A008;TRAORE;Awa;;;Mme;Ingénieur des travaux informatiques;Informaticiens;01/03/2016;01/03/2016;SDA;A007;FONCTIONNAIRE'
].join('\n');

const HOLDERS: Record<string, string> = { MINISTRE: 'A001', SECRETAIRE_GENERAL: 'A002', DRH: 'A003', CHEF_SERVICE_RH: 'A004', CHEF_DGSI: 'A005', CHEF_DLE: 'A006', CHEF_SDA: 'A007' };

/** Mise en service complète d'une administration ; retourne les en-têtes de chaque acteur. */
async function setUpAdministration() {
  const reg = ok(await post('/api/auth/register', {}, { firstName: 'Admin', lastName: 'DGSI', email: 'admin@exemple.bf', password: 'Admin#20260', companyName: 'Ministère de la Transition Digitale' }), 201);
  const login = ok(await post('/api/auth/login', {}, { email: 'admin@exemple.bf', password: 'Admin#20260' }));
  const H = auth(login.accessToken);
  expect(reg.user.role).toBe('ADMIN');

  // Organigramme et agents : vérification à blanc puis écriture
  expect(ok(await post('/api/org-units/import', H, { csv: ORG })).errors).toEqual([]);
  expect(await prisma.orgUnit.count()).toBe(0);
  expect(ok(await post('/api/org-units/import', H, { csv: ORG, dryRun: false })).errors).toEqual([]);
  expect(ok(await post('/api/agents/import', H, { csv: AGENTS, dryRun: false })).errors).toEqual([]);
  const agents = ok(await get('/api/agents?limit=100', H));
  const byMat: Record<string, string> = Object.fromEntries(agents.items.map((a: any) => [a.profile.matricule, a.id]));
  expect(Object.keys(byMat)).toHaveLength(8);

  // Circuits d'après les formulaires, puis postes pourvus
  ok(await post('/api/workflows/bootstrap', H));
  const positions: any[] = ok(await get('/api/positions', H));
  for (const [code, mat] of Object.entries(HOLDERS)) {
    const p = positions.find(x => x.code === code);
    if (!p) throw new Error(`poste ${code} absent : ${positions.map(x => x.code).join(', ')}`);
    ok(await post(`/api/positions/${p.id}/holders`, H, { userId: byMat[mat] }), 201);
  }

  // Comptes de connexion des responsables : ils se connectent avec leur mot de passe
  const people: Record<string, Record<string, string>> = {};
  for (const mat of Object.values(HOLDERS)) {
    const email = AGENTS.split('\n').find(l => l.startsWith(mat + ';'))!.split(';')[3];
    ok(await post(`/api/agents/${byMat[mat]}/credentials`, H, { email, password: `Pass#${mat}2026` }));
    const s = ok(await post('/api/auth/login', {}, { email, password: `Pass#${mat}2026` }));
    people[mat] = auth(s.accessToken);
  }

  // Carte professionnelle et PIN de l'agent A008
  const awa = byMat.A008;
  const card = ok(await post('/api/cards', H, { fullName: 'Awa TRAORE', agentId: awa, jobTitle: 'Ingénieur' }), 201);
  ok(await post(`/api/cards/${card.id}/issue`, H));
  // Le QR imprimé est lu comme le ferait un téléphone : il ne contient qu'un lien opaque
  const png = await get(`/api/cards/${card.id}/access-qr`, H).buffer(true).parse(binary);
  expect(png.status).toBe(200);
  const accessUrl = readQr(png.body as Buffer);
  expect(accessUrl).toMatch(/\/q\/[A-Za-z0-9_-]{16,}$/);
  expect(accessUrl).not.toMatch(/TRAORE|A008|Awa/i);
  const token = accessUrl.split('/q/')[1];
  const pin: string = ok(await post(`/api/agents/${awa}/pin/reset`, H)).pin;
  return { H, people, byMat, awa, cardId: card.id as string, token, pin };
}

async function openAgentSession(token: string, pin: string) {
  const scan = ok(await get(`/api/access/${token}`));
  expect(JSON.stringify(scan)).not.toContain('TRAORE'); // le scan seul ne révèle pas l'identité complète
  expect((await post(`/api/access/${token}/pin`, {}, { pin: pin === '000000' ? '111111' : '000000' })).status).toBe(401);
  return auth(ok(await post(`/api/access/${token}/pin`, {}, { pin })).sessionToken);
}

/** Le titulaire `who` traite l'étape active de la demande `id` depuis sa boîte « À traiter ». */
async function decide(who: Record<string, string>, id: string, body: Record<string, any>) {
  const item = ok(await get('/api/requests/inbox', who)).find((r: any) => r.id === id);
  if (!item) throw new Error('demande absente de la boîte « À traiter »');
  return ok(await post(`/api/requests/${id}/steps/${item.activeStep.id}/act`, who, body));
}

describe('parcours complet d\'une administration et d\'un agent', () => {
  it('inscription → paramétrage CSV → carte → QR + PIN → décision, jouissance, absence (avec retour), pilotage, audit, révocation', async () => {
    const a = await setUpAdministration();
    const P = a.people;
    const agent = await openAgentSession(a.token, a.pin);

    // --- l'agent consulte son dossier et son solde
    const me = ok(await get('/api/access/me', agent));
    expect(JSON.stringify(me)).toContain('TRAORE');
    const balance = ok(await get('/api/access/balance', agent));
    expect(balance.entitlement.days).toBe(30);
    const services = ok(await get('/api/access/services', agent));
    expect(JSON.stringify(services)).toMatch(/DECISION_CONGE/);

    // --- 1. Décision de congé : 4 avis puis décision du ministre
    const year = new Date().getUTCFullYear();
    const dcFields = { year, destinations: 'au Burkina Faso et dans les pays de la CEDEAO', eStampNumber: '1790 8872 0082' };
    const preview = ok(await post('/api/access/requests/preview', agent, { typeCode: 'DECISION_CONGE', fields: dcFields }));
    expect(preview.errors ?? {}).toEqual({});
    const dc = ok(await post('/api/access/requests', agent, { typeCode: 'DECISION_CONGE', fields: dcFields }), 201);
    expect(dc.status).toBe('DRAFT');
    const dcSub = ok(await post(`/api/access/requests/${dc.id}/submit`, agent));
    expect(dcSub.status).toBe('IN_PROGRESS');
    expect(dcSub.reference).toMatch(new RegExp(`^DC-${year}-\\d{6}$`));
    // seul le premier responsable (directeur) est notifié
    expect(ok(await get('/api/notifications/unread-count', P.A006)).unread).toBe(1);
    expect(ok(await get('/api/notifications/unread-count', P.A001)).unread).toBe(0);
    // le ministre ne peut pas sauter les étapes
    expect(ok(await get('/api/requests/inbox', P.A001))).toEqual([]);

    for (const mat of ['A006', 'A005', 'A003', 'A002']) await decide(P[mat], dc.id, { action: 'FAVORABLE', comment: 'Avis favorable' });
    const approved = await decide(P.A001, dc.id, { action: 'APPROVE', decisionNumber: `${year}-0042/MTD/SG/DRH` });
    expect(approved.status).toBe('APPROVED');
    const agentNotes = ok(await get('/api/access/notifications', agent));
    expect(agentNotes.items[0].message).toMatch(/approuvée/);
    expect(agentNotes.total).toBe(5);

    // documents : une version par événement, téléchargeables par l'agent et par les responsables du circuit
    const view = ok(await get(`/api/access/requests/${dc.id}`, agent));
    expect(view.progress[view.progress.length - 1].label).toBe('Décision de Madame la Ministre');
    expect(view.documents.length).toBeGreaterThanOrEqual(6);
    const pdf = await get(`/api/access/requests/${dc.id}/document`, agent).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((await get(`/api/requests/${dc.id}/document`, P.A005)).status).toBe(200);
    expect((await get(`/api/requests/${dc.id}/document`, P.A004)).status).toBe(404); // hors du circuit

    // --- 2. Jouissance : 1re tranche de 15 jours
    const decisions = ok(await get('/api/access/decisions', agent));
    expect(decisions).toHaveLength(1);
    const jcFields = { leaveDecisionId: decisions[0].id, startDate: inDays(20), endDate: inDays(34), destination: 'au Burkina Faso' };
    const jc = ok(await post('/api/access/requests', agent, { typeCode: 'JOUISSANCE_CONGE', fields: jcFields }), 201);
    ok(await post(`/api/access/requests/${jc.id}/submit`, agent));
    // une seconde demande qui chevauche est refusée
    const overlap = await post('/api/access/requests', agent, { typeCode: 'JOUISSANCE_CONGE', fields: { ...jcFields, startDate: inDays(30), endDate: inDays(44) } });
    expect(overlap.status).toBe(422);
    await decide(P.A004, jc.id, { action: 'FAVORABLE' });
    expect((await decide(P.A007, jc.id, { action: 'APPROVE' })).status).toBe('APPROVED');
    const after = ok(await get('/api/access/balance', agent));
    expect(JSON.stringify(after)).toMatch(/15/);

    // --- 3. Absence pour événement familial, retournée pour correction puis approuvée
    const types: any[] = ok(await get('/api/access/absence-types', agent));
    const family = types.find(t => t.code === 'EVENEMENT_FAMILIAL');
    const aaFields = { absenceTypeId: family.id, startDate: inDays(5), endDate: inDays(7), motif: 'mariage' };
    const aa = ok(await post('/api/access/requests', agent, { typeCode: 'AUTORISATION_ABSENCE', fields: aaFields }), 201);
    ok(await post(`/api/access/requests/${aa.id}/submit`, agent));
    const ret = await decide(P.A004, aa.id, { action: 'RETURN', comment: 'Précisez le lien de parenté' });
    expect(ret.status).toBe('RETURNED');
    ok(await put(`/api/access/requests/${aa.id}`, agent, { fields: { ...aaFields, motif: 'mariage de ma sœur' } }));
    expect(ok(await post(`/api/access/requests/${aa.id}/submit`, agent)).round).toBe(2);
    await decide(P.A004, aa.id, { action: 'FAVORABLE' });
    expect((await decide(P.A007, aa.id, { action: 'APPROVE' })).status).toBe('APPROVED');
    // plafond annuel : 10 jours, 3 consommés → 8 jours supplémentaires refusés
    const tooMuch = await post('/api/access/requests/preview', agent, { typeCode: 'AUTORISATION_ABSENCE', fields: { ...aaFields, startDate: inDays(60), endDate: inDays(67) } });
    expect(JSON.stringify(tooMuch.body.errors)).toMatch(/plafond|jours/i);

    // --- 4. Pilotage
    const stats = ok(await get('/api/stats/overview', a.H));
    expect(stats.requests).toMatchObject({ submitted: 3, approved: 3, pending: 0 });
    expect(stats.absences.approvedAbsenceDays).toBe(3);
    expect(stats.absences.approvedLeaveEnjoymentDays).toBe(15);
    expect(stats.cards).toMatchObject({ total: 1, active: 1 });
    const balances: any[] = ok(await get(`/api/stats/balances?year=${year}`, a.H));
    expect(balances.find(b => b.matricule === 'A008')).toMatchObject({ acquired: 30, authorized: 30, consumed: 15, remaining: 15, absenceDays: 3 });
    // les agents qui n'ont rien consulté apparaissent avec leur droit réel, pas à 0
    expect(balances.find(b => b.matricule === 'A002')).toMatchObject({ acquired: 30, consumed: 0, remaining: 30 });
    const csv = await get('/api/stats/requests.csv', a.H);
    expect(csv.text).toContain('AA-');
    // un chef de service ne voit que les demandes de son circuit
    expect(ok(await get('/api/stats/overview', P.A007)).requests.submitted).toBe(2);
    // aucun retard : le balayage des délais ne signale rien
    expect(ok(await post('/api/escalations/run', a.H))).toEqual({ reminders: 0, escalations: 0, checked: 0 });

    // --- 5. Audit intègre, révocation immédiate de la carte
    expect(ok(await get('/api/audit/verify', a.H)).ok).toBe(true);
    ok(await post(`/api/cards/${a.cardId}/revoke`, a.H, { reason: 'Perte déclarée' }));
    expect((await get('/api/access/balance', agent)).status).toBe(404);
    expect((await get(`/api/access/${a.token}`)).status).toBe(404);
  });

  it('un agent d\'une autre administration ni un responsable d\'une autre administration ne voient rien', async () => {
    const a = await setUpAdministration();
    const agent = await openAgentSession(a.token, a.pin);
    const dc = ok(await post('/api/access/requests', agent, { typeCode: 'DECISION_CONGE', fields: { year: new Date().getUTCFullYear(), destinations: 'au Burkina Faso', eStampNumber: '12345678' } }), 201);
    ok(await post(`/api/access/requests/${dc.id}/submit`, agent));

    const other = ok(await post('/api/auth/register', {}, { firstName: 'Autre', lastName: 'Admin', email: 'autre@exemple.bf', password: 'Autre#20260', companyName: 'Ministère de la Santé' }), 201);
    const H2 = auth(other.accessToken);
    expect((await get(`/api/requests/${dc.id}`, H2)).status).toBe(404);
    expect(ok(await get('/api/requests', H2)).total ?? 0).toBe(0);
    expect(ok(await get('/api/stats/overview', H2)).requests.submitted).toBe(0);
    expect(ok(await get('/api/agents', H2)).total ?? 0).toBe(0);
    expect((await get(`/api/cards/${a.cardId}`, H2)).status).toBe(403);
    // le jeton de l'agent n'ouvre pas l'API d'administration, ni l'inverse
    expect((await get('/api/requests/inbox', agent)).status).toBe(401);
    expect((await get('/api/access/requests', a.H)).status).toBe(401);
  });
});
