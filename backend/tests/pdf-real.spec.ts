import fs from 'fs';
import { app, prisma, request, resetDb } from './helpers';
import { scenario, submitDecisionRequest, act } from './requests-helpers';
import { htmlPdfService } from '../src/infrastructure/pdf/html-pdf.service';

beforeAll(() => { htmlPdfService.useRealRenderer = true; });
afterAll(async () => { htmlPdfService.useRealRenderer = false; await htmlPdfService.close(); });
beforeEach(resetDb);

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

describe('rendu PDF réel (Chrome)', () => {
  it('génère un PDF valide pour chacun des trois modèles (aperçu administrateur)', async () => {
    const sc = await scenario();
    const list = (await request(app).get('/api/form-templates').set(sc.H)).body;
    for (const code of ['DECISION_CONGE', 'JOUISSANCE_CONGE', 'AUTORISATION_ABSENCE']) {
      const tpl = list.find((t: any) => t.typeCode === code);
      const res = await request(app).post(`/api/form-templates/${code}/preview`).set(sc.H).send({ html: tpl.html, css: tpl.css }).buffer(true).parse((r, cb) => { const d: Buffer[] = []; r.on('data', x => d.push(x)); r.on('end', () => cb(null, Buffer.concat(d))); });
      expect(res.status).toBe(200);
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(8000);
      expect(pageCount(pdf)).toBeGreaterThanOrEqual(1);
      expect(pageCount(pdf)).toBeLessThanOrEqual(3);
      if (process.env.SAVE_PDF_DIR) fs.writeFileSync(`${process.env.SAVE_PDF_DIR}/apercu-${code}.pdf`, pdf);
    }
  }, 120000);

  it('génère, stocke hors du dossier public et relit le document d\'une vraie demande après traitement', async () => {
    const sc = await scenario();
    const r = await submitDecisionRequest(sc);
    const s1 = (await prisma.requestStep.findFirst({ where: { requestId: r.id, order: 1 } }))!;
    await act(sc, sc.people.dir, r.id, s1.id, { action: 'FAVORABLE' });
    const docs = await prisma.requestDocument.findMany({ where: { requestId: r.id }, orderBy: { version: 'asc' } });
    expect(docs).toHaveLength(2);
    expect(docs.every(d => d.size > 8000)).toBe(true);
    expect(docs[0].path).toMatch(/^requests\//);
    const dl = await request(app).get(`/api/access/requests/${r.id}/document`).set(sc.agent.headers).buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on('data', x => d.push(x)); res.on('end', () => cb(null, Buffer.concat(d))); });
    expect(dl.status).toBe(200);
    const pdf = dl.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBe(docs[1].size);
    if (process.env.SAVE_PDF_DIR) fs.writeFileSync(`${process.env.SAVE_PDF_DIR}/demande-decision-v2.pdf`, pdf);
  }, 120000);
});
