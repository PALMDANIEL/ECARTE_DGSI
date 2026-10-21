import { app, prisma, request, resetDb, auth, makeTenant, makeUser, createAgent, tokenFor } from './helpers';
import { scenario, Scenario, act, dcFields, submitDecisionRequest, approveDecisionRequest, inDays, today } from './requests-helpers';
import { stepFingerprint } from '../src/modules/requests/document.service';
import { auditService } from '../src/modules/audit/audit.service';
import { documentService } from '../src/modules/requests/document.service';

beforeEach(resetDb);

const post = (path: string, headers: any, body?: any) => request(app).post(path).set(headers).send(body ?? {});
const get = (path: string, headers: any) => request(app).get(path).set(headers);

describe('circuits : création d\'après les formulaires', () => {
  it('génère les 3 circuits et les postes manquants (vacants), sans rien remplacer au second appel', async () => {
    const t = await makeTenant();
    await post('/api/org-units/import', t.headers, { csv: 'code;nom;type;code_parent\nDGSI;Direction Générale des SI;DG;\nSDA;Service Développement des Applications;SERVICE;DGSI\n', dryRun: false });
    const first = await post('/api/workflows/bootstrap', t.headers);
    expect(first.status).toBe(200);
    expect(first.body.published.map((p: any) => p.type).sort()).toEqual(['AUTORISATION_ABSENCE', 'DECISION_CONGE', 'JOUISSANCE_CONGE']);
    expect(first.body.createdPositions.join(' ')).toMatch(/MINISTRE.*DRH.*|DRH/s);
    const codes = (await prisma.position.findMany({ where: { companyId: t.company.id } })).map(p => p.code);
    expect(codes).toEqual(expect.arrayContaining(['MINISTRE', 'SECRETAIRE_GENERAL', 'DRH', 'CHEF_SERVICE_RH', 'CHEF_DGSI', 'CHEF_SDA']));
    const sda = await prisma.position.findFirst({ where: { code: 'CHEF_SDA' } });
    expect(sda!.label).toBe('Chef de Service Développement des Applications');

    const dc = (await get('/api/workflows/DECISION_CONGE', t.headers)).body;
    expect(dc).toHaveLength(1);
    expect(dc[0].steps.map((s: any) => `${s.kind}:${s.resolution}`)).toEqual(['AVIS:UNIT_TYPE_HEAD', 'AVIS:UNIT_TYPE_HEAD', 'AVIS:POSITION', 'AVIS:POSITION', 'DECISION:POSITION']);

    const second = await post('/api/workflows/bootstrap', t.headers);
    expect(second.body.published).toEqual([]);
    expect(second.body.createdPositions).toEqual([]);
    expect((await get('/api/workflows/DECISION_CONGE', t.headers)).body).toHaveLength(1);
  });

  it('refuse un circuit sans décision finale, avec plusieurs décisions, ou avec des références invalides', async () => {
    const t = await makeTenant();
    const pos = (await post('/api/positions', t.headers, { code: 'P', label: 'Chef' })).body;
    const avis = { kind: 'AVIS', resolution: 'POSITION', positionId: pos.id };
    const dec = { kind: 'DECISION', resolution: 'POSITION', positionId: pos.id };
    const publish = (steps: any[]) => post('/api/workflows/DECISION_CONGE', t.headers, { steps });
    expect((await publish([])).status).toBe(400);
    expect((await publish([avis])).status).toBe(400);
    expect((await publish([dec, avis])).status).toBe(400);
    expect((await publish([dec, dec])).status).toBe(400);
    expect((await publish([{ ...avis, positionId: 'inconnu' }, dec])).status).toBe(400);
    expect((await publish([{ kind: 'AVIS', resolution: 'SUPERVISOR_LEVEL' }, dec])).status).toBe(400);
    expect((await publish([{ kind: 'AVIS', resolution: 'UNIT_TYPE_HEAD' }, dec])).status).toBe(400);
    expect((await publish([avis, { ...dec, condition: { field: 'x', op: 'gt', value: 1 } }])).status).toBe(400);
    expect((await publish([avis, dec])).status).toBe(201);
  });

  it('versionne : une nouvelle publication clôt l\'ancienne et les demandes en cours gardent leur circuit', async () => {
    const sc = await scenario();
    const req1 = await submitDecisionRequest(sc);
    const v1 = (await prisma.request.findUnique({ where: { id: req1.id } }))!.workflowId;
    // nouveau circuit réduit à une seule étape de décision
    const pub = await post('/api/workflows/DECISION_CONGE', sc.H, { steps: [{ kind: 'DECISION', resolution: 'POSITION', positionId: sc.positions.MINISTRE }] });
    expect(pub.status).toBe(201);
    expect(pub.body.version).toBe(2);
    const defs = (await get('/api/workflows/DECISION_CONGE', sc.H)).body;
    expect(defs.map((d: any) => [d.version, d.isActive])).toEqual([[2, true], [1, false]]);
    // la demande déjà déposée reste attachée à la version 1 (5 étapes)
    expect((await prisma.request.findUnique({ where: { id: req1.id } }))!.workflowId).toBe(v1);
    expect(await prisma.requestStep.count({ where: { requestId: req1.id } })).toBe(5);
  });

  it('simule un circuit pour un agent : approbateurs ou postes vacants', async () => {
    const sc = await scenario({ fillPositions: false });
    const sim = await post('/api/workflows/simulate', sc.H, { typeCode: 'DECISION_CONGE', agentId: sc.agent.id });
    expect(sim.status).toBe(200);
    expect(sim.body.steps).toHaveLength(0);
    expect(sim.body.unresolved.length).toBeGreaterThanOrEqual(5);
    expect(sim.body.unresolved[0].reason).toMatch(/vacant/);

    const filled = await scenario();
    const ok = await post('/api/workflows/simulate', filled.H, { typeCode: 'DECISION_CONGE', agentId: filled.agent.id });
    expect(ok.body.unresolved).toEqual([]);
    expect(ok.body.steps.map((s: any) => s.approverName)).toEqual(['Didier Directeur', 'Denis DG', 'Diane DRH', 'Samuel Secrétaire', 'Marie Ministre']);
    expect(ok.body.steps[0].heading).toBe("Avis de Monsieur le Directeur de l'Ingénierie logicielle et de l'Exploitation");
    expect(ok.body.steps[4].heading).toBe('Décision de Monsieur le Ministre');
  });

  it('applique les étapes conditionnelles et la résolution par supérieur hiérarchique', async () => {
    const sc = await scenario();
    await post('/api/workflows/AUTORISATION_ABSENCE', sc.H, { steps: [
      { kind: 'AVIS', resolution: 'SUPERVISOR_LEVEL', level: 1 },
      { kind: 'AVIS', resolution: 'POSITION', positionId: sc.positions.DRH, condition: { field: 'durationDays', op: 'gt', value: 3 } },
      { kind: 'DECISION', resolution: 'POSITION', positionId: sc.positions.CHEF_SERVICE_RH }
    ] });
    const short = await post('/api/workflows/simulate', sc.H, { typeCode: 'AUTORISATION_ABSENCE', agentId: sc.agent.id, data: { durationDays: 1 } });
    expect(short.body.steps).toHaveLength(2);
    expect(short.body.steps[0].approverName).toBe('Serge ChefService');
    expect(short.body.skipped[0].reason).toMatch(/condition/);
    const long = await post('/api/workflows/simulate', sc.H, { typeCode: 'AUTORISATION_ABSENCE', agentId: sc.agent.id, data: { durationDays: 5 } });
    expect(long.body.steps).toHaveLength(3);
  });

  it('réserve l\'administration des circuits aux administrateurs', async () => {
    const t = await makeTenant();
    const employee = await makeUser(t.company.id, 'EMPLOYEE');
    for (const [m, p] of [['get', '/api/workflows/DECISION_CONGE'], ['post', '/api/workflows/bootstrap'], ['get', '/api/request-types'], ['get', '/api/form-templates']] as const) {
      expect((await (request(app) as any)[m](p).set(auth(employee.token))).status).toBe(403);
    }
  });
});

describe('services de l\'agent', () => {
  it('propose les démarches selon la situation : la jouissance exige une décision valide', async () => {
    const sc = await scenario();
    const services = (await get('/api/access/services', sc.agent.headers)).body;
    const byCode = Object.fromEntries(services.map((s: any) => [s.code, s]));
    expect(byCode.DECISION_CONGE.available).toBe(true);
    expect(byCode.AUTORISATION_ABSENCE.available).toBe(true);
    expect(byCode.JOUISSANCE_CONGE.available).toBe(false);
    expect(byCode.JOUISSANCE_CONGE.reason).toMatch(/décision de congé/);
    expect((await get('/api/access/decisions', sc.agent.headers)).body).toEqual([]);
  });

  it('signale une démarche dont le circuit n\'est pas configuré', async () => {
    const sc = await scenario({ withWorkflows: false });
    const services = (await get('/api/access/services', sc.agent.headers)).body;
    expect(services.every((s: any) => !s.available)).toBe(true);
    expect(services[0].reason).toMatch(/non configuré/);
    expect((await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).status).toBe(409);
  });
});

describe('demande de décision de congé', () => {
  it('valide les données saisies avec un message par champ', async () => {
    const sc = await scenario();
    const create = (fields: any) => post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields });
    const bad = await create({ year: 1999, destinations: '', eStampNumber: 'abc' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.errors).sort()).toEqual(['destinations', 'eStampNumber', 'year']);
    expect((await create(dcFields({ year: 'x' }))).status).toBe(422);
    expect((await create(dcFields({ eStampNumber: '12' }))).status).toBe(422);
    expect((await create(dcFields({ previousDecisionDate: '31/02/2026' }))).status).toBe(422);
    expect((await post('/api/access/requests', sc.agent.headers, { typeCode: 'INCONNU', fields: {} })).status).toBe(404);
    expect((await create(dcFields())).status).toBe(201);
  });

  it('suit le circuit complet : 4 avis puis la décision du Ministre, dans l\'ordre, avec PDF versionné', async () => {
    const sc = await scenario();
    const submitted = await submitDecisionRequest(sc);
    expect(submitted.status).toBe('IN_PROGRESS');
    expect(submitted.reference).toMatch(/^DC-\d{4}-000001$/);
    expect(submitted.progress.map((s: any) => s.isActive)).toEqual([true, false, false, false, false]);
    expect(submitted.documents).toHaveLength(1);

    // Seul le titulaire de l'étape active la voit dans sa boîte
    expect((await get('/api/requests/inbox', sc.people.dir.headers)).body.map((r: any) => r.id)).toEqual([submitted.id]);
    for (const other of [sc.people.dg, sc.people.drh, sc.people.sg, sc.people.minister, sc.people.svc, sc.people.other]) {
      expect((await get('/api/requests/inbox', other.headers)).body).toEqual([]);
    }

    const final = await approveDecisionRequest(sc, submitted.id);
    expect(final.status).toBe('APPROVED');
    expect(final.progress.map((s: any) => s.result)).toEqual(['FAVORABLE', 'FAVORABLE', 'FAVORABLE', 'FAVORABLE', 'APPROVED']);
    expect(final.closedAt).toBeTruthy();
    expect(final.issuedDecision).toMatchObject({ number: '2026-14-00001/MEF/SG/DRH', days: 30 });
    // une version de document par événement : dépôt + 5 traitements
    expect(final.documents.map((d: any) => d.version)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(final.documents[5].reason).toBe('SUBMITTED');
    expect(final.documents[0].reason).toBe('FINAL');

    const decision = await prisma.leaveDecision.findFirst();
    expect(decision).toMatchObject({ number: '2026-14-00001/MEF/SG/DRH', agentId: sc.agent.id, days: 30, status: 'VALID' });
    // l'agent est notifié
    const notes = await prisma.notification.findMany({ where: { userId: sc.agent.id } });
    expect(notes.some(n => /approuvée/.test(n.message))).toBe(true);
  });

  it('empêche le saut d\'étape, la validation par un non-habilité, le traitement de sa propre demande et la double validation', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const steps = (await prisma.requestStep.findMany({ where: { requestId: r.id }, orderBy: { order: 'asc' } }));
    // le DG tente de répondre à l'étape 2 avant l'étape 1
    expect((await act(sc, sc.people.dg, r.id, steps[1].id, { action: 'FAVORABLE' })).status).toBe(409);
    // un tiers sur l'étape active
    expect((await act(sc, sc.people.other, r.id, steps[0].id, { action: 'FAVORABLE' })).status).toBe(403);
    // le demandeur lui-même (même s'il avait un jeton d'administration)
    const selfToken = await tokenFor(sc.agent.id);
    expect((await request(app).post(`/api/requests/${r.id}/steps/${steps[0].id}/act`).set(auth(selfToken)).send({ action: 'FAVORABLE' })).status).toBe(403);
    // action invalide pour le type d'étape
    expect((await act(sc, sc.people.dir, r.id, steps[0].id, { action: 'APPROVE' })).status).toBe(400);
    // le bon responsable, puis une seconde validation de la même étape
    expect((await act(sc, sc.people.dir, r.id, steps[0].id, { action: 'FAVORABLE' })).status).toBe(200);
    const again = await act(sc, sc.people.dir, r.id, steps[0].id, { action: 'FAVORABLE' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOT_ACTIVE_STEP');
  });

  it('une seule des deux validations simultanées d\'une même étape aboutit', async () => {
    const sc = await scenario();
    // un délégataire du Directeur peut aussi agir : deux personnes habilitées répondent en même temps
    await post('/api/delegations', sc.H, { positionId: sc.positions.CHEF_DLE, delegateId: sc.people.other.id, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() });
    const r = await submitDecisionRequest(sc);
    const step = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    const results = await Promise.all([
      act(sc, sc.people.dir, r.id, step.id, { action: 'FAVORABLE' }),
      act(sc, sc.people.other, r.id, step.id, { action: 'UNFAVORABLE', comment: 'Je ne suis pas d\'accord' })
    ]);
    expect(results.map(x => x.status).sort()).toEqual([200, 409]);
    expect(await prisma.requestStep.count({ where: { requestId: r.id, round: 1, result: { in: ['FAVORABLE', 'UNFAVORABLE'] } } })).toBe(1);
  });

  it('exige un commentaire pour un avis défavorable, un rejet ou un retour, et un numéro pour la décision de congé', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    const noComment = await act(sc, sc.people.dir, r.id, s1.id, { action: 'RETURN' });
    expect(noComment.status).toBe(422);
    expect(noComment.body.code).toBe('COMMENT_REQUIRED');
    expect((await act(sc, sc.people.dir, r.id, s1.id, { action: 'UNFAVORABLE', comment: 'ok' })).status).toBe(422);

    for (const who of [sc.people.dir, sc.people.dg, sc.people.drh, sc.people.sg]) {
      const item = (await get('/api/requests/inbox', who.headers)).body[0];
      await act(sc, who, r.id, item.activeStep.id, { action: 'FAVORABLE' });
    }
    const item = (await get('/api/requests/inbox', sc.people.minister.headers)).body[0];
    const noNumber = await act(sc, sc.people.minister, r.id, item.activeStep.id, { action: 'APPROVE' });
    expect(noNumber.status).toBe(422);
    expect(noNumber.body.code).toBe('DECISION_NUMBER_REQUIRED');
    expect(await prisma.leaveDecision.count()).toBe(0);
    expect((await act(sc, sc.people.minister, r.id, item.activeStep.id, { action: 'APPROVE', decisionNumber: 'N-1' })).status).toBe(200);
    // numéro unique
    expect(await prisma.leaveDecision.count({ where: { number: 'N-1' } })).toBe(1);
  });

  it('un avis défavorable est enregistré mais le circuit continue jusqu\'à la décision', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    const res = await act(sc, sc.people.dir, r.id, s1.id, { action: 'UNFAVORABLE', comment: 'Charge de travail importante' });
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.progress[0]).toMatchObject({ result: 'UNFAVORABLE', comment: 'Charge de travail importante', actorName: 'Didier Directeur' });
    expect(res.body.progress[1].isActive).toBe(true);
  });

  it('rejette définitivement : plus aucune action possible et aucune décision créée', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    for (const who of [sc.people.dir, sc.people.dg, sc.people.drh, sc.people.sg]) {
      const item = (await get('/api/requests/inbox', who.headers)).body[0];
      await act(sc, who, r.id, item.activeStep.id, { action: 'FAVORABLE' });
    }
    const item = (await get('/api/requests/inbox', sc.people.minister.headers)).body[0];
    const res = await act(sc, sc.people.minister, r.id, item.activeStep.id, { action: 'REJECT', comment: 'Nécessités de service' });
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.closedAt).toBeTruthy();
    expect(await prisma.leaveDecision.count()).toBe(0);
    const again = await act(sc, sc.people.minister, r.id, item.activeStep.id, { action: 'APPROVE', decisionNumber: 'X' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOT_IN_PROGRESS');
    expect((await get('/api/requests/inbox', sc.people.minister.headers)).body).toEqual([]);
  });

  it('retour pour correction : l\'agent corrige, redépose, un nouveau tour recommence avec la même référence', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    const returned = await act(sc, sc.people.dir, r.id, s1.id, { action: 'RETURN', comment: 'Précisez les destinations' });
    expect(returned.body.status).toBe('RETURNED');
    expect((await get('/api/requests/inbox', sc.people.dir.headers)).body).toEqual([]);

    // Tant que la demande est retournée, aucun responsable ne peut agir
    expect((await act(sc, sc.people.dir, r.id, s1.id, { action: 'FAVORABLE' })).status).toBe(409);

    const edited = await request(app).put(`/api/access/requests/${r.id}`).set(sc.agent.headers).send({ fields: dcFields({ destinations: 'au Burkina Faso et en Côte d\'Ivoire' }) });
    expect(edited.status).toBe(200);
    const again = await post(`/api/access/requests/${r.id}/submit`, sc.agent.headers);
    expect(again.body.status).toBe('IN_PROGRESS');
    expect(again.body.reference).toBe(r.reference);
    expect(again.body.round).toBe(2);
    expect(again.body.progress).toHaveLength(5);
    expect(again.body.progress.every((s: any) => s.result === 'PENDING')).toBe(true);
    expect(again.body.previousRounds[0]).toMatchObject({ round: 1, result: 'RETURNED', comment: 'Précisez les destinations' });
    expect(again.body.documents[0].reason).toBe('RESUBMITTED');
    expect((await get('/api/requests/inbox', sc.people.dir.headers)).body).toHaveLength(1);
  });

  it('annulation par l\'agent : possible en cours de traitement, impossible une fois approuvée', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const cancelled = await post(`/api/access/requests/${r.id}/cancel`, sc.agent.headers);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await get('/api/requests/inbox', sc.people.dir.headers)).body).toEqual([]);
    expect((await post(`/api/access/requests/${r.id}/cancel`, sc.agent.headers)).status).toBe(409);

    const r2 = await submitDecisionRequest(sc);
    await approveDecisionRequest(sc, r2.id);
    expect((await post(`/api/access/requests/${r2.id}/cancel`, sc.agent.headers)).status).toBe(409);
  });

  it('empêche les doublons : une seule demande en cours par année, et aucune si une décision valide existe', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const dup = await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() });
    expect(dup.status).toBe(422);
    expect(dup.body.errors.year).toMatch(/déjà en cours/);
    await approveDecisionRequest(sc, r.id);
    const after = await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() });
    expect(after.body.errors.year).toMatch(/décision de congé valide existe/);
  });

  it('bloque le dépôt si un poste du circuit est vacant, avec l\'explication', async () => {
    const sc = await scenario({ fillPositions: false });
    const c = await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() });
    const res = await post(`/api/access/requests/${c.body.id}/submit`, sc.agent.headers);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WORKFLOW_UNRESOLVED');
    expect(res.body.unresolved.length).toBeGreaterThan(0);
    expect((await prisma.request.findUnique({ where: { id: c.body.id } }))!.status).toBe('DRAFT'); // rien n'est parti à moitié
    expect(await prisma.requestStep.count()).toBe(0);
  });

  it('numérote les références de façon unique et continue, y compris sous charge', async () => {
    const sc = await scenario();
    const created = await Promise.all(Array.from({ length: 6 }, (_, i) => post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: 'x' } }).then(() => i)));
    expect(created).toHaveLength(6);
    const types = (await get('/api/absence-types', sc.H)).body;
    const fam = types.find((t: any) => t.code === 'EVENEMENT_FAMILIAL');
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: fam.id, startDate: inDays(30 + i * 3), motif: 'des raisons de famille' } })));
    expect(results.map(r => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    const refs = results.map(r => r.body.reference).sort();
    expect(new Set(refs).size).toBe(6);
    expect(refs[0]).toMatch(/^AA-\d{4}-000001$/);
    expect(refs[5]).toMatch(/^AA-\d{4}-000006$/);
  });
});

describe('demande de jouissance de congé', () => {
  async function withDecision(sc: Scenario) {
    const r = await submitDecisionRequest(sc);
    await approveDecisionRequest(sc, r.id);
    return (await prisma.leaveDecision.findFirstOrThrow()).id;
  }
  const jc = (sc: Scenario, fields: any) => post('/api/access/requests', sc.agent.headers, { typeCode: 'JOUISSANCE_CONGE', fields });

  it('refuse sans décision préalable', async () => {
    const sc = await scenario();
    const res = await jc(sc, { startDate: inDays(10), endDate: inDays(39), destination: 'au Burkina Faso' });
    expect(res.status).toBe(422);
    expect(res.body.errors.leaveDecisionId).toMatch(/décision de congé préalable/);
  });

  it('refuse la décision d\'un autre agent, une décision annulée, des dates incohérentes ou un dépassement', async () => {
    const sc = await scenario();
    const decisionId = await withDecision(sc);
    const base = { leaveDecisionId: decisionId, destination: 'au Burkina Faso et en Côte d\'Ivoire' };
    expect((await jc(sc, { ...base, startDate: inDays(10), endDate: inDays(5) })).body.errors.endDate).toMatch(/précède/);
    expect((await jc(sc, { ...base, startDate: '2020-01-01', endDate: '2020-01-30' })).body.errors.startDate).toMatch(/passé/);
    expect((await jc(sc, { ...base, startDate: inDays(10), endDate: inDays(50) })).body.errors.endDate).toMatch(/supérieure aux 30 jour/);
    expect((await jc(sc, { ...base, startDate: 'nimporte', endDate: inDays(5) })).status).toBe(422);
    // décision d'un autre agent
    const other = await createAgent(sc.H, { matricule: 'ZZ-1' });
    const foreign = await prisma.leaveDecision.create({ data: { companyId: sc.t.company.id, agentId: other.id, number: 'X-1', year: 2026, days: 30 } });
    expect((await jc(sc, { ...base, leaveDecisionId: foreign.id, startDate: inDays(10), endDate: inDays(20) })).status).toBe(422);
    await prisma.leaveDecision.update({ where: { id: decisionId }, data: { status: 'CANCELLED' } });
    expect((await jc(sc, { ...base, startDate: inDays(10), endDate: inDays(20) })).body.errors.leaveDecisionId).toMatch(/plus valide|préalable/);
  });

  it('suit le circuit court (avis du chef RH, décision du chef de service) et consomme les jours de la décision', async () => {
    const sc = await scenario();
    const decisionId = await withDecision(sc);
    const start = inDays(10), end = inDays(39); // 30 jours calendaires
    const c = await jc(sc, { leaveDecisionId: decisionId, startDate: start, endDate: end, destination: "au Burkina Faso et en Côte d'Ivoire" });
    expect(c.status).toBe(201);
    expect(c.body.data.durationDays).toBe(30);
    const sub = await post(`/api/access/requests/${c.body.id}/submit`, sc.agent.headers);
    expect(sub.body.reference).toMatch(/^JC-/);
    expect(sub.body.progress.map((s: any) => s.label)).toEqual(['Avis de Monsieur le Chef du Service des Ressources Humaines', 'Décision de Monsieur le Chef de Service Développement des Applications']);
    // le Ministre ni le Directeur n'interviennent
    expect((await get('/api/requests/inbox', sc.people.minister.headers)).body).toEqual([]);
    const a = (await get('/api/requests/inbox', sc.people.rh.headers)).body[0];
    await act(sc, sc.people.rh, sub.body.id, a.activeStep.id, { action: 'FAVORABLE' });
    const d = (await get('/api/requests/inbox', sc.people.svc.headers)).body[0];
    const fin = await act(sc, sc.people.svc, sub.body.id, d.activeStep.id, { action: 'APPROVE' });
    expect(fin.body.status).toBe('APPROVED');
    // les 30 jours sont consommés : une seconde période est refusée
    const more = await jc(sc, { leaveDecisionId: decisionId, startDate: inDays(60), endDate: inDays(62), destination: 'au Burkina Faso' });
    expect(more.status).toBe(422);
    expect(more.body.errors.endDate).toMatch(/restant/);
    expect((await get('/api/access/decisions', sc.agent.headers)).body).toEqual([]);
  });

  it('détecte le chevauchement avec une autre demande de l\'agent', async () => {
    const sc = await scenario();
    const decisionId = await withDecision(sc);
    const c = await jc(sc, { leaveDecisionId: decisionId, startDate: inDays(10), endDate: inDays(19), destination: 'au Burkina Faso' });
    await post(`/api/access/requests/${c.body.id}/submit`, sc.agent.headers);
    const overlap = await jc(sc, { leaveDecisionId: decisionId, startDate: inDays(15), endDate: inDays(24), destination: 'au Burkina Faso' });
    expect(overlap.status).toBe(422);
    expect(overlap.body.errors.startDate).toMatch(/chevauche/);
    const types = (await get('/api/absence-types', sc.H)).body;
    const fam = types.find((t: any) => t.code === 'EVENEMENT_FAMILIAL');
    const abs = await post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: fam.id, startDate: inDays(12), motif: 'des raisons de famille' } });
    expect(abs.body.errors.startDate).toMatch(/chevauche/);
  });
});

describe('autorisation d\'absence', () => {
  const abs = async (sc: Scenario, fields: any) => {
    const types = (await get('/api/absence-types', sc.H)).body;
    const fam = types.find((t: any) => t.code === 'EVENEMENT_FAMILIAL');
    return post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: fam.id, motif: 'des raisons de famille', ...fields } });
  };

  it('accepte une absence en heures et rend le document avec la durée en lettres', async () => {
    const sc = await scenario();
    const created = await abs(sc, { startDate: inDays(5), durationHours: 24 });
    expect(created.status).toBe(201);
    const sub = await post(`/api/access/requests/${created.body.id}/submit`, sc.agent.headers);
    expect(sub.body.reference).toMatch(/^AA-/);
    const html = await documentService.renderHtml(created.body.id, 1);
    expect(html).toContain('vingt-quatre (24) heures');
    expect(html).toContain('pour la journée du');
    expect(html).toContain('pour des raisons de famille');
    expect(html).toContain('M-0001');
    // son propre circuit : avis RH puis décision du chef de service
    expect(sub.body.progress.map((s: any) => s.kind)).toEqual(['AVIS', 'DECISION']);
  });

  it('valide type, dates, heures et motif', async () => {
    const sc = await scenario();
    expect((await abs(sc, { startDate: inDays(5), durationHours: 0 })).body.errors.durationHours).toMatch(/invalide/);
    expect((await abs(sc, { startDate: inDays(5), durationHours: 50 })).body.errors.durationHours).toMatch(/supérieure/);
    expect((await abs(sc, { startDate: inDays(5), endDate: inDays(3) })).body.errors.endDate).toMatch(/précède/);
    expect((await abs(sc, { startDate: '2020-01-01' })).body.errors.startDate).toMatch(/passé/);
    expect((await abs(sc, { startDate: inDays(5), motif: 'x' })).body.errors.motif).toBeTruthy();
    const none = await post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: 'inconnu', startDate: inDays(5), motif: 'raison valable' } });
    expect(none.body.errors.absenceTypeId).toBeTruthy();
    // type en jours uniquement : les heures sont refusées ; type en heures : obligatoires
    await post('/api/absence-types', sc.H, { code: 'JOURS', name: 'Jours entiers', unit: 'JOUR' });
    await post('/api/absence-types', sc.H, { code: 'HEURES', name: 'Heures', unit: 'HEURE' });
    const types = (await get('/api/absence-types', sc.H)).body;
    const j = types.find((t: any) => t.code === 'JOURS'), h = types.find((t: any) => t.code === 'HEURES');
    const f = (t: any, extra: any) => post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: t.id, startDate: inDays(8), motif: 'raison valable', ...extra } });
    expect((await f(j, { durationHours: 4 })).body.errors.durationHours).toMatch(/jours entiers/);
    expect((await f(h, {})).body.errors.durationHours).toMatch(/obligatoire/);
    expect((await f(j, {})).status).toBe(201);
  });

  it('administre les types d\'absence : code unique, modification, désactivation', async () => {
    const sc = await scenario();
    expect((await post('/api/absence-types', sc.H, { code: 'evenement_familial', name: 'Doublon', unit: 'JOUR' })).status).toBe(409);
    const types = (await get('/api/absence-types?all=true', sc.H)).body;
    expect(types.map((t: any) => t.code)).toEqual(expect.arrayContaining(['EVENEMENT_FAMILIAL', 'ACTIVITE_SYNDICALE', 'MISSION_INTERET_NATIONAL', 'AUTRE']));
    expect(types.find((t: any) => t.code === 'EVENEMENT_FAMILIAL')).toMatchObject({ annualCap: 10, deductsFromLeave: false });
    expect(types.find((t: any) => t.code === 'ACTIVITE_SYNDICALE').annualCap).toBeNull(); // hors plafond (art. 57)
    const fam = types.find((t: any) => t.code === 'EVENEMENT_FAMILIAL');
    await request(app).put(`/api/absence-types/${fam.id}`).set(sc.H).send({ name: 'Événement familial', unit: 'BOTH', annualCap: 12, isActive: false });
    expect((await get('/api/absence-types', sc.H)).body.map((t: any) => t.code)).not.toContain('EVENEMENT_FAMILIAL');
  });
});

describe('délégations', () => {
  it('le délégataire traite l\'étape pendant la délégation, plus après, et seulement pour les démarches visées', async () => {
    const sc = await scenario();
    const past = new Date(Date.now() - 2 * 86400000).toISOString(), soon = new Date(Date.now() + 86400000).toISOString();
    // délégation expirée
    await post('/api/delegations', sc.H, { positionId: sc.positions.CHEF_DLE, delegateId: sc.people.other.id, startsAt: new Date(Date.now() - 5 * 86400000).toISOString(), endsAt: past });
    // délégation active mais limitée à une autre démarche
    await post('/api/delegations', sc.H, { positionId: sc.positions.CHEF_DLE, delegateId: sc.people.svc.id, startsAt: past, endsAt: soon, requestTypes: ['AUTORISATION_ABSENCE'] });
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    expect((await act(sc, sc.people.other, r.id, s1.id, { action: 'FAVORABLE' })).status).toBe(403);
    expect((await act(sc, sc.people.svc, r.id, s1.id, { action: 'FAVORABLE' })).status).toBe(403);
    // délégation active et couvrant la démarche
    await post('/api/delegations', sc.H, { positionId: sc.positions.CHEF_DLE, delegateId: sc.people.other.id, startsAt: past, endsAt: soon, requestTypes: ['DECISION_CONGE'] });
    expect((await get('/api/requests/inbox', sc.people.other.headers)).body).toHaveLength(1);
    const ok = await act(sc, sc.people.other, r.id, s1.id, { action: 'FAVORABLE' });
    expect(ok.status).toBe(200);
    expect(ok.body.progress[0].actorName).toBe('Olivia Autre'); // trace du délégataire réel
  });
});

describe('pièces justificatives', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const upload = (sc: Scenario, id: string, buf: Buffer, mime: string, name = 'piece.pdf', code?: string) =>
    request(app).post(`/api/access/requests/${id}/attachments`).set(sc.agent.headers).field('code', code || '').attach('file', buf, { filename: name, contentType: mime });

  it('accepte un PDF ou une image, refuse un faux type, un format interdit et un fichier trop gros', async () => {
    const sc = await scenario();
    const c = (await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).body;
    expect((await upload(sc, c.id, pdf, 'application/pdf', 'decision.pdf')).status).toBe(201);
    expect((await upload(sc, c.id, png, 'image/png', 'timbre.png', 'ETIMBRE')).status).toBe(201);
    // faux PDF (contenu exécutable déguisé)
    expect((await upload(sc, c.id, Buffer.from('MZ\x90\x00 malware'), 'application/pdf', 'faux.pdf')).status).toBe(415);
    expect((await upload(sc, c.id, pdf, 'text/html', 'page.html')).status).toBe(415);
    expect((await upload(sc, c.id, Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]), 'application/pdf', 'gros.pdf')).status).toBe(400); // plafond de 5 Mo (erreur multer → 400)
    expect((await upload(sc, c.id, pdf, 'application/pdf', 'x.pdf', 'CODE_INCONNU')).status).toBe(400);
    const view = (await get(`/api/access/requests/${c.id}`, sc.agent.headers)).body;
    expect(view.attachments.map((a: any) => a.name).sort()).toEqual(['decision.pdf', 'timbre.png']);
  });

  it('bloque le dépôt si une pièce obligatoire manque (règle administrable)', async () => {
    const sc = await scenario();
    const types = (await get('/api/request-types', sc.H)).body;
    const dc = types.find((t: any) => t.code === 'DECISION_CONGE');
    const upd = await request(app).put(`/api/request-types/${dc.id}`).set(sc.H).send({ attachmentRules: [{ code: 'ETIMBRE', label: 'Reçu du timbre électronique', required: true }] });
    expect(upd.status).toBe(200);
    const c = (await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).body;
    const refused = await post(`/api/access/requests/${c.id}/submit`, sc.agent.headers);
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('ATTACHMENTS_MISSING');
    await upload(sc, c.id, pdf, 'application/pdf', 'recu.pdf', 'ETIMBRE');
    expect((await post(`/api/access/requests/${c.id}/submit`, sc.agent.headers)).status).toBe(200);
  });

  it('verrouille les pièces après le dépôt ; le responsable les télécharge, pas un tiers', async () => {
    const sc = await scenario();
    const c = (await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).body;
    const att = (await upload(sc, c.id, pdf, 'application/pdf', 'decision.pdf')).body;
    await post(`/api/access/requests/${c.id}/submit`, sc.agent.headers);
    expect((await upload(sc, c.id, pdf, 'application/pdf', 'autre.pdf')).status).toBe(409);
    expect((await request(app).delete(`/api/access/requests/${c.id}/attachments/${att.id}`).set(sc.agent.headers)).status).toBe(409);
    const dl = await request(app).get(`/api/requests/${c.id}/attachments/${att.id}`).set(sc.people.dir.headers).buffer(true).parse((r, cb) => { const d: Buffer[] = []; r.on('data', x => d.push(x)); r.on('end', () => cb(null, Buffer.concat(d))); });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect((dl.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await get(`/api/requests/${c.id}/attachments/${att.id}`, sc.people.other.headers)).status).toBe(404);
  });

  it('stocke les fichiers hors du dossier public', async () => {
    const sc = await scenario();
    const c = (await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).body;
    await upload(sc, c.id, pdf, 'application/pdf', 'decision.pdf');
    const row = await prisma.requestAttachment.findFirstOrThrow();
    expect(row.path).toMatch(/^attachments\//);
    expect(row.path).not.toMatch(/uploads/);
    expect((await request(app).get('/uploads/' + row.path)).status).toBe(404);
  });
});

describe('contrôle d\'accès aux dossiers', () => {
  it('chaque acteur ne voit que les demandes qui le concernent ; les consultations sont journalisées', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    // participants du circuit et administrateur : accès
    for (const who of [sc.people.dir, sc.people.minister, sc.people.sg]) expect((await get(`/api/requests/${r.id}`, who.headers)).status).toBe(200);
    expect((await get(`/api/requests/${r.id}`, sc.H)).status).toBe(200);
    // collègue sans rôle dans le circuit, autre société : 404
    expect((await get(`/api/requests/${r.id}`, sc.people.other.headers)).status).toBe(404);
    const stranger = await makeTenant();
    expect((await get(`/api/requests/${r.id}`, stranger.headers)).status).toBe(404);
    expect((await get(`/api/requests/${r.id}/document`, sc.people.other.headers)).status).toBe(404);
    // consultation tracée
    const views = await prisma.auditLog.findMany({ where: { action: 'REQUEST_VIEWED', entityId: r.id } });
    expect(views.length).toBeGreaterThanOrEqual(4);
    expect(views.map(v => v.actorId)).toContain(sc.people.dir.id);
    // recherche : le collègue ne trouve rien, le directeur trouve la demande
    expect((await get('/api/requests', sc.people.other.headers)).body.total).toBe(0);
    expect((await get('/api/requests', sc.people.dir.headers)).body.total).toBe(1);
    expect((await get('/api/requests', sc.H)).body.total).toBe(1);
    expect((await get('/api/requests', stranger.headers)).body.total).toBe(0);
  });

  it('un agent ne voit que ses propres demandes', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const other = await createAgent(sc.H, { matricule: 'AG-2', orgUnitId: sc.units.SDA, supervisorId: sc.people.svc.id });
    const card = await (await import('./helpers')).issueCard(sc.H, other.id);
    const pin = (await post(`/api/agents/${other.id}/pin/reset`, sc.H)).body.pin;
    const session = (await post(`/api/access/${card.token}/pin`, {}, { pin })).body.sessionToken;
    expect((await get(`/api/access/requests/${r.id}`, auth(session))).status).toBe(404);
    expect((await get(`/api/access/requests/${r.id}/document`, auth(session))).status).toBe(404);
    expect((await get('/api/access/requests', auth(session))).body).toEqual([]);
    expect((await get('/api/access/requests', sc.agent.headers)).body).toHaveLength(1);
    expect((await post(`/api/access/requests/${r.id}/cancel`, auth(session))).status).toBe(404);
  });

  it('sépare les sessions : le jeton agent n\'ouvre pas l\'API des responsables, et inversement', async () => {
    const sc = await scenario();
    expect((await get('/api/requests/inbox', sc.agent.headers)).status).toBe(401);
    expect((await get('/api/requests', sc.agent.headers)).status).toBe(401);
    expect((await get('/api/access/requests', sc.H)).status).toBe(401);
    expect((await get('/api/access/services', sc.people.dir.headers)).status).toBe(401);
    expect((await get('/api/access/requests', {})).status).toBe(401);
  });

  it('une carte révoquée coupe immédiatement l\'accès aux démarches, session en cours comprise', async () => {
    const sc = await scenario();
    expect((await get('/api/access/services', sc.agent.headers)).status).toBe(200);
    await post(`/api/cards/${sc.agent.cardId}/revoke`, sc.H, { reason: 'Fraude suspectée' });
    for (const path of ['/api/access/services', '/api/access/requests', '/api/access/decisions']) {
      expect((await get(path, sc.agent.headers)).status).toBe(404);
    }
    expect((await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).status).toBe(404);
  });

  it('recherche multicritère : référence, nom, matricule, type, statut, unité, période', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const q = async (qs: string) => (await get('/api/requests?' + qs, sc.H)).body.total;
    expect(await q('q=' + r.reference)).toBe(1);
    expect(await q('q=' + encodeURIComponent('Koné'))).toBe(1);
    expect(await q('q=M-0001')).toBe(1);
    expect(await q('q=inconnu')).toBe(0);
    expect(await q('typeCode=DECISION_CONGE')).toBe(1);
    expect(await q('typeCode=AUTORISATION_ABSENCE')).toBe(0);
    expect(await q('status=IN_PROGRESS')).toBe(1);
    expect(await q('status=APPROVED')).toBe(0);
    expect(await q(`orgUnitId=${sc.units.DGSI}`)).toBe(1); // sous-arbre de la DG
    expect(await q(`orgUnitId=${sc.units.SG}`)).toBe(1);
    expect(await q(`from=${today()}T00:00:00Z&to=${inDays(1)}T00:00:00Z`)).toBe(1);
    expect(await q(`from=${inDays(2)}T00:00:00Z`)).toBe(0);
  });
});

describe('documents', () => {
  it('conserve toutes les versions et leurs empreintes ; le téléchargement est tracé', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    await act(sc, sc.people.dir, r.id, s1.id, { action: 'FAVORABLE' });
    const docs = await prisma.requestDocument.findMany({ where: { requestId: r.id }, orderBy: { version: 'asc' } });
    expect(docs.map(d => [d.version, d.reason])).toEqual([[1, 'SUBMITTED'], [2, 'STEP']]);
    expect(new Set(docs.map(d => d.sha256)).size).toBe(2); // contenus différents
    const v1 = await request(app).get(`/api/access/requests/${r.id}/documents/1`).set(sc.agent.headers);
    const latest = await request(app).get(`/api/access/requests/${r.id}/document`).set(sc.agent.headers);
    expect(v1.status).toBe(200);
    expect(v1.headers['content-type']).toBe('application/pdf');
    expect(v1.headers['cache-control']).toBe('no-store');
    expect(latest.headers['content-disposition']).toContain(`${r.reference}-v2.pdf`);
    expect((await get(`/api/access/requests/${r.id}/documents/9`, sc.agent.headers)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'REQUEST_DOCUMENT_DOWNLOADED' } })).toBe(2);
  });

  it('le document reflète l\'état du circuit : espaces à signer puis mentions électroniques à empreinte vérifiable', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const before = await documentService.renderHtml(r.id, 1);
    expect(before).toContain('class="space');
    expect(before).not.toContain('Signé électroniquement par Didier');
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    await act(sc, sc.people.dir, r.id, s1.id, { action: 'UNFAVORABLE', comment: 'Réserve sur la période' });
    const after = (await documentService.renderHtml(r.id, 2)).replace(/&#x27;|&#39;/g, "'");
    expect(after).toContain('Signé électroniquement par Didier Directeur');
    expect(after).toContain('Avis défavorable');
    expect(after).toContain('Réserve sur la période');
    const done = (await prisma.requestStep.findUniqueOrThrow({ where: { id: s1.id } }));
    expect(after).toContain(`Empreinte : ${stepFingerprint(r.reference, { order: 1, round: 1, result: 'UNFAVORABLE', comment: 'Réserve sur la période', actorId: sc.people.dir.id, decidedAt: done.decidedAt })}`);
    // les données personnelles du demandeur figurent dans l'en-tête
    expect(after).toContain('KONÉ AWA MARIE');
    expect(after).toContain('Matricule : M-0001');
    expect(after).toContain("à la Direction Générale des Systèmes d'Information");
    expect(after).toContain('E-timbre N° : 1790 8872 0082');
  });

  it('fige les données au dépôt : une modification ultérieure de l\'organisation ne réécrit pas le document', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    await prisma.agentProfile.update({ where: { userId: sc.agent.id }, data: { grade: 'Grade modifié après dépôt' } });
    await prisma.user.update({ where: { id: sc.agent.id }, data: { lastName: 'Changé' } });
    const html = await documentService.renderHtml(r.id, 1);
    expect(html).toContain('KONÉ AWA MARIE');
    expect(html).not.toContain('Grade modifié');
    expect(html).toContain('Ingénieur');
  });

  it('régénère le document à la demande d\'un administrateur uniquement', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    expect((await post(`/api/requests/${r.id}/regenerate`, sc.people.dir.headers)).status).toBe(403);
    const ok = await post(`/api/requests/${r.id}/regenerate`, sc.H);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    expect(ok.body.reason).toBe('REGENERATED');
  });
});

describe('modèles de documents administrables', () => {
  it('publie une nouvelle version sans modifier les anciennes, valide la syntaxe et génère un aperçu', async () => {
    const sc = await scenario();
    const list = (await get('/api/form-templates', sc.H)).body;
    expect(list.map((t: any) => t.typeCode).sort()).toEqual(['AUTORISATION_ABSENCE', 'DECISION_CONGE', 'JOUISSANCE_CONGE']);
    const dc = list.find((t: any) => t.typeCode === 'DECISION_CONGE');
    const v2 = await request(app).put('/api/form-templates/DECISION_CONGE').set(sc.H).send({ html: dc.html.replace('Demande de décision de congé administratif', 'Demande de décision de congé annuel'), css: dc.css });
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);
    const all = (await get('/api/form-templates', sc.H)).body.filter((t: any) => t.typeCode === 'DECISION_CONGE');
    expect(all.map((t: any) => [t.version, t.isActive])).toEqual([[2, true], [1, false]]);
    const bad = await request(app).put('/api/form-templates/DECISION_CONGE').set(sc.H).send({ html: '{{#if x}}jamais fermé', css: '' });
    expect(bad.status).toBe(422);
    expect((await request(app).put('/api/form-templates/INCONNU').set(sc.H).send({ html: 'x', css: '' })).status).toBe(404);
    expect((await get('/api/form-templates/variables', sc.H)).body).toContain('agent.matricule');
    const preview = await request(app).post('/api/form-templates/DECISION_CONGE/preview').set(sc.H).send({ html: dc.html, css: dc.css });
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('application/pdf');
    // un nouveau dépôt utilise le modèle actif
    const r = await submitDecisionRequest(sc);
    expect(await documentService.renderHtml(r.id, 1)).toContain('congé annuel');
  });
});

describe('traçabilité', () => {
  it('journalise chaque événement du cycle de vie et la chaîne d\'audit reste intègre', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    await approveDecisionRequest(sc, r.id);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: r.id }, orderBy: { seq: 'asc' } })).map(a => a.action);
    expect(actions[0]).toBe('REQUEST_CREATED');
    expect(actions).toContain('REQUEST_SUBMITTED');
    expect(actions.filter(a => a === 'REQUEST_STEP_ACTED')).toHaveLength(5);
    const decisive = await prisma.auditLog.findFirst({ where: { entityId: r.id, action: 'REQUEST_STEP_ACTED' }, orderBy: { seq: 'desc' } });
    expect((decisive!.after as any)).toMatchObject({ result: 'APPROVED', status: 'APPROVED', decisionNumber: '2026-14-00001/MEF/SG/DRH' });
    expect(decisive!.actorId).toBe(sc.people.minister.id);
    expect(await auditService.verify()).toMatchObject({ ok: true });
  });
});
