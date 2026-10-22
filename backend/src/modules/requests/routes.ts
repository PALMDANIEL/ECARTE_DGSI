import { Router } from 'express';
import multer from 'multer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { OrgUnitType, StepKind, StepResolution } from '@prisma/client';
import { prisma } from '../../database/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { AppError } from '../../shared/errors/app-error';
import { asyncHandler, parseDto } from '../../shared/validation';
import { auditService } from '../audit/audit.service';
import { htmlPdfService } from '../../infrastructure/pdf/html-pdf.service';
import { renderTemplate } from './templates/engine';
import { TEMPLATE_VARIABLES } from './templates/defaults';
import { ensureDefaults } from './request-defaults';
import { documentService, sampleContext } from './document.service';
import { requestService, ActAction } from './request.service';
import { workflowService } from './workflow.service';
import { escalationService } from './escalation.service';

const admin = authorize('ADMIN', 'SUPER_ADMIN');
const actorOf = (req: any) => ({ id: req.user.id, email: req.user.email });

// ------------------------------------------------------------------ DTO
class StepDto {
  @IsEnum(StepKind) kind!: StepKind;
  @IsOptional() @IsString() label?: string | null;
  @IsEnum(StepResolution) resolution!: StepResolution;
  @IsOptional() @IsString() positionId?: string | null;
  @IsOptional() @IsInt() @Min(1) level?: number | null;
  @IsOptional() @IsEnum(OrgUnitType) unitType?: OrgUnitType | null;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsObject() condition?: any;
  @IsOptional() @IsInt() @Min(1) deadlineDays?: number | null;
  @IsOptional() @IsString() escalatePositionId?: string | null;
  @IsOptional() @IsBoolean() allowReturn?: boolean;
  @IsOptional() @IsBoolean() rejectOnUnfavorable?: boolean;
}
class PublishDto { @IsArray() @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[]; @IsOptional() @IsString() name?: string; }
class SimulateDto { @IsString() @IsNotEmpty() typeCode!: string; @IsString() @IsNotEmpty() agentId!: string; @IsOptional() @IsObject() data?: Record<string, any>; }
class TypeUpdateDto { @IsOptional() @IsString() @IsNotEmpty() name?: string; @IsOptional() @IsBoolean() isActive?: boolean; @IsOptional() @IsArray() attachmentRules?: any[]; }
class ActDto { @IsString() action!: ActAction; @IsOptional() @IsString() comment?: string; @IsOptional() @IsString() decisionNumber?: string; }
class AbsenceTypeDto { @IsString() @IsNotEmpty() code!: string; @IsString() @IsNotEmpty() name!: string; @IsIn(['JOUR', 'HEURE', 'BOTH']) unit!: string; @IsOptional() annualCap?: number | null; @IsOptional() @IsBoolean() deductsFromLeave?: boolean; @IsOptional() @IsString() legalReference?: string | null; @IsOptional() @IsBoolean() isActive?: boolean; }
class TemplateDto { @IsString() @IsNotEmpty() html!: string; @IsString() css!: string; }

// ============================================================== /request-types
const types = Router();
types.use(authenticate);
types.get('/', admin, asyncHandler(async (req, res) => res.json(await workflowService.types(req.user.companyId))));
types.put('/:id', admin, asyncHandler(async (req, res) => res.json(await workflowService.updateType(req.user.companyId, req.params.id, await parseDto(TypeUpdateDto, req.body), actorOf(req), req))));

// ============================================================== /absence-types
const absence = Router();
absence.use(authenticate);
absence.get('/', asyncHandler(async (req, res) => {
  await ensureDefaults(req.user.companyId);
  res.json(await prisma.absenceType.findMany({ where: { companyId: req.user.companyId, ...(req.query.all === 'true' && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) ? {} : { isActive: true }) }, orderBy: { name: 'asc' } }));
}));
absence.post('/', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(AbsenceTypeDto, req.body);
  const code = dto.code.trim().toUpperCase();
  if (await prisma.absenceType.findUnique({ where: { companyId_code: { companyId: req.user.companyId, code } } })) throw new AppError(`Le code ${code} existe déjà`, 409);
  const created = await prisma.absenceType.create({ data: { companyId: req.user.companyId, code, name: dto.name.trim(), unit: dto.unit, annualCap: dto.annualCap ?? null, deductsFromLeave: dto.deductsFromLeave ?? false, legalReference: dto.legalReference ?? null } });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'ABSENCE_TYPE_CREATED', entity: 'AbsenceType', entityId: created.id, after: created, req });
  res.status(201).json(created);
}));
absence.put('/:id', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(AbsenceTypeDto, { code: 'X', ...req.body });
  const before = await prisma.absenceType.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
  if (!before) throw new AppError('Type d\'absence introuvable', 404);
  const after = await prisma.absenceType.update({ where: { id: before.id }, data: { name: dto.name.trim(), unit: dto.unit, annualCap: dto.annualCap ?? null, deductsFromLeave: dto.deductsFromLeave ?? before.deductsFromLeave, legalReference: dto.legalReference ?? null, isActive: dto.isActive ?? before.isActive } });
  await auditService.log({ companyId: req.user.companyId, actor: actorOf(req), action: 'ABSENCE_TYPE_UPDATED', entity: 'AbsenceType', entityId: before.id, before, after, req });
  res.json(after);
}));

// ================================================================= /workflows
const workflows = Router();
workflows.use(authenticate, admin);
workflows.post('/bootstrap', asyncHandler(async (req, res) => res.json(await workflowService.bootstrapFromForms(req.user.companyId, actorOf(req), req))));
workflows.post('/simulate', asyncHandler(async (req, res) => {
  const dto = await parseDto(SimulateDto, req.body);
  res.json(await workflowService.simulate(req.user.companyId, dto.typeCode, dto.agentId, dto.data || {}));
}));
workflows.get('/:typeCode', asyncHandler(async (req, res) => res.json(await workflowService.definitions(req.user.companyId, req.params.typeCode))));
workflows.post('/:typeCode', asyncHandler(async (req, res) => {
  const dto = await parseDto(PublishDto, req.body);
  res.status(201).json(await workflowService.publish(req.user.companyId, req.params.typeCode, dto.steps as any, dto.name, actorOf(req), req));
}));

// ============================================================= /form-templates
const templates = Router();
templates.use(authenticate, admin);
templates.get('/variables', (_req, res) => res.json(TEMPLATE_VARIABLES));
templates.get('/', asyncHandler(async (req, res) => {
  await ensureDefaults(req.user.companyId);
  res.json(await prisma.formTemplate.findMany({ where: { companyId: req.user.companyId }, orderBy: [{ typeCode: 'asc' }, { version: 'desc' }] }));
}));
templates.put('/:typeCode', asyncHandler(async (req, res) => {
  const dto = await parseDto(TemplateDto, req.body);
  const companyId = req.user.companyId;
  await ensureDefaults(companyId);
  if (!['DECISION_CONGE', 'JOUISSANCE_CONGE', 'AUTORISATION_ABSENCE'].includes(req.params.typeCode)) throw new AppError('Type inconnu', 404);
  try { renderTemplate(dto.html, sampleContext(req.params.typeCode)); } catch (e: any) { throw new AppError(`Modèle invalide : ${e.message}`, 422); }
  const last = await prisma.formTemplate.findFirst({ where: { companyId, typeCode: req.params.typeCode }, orderBy: { version: 'desc' } });
  const created = await prisma.$transaction(async tx => {
    await tx.formTemplate.updateMany({ where: { companyId, typeCode: req.params.typeCode }, data: { isActive: false } });
    return tx.formTemplate.create({ data: { companyId, typeCode: req.params.typeCode, version: (last?.version ?? 0) + 1, html: dto.html, css: dto.css, createdById: req.user.id } });
  });
  await auditService.log({ companyId, actor: actorOf(req), action: 'FORM_TEMPLATE_PUBLISHED', entity: 'FormTemplate', entityId: created.id, after: { typeCode: created.typeCode, version: created.version }, req });
  res.status(201).json(created);
}));
templates.post('/:typeCode/preview', asyncHandler(async (req, res) => {
  const dto = await parseDto(TemplateDto, req.body);
  let body: string;
  try { body = renderTemplate(dto.html, sampleContext(req.params.typeCode)); } catch (e: any) { throw new AppError(`Modèle invalide : ${e.message}`, 422); }
  const pdf = await htmlPdfService.render(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${dto.css}</style></head><body>${body}</body></html>`, 'Aperçu du modèle (données d\'exemple)');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="apercu.pdf"');
  res.send(pdf);
}));

// ================================================================== /requests
const requests = Router();
requests.use(authenticate);
requests.get('/inbox', asyncHandler(async (req, res) => res.json(await requestService.inbox(req.user))));
requests.get('/', asyncHandler(async (req, res) => {
  const q = req.query;
  res.json(await requestService.search(req.user, {
    q: q.q as string, typeCode: q.typeCode as string, status: q.status as string, orgUnitId: q.orgUnitId as string,
    from: q.from ? new Date(q.from as string) : undefined, to: q.to ? new Date(q.to as string) : undefined,
    page: parseInt(q.page as string) || 1, limit: parseInt(q.limit as string) || 25
  }));
}));
requests.get('/:id', asyncHandler(async (req, res) => res.json(await requestService.detail(req.params.id, req.user, false, req))));
requests.get('/:id/document', asyncHandler(async (req, res) => sendPdf(res, await requestService.document(req.params.id, req.user, undefined, req))));
requests.get('/:id/documents/:version', asyncHandler(async (req, res) => sendPdf(res, await requestService.document(req.params.id, req.user, parseInt(req.params.version), req))));
requests.get('/:id/attachments/:attachmentId', asyncHandler(async (req, res) => sendFile(res, await requestService.attachment(req.params.id, req.params.attachmentId, req.user, req))));
requests.post('/:id/steps/:stepId/act', asyncHandler(async (req, res) => {
  const dto = await parseDto(ActDto, req.body);
  res.json(await requestService.act(req.params.id, req.params.stepId, req.user, dto, req));
}));
requests.post('/:id/regenerate', admin, asyncHandler(async (req, res) => res.json(await requestService.regenerate(req.params.id, req.user, req))));

// ----------------------------------------------------------------- utilitaires
export function sendPdf(res: any, out: { doc: { version: number }; buffer: Buffer; reference?: string }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${out.reference || 'demande'}-v${out.doc.version}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.buffer);
}
export function sendFile(res: any, out: { att: { name: string; mime: string }; buffer: Buffer }) {
  res.setHeader('Content-Type', out.att.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(out.att.name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.buffer);
}

/** Vérifie la signature binaire : le type MIME annoncé par le client ne suffit pas. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}
export const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('file');

export const escalationRouter = Router();
escalationRouter.use(authenticate, admin);
escalationRouter.get('/overdue', asyncHandler(async (req: any, res) => res.json(await escalationService.list(req.user.companyId))));
escalationRouter.post('/run', asyncHandler(async (req: any, res) => res.json(await escalationService.run(req.user.companyId))));

export { types as requestTypeRouter, absence as absenceTypeRouter, workflows as workflowRouter, templates as formTemplateRouter, requests as requestRouter, documentService };
