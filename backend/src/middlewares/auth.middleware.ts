import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../infrastructure/config';
import { logger } from '../infrastructure/logger';
export interface AuthRequest extends Request { user?: { id: string; email: string; companyId: string; role: string }; }
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  try { req.user = jwt.verify(authHeader.split(' ')[1], config.jwtSecret) as any; next(); } catch (error) { logger.error('JWT failed', { error }); return res.status(401).json({ message: 'Invalid token' }); }
};
export const authorize = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Unauthorized' }); if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' }); next(); };
