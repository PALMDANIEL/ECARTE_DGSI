import { Router, Request } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { IsString, Length } from 'class-validator';
import { AppError } from '../../shared/errors/app-error';
import { asyncHandler, parseDto } from '../../shared/validation';
import { agentJwtSecret } from '../../shared/utils/crypto';
import { accessService, AgentSession } from './access.service';

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

// /me est déclaré avant /:token pour ne pas être pris pour un jeton
router.get('/me', authenticateAgent, asyncHandler(async (req, res) => res.json(await accessService.me(req.agent.sub, req.agent.cardId))));
router.get('/:token', scanLimiter, asyncHandler(async (req, res) => res.json(await accessService.scan(req.params.token, ctxOf(req)))));
router.post('/:token/pin', pinLimiter, asyncHandler(async (req, res) => {
  const dto = await parseDto(PinDto, req.body);
  res.json(await accessService.verifyPin(req.params.token, dto.pin, ctxOf(req)));
}));

export { router as accessRouter };
