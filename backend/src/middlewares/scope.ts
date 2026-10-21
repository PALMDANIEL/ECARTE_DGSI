import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';

type ScopedModel = 'user' | 'team' | 'businessCard';

// Verrouille les routes /:id sur la société de l'utilisateur connecté (SUPER_ADMIN exclu : accès multi-sociétés).
export const scopeByCompany = (model: ScopedModel) =>
  async (req: Request & { user?: any }, res: Response, next: NextFunction, id: string) => {
    try {
      const entity = await (prisma as any)[model].findUnique({ where: { id }, select: { companyId: true, ...(model === 'businessCard' ? { userId: true } : {}) } });
      if (!entity) return res.status(404).json({ message: 'Not found' });
      if (req.user?.role !== 'SUPER_ADMIN' && entity.companyId !== req.user?.companyId) return res.status(403).json({ message: 'Forbidden' });
      (req as any).scopedEntity = entity;
      next();
    } catch (error) {
      next(error);
    }
  };

// Une carte ne peut être modifiée/supprimée que par son propriétaire ou un ADMIN/MANAGER/SUPER_ADMIN.
export const cardOwnerOrManager = (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  const entity = (req as any).scopedEntity;
  if (['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user?.role) || entity?.userId === req.user?.id) return next();
  return res.status(403).json({ message: 'Forbidden' });
};

// Seul un SUPER_ADMIN peut attribuer le rôle SUPER_ADMIN.
export const noRoleEscalation = (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  if (req.body?.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });
  next();
};

// Une société n'est accessible que par ses membres (SUPER_ADMIN : toutes).
export const scopeCompanyParam = (req: Request & { user?: any }, res: Response, next: NextFunction, id: string) => {
  if (req.user?.role !== 'SUPER_ADMIN' && id !== req.user?.companyId) return res.status(403).json({ message: 'Forbidden' });
  next();
};
