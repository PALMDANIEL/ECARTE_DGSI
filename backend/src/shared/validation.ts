import { Request, Response, NextFunction, RequestHandler } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppError } from './errors/app-error';

/** Valide un corps de requête ; les propriétés non déclarées dans le DTO sont retirées (pas de mass-assignment). */
export async function parseDto<T extends object>(cls: new () => T, body: unknown): Promise<T> {
  const dto = plainToInstance(cls, body ?? {});
  const errors = await validate(dto, { whitelist: true });
  if (errors.length) {
    const message = errors.map(e => Object.values(e.constraints || {}).join(', ')).join(' ; ');
    throw new AppError(message || 'Données invalides', 400);
  }
  return dto;
}

/** Express 4 ne capture pas les erreurs des handlers async : on les transmet au gestionnaire d'erreurs. */
export const asyncHandler =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
