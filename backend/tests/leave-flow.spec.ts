import { app, prisma, request, resetDb, auth, makeTenant, makeUser, createAgent, tokenFor } from './helpers';
import { scenario, Scenario, act, dcFields, submitDecisionRequest, approveDecisionRequest, inDays } from './requests-helpers';
import { leaveService, LEAVE_TYPE } from '../src/modules/leave/leave.service';
import { rulesService } from '../src/modules/settings/rules.service';

beforeEach(resetDb);

const post = (path: string, headers: any, body?: any) => request(app).post(path).set(headers).send(body ?? {});
const get = (path: string, headers: any) => request(app).get(path).set(headers);
const put = (path: string, headers: any, body?: any) => request(app).put(path).set(headers).send(body ?? {});
const setRule = (sc: Scenario, key: string, value: any) => put(`/api/settings/rules/${key}`, sc.H, { value });
const year = () => new Date().getUTCFullYear();

/** Obtient une décision de congé approuvée pour l'agent du scénario. */
async function withDecision(sc: Scenario) {
  const r = await submitDecisionRequest(sc);
  await approveDecisionRequest(sc, r.id);
  return prisma.leaveDecision.findFirstOrThrow({ where: { agentId: sc.agent.id } });
}
const jc = (sc: Scenario, fields: any) => post('/api/access/requests', sc.agent.headers, { typeCode: 'JOUISSANCE_CONGE', fields: { destination: 'au Burkina Faso', ...fields } });
const submit = (sc: Scenario, id: string) => post(`/api/access/requests/${id}/submit`, sc.agent.headers);
async function absenceType(sc: Scenario, code: string) {
  return (await get('/api/absence-types?all=true', sc.H)).body.find((t: any) => t.code === code);
}
const aa = async (sc: Scenario, code: string, fields: any) => {
  const t = await absenceType(sc, code);
  return post('/api/access/requests', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: t.id, motif: 'des raisons de famille', ...fields } });
};
/** Traite une demande d'absence jusqu'à son approbation (circuit court : avis RH puis chef de service). */
async function approveShort(sc: Scenario, id: string) {
  for (const who of [sc.people.rh, sc.people.svc]) {
    const item = (await get('/api/requests/inbox', who.headers)).body.find((r: any) => r.id === id);
    const res = await act(sc, who, id, item.activeStep.id, { action: who === sc.people.rh ? 'FAVORABLE' : 'APPROVE' });
    if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  }
}

describe('paramètres typés et régimes', () => {
  it('valide le type, les choix et le format de chaque paramètre', async () => {
    const t = await makeTenant();
    const p = (k: string, v: any) => put(`/api/settings/rules/${k}`, t.headers, { value: v });
    expect((await p('leave.proration_enabled', true)).status).toBe(200);
    expect((await p('leave.proration_enabled', 'oui')).status).toBe(400);
    expect((await p('leave.count_mode', 'WORKING')).status).toBe(200);
    expect((await p('leave.count_mode', 'HEBDO')).status).toBe(400);
    expect((await p('leave.reference_period_start', '07-01')).status).toBe(200);
    expect((await p('leave.reference_period_start', '13-45')).status).toBe(400);
    expect((await p('calendar.weekend_days', '5,6')).status).toBe(200);
    expect((await p('calendar.weekend_days', 'samedi')).status).toBe(400);
    expect((await p('leave.annual_days', -5)).status).toBe(400);
    expect((await p('leave.inconnu', 1)).status).toBe(400);
  });

  it('liste les paramètres groupés avec leur référence légale vérifiée, et gère les surcharges par régime', async () => {
    const t = await makeTenant();
    const list = (await get('/api/settings/rules', t.headers)).body;
    expect(list.regimes).toEqual(['FONCTIONNAIRE', 'CONTRACTUEL', 'ENSEIGNANT']);
    const annual = list.rules.find((r: any) => r.key === 'leave.annual_days');
    expect(annual).toMatchObject({ value: 30, group: 'Congé annuel', type: 'number', legalReference: 'Loi 081-2015/CNT, art. 53' });
    expect(list.rules.find((r: any) => r.key === 'absence.hours_per_day').value).toBe(24);
    expect(list.rules.find((r: any) => r.key === 'leave.proration_enabled').value).toBe(false); // pas de proratisation par défaut

    expect((await put('/api/settings/rules/leave.annual_days@CONTRACTUEL', t.headers, { value: 24, comment: 'Code du travail' })).status).toBe(200);
    expect((await put('/api/settings/rules/leave.annual_days@MARTIEN', t.headers, { value: 24 })).status).toBe(400);
    expect(await rulesService.get(t.company.id, 'leave.annual_days', new Date(), 'CONTRACTUEL')).toBe(24);
    expect(await rulesService.get(t.company.id, 'leave.annual_days', new Date(), 'FONCTIONNAIRE')).toBe(30);
    expect(await rulesService.get(t.company.id, 'leave.annual_days', new Date(), 'ENSEIGNANT')).toBe(30); // repli sur la valeur de base
    const after = (await get('/api/settings/rules', t.headers)).body;
    expect(after.overrides).toHaveLength(1);
    expect(after.overrides[0]).toMatchObject({ key: 'leave.annual_days@CONTRACTUEL', regime: 'CONTRACTUEL', value: 24 });
    expect((await request(app).delete('/api/settings/rules/leave.annual_days@CONTRACTUEL').set(t.headers)).status).toBe(204);
    expect(await rulesService.get(t.company.id, 'leave.annual_days', new Date(), 'CONTRACTUEL')).toBe(30);
    expect((await request(app).delete('/api/settings/rules/leave.annual_days').set(t.headers)).status).toBe(400); // la base ne se supprime pas
  });
});

describe('droit annuel au congé (loi 081-2015/CNT, art. 53)', () => {
  const setProfile = (sc: Scenario, data: any) => prisma.agentProfile.update({ where: { userId: sc.agent.id }, data });

  it('ouvre 30 jours après 11 mois de services accomplis, sinon indique la date d\'ouverture du droit', async () => {
    const sc = await scenario();
    expect(await leaveService.entitlement(sc.agent.id, 2026)).toMatchObject({ eligible: true, days: 30, serviceStart: '2015-01-01', eligibleFrom: '2015-12-01' });

    await setProfile(sc, { serviceStartDate: new Date('2026-03-01T00:00:00Z'), hireDate: null });
    const early = await leaveService.entitlement(sc.agent.id, 2026);
    expect(early).toMatchObject({ eligible: false, days: 0, eligibleFrom: '2027-02-01' });
    expect(early.reason).toMatch(/11 mois de services accomplis requis.*01\/02\/2027/);
    expect(await leaveService.entitlement(sc.agent.id, 2027)).toMatchObject({ eligible: true, days: 30 });
    expect(await leaveService.entitlement(sc.agent.id, 2025)).toMatchObject({ eligible: false });
  });

  it('apprécie l\'éligibilité à la date de la demande si le paramètre l\'impose', async () => {
    const sc = await scenario();
    await setProfile(sc, { serviceStartDate: new Date(Date.UTC(year() - 1, 5, 1)) }); // 11 mois accomplis en mai de l'année en cours
    await put('/api/settings/rules/leave.eligibility_basis', sc.H, { value: 'AT_REQUEST', validFrom: '2020-01-01T00:00:00Z' });
    const ent = await leaveService.entitlement(sc.agent.id, year(), new Date(Date.UTC(year(), 2, 1)));
    expect(ent.eligible).toBe(false);
    expect((await leaveService.entitlement(sc.agent.id, year(), new Date(Date.UTC(year(), 11, 1)))).eligible).toBe(true);
  });

  it('ne proratise pas par défaut ; le prorata (mois entiers, arrondi) est disponible sur paramétrage', async () => {
    const sc = await scenario();
    await setProfile(sc, { serviceStartDate: new Date('2026-04-01T00:00:00Z') });
    await setRule(sc, 'leave.eligibility_months', 0);
    expect((await leaveService.entitlement(sc.agent.id, 2026)).days).toBe(30);
    await setRule(sc, 'leave.proration_enabled', true);
    expect((await leaveService.entitlement(sc.agent.id, 2026)).days).toBe(22); // 9 mois / 12 × 30 = 22,5 → arrondi inférieur
    await setRule(sc, 'leave.proration_rounding', 'CEIL');
    expect((await leaveService.entitlement(sc.agent.id, 2026)).days).toBe(23);
    expect((await leaveService.entitlement(sc.agent.id, 2027)).days).toBe(30);
  });

  it('exige la date d\'entrée en service (désactivable) et bloque les régimes non paramétrés', async () => {
    const sc = await scenario();
    await setProfile(sc, { serviceStartDate: null, hireDate: null });
    const none = await leaveService.entitlement(sc.agent.id, 2026);
    expect(none).toMatchObject({ eligible: false, days: 0 });
    expect(none.reason).toMatch(/date d'entrée en service/);
    await setRule(sc, 'leave.require_service_date', false);
    expect(await leaveService.entitlement(sc.agent.id, 2026)).toMatchObject({ eligible: true, days: 30 });

    await setProfile(sc, { regime: 'CONTRACTUEL', serviceStartDate: new Date('2015-01-01T00:00:00Z') });
    const reg = await leaveService.entitlement(sc.agent.id, 2026);
    expect(reg.eligible).toBe(false);
    expect(reg.reason).toMatch(/CONTRACTUEL.*pas paramétré/);
    await setRule(sc, 'leave.annual_days@CONTRACTUEL', 24);
    expect(await leaveService.entitlement(sc.agent.id, 2026)).toMatchObject({ eligible: true, days: 24 });
  });

  it('refuse la demande de décision d\'un agent sans droit, avec le message explicatif', async () => {
    const sc = await scenario();
    await prisma.agentProfile.update({ where: { userId: sc.agent.id }, data: { serviceStartDate: new Date(Date.UTC(year(), 5, 1)) } });
    const res = await post('/api/access/requests', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() });
    expect(res.status).toBe(422);
    expect(res.body.errors.year).toMatch(/11 mois de services accomplis requis/);
  });

  it('la décision ouvre le droit réel (et non une valeur fixe) et inscrit le droit acquis une seule fois, figé', async () => {
    const sc = await scenario();
    await setRule(sc, 'leave.annual_days', 25);
    const decision = await withDecision(sc);
    expect(decision.days).toBe(25);
    const acquired = await prisma.leaveLedger.findMany({ where: { agentId: sc.agent.id, nature: 'ACQUIS' } });
    expect(acquired).toHaveLength(1);
    expect(acquired[0]).toMatchObject({ days: 25, year: year(), leaveType: LEAVE_TYPE });
    expect((acquired[0].ruleSnapshot as any).annualDays).toBe(25);

    // Non-rétroactivité : un changement de paramètre ne touche ni le droit acquis ni la décision déjà rendue
    await setRule(sc, 'leave.annual_days', 40);
    await leaveService.ensureAcquired(prisma, sc.agent.id, year());
    expect(await prisma.leaveLedger.count({ where: { agentId: sc.agent.id, nature: 'ACQUIS' } })).toBe(1);
    expect((await prisma.leaveLedger.findFirstOrThrow({ where: { agentId: sc.agent.id, nature: 'ACQUIS' } })).days).toBe(25);
    expect((await prisma.leaveDecision.findUniqueOrThrow({ where: { id: decision.id } })).days).toBe(25);
    expect((await leaveService.entitlement(sc.agent.id, year())).days).toBe(40); // seul le calcul à venir change
  });

  it('reporte les jours non pris dans la limite paramétrée (aucun report par défaut)', async () => {
    const sc = await scenario();
    await leaveService.ensureAcquired(prisma, sc.agent.id, year() - 1); // 30 jours acquis l'an dernier, rien consommé
    await leaveService.ensureAcquired(prisma, sc.agent.id, year());
    expect((await leaveService.balance(sc.agent.id, year())).carriedOver).toBe(0);

    await setRule(sc, 'leave.carry_over_max_days', 10);
    await leaveService.ensureAcquired(prisma, sc.agent.id, year());
    const b = await leaveService.balance(sc.agent.id, year());
    expect(b).toMatchObject({ acquired: 30, carriedOver: 10, remaining: 40 });
    await leaveService.ensureAcquired(prisma, sc.agent.id, year()); // idempotent
    expect((await leaveService.balance(sc.agent.id, year())).carriedOver).toBe(10);
  });
});

describe('jouissance : décompte, éligibilité, fractionnement et registre', () => {
  it('inscrit la consommation au registre à l\'approbation et met à jour le solde', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    const c = await jc(sc, { leaveDecisionId: decision.id, startDate: inDays(10), endDate: inDays(24) }); // 15 jours
    expect(c.status).toBe(201);
    const sub = (await submit(sc, c.body.id)).body;
    expect(await prisma.leaveLedger.count({ where: { nature: 'CONSOMME' } })).toBe(0); // rien avant l'approbation
    await approveShort(sc, sub.id);
    const row = await prisma.leaveLedger.findFirstOrThrow({ where: { nature: 'CONSOMME' } });
    expect(row).toMatchObject({ days: -15, leaveType: LEAVE_TYPE, year: decision.year, requestId: sub.id, decisionId: decision.id });
    const bal = await leaveService.balance(sc.agent.id, decision.year);
    expect(bal).toMatchObject({ acquired: 30, consumed: 15, remaining: 15 });
    const overview = await leaveService.overview(sc.agent.id, decision.year);
    expect(overview.annual).toMatchObject({ decided: 30, consumed: 15, takeable: 15 });
  });

  it('applique le fractionnement : 2 tranches maximum, 15 jours par tranche, ou le congé entier', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    const make = (from: number, to: number) => jc(sc, { leaveDecisionId: decision.id, startDate: inDays(from), endDate: inDays(to) });
    const tooLong = await make(10, 29); // 20 jours : tranche fractionnée > 15 j
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.errors.endDate).toMatch(/ne peut excéder 15 jours/);
    const first = await make(10, 24); // 15 jours
    expect(first.status).toBe(201);
    expect((await submit(sc, first.body.id)).status).toBe(200);
    const second = await make(40, 54);
    expect(second.status).toBe(201);
    expect((await submit(sc, second.body.id)).status).toBe(200);
    const third = await make(70, 74);
    expect(third.status).toBe(422);
    expect(third.body.errors.endDate).toMatch(/plus de 2 tranche/);
  });

  it('accepte le congé entier de 30 jours en une seule tranche', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    const res = await jc(sc, { leaveDecisionId: decision.id, startDate: inDays(10), endDate: inDays(39) });
    expect(res.status).toBe(201);
    expect(res.body.data.durationDays).toBe(30);
  });

  it('refuse un congé qui commence avant l\'ouverture du droit', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    // l'agent aurait ses 11 mois dans 40 jours : décision existante, mais congé impossible avant
    const start = new Date(Date.now() + 40 * 86400000);
    await prisma.agentProfile.update({ where: { userId: sc.agent.id }, data: { serviceStartDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 11, start.getUTCDate())) } });
    const res = await jc(sc, { leaveDecisionId: decision.id, startDate: inDays(10), endDate: inDays(15) });
    expect(res.status).toBe(422);
    expect(res.body.errors.startDate).toMatch(/Congé impossible avant le/);
  });

  it('décompte en jours ouvrés et sans les jours fériés selon les paramètres', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    // prochain lundi au dimanche suivant (7 jours calendaires)
    const base = new Date(Date.now() + 14 * 86400000);
    base.setUTCDate(base.getUTCDate() + ((8 - base.getUTCDay()) % 7 || 7));
    const mon = base.toISOString().slice(0, 10), sun = new Date(base.getTime() + 6 * 86400000).toISOString().slice(0, 10), wed = new Date(base.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const dur = async () => (await post('/api/access/requests/preview', sc.agent.headers, { typeCode: 'JOUISSANCE_CONGE', fields: { leaveDecisionId: decision.id, startDate: mon, endDate: sun, destination: 'au Burkina Faso' } })).body.info.durationDays;
    expect(await dur()).toBe(7);
    await setRule(sc, 'leave.count_mode', 'WORKING');
    expect(await dur()).toBe(5);
    await post('/api/holidays', sc.H, { date: wed, label: 'Jour férié de test' });
    expect(await dur()).toBe(5); // fériés non exclus par défaut
    await setRule(sc, 'leave.exclude_holidays', true);
    expect(await dur()).toBe(4);
  });
});

describe('autorisations d\'absence : plafonds et décompte', () => {
  it('applique le plafond de 10 jours par an des événements familiaux, réservations en cours comprises', async () => {
    const sc = await scenario();
    const six = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(10), endDate: inDays(15) }); // 6 jours
    expect(six.status).toBe(201);
    expect((await submit(sc, six.body.id)).status).toBe(200); // réservés
    const over = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(30), endDate: inDays(34) }); // 5 jours : 6 + 5 > 10
    expect(over.status).toBe(422);
    expect(over.body.errors.absenceTypeId).toMatch(/Plafond annuel de 10 jour\(s\) dépassé.*6 déjà utilisé\(s\) ou réservé\(s\), 5 demandé/);
    const four = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(30), endDate: inDays(33) });
    expect(four.status).toBe(201);
    // l'approbation transforme la réservation en consommation, sans double compte
    await approveShort(sc, six.body.id);
    expect((await leaveService.absenceUsage(sc.agent.id, 'EVENEMENT_FAMILIAL', (await absenceType(sc, 'EVENEMENT_FAMILIAL')).id, new Date(inDays(10)).getUTCFullYear()))).toMatchObject({ consumed: 6 });
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(50), endDate: inDays(54) })).status).toBe(422); // 6 + 4 (réservés) déjà…
  });

  it('ne plafonne pas les absences hors plafond (art. 57) et respecte l\'option de non-application', async () => {
    const sc = await scenario();
    expect((await aa(sc, 'ACTIVITE_SYNDICALE', { startDate: inDays(10), endDate: inDays(40) })).status).toBe(201); // 31 jours, pas de plafond
    const big = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(60), endDate: inDays(72) });
    expect(big.status).toBe(422);
    await setRule(sc, 'absence.enforce_cap', false);
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(60), endDate: inDays(72) })).status).toBe(201);
  });

  it('convertit les heures en jours selon le paramètre (24 h = 1 jour par défaut ; 8 h = journée de travail)', async () => {
    const sc = await scenario();
    const day = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(10), durationHours: 24 });
    expect(day.status).toBe(201);
    expect(day.body.data.durationDays).toBe(1);
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(20), durationHours: 30 })).body.errors.durationHours).toMatch(/24 h par jour/);
    await setRule(sc, 'absence.hours_per_day', 8);
    const h = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(30), endDate: inDays(31), durationHours: 12 });
    expect(h.status).toBe(201);
    expect(h.body.data.durationDays).toBe(1.5);
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(40), durationHours: 9 })).body.errors.durationHours).toMatch(/8 h par jour/);
  });

  it('ventile une absence à cheval sur deux années et l\'impute à chacune', async () => {
    const sc = await scenario();
    const y = year();
    const res = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: `${y}-12-30`, endDate: `${y + 1}-01-02` });
    expect(res.status).toBe(201);
    expect(res.body.data.daysByYear).toEqual({ [y]: 2, [y + 1]: 2 });
    const sub = (await submit(sc, res.body.id)).body;
    await approveShort(sc, sub.id);
    const rows = await prisma.leaveLedger.findMany({ where: { agentId: sc.agent.id, nature: 'CONSOMME' }, orderBy: { year: 'asc' } });
    expect(rows.map(r => [r.year, r.days, r.leaveType])).toEqual([[y, -2, 'EVENEMENT_FAMILIAL'], [y + 1, -2, 'EVENEMENT_FAMILIAL']]);
  });

  it('exclut week-ends et jours fériés du décompte d\'absence quand c\'est paramétré, et refuse une période sans jour décompté', async () => {
    const sc = await scenario();
    const base = new Date(Date.now() + 20 * 86400000);
    base.setUTCDate(base.getUTCDate() + ((6 - base.getUTCDay() + 7) % 7)); // prochain samedi
    const sat = base.toISOString().slice(0, 10), sun = new Date(base.getTime() + 86400000).toISOString().slice(0, 10);
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: sat, endDate: sun })).body.data.durationDays).toBe(2);
    await setRule(sc, 'absence.count_mode', 'WORKING');
    const none = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: sat, endDate: sun });
    expect(none.status).toBe(422);
    expect(none.body.errors.startDate).toMatch(/aucun jour décompté/);
  });
});

describe('registre des droits : immuabilité et régularisations', () => {
  it('interdit toute modification ou suppression d\'écriture, même directement en base', async () => {
    const sc = await scenario();
    const row = await leaveService.regularise(prisma, { companyId: sc.t.company.id, agentId: sc.agent.id, leaveType: LEAVE_TYPE, year: year(), days: 3, reason: 'Régularisation de test', actorId: sc.t.admin.user.id });
    await expect(prisma.leaveLedger.update({ where: { id: row.id }, data: { days: 99 } })).rejects.toThrow(/écriture seule/);
    await expect(prisma.leaveLedger.delete({ where: { id: row.id } })).rejects.toThrow(/écriture seule/);
    await expect(prisma.leaveLedger.deleteMany({})).rejects.toThrow(/écriture seule/);
    await expect(prisma.$executeRaw`UPDATE "leave_ledger" SET "days" = 0`).rejects.toThrow(/écriture seule/);
    expect((await prisma.leaveLedger.findUniqueOrThrow({ where: { id: row.id } })).days).toBe(3);
  });

  it('est idempotent : une consommation n\'est jamais inscrite deux fois pour la même demande', async () => {
    const sc = await scenario();
    const args = { companyId: sc.t.company.id, agentId: sc.agent.id, leaveType: LEAVE_TYPE, year: year(), days: 5, requestId: 'req-1', reason: 'test' };
    await leaveService.consume(prisma, args);
    await leaveService.consume(prisma, args);
    expect(await prisma.leaveLedger.count({ where: { nature: 'CONSOMME' } })).toBe(1);
  });

  it('régularise par écriture compensatoire, avec motif obligatoire, réservée aux administrateurs et journalisée', async () => {
    const sc = await scenario();
    const reg = (body: any, headers = sc.H) => post('/api/leave/regularisations', headers, { agentId: sc.agent.id, leaveType: LEAVE_TYPE, year: year(), reason: 'Congé pris avant la mise en service', ...body });
    expect((await reg({ days: -12 })).status).toBe(201);
    expect((await reg({ days: 0 })).status).toBe(400);
    expect((await reg({ days: 400 })).status).toBe(400);
    expect((await reg({ days: 2, reason: 'ok' })).status).toBe(400);
    expect((await reg({ days: 2, leaveType: 'TYPE_INCONNU' })).status).toBe(400);
    expect((await reg({ days: 2, year: 1990 })).status).toBe(400);
    expect((await reg({ days: 2, agentId: 'inconnu' })).status).toBe(404);
    const employee = await makeUser(sc.t.company.id, 'EMPLOYEE');
    expect((await reg({ days: 2 }, auth(employee.token))).status).toBe(403);
    await leaveService.ensureAcquired(prisma, sc.agent.id, year());
    expect(await leaveService.balance(sc.agent.id, year())).toMatchObject({ acquired: 30, adjustments: -12, remaining: 18 });
    expect(await prisma.auditLog.count({ where: { action: 'LEAVE_REGULARISED' } })).toBe(1);
    const other = await makeTenant();
    expect((await post('/api/leave/regularisations', other.headers, { agentId: sc.agent.id, leaveType: LEAVE_TYPE, year: year(), days: 1, reason: 'Tentative inter-société' })).status).toBe(404);
  });

  it('une régularisation positive rend des jours d\'absence et rouvre le plafond', async () => {
    const sc = await scenario();
    const r = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(10), endDate: inDays(19) }); // 10 jours = plafond
    await approveShort(sc, (await submit(sc, r.body.id)).body.id);
    const y = new Date(inDays(10)).getUTCFullYear();
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(30) })).status).toBe(422);
    await post('/api/leave/regularisations', sc.H, { agentId: sc.agent.id, leaveType: 'EVENEMENT_FAMILIAL', year: y, days: 2, reason: 'Absence annulée par le service' });
    const reopened = await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(30), endDate: inDays(31) });
    expect(reopened.status).toBe(201);
    expect((await submit(sc, reopened.body.id)).status).toBe(200); // les 2 jours sont maintenant réservés
    expect((await aa(sc, 'EVENEMENT_FAMILIAL', { startDate: inDays(40) })).status).toBe(422);
  });
});

describe('administration des droits', () => {
  it('importe des ajustements (reprise de soldes) : validation par ligne, tout ou rien, idempotence du dry-run', async () => {
    const sc = await scenario();
    const csv = `matricule;annee;type;jours;motif\nM-0001;${year()};CONGE_ANNUEL;-10;Jours pris avant la mise en service\nM-0001;${year()};EVENEMENT_FAMILIAL;-3;Absences déjà accordées\n`;
    const dry = (await post('/api/leave/adjustments/import', sc.H, { csv })).body;
    expect(dry).toMatchObject({ dryRun: true, total: 2, created: 2, errors: [] });
    expect(await prisma.leaveLedger.count()).toBe(0);
    expect((await post('/api/leave/adjustments/import', sc.H, { csv, dryRun: false })).body.errors).toEqual([]);
    expect(await prisma.leaveLedger.count({ where: { nature: 'REGULARISATION' } })).toBe(2);

    const bad = `matricule;annee;type;jours;motif\nZZZ;${year()};CONGE_ANNUEL;-1;Motif valable\nM-0001;1900;CONGE_ANNUEL;-1;Motif valable\nM-0001;${year()};NIMPORTE;-1;Motif valable\nM-0001;${year()};CONGE_ANNUEL;0;Motif valable\nM-0001;${year()};CONGE_ANNUEL;-1;x\n`;
    const res = (await post('/api/leave/adjustments/import', sc.H, { csv: bad, dryRun: false })).body;
    expect(res.errors.map((e: any) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(await prisma.leaveLedger.count()).toBe(2); // rien de plus
    expect((await get('/api/leave/adjustments/template', sc.H)).status).toBe(200);
  });

  it('gère les jours fériés : création, doublon, import, suppression, filtre par année', async () => {
    const sc = await scenario();
    const y = year();
    expect((await post('/api/holidays', sc.H, { date: `${y}-05-01`, label: 'Fête du Travail' })).status).toBe(201);
    expect((await post('/api/holidays', sc.H, { date: `${y}-05-01`, label: 'Doublon' })).status).toBe(409);
    const csv = `date;libelle\n01/05/${y};Fête du Travail\n${y}-08-05;Fête de l'Indépendance\n`;
    expect((await post('/api/holidays/import', sc.H, { csv })).body).toMatchObject({ dryRun: true, created: 1, updated: 1, errors: [] });
    expect((await post('/api/holidays/import', sc.H, { csv, dryRun: false })).body.errors).toEqual([]);
    expect((await get(`/api/holidays?year=${y}`, sc.H)).body.map((h: any) => h.label)).toEqual(['Fête du Travail', "Fête de l'Indépendance"]);
    expect((await get(`/api/holidays?year=${y + 1}`, sc.H)).body).toEqual([]);
    expect((await post('/api/holidays/import', sc.H, { csv: 'date;libelle\n31/02/2026;x\n01/01/2026;\n', dryRun: false })).body.errors).toHaveLength(2);
    const h = (await get(`/api/holidays?year=${y}`, sc.H)).body[0];
    const employee = await makeUser(sc.t.company.id, 'EMPLOYEE');
    expect((await request(app).delete(`/api/holidays/${h.id}`).set(auth(employee.token))).status).toBe(403);
    expect((await get('/api/holidays', auth(employee.token))).status).toBe(200); // lecture ouverte
    expect((await request(app).delete(`/api/holidays/${h.id}`).set(sc.H)).status).toBe(204);
  });

  it('annule une décision sans jouissance liée, refuse sinon', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    expect((await post(`/api/leave/decisions/${decision.id}/cancel`, sc.H, { reason: 'ok' })).status).toBe(400);
    const c = await jc(sc, { leaveDecisionId: decision.id, startDate: inDays(10), endDate: inDays(15) });
    await submit(sc, c.body.id);
    expect((await post(`/api/leave/decisions/${decision.id}/cancel`, sc.H, { reason: 'Erreur de saisie' })).status).toBe(409);
    await post(`/api/access/requests/${c.body.id}/cancel`, sc.agent.headers);
    const ok = await post(`/api/leave/decisions/${decision.id}/cancel`, sc.H, { reason: 'Erreur de saisie' });
    expect(ok.status).toBe(200);
    expect((await prisma.leaveDecision.findUniqueOrThrow({ where: { id: decision.id } })).status).toBe('CANCELLED');
    expect((await post(`/api/leave/decisions/${decision.id}/cancel`, sc.H, { reason: 'Encore une fois' })).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'LEAVE_DECISION_CANCELLED' } })).toBe(1);
  });

  it('signale les situations à contrôler : dates manquantes, régime non paramétré, solde négatif', async () => {
    const sc = await scenario();
    const noDate = await createAgent(sc.H, { matricule: 'ND-1' });
    const contract = await createAgent(sc.H, { matricule: 'CT-1', regime: 'CONTRACTUEL', serviceStartDate: '2020-01-01' });
    await leaveService.regularise(prisma, { companyId: sc.t.company.id, agentId: sc.agent.id, leaveType: LEAVE_TYPE, year: year(), days: -5, reason: 'Solde négatif de test', actorId: sc.t.admin.user.id });
    const controls = (await get('/api/leave/controls', sc.H)).body;
    const types = (id: string) => controls.filter((c: any) => c.agentId === id).map((c: any) => c.type);
    expect(types(noDate.id)).toContain('SERVICE_DATE_MISSING');
    expect(types(contract.id)).toContain('REGIME_NOT_CONFIGURED');
    expect(types(sc.agent.id)).toContain('NEGATIVE_BALANCE');
  });

  it('restitue la vue d\'ensemble des droits d\'un agent, cloisonnée par société et réservée aux administrateurs', async () => {
    const sc = await scenario();
    const decision = await withDecision(sc);
    const ov = (await get(`/api/leave/agents/${sc.agent.id}/overview?year=${decision.year}`, sc.H)).body;
    expect(ov.entitlement).toMatchObject({ eligible: true, days: 30, eligibleFrom: '2015-12-01' });
    expect(ov.annual).toMatchObject({ acquired: 30, decided: 30, consumed: 0, remaining: 30 });
    expect(ov.decisions).toHaveLength(1);
    const family = ov.absences.find((a: any) => a.code === 'EVENEMENT_FAMILIAL');
    expect(family).toMatchObject({ cap: 10, consumed: 0, remaining: 10 });
    expect(ov.absences.find((a: any) => a.code === 'ACTIVITE_SYNDICALE').remaining).toBeNull();
    expect((await get(`/api/leave/agents/${sc.agent.id}/ledger`, sc.H)).body.length).toBeGreaterThan(0);
    const other = await makeTenant();
    expect((await get(`/api/leave/agents/${sc.agent.id}/overview`, other.headers)).status).toBe(404);
    const emp = await makeUser(sc.t.company.id, 'EMPLOYEE');
    expect((await get(`/api/leave/agents/${sc.agent.id}/overview`, auth(emp.token))).status).toBe(403);
  });
});

describe('espace agent : solde et aperçu', () => {
  it('l\'agent consulte son propre solde ; les jetons sont séparés', async () => {
    const sc = await scenario();
    const bal = await get('/api/access/balance', sc.agent.headers);
    expect(bal.status).toBe(200);
    expect(bal.body.entitlement.days).toBe(30);
    expect(bal.body.absences.length).toBeGreaterThan(0);
    expect((await get('/api/access/balance', sc.H)).status).toBe(401);
    expect((await get('/api/access/balance', {})).status).toBe(401);
  });

  it('prévisualise une demande sans rien enregistrer : erreurs par champ, durée décomptée, plafond restant', async () => {
    const sc = await scenario();
    const t = await absenceType(sc, 'EVENEMENT_FAMILIAL');
    const before = await prisma.request.count();
    const ok = (await post('/api/access/requests/preview', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: t.id, startDate: inDays(10), endDate: inDays(13), motif: 'des raisons de famille' } })).body;
    expect(ok.ok).toBe(true);
    expect(ok.info.durationDays).toBe(4);
    expect(Object.values(ok.info.cap)[0]).toMatchObject({ cap: 10, requested: 4, remainingAfter: 6 });
    const ko = (await post('/api/access/requests/preview', sc.agent.headers, { typeCode: 'AUTORISATION_ABSENCE', fields: { absenceTypeId: t.id, startDate: inDays(10), endDate: inDays(30), motif: 'des raisons de famille' } })).body;
    expect(ko.ok).toBe(false);
    expect(ko.errors.absenceTypeId).toMatch(/Plafond annuel/);
    const dc = (await post('/api/access/requests/preview', sc.agent.headers, { typeCode: 'DECISION_CONGE', fields: dcFields() })).body;
    expect(dc.ok).toBe(true);
    expect(dc.info).toMatchObject({ entitlementDays: 30 });
    expect(await prisma.request.count()).toBe(before); // aucun brouillon créé
  });
});
