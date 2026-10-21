import { Router } from 'express';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { prisma } from '../../database/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { AppError } from '../../shared/errors/app-error';
import { parseCsv, parseDate } from '../../shared/utils/csv';
import { toIsoDate } from '../../shared/utils/fr-format';
import { asyncHandler, parseDto } from '../../shared/validation';
import { auditService } from '../audit/audit.service';
import { LEAVE_TYPE, leaveService } from './leave.service';

class RegularisationDto {
  @IsString() @IsNotEmpty() agentId!: string;
  @IsString() @IsNotEmpty() leaveType!: string;
  @IsInt() year!: number;
  @IsNumber() days!: number;
  @IsString() @IsNotEmpty() reason!: string;
}
class CancelDecisionDto { @IsString() @IsNotEmpty() reason!: string; }
class ImportDto { @IsString() csv!: string; @IsOptional() @IsBoolean() dryRun?: boolean; }
class HolidayDto { @IsDateString() date!: string; @IsString() @IsNotEmpty() label!: string; }

const admin = authorize('ADMIN', 'SUPER_ADMIN');
const actorOf = (req: any) => ({ id: req.user.id, email: req.user.email });
const yearOf = (v: unknown) => { const y = parseInt(String(v), 10); return Number.isInteger(y) ? y : new Date().getUTCFullYear(); };

async function assertAgent(companyId: string, agentId: string) {
  if (!(await prisma.agentProfile.findFirst({ where: { userId: agentId, companyId } }))) throw new AppError('Agent introuvable', 404);
}

// ------------------------------------------------------------------ /leave
const leave = Router();
leave.use(authenticate, admin);

leave.get('/agents/:id/overview', asyncHandler(async (req, res) => {
  await assertAgent(req.user.companyId, req.params.id);
  res.json(await leaveService.overview(req.params.id, yearOf(req.query.year)));
}));

leave.get('/agents/:id/ledger', asyncHandler(async (req, res) => {
  await assertAgent(req.user.companyId, req.params.id);
  res.json(await leaveService.ledger(req.params.id, { year: req.query.year ? yearOf(req.query.year) : undefined, leaveType: req.query.leaveType as string }));
}));

leave.get('/controls', asyncHandler(async (req, res) => res.json(await leaveService.controls(req.user.companyId))));

/** Procédure de régularisation : seule voie pour corriger un solde (le registre est en écriture seule). */
leave.post('/regularisations', asyncHandler(async (req, res) => {
  const dto = await parseDto(RegularisationDto, req.body);
  const row = await leaveService.regularise(prisma, { companyId: req.user.companyId, ...dto, actorId: req.user.id });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'LEAVE_REGULARISED', entity: 'Agent', entityId: dto.agentId, after: { leaveType: dto.leaveType, year: dto.year, days: dto.days, reason: dto.reason }, req });
  res.status(201).json(row);
}));

/**
 * Import d'ajustements (reprise des soldes avant la mise en service) : matricule ; annee ; type ; jours ; motif.
 * « jours » est signé (ex. -12 = 12 jours déjà pris). Validation d'abord, écriture tout ou rien.
 */
leave.post('/adjustments/import', asyncHandler(async (req, res) => {
  const dto = await parseDto(ImportDto, req.body);
  const dryRun = dto.dryRun !== false;
  const companyId = req.user.companyId;
  const { headers, rows } = parseCsv(dto.csv);
  const report = { dryRun, total: rows.length, created: 0, updated: 0, errors: [] as { line: number; message: string }[] };
  const missing = ['matricule', 'annee', 'type', 'jours', 'motif'].filter(h => !headers.includes(h));
  if (missing.length) { report.errors.push({ line: 1, message: `Colonne(s) obligatoire(s) absente(s) : ${missing.join(', ')}` }); return res.json(report); }
  const profiles = new Map((await prisma.agentProfile.findMany({ where: { companyId }, select: { matricule: true, userId: true } })).map(p => [p.matricule, p.userId]));
  const types = new Set((await prisma.absenceType.findMany({ where: { companyId }, select: { code: true } })).map(t => t.code).concat(LEAVE_TYPE));
  const ok: { agentId: string; leaveType: string; year: number; days: number; reason: string }[] = [];
  for (const r of rows) {
    const v = r.values;
    const fail = (m: string) => report.errors.push({ line: r.line, message: `${v.matricule || '?'} : ${m}` });
    const agentId = profiles.get((v.matricule || '').toUpperCase());
    const year = parseInt(v.annee, 10), days = Number(String(v.jours).replace(',', '.')), leaveType = (v.type || '').toUpperCase();
    if (!agentId) fail('matricule inconnu');
    else if (!types.has(leaveType)) fail(`type « ${v.type} » inconnu (${[...types].join(', ')})`);
    else if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear() + 1) fail('année invalide');
    else if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 365) fail('nombre de jours invalide');
    else if ((v.motif || '').trim().length < 5) fail('motif obligatoire (5 caractères minimum)');
    else ok.push({ agentId, leaveType, year, days, reason: v.motif.trim() });
  }
  report.created = ok.length;
  if (report.errors.length || dryRun) return res.json(report);
  await prisma.$transaction(async tx => { for (const a of ok) await leaveService.regularise(tx, { companyId, ...a, actorId: req.user.id }); });
  await auditService.log({ companyId, actor: actorOf(req), action: 'LEAVE_ADJUSTMENTS_IMPORTED', entity: 'Agent', after: { count: ok.length }, req });
  res.json(report);
}));

leave.get('/adjustments/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-ajustements.csv"');
  res.send('﻿matricule;annee;type;jours;motif\n386239D;2026;CONGE_ANNUEL;-12;Jours déjà pris avant la mise en service de l\'application\n');
});

/** Annulation d'une décision de congé : impossible si des jours ont déjà été pris. */
leave.post('/decisions/:id/cancel', asyncHandler(async (req, res) => {
  const dto = await parseDto(CancelDecisionDto, req.body);
  if (dto.reason.trim().length < 5) throw new AppError('Le motif est obligatoire (5 caractères minimum)', 400);
  const d = await prisma.leaveDecision.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!d) throw new AppError('Décision introuvable', 404);
  if (d.status !== 'VALID') throw new AppError('Cette décision n\'est plus valide', 409);
  if (await prisma.request.count({ where: { leaveDecisionId: d.id, status: { in: ['IN_PROGRESS', 'RETURNED', 'APPROVED'] } } })) throw new AppError('Des jouissances sont liées à cette décision : annulation impossible', 409);
  await prisma.leaveDecision.update({ where: { id: d.id }, data: { status: 'CANCELLED' } });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'LEAVE_DECISION_CANCELLED', entity: 'LeaveDecision', entityId: d.id, before: { status: 'VALID', number: d.number }, after: { status: 'CANCELLED', reason: dto.reason }, req });
  res.json({ id: d.id, status: 'CANCELLED' });
}));

// ------------------------------------------------------------------ /holidays
const holidays = Router();
holidays.use(authenticate);
holidays.get('/', asyncHandler(async (req, res) => {
  const year = req.query.year ? yearOf(req.query.year) : undefined;
  res.json(await prisma.holiday.findMany({ where: { companyId: req.user.companyId, ...(year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } } : {}) }, orderBy: { date: 'asc' } }));
}));
holidays.post('/', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(HolidayDto, req.body);
  const date = new Date(toIsoDate(new Date(dto.date)) + 'T00:00:00Z');
  if (await prisma.holiday.findUnique({ where: { companyId_date: { companyId: req.user.companyId, date } } })) throw new AppError('Ce jour férié existe déjà', 409);
  const h = await prisma.holiday.create({ data: { companyId: req.user.companyId, date, label: dto.label.trim() } });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'HOLIDAY_CREATED', entity: 'Holiday', entityId: h.id, after: h, req });
  res.status(201).json(h);
}));
holidays.delete('/:id', admin, asyncHandler(async (req, res) => {
  const h = await prisma.holiday.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!h) throw new AppError('Jour férié introuvable', 404);
  await prisma.holiday.delete({ where: { id: h.id } });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'HOLIDAY_DELETED', entity: 'Holiday', entityId: h.id, before: h, req });
  res.status(204).send();
}));
/** Import CSV : date ; libelle (JJ/MM/AAAA ou AAAA-MM-JJ). Aucune liste n'est fournie par défaut : elle relève des textes en vigueur. */
holidays.post('/import', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(ImportDto, req.body);
  const dryRun = dto.dryRun !== false;
  const { headers, rows } = parseCsv(dto.csv);
  const report = { dryRun, total: rows.length, created: 0, updated: 0, errors: [] as { line: number; message: string }[] };
  if (!headers.includes('date') || !headers.includes('libelle')) { report.errors.push({ line: 1, message: 'Colonnes obligatoires : date ; libelle' }); return res.json(report); }
  const items: { date: Date; label: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    try {
      const date = parseDate(r.values.date);
      if (!date) throw new Error('date vide');
      if (!r.values.libelle) throw new Error('libellé vide');
      const key = toIsoDate(date);
      if (seen.has(key)) throw new Error(`date en double dans le fichier (${key})`);
      seen.add(key);
      items.push({ date, label: r.values.libelle });
    } catch (e: any) { report.errors.push({ line: r.line, message: e.message }); }
  }
  const existing = new Set((await prisma.holiday.findMany({ where: { companyId: req.user.companyId }, select: { date: true } })).map(h => toIsoDate(h.date)));
  report.created = items.filter(i => !existing.has(toIsoDate(i.date))).length;
  report.updated = items.length - report.created;
  if (report.errors.length || dryRun) return res.json(report);
  await prisma.$transaction(items.map(i => prisma.holiday.upsert({ where: { companyId_date: { companyId: req.user.companyId, date: i.date } }, update: { label: i.label }, create: { companyId: req.user.companyId, date: i.date, label: i.label } })));
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'HOLIDAYS_IMPORTED', entity: 'Holiday', after: { created: report.created, updated: report.updated }, req });
  res.json(report);
}));

export { leave as leaveRouter, holidays as holidayRouter };
