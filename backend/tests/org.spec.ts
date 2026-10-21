import { app, prisma, request, resetDb, makeTenant, makeUser, auth, createAgent } from './helpers';

beforeEach(resetDb);

const unit = (headers: any, body: any) => request(app).post('/api/org-units').set(headers).send(body);

describe('organigramme', () => {
  it('construit une hiérarchie SG > DG > Direction > Service et la restitue', async () => {
    const t = await makeTenant();
    const sg = (await unit(t.headers, { code: 'sg', name: 'Secrétariat Général', type: 'SG' })).body;
    expect(sg.code).toBe('SG'); // codes normalisés en majuscules
    const dg = (await unit(t.headers, { code: 'DGSI', name: 'DG des SI', type: 'DG', parentId: sg.id })).body;
    const dir = (await unit(t.headers, { code: 'DLE', name: 'Direction DLE', type: 'DIRECTION', parentId: dg.id })).body;
    const svc = (await unit(t.headers, { code: 'SDA', name: 'Service SDA', type: 'SERVICE', parentId: dir.id })).body;
    const list = await request(app).get('/api/org-units').set(t.headers);
    expect(list.body).toHaveLength(4);
    const { orgService } = await import('../src/modules/org/org.service');
    expect((await orgService.chain(t.company.id, svc.id)).map(c => c.code)).toEqual(['SG', 'DGSI', 'DLE', 'SDA']);
    expect((await orgService.subtreeIds(t.company.id, dg.id)).sort()).toEqual([dg.id, dir.id, svc.id].sort());
  });

  it('refuse un code en double, un type incohérent avec le parent et un parent d\'une autre société', async () => {
    const a = await makeTenant(), b = await makeTenant();
    const dg = (await unit(a.headers, { code: 'DG1', name: 'DG', type: 'DG' })).body;
    expect((await unit(a.headers, { code: 'dg1', name: 'Autre', type: 'DG' })).status).toBe(409);
    expect((await unit(a.headers, { code: 'X', name: 'Mauvais', type: 'SG', parentId: dg.id })).status).toBe(400);
    expect((await unit(a.headers, { code: 'Y', name: 'Même rang', type: 'DG', parentId: dg.id })).status).toBe(400);
    expect((await unit(b.headers, { code: 'Z', name: 'Étranger', type: 'DIRECTION', parentId: dg.id })).status).toBe(400);
    // le même code est libre dans une autre société
    expect((await unit(b.headers, { code: 'DG1', name: 'DG', type: 'DG' })).status).toBe(201);
  });

  it('empêche les cycles lors d\'un déplacement', async () => {
    const t = await makeTenant();
    const dg = (await unit(t.headers, { code: 'DG', name: 'DG', type: 'DG' })).body;
    const dir = (await unit(t.headers, { code: 'DIR', name: 'DIR', type: 'DIRECTION', parentId: dg.id })).body;
    const res = await request(app).put(`/api/org-units/${dg.id}`).set(t.headers).send({ type: 'DG', parentId: dir.id });
    expect(res.status).toBe(400);
  });

  it('refuse de supprimer une unité utilisée (agents, sous-unités, postes) mais supprime une unité vide', async () => {
    const t = await makeTenant();
    const dg = (await unit(t.headers, { code: 'DG', name: 'DG', type: 'DG' })).body;
    const dir = (await unit(t.headers, { code: 'DIR', name: 'DIR', type: 'DIRECTION', parentId: dg.id })).body;
    expect((await request(app).delete(`/api/org-units/${dg.id}`).set(t.headers)).status).toBe(409);
    await createAgent(t.headers, { orgUnitId: dir.id });
    expect((await request(app).delete(`/api/org-units/${dir.id}`).set(t.headers)).status).toBe(409);
    const empty = (await unit(t.headers, { code: 'VIDE', name: 'Vide', type: 'SERVICE', parentId: dir.id })).body;
    expect((await request(app).delete(`/api/org-units/${empty.id}`).set(t.headers)).status).toBe(204);
  });

  it('est cloisonné : une autre société ne voit ni ne modifie mes unités', async () => {
    const a = await makeTenant(), b = await makeTenant();
    const dg = (await unit(a.headers, { code: 'DG', name: 'DG', type: 'DG' })).body;
    expect((await request(app).get('/api/org-units').set(b.headers)).body).toEqual([]);
    expect((await request(app).put(`/api/org-units/${dg.id}`).set(b.headers).send({ name: 'Piraté' })).status).toBe(404);
    expect((await request(app).delete(`/api/org-units/${dg.id}`).set(b.headers)).status).toBe(404);
  });

  it('réserve l\'écriture aux administrateurs', async () => {
    const t = await makeTenant();
    const employee = await makeUser(t.company.id, 'EMPLOYEE');
    expect((await unit(auth(employee.token), { code: 'X', name: 'X', type: 'DG' })).status).toBe(403);
    expect((await request(app).get('/api/org-units').set(auth(employee.token))).status).toBe(200);
  });

  it('journalise création, modification et suppression', async () => {
    const t = await makeTenant();
    const dg = (await unit(t.headers, { code: 'DG', name: 'DG', type: 'DG' })).body;
    await request(app).put(`/api/org-units/${dg.id}`).set(t.headers).send({ name: 'Direction Générale' });
    await request(app).delete(`/api/org-units/${dg.id}`).set(t.headers);
    const actions = (await prisma.auditLog.findMany({ where: { entity: 'OrgUnit' }, orderBy: { seq: 'asc' } })).map(a => a.action);
    expect(actions).toEqual(['ORG_UNIT_CREATED', 'ORG_UNIT_UPDATED', 'ORG_UNIT_DELETED']);
  });
});

describe('import CSV de l\'organigramme', () => {
  const csv = 'code;nom;type;code_parent\nSDA;Service SDA;SERVICE;DLE\nSG;Secrétariat Général;SG;\nDLE;Direction DLE;DIRECTION;DGSI\nDGSI;DG des SI;DG;SG\n';

  it('valide à blanc par défaut sans rien écrire, puis importe (parents après enfants acceptés)', async () => {
    const t = await makeTenant();
    const dry = await request(app).post('/api/org-units/import').set(t.headers).send({ csv });
    expect(dry.body).toMatchObject({ dryRun: true, total: 4, created: 4, updated: 0, errors: [] });
    expect(await prisma.orgUnit.count()).toBe(0);

    const real = await request(app).post('/api/org-units/import').set(t.headers).send({ csv, dryRun: false });
    expect(real.body).toMatchObject({ dryRun: false, created: 4, errors: [] });
    const sda = await prisma.orgUnit.findFirst({ where: { code: 'SDA' }, include: { parent: { include: { parent: { include: { parent: true } } } } } });
    expect(sda?.parent?.code).toBe('DLE');
    expect(sda?.parent?.parent?.code).toBe('DGSI');
    expect(sda?.parent?.parent?.parent?.code).toBe('SG');
  });

  it('est idempotent : un second import met à jour sans dupliquer', async () => {
    const t = await makeTenant();
    await request(app).post('/api/org-units/import').set(t.headers).send({ csv, dryRun: false });
    const again = await request(app).post('/api/org-units/import').set(t.headers).send({ csv: csv.replace('Service SDA', 'Service Développement'), dryRun: false });
    expect(again.body).toMatchObject({ created: 0, updated: 4, errors: [] });
    expect(await prisma.orgUnit.count()).toBe(4);
    expect((await prisma.orgUnit.findFirst({ where: { code: 'SDA' } }))?.name).toBe('Service Développement');
  });

  it('tout ou rien : une erreur empêche toute écriture et est localisée par ligne', async () => {
    const t = await makeTenant();
    const bad = 'code;nom;type;code_parent\nSG;SG;SG;\nA;A;BIDON;SG\nB;B;SERVICE;INCONNU\nSG;Doublon;SG;\nC;C;DG;D\nD;D;DIRECTION;C\n';
    const res = await request(app).post('/api/org-units/import').set(t.headers).send({ csv: bad, dryRun: false });
    expect(res.body.errors.length).toBeGreaterThanOrEqual(4);
    const lines = res.body.errors.map((e: any) => e.line);
    expect(lines).toEqual(expect.arrayContaining([3, 4, 5]));
    expect(await prisma.orgUnit.count()).toBe(0);
  });

  it('signale les colonnes obligatoires manquantes', async () => {
    const t = await makeTenant();
    const res = await request(app).post('/api/org-units/import').set(t.headers).send({ csv: 'code;libelle\nA;B\n' });
    expect(res.body.errors[0].message).toMatch(/nom, type/);
  });
});

describe('postes, titulaires et délégations', () => {
  it('affecte un titulaire en conservant l\'historique', async () => {
    const t = await makeTenant();
    const pos = (await request(app).post('/api/positions').set(t.headers).send({ code: 'CHEF_SERVICE_RH', label: 'Chef du service RH', civility: 'M', level: 3 })).body;
    const u1 = await createAgent(t.headers), u2 = await createAgent(t.headers);
    expect((await request(app).post(`/api/positions/${pos.id}/holders`).set(t.headers).send({ userId: u1.id })).status).toBe(201);
    const later = new Date(Date.now() + 1000).toISOString();
    await request(app).post(`/api/positions/${pos.id}/holders`).set(t.headers).send({ userId: u2.id, startsAt: later });
    const history = (await request(app).get(`/api/positions/${pos.id}/holders`).set(t.headers)).body;
    expect(history).toHaveLength(2);
    const first = history.find((h: any) => h.userId === u1.id);
    expect(first.endsAt).toBe(later); // le titulaire sortant est clôturé à la date d'arrivée du nouveau
    expect((await request(app).get('/api/positions').set(t.headers)).body[0].holder.id).toBe(u1.id);
  });

  it('refuse un code de poste en double et la suppression d\'un poste avec historique', async () => {
    const t = await makeTenant();
    const pos = (await request(app).post('/api/positions').set(t.headers).send({ code: 'P1', label: 'P' })).body;
    expect((await request(app).post('/api/positions').set(t.headers).send({ code: 'p1', label: 'Q' })).status).toBe(409);
    const u = await createAgent(t.headers);
    await request(app).post(`/api/positions/${pos.id}/holders`).set(t.headers).send({ userId: u.id });
    expect((await request(app).delete(`/api/positions/${pos.id}`).set(t.headers)).status).toBe(409);
  });

  it('crée une délégation valide et refuse dates inversées, titulaire = délégataire, et agent d\'une autre société', async () => {
    const t = await makeTenant(), other = await makeTenant();
    const pos = (await request(app).post('/api/positions').set(t.headers).send({ code: 'DRH', label: 'DRH' })).body;
    const holder = await createAgent(t.headers), deputy = await createAgent(t.headers), stranger = await createAgent(other.headers);
    await request(app).post(`/api/positions/${pos.id}/holders`).set(t.headers).send({ userId: holder.id });
    const now = Date.now(), d = (days: number) => new Date(now + days * 86400000).toISOString();
    const post = (body: any) => request(app).post('/api/delegations').set(t.headers).send({ positionId: pos.id, startsAt: d(0), endsAt: d(10), ...body });
    expect((await post({ delegateId: deputy.id, requestTypes: ['AUTORISATION_ABSENCE'], reason: 'Mission' })).status).toBe(201);
    expect((await post({ delegateId: deputy.id, endsAt: d(-1) })).status).toBe(400);
    expect((await post({ delegateId: holder.id })).status).toBe(400);
    expect((await post({ delegateId: stranger.id })).status).toBe(400);
    expect((await request(app).get('/api/delegations').set(t.headers)).body).toHaveLength(1);
  });
});
