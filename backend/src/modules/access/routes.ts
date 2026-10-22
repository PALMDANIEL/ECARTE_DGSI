import { Router, Request } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { IsString, Length, IsObject, IsNotEmpty } from 'class-validator';
import { AppError } from '../../shared/errors/app-error';
import { asyncHandler, parseDto } from '../../shared/validation';
import { agentJwtSecret } from '../../shared/utils/crypto';
import { accessService, AgentSession } from './access.service';
import { notifyService } from '../notifications/notify.service';
import { prisma } from '../../database/client';
import { requestService } from '../requests/request.service';
import { leaveService } from '../leave/leave.service';
import { attachmentUpload, sendFile, sendPdf, sniffMime } from '../requests/routes';

class PinDto { @IsString() @Length(4, 12, { message: 'PIN invalide' }) pin!: string; }

// Limitation par IP, indépendante du limiteur global : freine l'énumération de jetons et la force brute sur le PIN.
const scanLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 60, standardHeaders: true, legacyHeaders: false, message: { message: 'Trop de requêtes, réessayez plus tard.', code: 'RATE_LIMITED' } });
const pinLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Trop de tentatives, réessayez plus tard.', code: 'RATE_LIMITED' } });

const ctxOf = (req: Request) => ({ ip: req.ip || '', userAgent: req.headers['user-agent'] || '' });

/** Authentifie une session agent (QR + PIN). Refuse tout autre type de jeton. */
export const authenticateAgent = (req: any, _res: any, next: any) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AppError('Session agent requise', 401, 'AGENT_SESSION_REQUIRED'));
  try {
    const payload = jwt.verify(header.split(' ')[1], agentJwtSecret()) as AgentSession;
    if (payload.scope !== 'agent') throw new Error('scope');
    req.agent = payload;
    next();
  } catch {
    next(new AppError('Session expirée : scannez à nouveau votre carte', 401, 'AGENT_SESSION_EXPIRED'));
  }
};

const router = Router();

/**
 * Chaque appel de la session agent revérifie que la carte est toujours active et l'agent actif :
 * une révocation prend effet immédiatement, sans attendre l'expiration de la session.
 */
const agentContext = asyncHandler(async (req: any, _res, next) => {
  const s = req.agent as AgentSession;
  const [user, card] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.sub }, select: { id: true, isActive: true, companyId: true, agentProfile: { select: { userId: true } } } }),
    prisma.businessCard.findUnique({ where: { id: s.cardId }, select: { status: true, expiresAt: true, agentId: true } })
  ]);
  const ok = user?.isActive && user.agentProfile && card && card.agentId === s.sub && card.status === 'ACTIVE' && (!card.expiresAt || card.expiresAt > new Date());
  if (!ok) return next(new AppError('Carte invalide ou non utilisable', 404, 'CARD_INVALID'));
  req.agentCtx = { agentId: user.id, companyId: user.companyId };
  next();
});

class FieldsDto { @IsObject() fields!: Record<string, any>; @IsString() @IsNotEmpty() typeCode!: string; }
class UpdateFieldsDto { @IsObject() fields!: Record<string, any>; }

// --- Démarches de l'agent (demandes de congé, jouissance, absence) ---
router.get('/services', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.servicesFor(req.agentCtx.agentId, req.agentCtx.companyId))));
router.get('/decisions', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.availableDecisions(req.agentCtx.agentId, req.agentCtx.companyId))));
router.get('/absence-types', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  res.json(await prisma.absenceType.findMany({ where: { companyId: req.agentCtx.companyId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, unit: true, annualCap: true } }));
}));
router.get('/balance', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await leaveService.overview(req.agentCtx.agentId, parseInt(String(req.query.year), 10) || new Date().getUTCFullYear()))));
router.post('/requests/preview', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  const dto = await parseDto(FieldsDto, req.body);
  res.json(await requestService.preview(req.agentCtx.agentId, req.agentCtx.companyId, dto.typeCode, dto.fields));
}));
router.get('/requests', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.agentList(req.agentCtx.agentId))));
router.post('/requests', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  const dto = await parseDto(FieldsDto, req.body);
  res.status(201).json(await requestService.createDraft(req.agentCtx.agentId, req.agentCtx.companyId, dto.typeCode, dto.fields));
}));
router.get('/requests/:id', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.agentView(req.params.id, req.agentCtx.agentId))));
router.put('/requests/:id', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  const dto = await parseDto(UpdateFieldsDto, req.body);
  res.json(await requestService.updateDraft(req.params.id, req.agentCtx.agentId, dto.fields));
}));
router.post('/requests/:id/submit', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.submit(req.params.id, req.agentCtx.agentId))));
router.post('/requests/:id/cancel', authenticateAgent, agentContext, asyncHandler(async (req, res) => res.json(await requestService.cancel(req.params.id, req.agentCtx.agentId))));
router.get('/requests/:id/document', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  const out = await requestService.agentDocument(req.params.id, req.agentCtx.agentId);
  sendPdf(res, { ...out, reference: (await requestService.agentView(req.params.id, req.agentCtx.agentId)).reference });
}));
router.get('/requests/:id/documents/:version', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  const out = await requestService.agentDocument(req.params.id, req.agentCtx.agentId, parseInt(req.params.version));
  sendPdf(res, { ...out, reference: (await requestService.agentView(req.params.id, req.agentCtx.agentId)).reference });
}));
router.post('/requests/:id/attachments', authenticateAgent, agentContext, (req, res, next) => attachmentUpload(req, res, next), asyncHandler(async (req, res) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError('Aucun fichier fourni (champ « file »)', 400);
  const real = sniffMime(file.buffer);
  if (!real || real !== file.mimetype) throw new AppError('Le contenu du fichier ne correspond pas à son type (PDF, JPG ou PNG attendu)', 415);
  res.status(201).json(await requestService.addAttachment(req.params.id, req.agentCtx.agentId, file, req.body?.code));
}));
router.delete('/requests/:id/attachments/:attachmentId', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  await requestService.removeAttachment(req.params.id, req.agentCtx.agentId, req.params.attachmentId);
  res.status(204).send();
}));
router.get('/requests/:id/attachments/:attachmentId', authenticateAgent, agentContext, asyncHandler(async (req, res) => {
  await requestService.agentView(req.params.id, req.agentCtx.agentId);
  sendFile(res, await requestService.readAttachment(req.params.id, req.params.attachmentId));
}));

// /me est déclaré avant /:token pour ne pas être pris pour un jeton
router.get('/notifications', authenticateAgent, agentContext, asyncHandler(async (req: any, res) => res.json(await notifyService.list(req.agentCtx.agentId, { unreadOnly: req.query.unread === 'true', page: parseInt(String(req.query.page), 10) || 1, limit: parseInt(String(req.query.limit), 10) || 20 }))));
router.post('/notifications/read-all', authenticateAgent, agentContext, asyncHandler(async (req: any, res) => res.json({ updated: await notifyService.markAllRead(req.agentCtx.agentId) })));
router.post('/notifications/:id/read', authenticateAgent, agentContext, asyncHandler(async (req: any, res) => { await notifyService.markRead(req.agentCtx.agentId, req.params.id); res.status(204).send(); }));
router.get('/me', authenticateAgent, asyncHandler(async (req, res) => res.json(await accessService.me(req.agent.sub, req.agent.cardId))));
router.get('/:token', scanLimiter, asyncHandler(async (req, res) => res.json(await accessService.scan(req.params.token, ctxOf(req)))));
router.post('/:token/pin', pinLimiter, asyncHandler(async (req, res) => {
  const dto = await parseDto(PinDto, req.body);
  res.json(await accessService.verifyPin(req.params.token, dto.pin, ctxOf(req)));
}));

export { router as accessRouter };
