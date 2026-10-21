import { Request, Response, NextFunction } from 'express';
import { logger } from '../infrastructure/logger';
import { AppError } from '../shared/errors/app-error';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  return res.status(500).json({ message: 'Internal server error' });
};
