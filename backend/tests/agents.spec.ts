import { app, prisma, request, resetDb, makeTenant, makeUser, auth, createAgent } from './helpers';
import { verifyPin } from '../src/shared/utils/crypto';

beforeEach(resetDb);

describe('agents', () => {
  it('crée un agent (compte + profil) sans dupliquer l\'identité et sans exposer de secret', async () => {
    const t = await makeTenant();
    const res = await request(app).post('/api/agents').set(t.headers).send({ matricule: '386239d', firstName: 'Romeo', lastName: 'PALM', civility: 'M', grade: 'Ingénieur de Travaux en Informatique', hireDate: '2018-03-01' });
    expect(res.status).toBe(201);
    expect(res.body.profile.matricule).toBe('386239D');
    expect(res.body.profile.hasPin).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/password|pinHash/);
    expect(await prisma.user.count({ where: { companyId: t.company.id } })).toBe(2); // admin + agent, pas de doublon
    const user = await prisma.user.findUnique({ where: { id: res.body.id } });
    expect(user!.email).toMatch(/@agents\.invalid$/);
    expect(user!.password).not.toBe('');
  });

  it('impose l\'unicité du matricule par société (mais pas entre sociétés)', async () => {
    const a = await makeTenant(), b = await makeTenant();
    await createAgent(a.headers, { matricule: 'X1' });
    expect((await request(app).post('/api/agents').set(a.headers).send({ matricule: 'x1', firstName: 'A', lastName: 'B' })).status).toBe(409);
    expect((await request(app).post('/api/agents').set(b.headers).send({ matricule: 'X1', firstName: 'A', lastName: 'B' })).status).toBe(201);
  });

  it('refuse un email déjà utilisé, une unité ou un supérieur introuvables', async () => {
    const a = await makeTenant(), b = await makeTenant();
    const other = await createAgent(b.headers);
    await createAgent(a.headers, { email: 'dup@test.local' });
    expect((await request(app).post('/api/agents').set(a.headers).send({ matricule: 'N1', firstName: 'A', lastName: 'B', email: 'dup@test.local' })).status).toBe(409);
    expect((await request(app).post('/api/agents').set(a.headers).send({ matricule: 'N2', firstName: 'A', lastName: 'B', orgUnitId: 'inconnu' })).status).toBe(400);
    const res = await request(app).post('/api/agents').set(a.headers).send({ matricule: 'N3', firstName: 'A', lastName: 'B', supervisorId: other.id });
    expect(res.status).toBe(400);
    expect(await prisma.agentProfile.count({ where: { matricule: 'N3' } })).toBe(0); // rien n'est resté en base
  });

  it('refuse les boucles hiérarchiques', async () => {
    const t = await makeTenant();
    const boss = await createAgent(t.headers), mid = await createAgent(t.headers, { supervisorId: boss.id }), low = await createAgent(t.headers, { supervisorId: mid.id });
    expect((await request(app).put(`/api/agents/${boss.id}`).set(t.headers).send({ supervisorId: low.id })).status).toBe(400);
    expect((await request(app).put(`/api/agents/${boss.id}`).set(t.headers).send({ supervisorId: boss.id })).status).toBe(400);
    expect((await request(app).put(`/api/agents/${low.id}`).set(t.headers).send({ supervisorId: boss.id })).status).toBe(200);
  });

  it('modifie le profil, vide un champ avec null et journalise sans fuiter le PIN', async () => {
    const t = await makeTenant();
    const a = await createAgent(t.headers, { grade: 'Grade A', civility: 'MME' });
    const res = await request(app).put(`/api/agents/${a.id}`).set(t.headers).send({ grade: null, jobTitle: 'Chef', hireDate: '2020-01-15' });
    expect(res.body.profile.grade).toBeNull();
    expect(res.body.jobTitle).toBe('Chef');
    expect(res.body.profile.hireDate).toContain('2020-01-15');
    const log = await prisma.auditLog.findFirst({ where: { action: 'AGENT_UPDATED' } });
    expect(JSON.stringify(log)).not.toContain('pinHash');
  });

  it('génère un PIN numérique stocké haché, affiché une seule fois, et le remet à zéro les verrous', async () => {
    const t = await makeTenant();
    const a = await createAgent(t.headers);
    await prisma.agentProfile.update({ where: { userId: a.id }, data: { pinFailedAttempts: 4, pinLockedUntil: new Date(Date.now() + 99999) } });
    const res = await request(app).post(`/api/agents/${a.id}/pin/reset`).set(t.headers);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    const profile = await prisma.agentProfile.findUnique({ where: { userId: a.id } });
    expect(profile!.pinHash).not.toContain(res.body.pin);
    expect(await verifyPin(res.body.pin, profile!.pinHash!)).toBe(true);
    expect(profile!.pinFailedAttempts).toBe(0);
    expect(profile!.pinLockedUntil).toBeNull();
    const logs = JSON.stringify(await prisma.auditLog.findMany());
    expect(logs).not.toContain(res.body.pin);
    expect((await request(app).get(`/api/agents/${a.id}`).set(t.headers)).body.profile.hasPin).toBe(true);
  });

  it('cherche par nom ou matricule et filtre par unité (sous-arbre inclus)', async () => {
    const t = await makeTenant();
    const dg = (await request(app).post('/api/org-units').set(t.headers).send({ code: 'DG', name: 'DG', type: 'DG' })).body;
    const dir = (await request(app).post('/api/org-units').set(t.headers).send({ code: 'DIR', name: 'DIR', type: 'DIRECTION', parentId: dg.id })).body;
    const other = (await request(app).post('/api/org-units').set(t.headers).send({ code: 'AUTRE', name: 'Autre', type: 'DG' })).body;
    await createAgent(t.headers, { matricule: 'A1', lastName: 'Traoré', orgUnitId: dir.id });
    await createAgent(t.headers, { matricule: 'B2', lastName: 'Ouédraogo', orgUnitId: other.id });
    const get = (q: string) => request(app).get('/api/agents?' + q).set(t.headers);
    expect((await get('search=traor')).body.total).toBe(1);
    expect((await get('search=b2')).body.items[0].profile.matricule).toBe('B2');
    expect((await get(`orgUnitId=${dg.id}`)).body.items.map((i: any) => i.profile.matricule)).toEqual(['A1']);
    expect((await get('')).body.total).toBe(2);
  });

  it('est réservé aux administrateurs et cloisonné par société', async () => {
    const a = await makeTenant(), b = await makeTenant();
    const agent = await createAgent(a.headers);
    const employee = await makeUser(a.company.id, 'EMPLOYEE');
    expect((await request(app).get('/api/agents').set(auth(employee.token))).status).toBe(403);
    expect((await request(app).get(`/api/agents/${agent.id}`).set(b.headers)).status).toBe(404);
    expect((await request(app).put(`/api/agents/${agent.id}`).set(b.headers).send({ grade: 'X' })).status).toBe(404);
    expect((await request(app).post(`/api/agents/${agent.id}/pin/reset`).set(b.headers)).status).toBe(404);
    expect((await request(app).get('/api/agents').set(b.headers)).body.total).toBe(0);
  });

  it('interdit à un administrateur de se désactiver lui-même', async () => {
    const t = await makeTenant();
    await prisma.agentProfile.create({ data: { userId: t.admin.user.id, companyId: t.company.id, matricule: 'ADM1' } });
    expect((await request(app).put(`/api/agents/${t.admin.user.id}/active`).set(t.headers).send({ isActive: false })).status).toBe(400);
  });
});

describe('import CSV des agents', () => {
  const orgCsv = 'code;nom;type;code_parent\nDGSI;DG des SI;DG;\nSDA;Service SDA;SERVICE;DGSI\n';
  const head = 'matricule;nom;prenom;email;telephone;civilite;grade;corps;date_integration;date_entree_service;code_unite;matricule_superieur;regime\n';

  it('importe des agents avec supérieurs déclarés après leurs subordonnés, et rattache aux unités', async () => {
    const t = await makeTenant();
    await request(app).post('/api/org-units/import').set(t.headers).send({ csv: orgCsv, dryRun: false });
    const csv = head +
      'M2;TRAORE;Awa;;;Mme;Ingénieur;Informaticiens;01/03/2018;01/04/2018;SDA;M1;FONCTIONNAIRE\n' +
      'M1;OUEDRAOGO;Paul;paul@test.local;70000000;M;Directeur;;2010-01-01;2010-01-01;DGSI;;\n';
    const dry = await request(app).post('/api/agents/import').set(t.headers).send({ csv });
    expect(dry.body).toMatchObject({ dryRun: true, total: 2, created: 2, errors: [] });
    expect(await prisma.agentProfile.count()).toBe(0);

    const real = await request(app).post('/api/agents/import').set(t.headers).send({ csv, dryRun: false });
    expect(real.body.errors).toEqual([]);
    const awa = await prisma.agentProfile.findFirst({ where: { matricule: 'M2' }, include: { orgUnit: true, supervisor: true, user: true } });
    expect(awa!.orgUnit!.code).toBe('SDA');
    expect(awa!.supervisor!.lastName).toBe('OUEDRAOGO');
    expect(awa!.civility).toBe('MME');
    expect(awa!.hireDate!.toISOString()).toContain('2018-03-01');
    expect(awa!.regime).toBe('FONCTIONNAIRE');
  });

  it('met à jour sans dupliquer lors d\'un second import', async () => {
    const t = await makeTenant();
    const csv = head + 'M1;DUPONT;Jean;;;;Grade 1;;;;;;\n';
    await request(app).post('/api/agents/import').set(t.headers).send({ csv, dryRun: false });
    const again = await request(app).post('/api/agents/import').set(t.headers).send({ csv: csv.replace('Grade 1', 'Grade 2'), dryRun: false });
    expect(again.body).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect(await prisma.agentProfile.count()).toBe(1);
    expect((await prisma.agentProfile.findFirst())!.grade).toBe('Grade 2');
  });

  it('tout ou rien : liste toutes les erreurs avec leur ligne et n\'écrit rien', async () => {
    const t = await makeTenant();
    await request(app).post('/api/org-units/import').set(t.headers).send({ csv: orgCsv, dryRun: false });
    const csv = head +
      'OK1;Bon;Agent;;;;;;;;SDA;;\n' +                       // ligne 2 : valide
      ';Sans;Matricule;;;;;;;;;;\n' +                         // ligne 3 : matricule vide
      'E1;Date;Mauvaise;;;;;;31/02/2020;;;;\n' +              // ligne 4 : date inexistante
      'E2;Unite;Inconnue;;;;;;;;NOPE;;\n' +                   // ligne 5 : unité inconnue
      'E3;Email;Mauvais;pas-un-email;;;;;;;;;\n' +            // ligne 6 : email invalide
      'E4;Civ;Bad;;;Dr;;;;;;;\n' +                            // ligne 7 : civilité invalide
      'E5;Sup;Absent;;;;;;;;;GHOST;\n' +                      // ligne 8 : supérieur introuvable
      'E6;Dates;Inversees;;;;;;2020-01-01;2019-01-01;;;\n' +  // ligne 9 : service avant intégration
      'OK1;Doublon;Agent;;;;;;;;;;\n';                        // ligne 10 : matricule en double
    const res = await request(app).post('/api/agents/import').set(t.headers).send({ csv, dryRun: false });
    expect(res.body.errors.map((e: any) => e.line).sort((a: number, b: number) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await prisma.agentProfile.count()).toBe(0);
  });

  it('détecte les boucles hiérarchiques dans le fichier et refuse un email d\'un autre compte', async () => {
    const t = await makeTenant();
    const loop = head + 'A;A;A;;;;;;;;;B;\nB;B;B;;;;;;;;;A;\n';
    expect((await request(app).post('/api/agents/import').set(t.headers).send({ csv: loop })).body.errors.length).toBeGreaterThan(0);
    const taken = head + `Z;Z;Z;${t.admin.user.email};;;;;;;;;\n`;
    expect((await request(app).post('/api/agents/import').set(t.headers).send({ csv: taken })).body.errors[0].message).toMatch(/déjà utilisé/);
  });

  it('fournit un modèle CSV téléchargeable et réservé aux administrateurs', async () => {
    const t = await makeTenant();
    const res = await request(app).get('/api/agents/import/template').set(t.headers);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const employee = await makeUser(t.company.id, 'EMPLOYEE');
    expect((await request(app).get('/api/agents/import/template').set(auth(employee.token))).status).toBe(403);
  });
});
