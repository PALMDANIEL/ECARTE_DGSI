import { Router, Request } from 'express';
import { RequestStatus } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { AppError } from '../../shared/errors/app-error';
import { asyncHandler } from '../../shared/validation';
import { toCsv } from '../../shared/utils/csv';
import { StatsFilter, statsService } from './stats.service';

const router = Router();
router.use(authenticate);

const STATUSES = ['IN_PROGRESS', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'];
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const date = (v: unknown, end = false) => {
  const s = str(v); if (!s) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : s);
  if (isNaN(+d)) throw new AppError(`Date invalide : ${s}`, 400);
  return d;
};
function filters(req: Request): StatsFilter {
  const status = str(req.query.status);
  if (status && !STATUSES.includes(status)) throw new AppError('Statut invalide', 400);
  const f: StatsFilter = { from: date(req.query.from), to: date(req.query.to, true), typeCode: str(req.query.typeCode), status: status as RequestStatus | undefined, orgUnitId: str(req.query.orgUnitId), agentId: str(req.query.agentId), positionId: str(req.query.positionId) };
  if (f.from && f.to && f.from > f.to) throw new AppError('La période est inversée', 400);
  return f;
}
const year = (req: Request) => parseInt(String(req.query.year), 10) || new Date().getUTCFullYear();
const csv = (res: any, name: string, body: string) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'no-store'); res.send(body); };

router.get('/overview', asyncHandler(async (req: any, res) => res.json(await statsService.overview(req.user, filters(req)))));
router.get('/requests', asyncHandler(async (req: any, res) => res.json(await statsService.requests(req.user, filters(req)))));
router.get('/requests.csv', asyncHandler(async (req: any, res) => {
  const rows = await statsService.requests(req.user, filters(req));
  csv(res, 'demandes.csv', toCsv(['Référence', 'Type', 'Statut', 'Agent', 'Matricule', 'Unité', 'Déposée le', 'Clôturée le', 'Jours', 'Du', 'Au', 'Étape en cours', 'Délai de traitement (jours)'],
    rows.map(r => [r.reference, r.type, r.status, r.applicant, r.matricule, r.unit, r.submittedAt, r.closedAt, r.days, r.from, r.to, r.currentStep, r.delayDays])));
}));
router.get('/balances', authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: any, res) => res.json(await statsService.balances(req.user, year(req), str(req.query.orgUnitId)))));
router.get('/balances.csv', authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: any, res) => {
  const rows = await statsService.balances(req.user, year(req), str(req.query.orgUnitId));
  csv(res, `soldes-${year(req)}.csv`, toCsv(['Matricule', 'Agent', 'Unité', 'Année', 'Jours acquis', 'Jours autorisés (décisions)', 'Jours consommés', 'Régularisations', 'Solde', 'Jours d\'absence'], rows.map(r => [r.matricule, r.name, r.unit, r.year, r.acquired, r.authorized, r.consumed, r.adjustments, r.remaining, r.absenceDays])));
}));

export { router as statsRouter };
