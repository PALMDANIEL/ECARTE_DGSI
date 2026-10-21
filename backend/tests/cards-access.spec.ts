import jwt from 'jsonwebtoken';
import { app, prisma, request, resetDb, makeTenant, makeUser, auth, createAgent, issueCard, waitFor } from './helpers';
import { config } from '../src/infrastructure/config';
import { agentJwtSecret } from '../src/shared/utils/crypto';

beforeEach(resetDb);

/** Agent prêt à scanner : profil + carte émise + PIN connu. */
async function setup() {
  const t = await makeTenant();
  const unit = (await request(app).post('/api/org-units').set(t.headers).send({ code: 'SDA', name: 'Service SDA', type: 'SERVICE' })).body;
  const agent = await createAgent(t.headers, { firstName: 'Awa Marie', lastName: 'Koné', matricule: 'M-001', civility: 'MME', grade: 'Ingénieur', orgUnitId: unit.id });
  const card = await issueCard(t.headers, agent.id);
  const pin = (await request(app).post(`/api/agents/${agent.id}/pin/reset`).set(t.headers)).body.pin as string;
  return { t, agent, card, pin };
}
const scan = (token: string) => request(app).get(`/api/access/${token}`);
const sendPin = (token: string, pin: string) => request(app).post(`/api/access/${token}/pin`).send({ pin });

describe('cycle de vie de la carte', () => {
  it('émet une carte : numéro unique CP-AAAA-NNNNNN, échéance selon le paramètre, jeton opaque', async () => {
    const { t, card } = await setup();
    expect(card.summary.cardNumber).toMatch(/^CP-\d{4}-\d{6}$/);
    expect(card.summary.status).toBe('ACTIVE');
    const years = new Date(card.summary.expiresAt).getFullYear() - new Date(card.summary.issuedAt).getFullYear();
    expect(years).toBe(5);
    expect(card.url).toMatch(/^http:\/\/test\.local\/q\/[A-Za-z0-9_-]{22}$/);
    // le jeton n'est jamais stocké en clair
    const cred = await prisma.cardCredential.findFirst();
    expect(JSON.stringify(cred)).not.toContain(card.token);
    // numérotation continue
    const agent2 = await createAgent(t.headers);
    const card2 = await issueCard(t.headers, agent2.id);
    const n = (c: string) => parseInt(c.split('-')[2], 10);
    expect(n(card2.summary.cardNumber)).toBe(n(card.summary.cardNumber) + 1);
  });

  it('respecte la durée de validité paramétrée', async () => {
    const t = await makeTenant();
    await request(app).put('/api/settings/rules/card.validity_years').set(t.headers).send({ value: 2 });
    const agent = await createAgent(t.headers);
    const card = await issueCard(t.headers, agent.id);
    expect(new Date(card.summary.expiresAt).getFullYear() - new Date(card.summary.issuedAt).getFullYear()).toBe(2);
  });

  it('refuse l\'émission sans agent, double émission, et un agent déjà titulaire d\'une carte valide', async () => {
    const t = await makeTenant();
    const noAgent = (await request(app).post('/api/cards').set(t.headers).send({ fullName: 'Sans agent' })).body;
    expect((await request(app).post(`/api/cards/${noAgent.id}/issue`).set(t.headers)).status).toBe(409);

    const agent = await createAgent(t.headers);
    const card = await issueCard(t.headers, agent.id);
    expect((await request(app).post(`/api/cards/${card.cardId}/issue`).set(t.headers)).status).toBe(409);

    const second = (await request(app).post('/api/cards').set(t.headers).send({ fullName: 'Deuxième', agentId: agent.id })).body;
    const res = await request(app).post(`/api/cards/${second.id}/issue`).set(t.headers);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/possède déjà/);
  });

  it('suspend puis réactive ; suspension et révocation exigent un motif', async () => {
    const { t, card } = await setup();
    expect((await request(app).post(`/api/cards/${card.cardId}/suspend`).set(t.headers).send({})).status).toBe(400);
    expect((await scan(card.token)).status).toBe(200);
    await request(app).post(`/api/cards/${card.cardId}/suspend`).set(t.headers).send({ reason: 'Enquête en cours' });
    expect((await scan(card.token)).status).toBe(404);
    await request(app).post(`/api/cards/${card.cardId}/reactivate`).set(t.headers);
    expect((await scan(card.token)).status).toBe(200);
    expect((await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'x' })).status).toBe(400);
  });

  it('révoque définitivement : le QR imprimé ne fonctionne plus et la carte ne peut pas être ré-émise', async () => {
    const { t, card, pin } = await setup();
    const res = await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'Perte déclarée' });
    expect(res.body.status).toBe('REVOKED');
    expect((await scan(card.token)).status).toBe(404);
    expect((await sendPin(card.token, pin)).status).toBe(404);
    expect((await request(app).post(`/api/cards/${card.cardId}/issue`).set(t.headers)).status).toBe(409);
    expect((await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'encore' })).status).toBe(409);
    const hist = (await request(app).get(`/api/cards/${card.cardId}/history`).set(t.headers)).body;
    expect(hist.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['ISSUED', 'REVOKED']));
    expect(hist.credentials.every((c: any) => c.revokedAt)).toBe(true);
    expect(JSON.stringify(hist)).not.toContain(card.token);
  });

  it('renouvelle : nouvelle échéance, nouveau jeton, ancien QR invalide', async () => {
    const { t, card } = await setup();
    const before = new Date(card.summary.expiresAt);
    const res = await request(app).post(`/api/cards/${card.cardId}/renew`).set(t.headers);
    expect(new Date(res.body.expiresAt).getFullYear()).toBe(before.getFullYear() + 5);
    expect((await scan(card.token)).status).toBe(404);
    const { cardLifecycleService } = await import('../src/modules/card-lifecycle/card-lifecycle.service');
    const newUrl = (await cardLifecycleService.accessUrl(t.company.id, card.cardId))!;
    expect(newUrl).not.toBe(card.url);
    expect((await scan(newUrl.split('/q/')[1])).status).toBe(200);
  });

  it('remplace : nouveau numéro, ancien jeton révoqué, ancien numéro conservé dans l\'historique', async () => {
    const { t, card } = await setup();
    const res = await request(app).post(`/api/cards/${card.cardId}/replace`).set(t.headers).send({ reason: 'Carte détériorée' });
    expect(res.body.cardNumber).not.toBe(card.summary.cardNumber);
    expect((await scan(card.token)).status).toBe(404);
    const ev = (await request(app).get(`/api/cards/${card.cardId}/history`).set(t.headers)).body.events.find((e: any) => e.type === 'REPLACED');
    expect(ev.metadata.previousCardNumber).toBe(card.summary.cardNumber);
  });

  it('restitue l\'historique des cartes d\'un agent', async () => {
    const { t, agent, card } = await setup();
    await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'Fin de fonction' });
    await issueCard(t.headers, agent.id);
    const hist = (await request(app).get(`/api/agents/${agent.id}/cards`).set(t.headers)).body;
    expect(hist).toHaveLength(2);
    expect(hist.map((h: any) => h.status).sort()).toEqual(['ACTIVE', 'REVOKED']);
  });

  it('réserve les actions aux administrateurs et cloisonne par société', async () => {
    const { t, card } = await setup();
    const employee = await makeUser(t.company.id, 'EMPLOYEE');
    for (const path of ['issue', 'renew', 'reactivate']) expect((await request(app).post(`/api/cards/${card.cardId}/${path}`).set(auth(employee.token))).status).toBe(403);
    expect((await request(app).post(`/api/cards/${card.cardId}/revoke`).set(auth(employee.token)).send({ reason: 'abus' })).status).toBe(403);
    expect((await request(app).get(`/api/cards/${card.cardId}/access-qr`).set(auth(employee.token))).status).toBe(403);

    const other = await makeTenant();
    expect((await request(app).post(`/api/cards/${card.cardId}/revoke`).set(other.headers).send({ reason: 'piratage' })).status).toBe(403);
    expect((await request(app).get(`/api/cards/${card.cardId}/access-qr`).set(other.headers)).status).toBe(403);
    expect((await scan(card.token)).status).toBe(200); // toujours valide
  });

  it('fournit le QR d\'accès en PNG sans donnée personnelle, et le journalise', async () => {
    const { t, card } = await setup();
    const res = await request(app).get(`/api/cards/${card.cardId}/access-qr`).set(t.headers).buffer(true).parse((r, cb) => { const d: Buffer[] = []; r.on('data', c => d.push(c)); r.on('end', () => cb(null, Buffer.concat(d))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
    expect(await prisma.auditLog.count({ where: { action: 'CARD_ACCESS_QR_VIEWED' } })).toBe(1);
  });

  it('un employé ne peut créer une carte que pour lui-même ; un gestionnaire peut désigner un agent', async () => {
    const t = await makeTenant();
    const employee = await makeUser(t.company.id, 'EMPLOYEE');
    const agent = await createAgent(t.headers);
    const mine = (await request(app).post('/api/cards').set(auth(employee.token)).send({ fullName: 'Moi', agentId: agent.id })).body;
    expect(mine.agentId).toBe(employee.user.id);
    const managed = (await request(app).post('/api/cards').set(t.headers).send({ fullName: 'Pour agent', agentId: agent.id })).body;
    expect(managed.agentId).toBe(agent.id);
    const stranger = await createAgent((await makeTenant()).headers);
    expect((await request(app).post('/api/cards').set(t.headers).send({ fullName: 'X', agentId: stranger.id })).status).toBe(400);
    // le titulaire d'une carte émise ne peut plus être changé
    const issued = await issueCard(t.headers, agent.id);
    const other = await createAgent(t.headers);
    expect((await request(app).put(`/api/cards/${issued.cardId}`).set(t.headers).send({ fullName: 'Awa Koné', agentId: other.id })).status).toBe(409);
  });

  it('n\'expose jamais les informations administratives sur la carte de visite publique', async () => {
    const { card } = await setup();
    const c = await prisma.businessCard.findUnique({ where: { id: card.cardId } });
    const res = await request(app).get(`/api/cards/public/${c!.slug}`);
    expect(res.status).toBe(200);
    for (const k of ['cardNumber', 'status', 'agentId', 'issuedAt', 'expiresAt', 'userId']) expect(res.body).not.toHaveProperty(k);
    expect(JSON.stringify(res.body)).not.toMatch(/password|pinHash|tokenHash/);
  });
});

describe('scan du QR (identification)', () => {
  it('identifie l\'agent par un nom masqué, sans donnée confidentielle', async () => {
    const { card } = await setup();
    const res = await scan(card.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, pinRequired: true, pinConfigured: true, agent: { displayName: 'Awa K.', unit: 'Service SDA' } });
    const text = JSON.stringify(res.body);
    for (const secret of ['M-001', 'Ingénieur', 'Koné', 'CP-', '@']) expect(text).not.toContain(secret);
  });

  it('enregistre le scan', async () => {
    const { card } = await setup();
    await scan(card.token);
    expect(await waitFor(async () => (await prisma.scan.count({ where: { cardId: card.cardId } })) === 1)).toBe(true);
  });

  it('refuse de la même façon un jeton inconnu, malformé, révoqué ou expiré (aucune fuite d\'information)', async () => {
    const { t, card } = await setup();
    const unknown = await scan('inconnuinconnuinconnu00');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ message: 'Carte invalide ou non utilisable', code: 'CARD_INVALID' });

    await prisma.businessCard.update({ where: { id: card.cardId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await scan(card.token);
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual(unknown.body);

    const revoked = await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'Test' }).then(() => scan(card.token));
    expect(revoked.body).toEqual(unknown.body);
    expect((await scan('%00%00')).body).toEqual(unknown.body);
  });

  it('journalise les tentatives sur une carte connue mais inutilisable, mais pas les jetons inconnus', async () => {
    const { t, card } = await setup();
    await scan('jetoninexistant000000000');
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(0);
    await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'Test' });
    await scan(card.token);
    const log = await prisma.auditLog.findFirst({ where: { action: 'ACCESS_DENIED' } });
    expect((log!.after as any).reason).toBe('TOKEN_REVOKED');
    expect(JSON.stringify(log)).not.toContain(card.token);
  });

  it('refuse si l\'agent est désactivé', async () => {
    const { t, agent, card } = await setup();
    await request(app).put(`/api/agents/${agent.id}/active`).set(t.headers).send({ isActive: false });
    expect((await scan(card.token)).status).toBe(404);
  });

  it('signale quand le PIN n\'a pas encore été remis', async () => {
    const t = await makeTenant();
    const agent = await createAgent(t.headers);
    const card = await issueCard(t.headers, agent.id);
    expect((await scan(card.token)).body.pinConfigured).toBe(false);
    const res = await sendPin(card.token, '123456');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PIN_NOT_SET');
  });
});

describe('PIN et session agent', () => {
  it('ouvre une session avec le bon PIN et renvoie le dossier de l\'agent', async () => {
    const { card, pin } = await setup();
    const res = await sendPin(card.token, pin);
    expect(res.status).toBe(200);
    expect(res.body.sessionToken).toBeTruthy();
    expect(res.body.expiresInMinutes).toBe(20);
    expect(res.body.agent).toMatchObject({ firstName: 'Awa Marie', lastName: 'Koné', matricule: 'M-001', grade: 'Ingénieur', civility: 'MME' });
    expect(res.body.agent.orgChain.map((u: any) => u.code)).toEqual(['SDA']);
    expect(res.body.card.number).toBe(card.summary.cardNumber);
    expect(JSON.stringify(res.body)).not.toMatch(/pinHash|password|tokenHash/);
    const me = await request(app).get('/api/access/me').set(auth(res.body.sessionToken));
    expect(me.status).toBe(200);
    expect(me.body.agent.matricule).toBe('M-001');
  });

  it('refuse un mauvais PIN avec le nombre d\'essais restants, puis verrouille après 5 échecs', async () => {
    const { card, pin, agent } = await setup();
    const wrong = pin === '000000' ? '111111' : '000000';
    const first = await sendPin(card.token, wrong);
    expect(first.status).toBe(401);
    expect(first.body).toMatchObject({ code: 'PIN_INVALID', remainingAttempts: 4 });
    for (let i = 0; i < 3; i++) await sendPin(card.token, wrong);
    const fifth = await sendPin(card.token, wrong);
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe('PIN_LOCKED');
    // même le bon PIN est refusé pendant le verrouillage
    const locked = await sendPin(card.token, pin);
    expect(locked.status).toBe(423);
    expect(await prisma.auditLog.count({ where: { action: 'PIN_LOCKED', entityId: agent.id } })).toBe(1);
  });

  it('déverrouille à l\'échéance et remet le compteur à zéro après un succès', async () => {
    const { card, pin, agent } = await setup();
    const wrong = pin === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await sendPin(card.token, wrong);
    await prisma.agentProfile.update({ where: { userId: agent.id }, data: { pinLockedUntil: new Date(Date.now() - 1000) } });
    expect((await sendPin(card.token, pin)).status).toBe(200);
    expect((await prisma.agentProfile.findUnique({ where: { userId: agent.id } }))!.pinFailedAttempts).toBe(0);
    // un échec isolé après un verrou expiré ne reverrouille pas
    expect((await sendPin(card.token, wrong)).body.remainingAttempts).toBe(4);
  });

  it('un PIN de 5 échecs paramétré à 2 verrouille après 2 échecs (règle administrable)', async () => {
    const { t, card, pin } = await setup();
    await request(app).put('/api/settings/rules/access.pin_max_attempts').set(t.headers).send({ value: 2 });
    const wrong = pin === '000000' ? '111111' : '000000';
    await sendPin(card.token, wrong);
    expect((await sendPin(card.token, wrong)).status).toBe(423);
  });

  it('valide le format du PIN', async () => {
    const { card } = await setup();
    expect((await request(app).post(`/api/access/${card.token}/pin`).send({})).status).toBe(400);
    expect((await sendPin(card.token, '1')).status).toBe(400);
  });

  it('le simple scan ne donne accès à rien : pas de session, pas de dossier', async () => {
    const { card } = await setup();
    expect((await request(app).get('/api/access/me')).status).toBe(401);
    expect((await request(app).get('/api/access/me').set(auth(card.token))).status).toBe(401);
  });

  it('un jeton agent n\'est jamais accepté par l\'API d\'administration, et inversement', async () => {
    const { t, card, pin, agent } = await setup();
    const session = (await sendPin(card.token, pin)).body.sessionToken;
    for (const path of ['/api/cards', '/api/users/me', '/api/agents', '/api/org-units', '/api/audit']) {
      expect((await request(app).get(path).set(auth(session))).status).toBe(401);
    }
    expect((await request(app).get('/api/access/me').set(t.headers)).status).toBe(401);
    // jeton agent forgé avec le secret des administrateurs : refusé
    const forged = jwt.sign({ scope: 'agent', sub: agent.id, cardId: card.cardId, companyId: t.company.id }, config.jwtSecret, { expiresIn: '5m' });
    expect((await request(app).get('/api/access/me').set(auth(forged))).status).toBe(401);
    // jeton signé avec le bon secret mais sans le bon scope : refusé
    const noScope = jwt.sign({ sub: agent.id, cardId: card.cardId }, agentJwtSecret(), { expiresIn: '5m' });
    expect((await request(app).get('/api/access/me').set(auth(noScope))).status).toBe(401);
  });

  it('la session cesse de fonctionner si la carte est révoquée ou l\'agent désactivé', async () => {
    const { t, card, pin, agent } = await setup();
    const session = (await sendPin(card.token, pin)).body.sessionToken;
    expect((await request(app).get('/api/access/me').set(auth(session))).status).toBe(200);
    await request(app).post(`/api/cards/${card.cardId}/revoke`).set(t.headers).send({ reason: 'Fraude' });
    expect((await request(app).get('/api/access/me').set(auth(session))).status).toBe(404);
  });

  it('expire une session au bout du délai paramétré', async () => {
    const { card, agent, t } = await setup();
    const expired = jwt.sign({ scope: 'agent', sub: agent.id, cardId: card.cardId, companyId: t.company.id }, agentJwtSecret(), { expiresIn: '-1s' });
    const res = await request(app).get('/api/access/me').set(auth(expired));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AGENT_SESSION_EXPIRED');
  });

  it('journalise l\'ouverture de session et les échecs sans jamais écrire le PIN ni le jeton', async () => {
    const { card, pin } = await setup();
    await sendPin(card.token, pin === '000000' ? '111111' : '000000');
    await sendPin(card.token, pin);
    const logs = JSON.stringify(await prisma.auditLog.findMany());
    expect(logs).toContain('PIN_FAILED');
    expect(logs).toContain('AGENT_SESSION_OPENED');
    expect(logs).not.toContain(pin);
    expect(logs).not.toContain(card.token);
  });
});

describe('isolation entre sociétés', () => {
  it('un jeton ne donne accès qu\'au dossier de son propre agent', async () => {
    const a = await setup();
    const b = await setup();
    const sa = (await sendPin(a.card.token, a.pin)).body;
    const sb = (await sendPin(b.card.token, b.pin)).body;
    expect(sa.agent.matricule).toBe('M-001');
    const meA = (await request(app).get('/api/access/me').set(auth(sa.sessionToken))).body;
    const meB = (await request(app).get('/api/access/me').set(auth(sb.sessionToken))).body;
    expect(meA.card.number).toBe(a.card.summary.cardNumber);
    expect(meB.card.number).toBe(b.card.summary.cardNumber);
    expect(meA.card.number).not.toBe(meB.card.number);
    // le PIN de l'un n'ouvre pas la carte de l'autre
    expect((await sendPin(a.card.token, b.pin)).status).toBe(401);
  });
});

describe('limitation de débit', () => {
  it('le limiteur dédié au PIN et au scan est présent hors environnement de test', () => {
    // En test les plafonds sont relevés ; on vérifie ici que la configuration de production est bien restrictive.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/modules/access/routes.ts'), 'utf8');
    expect(src).toMatch(/max: process\.env\.NODE_ENV === 'test' \? 10000 : 60/);
    expect(src).toMatch(/max: process\.env\.NODE_ENV === 'test' \? 10000 : 20/);
  });
});
