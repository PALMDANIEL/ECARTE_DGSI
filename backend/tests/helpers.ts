import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { prisma } from '../src/database/client';
import { app } from '../src/app';
import { config } from '../src/infrastructure/config';

export { app, prisma, request };

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function makeCompany(name = `Ministère ${++counter}`) {
  return prisma.company.create({ data: { name } });
}

export async function makeUser(companyId: string, role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE', extra: Record<string, any> = {}) {
  const n = ++counter;
  const user = await prisma.user.create({
    data: { firstName: extra.firstName || 'Prénom' + n, lastName: extra.lastName || 'Nom' + n, email: `user${n}@test.local`, password: await bcrypt.hash('Password123', 4), companyId, role, isVerified: true }
  });
  return { user, token: jwt.sign({ id: user.id, email: user.email, companyId, role }, config.jwtSecret, { expiresIn: '1h' }) };
}

/** Attend qu'une condition soit vraie (effets asynchrones « fire and forget »), au lieu d'un délai fixe fragile. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 10000, stepMs = 50) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (await check()) return true; await new Promise(r => setTimeout(r, stepMs)); }
  return false;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Société + administrateur prêts à l'emploi. */
export async function makeTenant() {
  const company = await makeCompany();
  const admin = await makeUser(company.id, 'ADMIN');
  return { company, admin, headers: auth(admin.token) };
}

/** Crée un agent via l'API (compte + profil) et retourne ses identifiants. */
export async function createAgent(headers: Record<string, string>, data: Record<string, any> = {}) {
  const n = ++counter;
  const res = await request(app).post('/api/agents').set(headers).send({ matricule: `M${1000 + n}`, firstName: 'Awa', lastName: 'Koné', ...data });
  if (res.status !== 201) throw new Error(`createAgent: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Émet une carte pour l'agent et retourne l'URL d'accès (jeton en clair, comme sur le QR imprimé). */
export async function issueCard(headers: Record<string, string>, agentId: string) {
  const card = await request(app).post('/api/cards').set(headers).send({ fullName: 'Awa Koné', agentId });
  if (card.status !== 201) throw new Error(`create card: ${card.status} ${JSON.stringify(card.body)}`);
  const issued = await request(app).post(`/api/cards/${card.body.id}/issue`).set(headers);
  if (issued.status !== 200) throw new Error(`issue: ${issued.status} ${JSON.stringify(issued.body)}`);
  const { cardLifecycleService } = await import('../src/modules/card-lifecycle/card-lifecycle.service');
  const company = await prisma.businessCard.findUnique({ where: { id: card.body.id }, select: { companyId: true } });
  const url = (await cardLifecycleService.accessUrl(company!.companyId, card.body.id))!;
  return { cardId: card.body.id as string, token: url.split('/q/')[1], url, summary: issued.body };
}

afterAllDisconnect();
function afterAllDisconnect() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).afterAll?.(async () => { await prisma.$disconnect(); });
}
