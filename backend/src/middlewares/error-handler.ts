import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logger } from '../infrastructure/logger';
import { AppError } from '../shared/errors/app-error';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  if (err instanceof AppError) return res.status(err.statusCode).json({ message: err.message });
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (5 Mo max)' : 'Envoi du fichier invalide (champ attendu : "file")';
    return res.status(400).json({ message });
  }
  if (err?.message?.startsWith('Format non supporté')) return res.status(400).json({ message: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON invalide' });
  return res.status(500).json({ message: 'Internal server error' });
};
