import { app, prisma, request, resetDb, makeTenant, makeUser, auth } from './helpers';
import { auditService } from '../src/modules/audit/audit.service';
import { rulesService } from '../src/modules/settings/rules.service';

beforeEach(resetDb);

describe('journal d\'audit chaîné', () => {
  it('chaîne les entrées et valide l\'intégrité', async () => {
    for (let i = 0; i < 3; i++) await auditService.log({ action: 'TEST', entity: 'X', entityId: String(i), after: { i, b: 1, a: { z: 1, y: 2 } } });
    const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    expect(rows[0].prevHash).toBeNull();
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);
    expect(await auditService.verify()).toEqual({ ok: true, checked: 3 });
  });

  it('détecte une modification a posteriori', async () => {
    await auditService.log({ action: 'A', entity: 'X', after: { v: 1 } });
    await auditService.log({ action: 'B', entity: 'X', after: { v: 2 } });
    const first = await prisma.auditLog.findFirst({ orderBy: { seq: 'asc' } });
    await prisma.auditLog.update({ where: { id: first!.id }, data: { after: { v: 999 } } });
    const res = await auditService.verify();
    expect(res.ok).toBe(false);
    expect(res.brokenAtSeq).toBe(first!.seq);
  });

  it('détecte la suppression d\'une entrée intermédiaire', async () => {
    for (const a of ['A', 'B', 'C']) await auditService.log({ action: a, entity: 'X' });
    const mid = await prisma.auditLog.findFirst({ where: { action: 'B' } });
    await prisma.auditLog.delete({ where: { id: mid!.id } });
    expect((await auditService.verify()).ok).toBe(false);
  });

  it('reste cohérent sous écritures concurrentes', async () => {
    await Promise.all(Array.from({ length: 15 }, (_, i) => auditService.log({ action: 'C' + i, entity: 'X' })));
    expect(await auditService.verify()).toEqual({ ok: true, checked: 15 });
  });

  it('est cloisonné par société et réservé aux administrateurs', async () => {
    const a = await makeTenant(), b = await makeTenant();
    await auditService.log({ companyId: a.company.id, action: 'SECRET_A', entity: 'X' });
    await auditService.log({ companyId: b.company.id, action: 'SECRET_B', entity: 'X' });
    const res = await request(app).get('/api/audit').set(a.headers);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: any) => i.action)).toEqual(['SECRET_A']);
    const employee = await makeUser(a.company.id, 'EMPLOYEE');
    expect((await request(app).get('/api/audit').set(auth(employee.token))).status).toBe(403);
    expect((await request(app).get('/api/audit')).status).toBe(401);
  });
});

describe('paramètres versionnés', () => {
  it('renvoie la valeur par défaut puis la valeur personnalisée sans réécrire l\'historique', async () => {
    const t = await makeTenant();
    expect(await rulesService.get(t.company.id, 'card.validity_years')).toBe(5);

    const res = await request(app).put('/api/settings/rules/card.validity_years').set(t.headers).send({ value: 3, legalReference: 'Décret X, art. 2' });
    expect(res.status).toBe(200);
    expect(await rulesService.get(t.company.id, 'card.validity_years')).toBe(3);

    // Une valeur antérieure reste consultable à sa date
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    expect(await rulesService.get(t.company.id, 'card.validity_years', past)).toBe(5);

    await request(app).put('/api/settings/rules/card.validity_years').set(t.headers).send({ value: 4 });
    const rows = await prisma.ruleParameter.findMany({ where: { companyId: t.company.id, key: 'card.validity_years' }, orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].validTo).not.toBeNull(); // l'ancienne ligne est clôturée, pas modifiée
    expect(await rulesService.get(t.company.id, 'card.validity_years')).toBe(4);
    expect((await prisma.auditLog.count({ where: { action: 'RULE_CHANGED' } }))).toBe(2);
  });

  it('refuse une clé inconnue, un mauvais type et une valeur négative', async () => {
    const t = await makeTenant();
    expect((await request(app).put('/api/settings/rules/inconnue').set(t.headers).send({ value: 1 })).status).toBe(400);
    expect((await request(app).put('/api/settings/rules/card.validity_years').set(t.headers).send({ value: 'x' })).status).toBe(400);
    expect((await request(app).put('/api/settings/rules/card.validity_years').set(t.headers).send({ value: -1 })).status).toBe(400);
  });

  it('les paramètres d\'une société ne s\'appliquent pas à une autre', async () => {
    const a = await makeTenant(), b = await makeTenant();
    await request(app).put('/api/settings/rules/access.pin_max_attempts').set(a.headers).send({ value: 2 });
    expect(await rulesService.get(a.company.id, 'access.pin_max_attempts')).toBe(2);
    expect(await rulesService.get(b.company.id, 'access.pin_max_attempts')).toBe(5);
  });
});
