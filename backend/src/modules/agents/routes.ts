import { Router } from 'express';
import { IsString, IsOptional, IsEmail, IsBoolean, IsDateString, IsNotEmpty, IsIn } from 'class-validator';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { asyncHandler, parseDto } from '../../shared/validation';
import { agentService, AgentInput } from './agent.service';

const CIVILITIES = ['M', 'MME', 'MLLE'];

class AgentDto {
  @IsString() @IsNotEmpty() matricule!: string;
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsIn(CIVILITIES) civility?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() corps?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsDateString() serviceStartDate?: string;
  @IsOptional() @IsString() regime?: string;
  @IsOptional() @IsString() orgUnitId?: string;
  @IsOptional() @IsString() supervisorId?: string;
}
class UpdateAgentDto {
  @IsOptional() @IsString() @IsNotEmpty() matricule?: string;
  @IsOptional() @IsString() @IsNotEmpty() firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() civility?: string | null;
  @IsOptional() grade?: string | null;
  @IsOptional() corps?: string | null;
  @IsOptional() hireDate?: string | null;
  @IsOptional() serviceStartDate?: string | null;
  @IsOptional() @IsString() regime?: string;
  @IsOptional() orgUnitId?: string | null;
  @IsOptional() supervisorId?: string | null;
}
class ImportDto { @IsString() csv!: string; @IsOptional() @IsBoolean() dryRun?: boolean; }
class ActiveDto { @IsBoolean() isActive!: boolean; }

const toDate = (v?: string | null) => (v ? new Date(v) : v === null ? null : undefined);
const actorOf = (req: any) => ({ id: req.user.id, email: req.user.email });
const admin = authorize('ADMIN', 'SUPER_ADMIN');

const router = Router();
router.use(authenticate);

router.get('/', admin, asyncHandler(async (req, res) => {
  const q = req.query;
  res.json(await agentService.list(req.user.companyId, { search: q.search as string, orgUnitId: q.orgUnitId as string, page: parseInt(q.page as string) || 1, limit: parseInt(q.limit as string) || 25 }));
}));

router.get('/import/template', admin, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-agents.csv"');
  res.send('﻿matricule;nom;prenom;email;telephone;civilite;grade;corps;date_integration;date_entree_service;code_unite;matricule_superieur;regime\n386239D;PALM;Romeo Daratagnan;;;M;Ingénieur de Travaux en Informatique;Informaticiens;01/03/2018;01/03/2018;SDA;;FONCTIONNAIRE\n');
});

router.post('/import', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(ImportDto, req.body);
  res.json(await agentService.importCsv(req.user.companyId, dto.csv, dto.dryRun !== false, actorOf(req), req));
}));

router.post('/', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(AgentDto, req.body);
  const input: AgentInput = { ...dto, hireDate: toDate(dto.hireDate), serviceStartDate: toDate(dto.serviceStartDate) };
  res.status(201).json(await agentService.create(req.user.companyId, input, actorOf(req), req));
}));

router.get('/:id', admin, asyncHandler(async (req, res) => res.json(await agentService.get(req.user.companyId, req.params.id))));
router.get('/:id/cards', admin, asyncHandler(async (req, res) => res.json(await agentService.cardHistory(req.user.companyId, req.params.id))));

router.put('/:id', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(UpdateAgentDto, req.body);
  const input: Partial<AgentInput> = { ...dto, hireDate: toDate(dto.hireDate), serviceStartDate: toDate(dto.serviceStartDate) } as any;
  // Les champs explicitement vidés (null) doivent être conservés tels quels
  for (const k of ['civility', 'grade', 'corps', 'orgUnitId', 'supervisorId'] as const) if (k in (req.body || {})) (input as any)[k] = req.body[k] || null;
  for (const k of ['hireDate', 'serviceStartDate'] as const) if (k in (req.body || {})) (input as any)[k] = toDate(req.body[k] || null) ?? null;
  res.json(await agentService.updateProfile(req.user.companyId, req.params.id, input, actorOf(req), req));
}));

router.post('/:id/pin/reset', admin, asyncHandler(async (req, res) => res.json(await agentService.resetPin(req.user.companyId, req.params.id, actorOf(req), req))));
router.put('/:id/active', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(ActiveDto, req.body);
  await agentService.setActive(req.user.companyId, req.params.id, dto.isActive, actorOf(req), req);
  res.status(204).send();
}));

export { router as agentRouter };
