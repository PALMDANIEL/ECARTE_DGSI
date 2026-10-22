import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/validation';
import { notifyService } from './notify.service';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => res.json(await notifyService.list(req.user.id, { unreadOnly: req.query.unread === 'true', page: parseInt(req.query.page as string) || 1, limit: parseInt(req.query.limit as string) || 20 }))));
router.get('/unread-count', asyncHandler(async (req, res) => res.json({ unread: await notifyService.unreadCount(req.user.id) })));
router.post('/read-all', asyncHandler(async (req, res) => res.json({ updated: await notifyService.markAllRead(req.user.id) })));
router.post('/:id/read', asyncHandler(async (req, res) => { await notifyService.markRead(req.user.id, req.params.id); res.status(204).send(); }));

export { router as notificationRouter };
