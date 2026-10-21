import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/validation';
import { auditService } from './audit.service';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

router.get('/', asyncHandler(async (req, res) => {
  const q = req.query;
  res.json(await auditService.list(req.user.companyId, {
    entity: q.entity as string, entityId: q.entityId as string, action: q.action as string, actorId: q.actorId as string,
    from: q.from ? new Date(q.from as string) : undefined, to: q.to ? new Date(q.to as string) : undefined,
    page: parseInt(q.page as string) || 1, limit: parseInt(q.limit as string) || 50
  }));
}));

router.get('/verify', asyncHandler(async (_req, res) => res.json(await auditService.verify())));

export { router as auditRouter };
