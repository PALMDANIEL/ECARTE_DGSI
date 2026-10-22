import path from 'path';
import { promises as fs } from 'fs';
import jwt from 'jsonwebtoken';
import { app, prisma, request, resetDb, auth, makeTenant, makeUser, makeCompany } from './helpers';
import { config } from '../src/infrastructure/config';
import { EmailService } from '../src/infrastructure/email';

/**
 * Non-régression des fonctions d'origine de l'application (avant le module « Demandes ») :
 * authentification, utilisateurs, sociétés, équipes, cartes de visite, QR, fichiers, tableau de bord.
 */
beforeEach(resetDb);
afterEach(() => jest.restoreAllMocks());

const get = (p: string, h: any = {}) => request(app).get(p).set(h);
const post = (p: string, h: any = {}, b?: any) => request(app).post(p).set(h).send(b ?? {});
const put = (p: string, h: any = {}, b?: any) => request(app).put(p).set(h).send(b ?? {});
const del = (p: string, h: any = {}) => request(app).delete(p).set(h);

const register = (over: Record<string, any> = {}) =>
  post('/api/auth/register', {}, { firstName: 'Ada', lastName: 'Ouédraogo', email: `ada${Date.now()}${Math.random()}@exemple.org`.replace('0.', ''), password: 'MotDePasse#1', companyName: `Ministère ${Math.random()}`, ...over });

describe('authentification', () => {
  it('inscrit une nouvelle administration, sans jamais renvoyer le mot de passe ni le jeton de rafraîchissement stocké', async () => {
    jest.spyOn(EmailService.prototype, 'sendVerificationEmail').mockResolvedValue();
    const r = await register();
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('ADMIN');
    expect(r.body.user.password).toBeUndefined();
    expect(r.body.user.refreshToken).toBeUndefined();
    expect(r.body.accessToken).toBeTruthy();
  });

  it('refuse de rattacher un inscrit à une administration existante (sinon n\'importe qui en deviendrait administrateur)', async () => {
    jest.spyOn(EmailService.prototype, 'sendVerificationEmail').mockResolvedValue();
    const company = await makeCompany('Direction Générale des Systèmes d\'Information');
    const r = await register({ companyName: company.name });
    expect(r.status).toBe(409);
    expect(await prisma.user.count({ where: { companyId: company.id } })).toBe(0);
  });

  it('connexion : identifiants valides, mauvais mot de passe, compte désactivé, verrouillage après échecs', async () => {
    const t = await makeTenant();
    const ok = await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'Password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.password).toBeUndefined();
    expect(ok.body.user.refreshToken).toBeUndefined();
    expect((await get('/api/users/me', auth(ok.body.accessToken))).status).toBe(200);

    expect((await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'faux' })).status).toBe(401);
    expect((await post('/api/auth/login', {}, { email: 'inconnu@exemple.org', password: 'x' })).status).toBe(401);
    expect((await post('/api/auth/login', {}, { email: 'pas-un-email', password: 'x' })).status).toBe(400);

    const u = await makeUser(t.company.id, 'EMPLOYEE');
    for (let i = 0; i < config.maxFailedAttempts - 1; i++) await post('/api/auth/login', {}, { email: u.user.email, password: 'faux' });
    expect((await post('/api/auth/login', {}, { email: u.user.email, password: 'faux' })).body.message).toBe('Account locked');
    expect((await post('/api/auth/login', {}, { email: u.user.email, password: 'Password123' })).body.message).toBe('Account locked');

    const off = await makeUser(t.company.id, 'EMPLOYEE');
    await prisma.user.update({ where: { id: off.user.id }, data: { isActive: false } });
    expect((await post('/api/auth/login', {}, { email: off.user.email, password: 'Password123' })).status).toBe(401);
  });

  it('rafraîchit la session avec le bon jeton seulement', async () => {
    const t = await makeTenant();
    const login = (await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'Password123' })).body;
    const r = await post('/api/auth/refresh', {}, { refreshToken: login.refreshToken });
    expect(r.status).toBe(200);
    expect((await get('/api/users/me', auth(r.body.accessToken))).status).toBe(200);
    expect((await post('/api/auth/refresh', {}, { refreshToken: 'nimporte.quoi.ici' })).status).toBe(401);
    // un jeton d'accès n'est pas un jeton de rafraîchissement
    expect((await post('/api/auth/refresh', {}, { refreshToken: login.accessToken })).status).toBe(401);
  });

  it('change le mot de passe (ancien exigé) et révoque le jeton de rafraîchissement', async () => {
    const t = await makeTenant();
    const login = (await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'Password123' })).body;
    const h = auth(login.accessToken);
    expect((await post('/api/auth/change-password', h, { currentPassword: 'faux', newPassword: 'Nouveau#2026' })).status).toBe(400);
    expect((await post('/api/auth/change-password', h, { currentPassword: 'Password123', newPassword: 'court' })).status).toBe(400);
    expect((await post('/api/auth/change-password', h, { currentPassword: 'Password123', newPassword: 'Nouveau#2026' })).status).toBe(200);
    expect((await post('/api/auth/refresh', {}, { refreshToken: login.refreshToken })).status).toBe(401);
    expect((await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'Nouveau#2026' })).status).toBe(200);
  });

  it('réinitialisation : lien à usage unique, qui ne vaut pas session, et qu\'un jeton de session ne peut pas remplacer', async () => {
    const t = await makeTenant();
    let link = '';
    jest.spyOn(EmailService.prototype, 'sendPasswordResetEmail').mockImplementation(async (_to, token) => { link = token; });
    // même réponse que l'email existe ou non (pas d'énumération des comptes)
    expect((await post('/api/auth/forgot-password', {}, { email: 'inconnu@exemple.org' })).body).toEqual({ message: 'Reset link sent' });
    expect(link).toBe('');
    expect((await post('/api/auth/forgot-password', {}, { email: t.admin.user.email })).status).toBe(200);
    expect(link).toBeTruthy();

    // le lien de réinitialisation n'ouvre pas l'API
    expect((await get('/api/users/me', auth(link))).status).toBe(401);
    // un jeton de session ne permet pas de réinitialiser le mot de passe
    expect((await post('/api/auth/reset-password', {}, { token: t.admin.token, newPassword: 'Pirate#2026' })).status).toBe(400);
    // un jeton forgé à l'ancienne (même secret, sans usage) non plus
    const old = jwt.sign({ id: t.admin.user.id }, config.jwtSecret, { expiresIn: '1h' });
    expect((await post('/api/auth/reset-password', {}, { token: old, newPassword: 'Pirate#2026' })).status).toBe(400);

    expect((await post('/api/auth/reset-password', {}, { token: link, newPassword: 'Retrouve#2026' })).status).toBe(200);
    expect((await post('/api/auth/login', {}, { email: t.admin.user.email, password: 'Retrouve#2026' })).status).toBe(200);
    // usage unique : le même lien ne sert plus
    expect((await post('/api/auth/reset-password', {}, { token: link, newPassword: 'Encore#2026' })).status).toBe(400);
  });

  it('refuse les jetons sans type « access » (anciens jetons, jetons de vérification)', async () => {
    const t = await makeTenant();
    const legacy = jwt.sign({ id: t.admin.user.id, email: t.admin.user.email, companyId: t.company.id, role: 'ADMIN' }, config.jwtSecret, { expiresIn: '1h' });
    expect((await get('/api/users/me', auth(legacy))).status).toBe(401);
    expect((await get('/api/users/me')).status).toBe(401);
    expect((await get('/api/users/me', { Authorization: 'Bearer abc' })).status).toBe(401);
  });
});

describe('utilisateurs', () => {
  it('liste, consulte, crée et modifie dans sa société seulement, sans exposer les mots de passe', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const created = await post('/api/users', a.headers, { firstName: 'Issa', lastName: 'Sawadogo', email: 'issa@exemple.org', password: 'Issa#20260', companyId: b.company.id });
    expect(created.status).toBe(201);
    expect(created.body.password).toBeUndefined();
    expect(created.body.companyId).toBe(a.company.id); // la société vient du jeton, pas du corps
    const list = await get('/api/users', a.headers);
    expect(list.body.users.every((u: any) => u.password === undefined && u.companyId === a.company.id)).toBe(true);
    expect((await get(`/api/users/${created.body.id}`, b.headers)).status).toBe(403);
    expect((await put(`/api/users/${created.body.id}`, b.headers, { firstName: 'X' })).status).toBe(403);
    expect((await put(`/api/users/${created.body.id}`, a.headers, { jobTitle: 'Analyste' })).body.jobTitle).toBe('Analyste');
    expect((await post('/api/users', a.headers, { firstName: 'X', lastName: 'Y', email: 'issa@exemple.org', password: 'Issa#20260' })).status).toBe(400);
  });

  it('interdit l\'escalade de rôle et la désactivation de soi-même ; un employé ne gère pas les comptes', async () => {
    const t = await makeTenant();
    const emp = await makeUser(t.company.id, 'EMPLOYEE');
    expect((await post('/api/users', t.headers, { firstName: 'S', lastName: 'A', email: 'sa@exemple.org', password: 'Super#2026', role: 'SUPER_ADMIN' })).status).toBe(403);
    expect((await put(`/api/users/${emp.user.id}`, t.headers, { role: 'SUPER_ADMIN' })).status).toBe(403);
    expect((await put(`/api/users/${t.admin.user.id}`, t.headers, { isActive: false })).status).toBe(400);
    expect((await del(`/api/users/${t.admin.user.id}`, t.headers)).status).toBe(400);
    expect((await post('/api/users', auth(emp.token), { firstName: 'X', lastName: 'Y', email: 'x@exemple.org', password: 'Xxxx#2026' })).status).toBe(403);
    expect((await del(`/api/users/${t.admin.user.id}`, auth(emp.token))).status).toBe(403);
    // suppression = désactivation
    expect((await del(`/api/users/${emp.user.id}`, t.headers)).status).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: emp.user.id } }))!.isActive).toBe(false);
  });

  it('profil personnel : seuls les champs autorisés sont modifiables', async () => {
    const t = await makeTenant();
    const emp = await makeUser(t.company.id, 'EMPLOYEE');
    const r = await put('/api/users/me', auth(emp.token), { jobTitle: 'Chargée d\'études', role: 'ADMIN', email: 'pirate@exemple.org' });
    expect(r.status).toBe(200);
    expect(r.body.jobTitle).toBe('Chargée d\'études');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: emp.user.id } });
    expect(after.role).toBe('EMPLOYEE');
    expect(after.email).toBe(emp.user.email);
    expect(r.body.companyName).toBe(t.company.name);
  });
});

describe('sociétés et équipes', () => {
  it('un administrateur ne voit et ne modifie que sa société ; seul le super-administrateur en crée', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    expect((await get('/api/companies', a.headers)).body.map((c: any) => c.id)).toEqual([a.company.id]);
    expect((await get(`/api/companies/${b.company.id}`, a.headers)).status).toBe(403);
    expect((await put(`/api/companies/${b.company.id}`, a.headers, { name: 'Piratée' })).status).toBe(403);
    expect((await put(`/api/companies/${a.company.id}`, a.headers, { name: 'Ministère renommé' })).body.name).toBe('Ministère renommé');
    expect((await post('/api/companies', a.headers, { name: 'Nouvelle' })).status).toBe(403);
    const root = await makeUser(a.company.id, 'SUPER_ADMIN');
    expect((await post('/api/companies', auth(root.token), { name: 'Nouvelle administration' })).status).toBe(201);
    expect((await get('/api/companies', auth(root.token))).body.length).toBeGreaterThanOrEqual(3);
  });

  it('équipes cloisonnées par société', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const team = await post('/api/teams', a.headers, { name: 'Cellule informatique', companyId: b.company.id });
    expect(team.status).toBe(201);
    expect(team.body.companyId).toBe(a.company.id);
    expect((await get('/api/teams', a.headers)).body).toHaveLength(1);
    expect((await get('/api/teams', b.headers)).body).toHaveLength(0);
    expect((await get(`/api/teams/${team.body.id}`, b.headers)).status).toBe(403);
    expect((await del(`/api/teams/${team.body.id}`, b.headers)).status).toBe(403);
    expect((await put(`/api/teams/${team.body.id}`, a.headers, { name: 'Cellule SI' })).body.name).toBe('Cellule SI');
    expect((await del(`/api/teams/${team.body.id}`, a.headers)).status).toBe(204);
  });
});

describe('cartes de visite, QR et tableau de bord', () => {
  it('crée, liste, modifie, exporte et archive une carte ; la page publique ne montre que les informations publiques', async () => {
    const t = await makeTenant();
    const emp = await makeUser(t.company.id, 'EMPLOYEE');
    const other = await makeTenant();
    const c = await post('/api/cards', auth(emp.token), { fullName: 'Rasmata Zongo', jobTitle: 'Ingénieure', email: 'rasmata@exemple.org', phoneMobile: '' });
    expect(c.status).toBe(201);
    expect(c.body.slug).toMatch(/rasmata-zongo/);
    expect((await get('/api/cards', t.headers)).body.map((x: any) => x.id)).toContain(c.body.id);
    expect((await get('/api/cards', other.headers)).body).toHaveLength(0);
    expect((await get(`/api/cards/${c.body.id}`, other.headers)).status).toBe(403);

    // modification : propriétaire ou gestionnaire ; champs protégés ignorés
    const upd = await put(`/api/cards/${c.body.id}`, auth(emp.token), { fullName: 'Rasmata Zongo', jobTitle: 'Cheffe de projet', companyId: other.company.id, slug: 'pirate' });
    expect(upd.status).toBe(200);
    expect(upd.body.jobTitle).toBe('Cheffe de projet');
    const stored = await prisma.businessCard.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(stored.companyId).toBe(t.company.id);
    expect(stored.slug).toBe(c.body.slug);
    const colleague = await makeUser(t.company.id, 'EMPLOYEE');
    expect((await put(`/api/cards/${c.body.id}`, auth(colleague.token), { fullName: 'X' })).status).toBe(403);

    // exports
    const vcf = await get(`/api/cards/${c.body.id}/vcard`, t.headers);
    expect(vcf.status).toBe(200);
    expect(vcf.text).toContain('BEGIN:VCARD');
    expect(vcf.text).toContain('Rasmata');
    const qr = await get(`/api/cards/${c.body.id}/qrcode`, t.headers).buffer(true);
    expect(qr.headers['content-type']).toBe('image/png');

    // page publique (sans connexion) : jamais les champs administratifs ; le scan est compté
    const pub = await get(`/api/cards/public/${c.body.slug}`);
    expect(pub.status).toBe(200);
    for (const k of ['agentId', 'cardNumber', 'status', 'userId', 'expiresAt']) expect(pub.body[k]).toBeUndefined();
    expect((await get(`/api/cards/public/${c.body.slug}/vcard`)).text).toContain('BEGIN:VCARD');
    expect((await get(`/api/qr/public/${c.body.slug}`)).headers['content-type']).toBe('image/png');
    expect((await get('/api/cards/public/inexistante')).status).toBe(404);
    const counted = await (async () => { for (let i = 0; i < 50; i++) { if (await prisma.scan.count({ where: { cardId: c.body.id } })) return true; await new Promise(r => setTimeout(r, 100)); } return false; })();
    expect(counted).toBe(true);

    // tableau de bord
    const dash = await get('/api/dashboard/stats', t.headers);
    expect(dash.status).toBe(200);
    expect(dash.body).toMatchObject({ cards: 1, companies: 1 });
    expect(dash.body.scans).toBeGreaterThanOrEqual(1);
    expect((await get('/api/dashboard/stats', other.headers)).body).toMatchObject({ cards: 0, scans: 0 });
    expect((await get('/api/dashboard/statistics', t.headers)).status).toBe(200);

    // désactivée : plus visible publiquement ; suppression réservée au propriétaire / gestionnaire
    await put(`/api/cards/${c.body.id}`, t.headers, { fullName: 'Rasmata Zongo', isActive: false });
    expect((await get(`/api/cards/public/${c.body.slug}`)).status).toBe(404);
    expect((await del(`/api/cards/${c.body.id}`, auth(colleague.token))).status).toBe(403);
    expect((await del(`/api/cards/${c.body.id}`, t.headers)).status).toBe(204);
  });

  it('générateur de QR réservé aux utilisateurs connectés', async () => {
    const t = await makeTenant();
    expect((await get('/api/qr/generate?url=https://exemple.org')).status).toBe(401);
    expect((await get('/api/qr/generate', t.headers)).status).toBe(400);
    expect((await get('/api/qr/generate?url=https://exemple.org', t.headers)).headers['content-type']).toBe('image/png');
  });
});

describe('envoi de photo', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

  it('accepte une vraie image, refuse un faux PNG, un format interdit, et sans connexion', async () => {
    const t = await makeTenant();
    const ok = await request(app).post('/api/files/upload').set(t.headers).attach('file', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/\/uploads\/photo\/[0-9a-f]{32}\.png$/);
    await fs.rm(path.join(process.cwd(), new URL(ok.body.url).pathname), { force: true });

    const fake = await request(app).post('/api/files/upload').set(t.headers).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const pdf = await request(app).post('/api/files/upload').set(t.headers).attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    expect((await request(app).post('/api/files/upload').set(t.headers)).status).toBe(400);
    expect((await request(app).post('/api/files/upload').attach('file', PNG, { filename: 'p.png', contentType: 'image/png' })).status).toBe(401);
  });
});
