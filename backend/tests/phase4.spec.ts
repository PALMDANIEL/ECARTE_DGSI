import { app, prisma, request, resetDb } from './helpers';
import { scenario, Scenario, act, submitDecisionRequest, approveDecisionRequest, inDays } from './requests-helpers';
import { notifyService } from '../src/modules/notifications/notify.service';
import { escalationService } from '../src/modules/requests/escalation.service';
import { toCsv } from '../src/shared/utils/csv';

beforeEach(resetDb);

const get = (path: string, headers: any) => request(app).get(path).set(headers);
const post = (path: string, headers: any, body?: any) => request(app).post(path).set(headers).send(body ?? {});
const setRule = (sc: Scenario, key: string, value: any) => request(app).put(`/api/settings/rules/${key}`).set(sc.H).send({ value });
const DAY = 86400000;

/** Rend l'étape active en retard de `days` jours et lui donne un poste d'escalade. */
async function makeLate(requestId: string, days: number, escalatePositionId?: string) {
  const step = (await prisma.requestStep.findMany({ where: { requestId, result: 'PENDING' }, orderBy: { order: 'asc' } }))[0];
  await prisma.requestStep.update({ where: { id: step.id }, data: { dueAt: new Date(Date.now() - days * DAY), activatedAt: new Date(Date.now() - (days + 5) * DAY), escalatePositionId: escalatePositionId ?? step.escalatePositionId } });
  return step.id;
}

describe('notifications', () => {
  it('prévient le premier responsable au dépôt, avec lien, et permet de lire / tout lire', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const list = await get('/api/notifications', sc.people.dir.headers);
    expect(list.status).toBe(200);
    expect(list.body.unread).toBe(1);
    expect(list.body.items[0]).toMatchObject({ type: 'REQUEST_ASSIGNED', requestId: r.id, isRead: false });
    expect(list.body.items[0].link).toBe(`/requests?open=${r.id}`);
    expect((await get('/api/notifications/unread-count', sc.people.dir.headers)).body.unread).toBe(1);
    // un autre responsable n'a rien reçu
    expect((await get('/api/notifications', sc.people.dg.headers)).body.total).toBe(0);

    const id = list.body.items[0].id;
    // on ne peut pas marquer la notification d'un autre
    expect((await post(`/api/notifications/${id}/read`, sc.people.dg.headers)).status).toBe(404);
    expect((await post(`/api/notifications/${id}/read`, sc.people.dir.headers)).status).toBe(204);
    expect((await get('/api/notifications/unread-count', sc.people.dir.headers)).body.unread).toBe(0);
    expect((await get('/api/notifications?unread=true', sc.people.dir.headers)).body.items).toHaveLength(0);

    await notifyService.notify({ companyId: sc.t.company.id, userIds: [sc.people.dir.id], type: 'REQUEST_UPDATE', message: 'a' });
    await notifyService.notify({ companyId: sc.t.company.id, userIds: [sc.people.dir.id], type: 'REQUEST_UPDATE', message: 'b' });
    expect((await post('/api/notifications/read-all', sc.people.dir.headers)).body.updated).toBe(2);
    expect((await get('/api/notifications/unread-count', sc.people.dir.headers)).body.unread).toBe(0);
  });

  it('refuse l\'accès sans authentification et à un jeton de session agent', async () => {
    const sc = await scenario();
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await get('/api/notifications', sc.agent.headers)).status).toBe(401);
  });

  it('informe l\'agent à chaque étape et lui donne sa propre liste via la session agent', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const inbox = (await get('/api/requests/inbox', sc.people.dir.headers)).body;
    await act(sc, sc.people.dir, r.id, inbox[0].activeStep.id, { action: 'FAVORABLE' });
    const mine = await get('/api/access/notifications', sc.agent.headers);
    expect(mine.status).toBe(200);
    expect(mine.body.items[0].message).toMatch(/franchi une étape/);
    // le suivant (DG) est prévenu
    expect((await get('/api/notifications', sc.people.dg.headers)).body.unread).toBe(1);
    expect((await post('/api/access/notifications/read-all', sc.agent.headers)).status).toBe(200);
    expect((await get('/api/access/notifications?unread=true', sc.agent.headers)).body.items).toHaveLength(0);
    // les administrateurs ne passent pas par la session agent
    expect((await get('/api/access/notifications', sc.H)).status).toBe(401);
  });

  it('envoie aussi un email si le paramètre est actif, uniquement aux adresses réelles, sans jamais bloquer', async () => {
    const sc = await scenario();
    const sent: { to: string; subject: string; text: string }[] = [];
    notifyService.setSender(async (to, subject, text) => { sent.push({ to, subject, text }); });
    try {
      await prisma.user.update({ where: { id: sc.people.dir.id }, data: { email: 'directeur@exemple.org' } });
      await submitDecisionRequest(sc);
      expect(sent).toHaveLength(0); // désactivé par défaut

      await setRule(sc, 'notify.email_enabled', true);
      await notifyService.notify({ companyId: sc.t.company.id, userIds: [sc.people.dir.id, sc.people.dg.id], type: 'REQUEST_UPDATE', message: 'Bonjour', link: '/requests?open=x' });
      expect(sent).toHaveLength(1); // le DG n'a qu'une adresse technique
      expect(sent[0].to).toBe('directeur@exemple.org');
      expect(sent[0].text).toContain('/requests?open=x');

      notifyService.setSender(async () => { throw new Error('SMTP down'); });
      await expect(notifyService.notify({ companyId: sc.t.company.id, userIds: [sc.people.dir.id], type: 'REQUEST_UPDATE', message: 'Encore' })).resolves.toBe(1);
      expect((await get('/api/notifications', sc.people.dir.headers)).body.items[0].message).toBe('Encore');
    } finally { notifyService.setSender((to, s, t) => new (require('../src/infrastructure/email').EmailService)().send(to, s, t)); }
  });
});

describe('délais, rappels et escalades', () => {
  it('ne fait rien tant que l\'échéance n\'est pas dépassée', async () => {
    const sc = await scenario();
    await submitDecisionRequest(sc);
    expect(await escalationService.run(sc.t.company.id)).toEqual({ reminders: 0, escalations: 0, checked: 0 });
    expect((await get('/api/escalations/overdue', sc.H)).body).toEqual([]);
  });

  it('envoie un seul rappel au responsable en retard, même si le balayage est relancé', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    await makeLate(r.id, 2);
    const first = await escalationService.run(sc.t.company.id);
    expect(first).toMatchObject({ reminders: 1, escalations: 0, checked: 1 });
    const again = await escalationService.run(sc.t.company.id);
    expect(again).toMatchObject({ reminders: 0, escalations: 0 });
    const types = (await get('/api/notifications', sc.people.dir.headers)).body.items.map((n: any) => n.type).sort();
    expect(types).toEqual(['REQUEST_ASSIGNED', 'REQUEST_OVERDUE']);
    const overdue = (await get('/api/escalations/overdue', sc.H)).body;
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ reference: r.reference, daysLate: 2 });
  });

  it('respecte le paramètre qui désactive les rappels', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    await makeLate(r.id, 2);
    await setRule(sc, 'escalation.reminder_enabled', false);
    expect((await escalationService.run(sc.t.company.id)).reminders).toBe(0);
  });

  it('escalade une seule fois après le délai de grâce, prévient le poste d\'escalade et l\'agent, journalise', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const stepId = await makeLate(r.id, 0.5, sc.positions.SECRETAIRE_GENERAL);
    // en retard d'une demi-journée seulement : grâce de 1 jour non atteinte
    expect(await escalationService.run(sc.t.company.id)).toMatchObject({ reminders: 1, escalations: 0 });
    await prisma.requestStep.update({ where: { id: stepId }, data: { dueAt: new Date(Date.now() - 3 * DAY) } });
    expect(await escalationService.run(sc.t.company.id)).toMatchObject({ reminders: 0, escalations: 1 });
    expect(await escalationService.run(sc.t.company.id)).toMatchObject({ escalations: 0 });
    const sgNotifs = (await get('/api/notifications', sc.people.sg.headers)).body.items;
    expect(sgNotifs.map((n: any) => n.type)).toEqual(['REQUEST_ESCALATED']);
    expect((await get('/api/access/notifications', sc.agent.headers)).body.items[0].message).toMatch(/en retard/);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'REQUEST_ESCALATED', entityId: r.id } });
    expect(audit).toBeTruthy();
    expect((await get('/api/audit/verify', sc.H)).body.ok).toBe(true);
  });

  it('un grâce de 0 jour escalade immédiatement ; sans poste d\'escalade, rien n\'est escaladé', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    await setRule(sc, 'escalation.escalate_after_days', 0);
    await makeLate(r.id, 1); // pas de poste d'escalade
    expect(await escalationService.run(sc.t.company.id)).toMatchObject({ escalations: 0 });
    await makeLate(r.id, 1, sc.positions.SECRETAIRE_GENERAL);
    expect(await escalationService.run(sc.t.company.id)).toMatchObject({ escalations: 1 });
  });

  it('le poste d\'escalade peut traiter l\'étape escaladée (et la voir), pas avant, ni si le paramètre l\'interdit', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const stepId = await makeLate(r.id, 3, sc.positions.SECRETAIRE_GENERAL);
    // avant escalade : le SG ne voit pas l'étape et ne peut pas agir
    expect((await get('/api/requests/inbox', sc.people.sg.headers)).body).toHaveLength(0);
    expect((await act(sc, sc.people.sg, r.id, stepId, { action: 'FAVORABLE' })).status).toBe(403);

    await escalationService.run(sc.t.company.id);
    const inbox = (await get('/api/requests/inbox', sc.people.sg.headers)).body;
    expect(inbox).toHaveLength(1);
    expect(inbox[0].activeStep.overdue).toBe(true);
    expect((await get(`/api/requests/${r.id}`, sc.people.sg.headers)).status).toBe(200);

    await setRule(sc, 'escalation.substitute_can_act', false);
    expect((await get('/api/requests/inbox', sc.people.sg.headers)).body).toHaveLength(0);
    expect((await act(sc, sc.people.sg, r.id, stepId, { action: 'FAVORABLE' })).status).toBe(403);

    await setRule(sc, 'escalation.substitute_can_act', true);
    const ok = await act(sc, sc.people.sg, r.id, stepId, { action: 'FAVORABLE' });
    expect(ok.status).toBe(200);
    // l'acteur réel est tracé (le SG, pas le directeur)
    const done = await prisma.requestStep.findUniqueOrThrow({ where: { id: stepId } });
    expect(done.actorId).toBe(sc.people.sg.id);
  });

  it('ne concerne que les administrateurs pour la liste et le déclenchement manuel', async () => {
    const sc = await scenario();
    expect((await get('/api/escalations/overdue', sc.people.dir.headers)).status).toBe(403);
    expect((await post('/api/escalations/run', sc.people.dir.headers)).status).toBe(403);
    expect((await post('/api/escalations/run', sc.H)).body).toEqual({ reminders: 0, escalations: 0, checked: 0 });
  });

  it('copie le poste d\'escalade du circuit publié dans les étapes de la demande', async () => {
    const sc = await scenario();
    const wf = (await get('/api/workflows/DECISION_CONGE', sc.H)).body[0];
    const steps = wf.steps.map((s: any) => ({ kind: s.kind, resolution: s.resolution, positionId: s.positionId, unitType: s.unitType, level: s.level, deadlineDays: s.deadlineDays, escalatePositionId: s.kind === 'DECISION' ? null : sc.positions.SECRETAIRE_GENERAL }));
    const pub = await post('/api/workflows/DECISION_CONGE', sc.H, { steps });
    expect(pub.status).toBe(201);
    const r = await submitDecisionRequest(sc);
    const first = (await prisma.requestStep.findMany({ where: { requestId: r.id }, orderBy: { order: 'asc' } }));
    expect(first[0].escalatePositionId).toBe(sc.positions.SECRETAIRE_GENERAL);
    expect(first[first.length - 1].escalatePositionId).toBeNull();
  });
});

describe('statistiques', () => {
  async function seed() {
    const sc = await scenario();
    const approved = await submitDecisionRequest(sc);
    await approveDecisionRequest(sc, approved.id);
    // une demande d'absence en cours
    const types = (await get('/api/access/absence-types', sc.agent.headers)).body;
    const t = types.find((x: any) => x.maxDaysPerYear !== undefined) || types[0];
    const c = await post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: t.id, startDate: inDays(3), endDate: inDays(4), motif: 'Événement familial' } });
    expect(c.status).toBe(201);
    const s = await post(`/api/access/requests/${c.body.id}/submit`, sc.agent.headers);
    expect(s.status).toBe(200);
    return { sc, approved, absence: s.body };
  }

  it('compte les demandes par statut, type, unité et mois pour un administrateur', async () => {
    const { sc } = await seed();
    const o = (await get('/api/stats/overview', sc.H)).body;
    expect(o.scope).toBe('COMPANY');
    expect(o.requests).toMatchObject({ submitted: 2, pending: 1, approved: 1, rejected: 0, returned: 0, cancelled: 0 });
    expect(o.requests.byType.map((t: any) => t.code).sort()).toEqual(['AUTORISATION_ABSENCE', 'DECISION_CONGE']);
    expect(o.requests.byType.find((t: any) => t.code === 'DECISION_CONGE')).toMatchObject({ count: 1, approved: 1 });
    expect(o.requests.byUnit[0]).toMatchObject({ count: 2 });
    expect(o.requests.byMonth).toHaveLength(1);
    expect(o.processing.byStep.length).toBeGreaterThanOrEqual(5);
    expect(o.processing.avgDays).not.toBeNull();
    expect(o.cards).toMatchObject({ total: 1, active: 1, revoked: 0 });
  });

  it('filtre par type, statut, période, unité, agent et autorité', async () => {
    const { sc } = await seed();
    const q = async (qs: string) => (await get(`/api/stats/requests?${qs}`, sc.H)).body;
    expect(await q('typeCode=DECISION_CONGE')).toHaveLength(1);
    expect(await q('status=IN_PROGRESS')).toHaveLength(1);
    expect(await q('status=APPROVED')).toHaveLength(1);
    expect(await q(`orgUnitId=${sc.units.SDA}`)).toHaveLength(2);
    expect(await q(`orgUnitId=${sc.units.SG}`)).toHaveLength(2); // sous-arbre inclus
    expect(await q(`orgUnitId=${sc.units.DGSI}`)).toHaveLength(2);
    expect(await q(`agentId=${sc.people.other.id}`)).toHaveLength(0);
    expect(await q(`agentId=${sc.agent.id}`)).toHaveLength(2);
    expect(await q(`positionId=${sc.positions.MINISTRE}`)).toHaveLength(1);
    const y = new Date().getUTCFullYear();
    expect(await q(`from=${y}-01-01&to=${y}-12-31`)).toHaveLength(2);
    expect(await q(`from=${y - 3}-01-01&to=${y - 2}-12-31`)).toHaveLength(0);
    expect((await get('/api/stats/requests?status=NOPE', sc.H)).status).toBe(400);
    expect((await get('/api/stats/requests?from=abc', sc.H)).status).toBe(400);
    expect((await get(`/api/stats/requests?from=${y}-12-31&to=${y}-01-01`, sc.H)).status).toBe(400);
  });

  it('cloisonne : un responsable ne voit que les demandes de son circuit, un tiers rien, les soldes sont réservés aux admins', async () => {
    const { sc } = await seed();
    const dir = (await get('/api/stats/overview', sc.people.dir.headers)).body;
    expect(dir.scope).toBe('INVOLVED');
    expect(dir.requests.submitted).toBe(1); // la décision de congé (il a donné son avis), pas l'absence
    expect(dir.cards).toBeUndefined();
    const minister = (await get('/api/stats/requests', sc.people.minister.headers)).body;
    expect(minister).toHaveLength(1);
    const stranger = (await get('/api/stats/overview', sc.people.other.headers)).body;
    expect(stranger.requests.submitted).toBe(0);
    expect((await get('/api/stats/balances', sc.people.dir.headers)).status).toBe(403);
    expect((await get('/api/stats/balances.csv', sc.people.dir.headers)).status).toBe(403);
    expect((await get('/api/stats/overview', sc.agent.headers)).status).toBe(401);
    expect((await request(app).get('/api/stats/overview')).status).toBe(401);
  });

  it('ne mélange pas les sociétés', async () => {
    const { sc } = await seed();
    const other = await scenario();
    const o = (await get('/api/stats/overview', other.H)).body;
    expect(o.requests.submitted).toBe(0);
    expect((await get(`/api/stats/requests?orgUnitId=${sc.units.SDA}`, other.H)).body).toHaveLength(0);
  });

  it('présente les soldes par agent (acquis, autorisés, consommés, solde)', async () => {
    const { sc } = await seed();
    const rows = (await get('/api/stats/balances', sc.H)).body;
    const me = rows.find((r: any) => r.agentId === sc.agent.id);
    expect(me).toMatchObject({ matricule: 'M-0001', acquired: 30, authorized: 30, consumed: 0, remaining: 30 });
    expect((await get(`/api/stats/balances?orgUnitId=${sc.units.DLE}`, sc.H)).body.find((r: any) => r.agentId === sc.agent.id)).toBeTruthy();
  });

  it('exporte en CSV avec BOM et neutralise les formules', async () => {
    const { sc } = await seed();
    const r = await get('/api/stats/requests.csv', sc.H);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text.charCodeAt(0)).toBe(0xFEFF);
    expect(r.text.split('\r\n').filter(Boolean)).toHaveLength(3);
    const b = await get('/api/stats/balances.csv', sc.H);
    expect(b.text).toContain('M-0001');
    expect(toCsv(['a'], [['=HYPERLINK("x")'], ['+1'], [-5], ['a;b'], ['ok']])).toBe('﻿a\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n-5\r\n"a;b"\r\nok\r\n');
  });
});
