import { app, request, makeTenant, createAgent, issueCard, tokenFor, auth, prisma } from './helpers';

const ORG_CSV = 'code;nom;type;code_parent\nSG;Secrétariat Général;SG;\nDGSI;Direction Générale des Systèmes d\'Information;DG;SG\nDLE;Direction de l\'Ingénierie logicielle et de l\'Exploitation;DIRECTION;DGSI\nSDA;Service Développement des Applications;SERVICE;DLE\n';

export interface Person { id: string; token: string; headers: Record<string, string> }

async function person(adminHeaders: Record<string, string>, data: Record<string, any>): Promise<Person> {
  const a = await createAgent(adminHeaders, data);
  const token = await tokenFor(a.id);
  return { id: a.id, token, headers: auth(token) };
}

/**
 * Scénario complet : société, organigramme SG › DG › Direction › Service, circuits des formulaires générés,
 * tous les postes pourvus, et un agent demandeur (carte émise, PIN connu, session ouverte).
 */
export async function scenario(opts: { fillPositions?: boolean; withWorkflows?: boolean } = {}) {
  const { fillPositions = true, withWorkflows = true } = opts;
  const t = await makeTenant();
  const H = t.headers;
  await request(app).post('/api/org-units/import').set(H).send({ csv: ORG_CSV, dryRun: false });
  const units = Object.fromEntries((await prisma.orgUnit.findMany({ where: { companyId: t.company.id } })).map(u => [u.code, u.id]));
  if (withWorkflows) await request(app).post('/api/workflows/bootstrap').set(H);

  const people = {
    minister: await person(H, { firstName: 'Marie', lastName: 'Ministre', civility: 'MME' }),
    sg: await person(H, { firstName: 'Samuel', lastName: 'Secrétaire', civility: 'M' }),
    drh: await person(H, { firstName: 'Diane', lastName: 'DRH', civility: 'MME' }),
    rh: await person(H, { firstName: 'Rachid', lastName: 'ChefRH', civility: 'M' }),
    dg: await person(H, { firstName: 'Denis', lastName: 'DG', civility: 'M', orgUnitId: units.DGSI }),
    dir: await person(H, { firstName: 'Didier', lastName: 'Directeur', civility: 'M', orgUnitId: units.DLE }),
    svc: await person(H, { firstName: 'Serge', lastName: 'ChefService', civility: 'M', orgUnitId: units.SDA }),
    other: await person(H, { firstName: 'Olivia', lastName: 'Autre', civility: 'MME', orgUnitId: units.SDA })
  };
  const applicantUser = await createAgent(H, { firstName: 'Awa Marie', lastName: 'Koné', civility: 'MME', matricule: 'M-0001', grade: 'Ingénieur', orgUnitId: units.SDA, supervisorId: people.svc.id, hireDate: '2015-01-01', serviceStartDate: '2015-01-01' });

  const positions = Object.fromEntries((await prisma.position.findMany({ where: { companyId: t.company.id } })).map(p => [p.code, p.id]));
  const holders: Record<string, Person> = { MINISTRE: people.minister, SECRETAIRE_GENERAL: people.sg, DRH: people.drh, CHEF_SERVICE_RH: people.rh, CHEF_DGSI: people.dg, CHEF_DLE: people.dir, CHEF_SDA: people.svc };
  if (withWorkflows && fillPositions) {
    for (const [code, p] of Object.entries(holders)) {
      const r = await request(app).post(`/api/positions/${positions[code]}/holders`).set(H).send({ userId: p.id });
      if (r.status !== 201) throw new Error(`holder ${code}: ${r.status} ${JSON.stringify(r.body)}`);
    }
  }

  const card = await issueCard(H, applicantUser.id);
  const pin = (await request(app).post(`/api/agents/${applicantUser.id}/pin/reset`).set(H)).body.pin as string;
  const session = (await request(app).post(`/api/access/${card.token}/pin`).send({ pin })).body.sessionToken as string;
  const agent = { id: applicantUser.id, session, headers: auth(session), cardToken: card.token, cardId: card.cardId, pin };
  return { t, H, units, positions, people, holders, agent };
}

export type Scenario = Awaited<ReturnType<typeof scenario>>;

export const today = () => new Date().toISOString().slice(0, 10);
export const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export const dcFields = (over: Record<string, any> = {}) => ({ year: new Date().getUTCFullYear(), destinations: "dans les pays de l'Afrique, aux USA et dans les pays membres de l'union Européenne", eStampNumber: '1790 8872 0082', ...over });

/** Dépose une demande de décision de congé (création + dépôt) et retourne la demande. */
export async function submitDecisionRequest(sc: Scenario, over: Record<string, any> = {}) {
  const c = await request(app).post('/api/access/requests').set(sc.agent.headers).send({ typeCode: 'DECISION_CONGE', fields: dcFields(over) });
  if (c.status !== 201) throw new Error(`create DC: ${c.status} ${JSON.stringify(c.body)}`);
  const s = await request(app).post(`/api/access/requests/${c.body.id}/submit`).set(sc.agent.headers);
  if (s.status !== 200) throw new Error(`submit DC: ${s.status} ${JSON.stringify(s.body)}`);
  return s.body;
}

export const act = (sc: Scenario, who: Person, requestId: string, stepId: string, body: Record<string, any>) =>
  request(app).post(`/api/requests/${requestId}/steps/${stepId}/act`).set(who.headers).send(body);

/** Fait traiter toutes les étapes d'une demande de décision par les bons responsables, jusqu'à l'approbation. */
export async function approveDecisionRequest(sc: Scenario, requestId: string, decisionNumber = '2026-14-00001/MEF/SG/DRH') {
  const order = [sc.people.dir, sc.people.dg, sc.people.drh, sc.people.sg];
  for (const who of order) {
    const inbox = (await request(app).get('/api/requests/inbox').set(who.headers)).body;
    const item = inbox.find((i: any) => i.id === requestId);
    if (!item) throw new Error('demande absente de la boîte de traitement');
    const r = await act(sc, who, requestId, item.activeStep.id, { action: 'FAVORABLE' });
    if (r.status !== 200) throw new Error(`avis: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const inbox = (await request(app).get('/api/requests/inbox').set(sc.people.minister.headers)).body;
  const item = inbox.find((i: any) => i.id === requestId);
  const fin = await act(sc, sc.people.minister, requestId, item.activeStep.id, { action: 'APPROVE', decisionNumber });
  if (fin.status !== 200) throw new Error(`décision: ${fin.status} ${JSON.stringify(fin.body)}`);
  return fin.body;
}
