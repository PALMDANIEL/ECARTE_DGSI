import { Router } from 'express';
import { OrgUnitType } from '@prisma/client';
import { IsString, IsOptional, IsEnum, IsBoolean, IsInt, IsDateString, IsArray, IsNotEmpty, Min } from 'class-validator';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { asyncHandler, parseDto } from '../../shared/validation';
import { orgService } from './org.service';

class CreateUnitDto { @IsString() @IsNotEmpty() code!: string; @IsString() @IsNotEmpty() name!: string; @IsEnum(OrgUnitType) type!: OrgUnitType; @IsOptional() @IsString() parentId?: string; }
class UpdateUnitDto { @IsOptional() @IsString() @IsNotEmpty() code?: string; @IsOptional() @IsString() @IsNotEmpty() name?: string; @IsOptional() @IsEnum(OrgUnitType) type?: OrgUnitType; @IsOptional() parentId?: string | null; @IsOptional() @IsBoolean() isActive?: boolean; }
class ImportDto { @IsString() csv!: string; @IsOptional() @IsBoolean() dryRun?: boolean; }
class CreatePositionDto { @IsString() @IsNotEmpty() code!: string; @IsString() @IsNotEmpty() label!: string; @IsOptional() @IsString() civility?: string; @IsOptional() @IsInt() @Min(0) level?: number; @IsOptional() @IsString() orgUnitId?: string; }
class UpdatePositionDto { @IsOptional() @IsString() @IsNotEmpty() label?: string; @IsOptional() civility?: string | null; @IsOptional() @IsInt() @Min(0) level?: number; @IsOptional() orgUnitId?: string | null; @IsOptional() @IsBoolean() isActive?: boolean; }
class HolderDto { @IsString() @IsNotEmpty() userId!: string; @IsOptional() @IsDateString() startsAt?: string; }
class EndHolderDto { @IsOptional() @IsDateString() endsAt?: string; }
class DelegationDto { @IsString() @IsNotEmpty() positionId!: string; @IsString() @IsNotEmpty() delegateId!: string; @IsDateString() startsAt!: string; @IsDateString() endsAt!: string; @IsOptional() @IsArray() @IsString({ each: true }) requestTypes?: string[]; @IsOptional() @IsString() reason?: string; }

const actorOf = (req: any) => ({ id: req.user.id, email: req.user.email });
const admin = authorize('ADMIN', 'SUPER_ADMIN');

// ---------------------------------------------------------------- /org-units
const units = Router();
units.use(authenticate);
units.get('/', asyncHandler(async (req, res) => res.json(await orgService.list(req.user.companyId))));
units.get('/import/template', admin, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-organigramme.csv"');
  res.send('﻿code;nom;type;code_parent\nSG;Secrétariat Général;SG;\nDGSI;Direction Générale des Systèmes d\'Information;DG;SG\nDLE;Direction de l\'Ingénierie logicielle et de l\'Exploitation;DIRECTION;DGSI\nSDA;Service Développement des Applications;SERVICE;DLE\n');
});
units.post('/import', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(ImportDto, req.body);
  res.json(await orgService.importUnits(req.user.companyId, dto.csv, dto.dryRun !== false, actorOf(req), req));
}));
units.post('/', admin, asyncHandler(async (req, res) => res.status(201).json(await orgService.createUnit(req.user.companyId, await parseDto(CreateUnitDto, req.body), actorOf(req), req))));
units.put('/:id', admin, asyncHandler(async (req, res) => {
  const body = await parseDto(UpdateUnitDto, req.body);
  // parentId peut être explicitement null (déplacer à la racine) : on le relit depuis le corps brut
  if ('parentId' in (req.body || {})) body.parentId = req.body.parentId || null;
  res.json(await orgService.updateUnit(req.user.companyId, req.params.id, body, actorOf(req), req));
}));
units.delete('/:id', admin, asyncHandler(async (req, res) => { await orgService.deleteUnit(req.user.companyId, req.params.id, actorOf(req), req); res.status(204).send(); }));

// ----------------------------------------------------------------- /positions
const positions = Router();
positions.use(authenticate);
positions.get('/', asyncHandler(async (req, res) => res.json(await orgService.listPositions(req.user.companyId))));
positions.post('/', admin, asyncHandler(async (req, res) => res.status(201).json(await orgService.createPosition(req.user.companyId, await parseDto(CreatePositionDto, req.body), actorOf(req), req))));
positions.put('/:id', admin, asyncHandler(async (req, res) => {
  const body = await parseDto(UpdatePositionDto, req.body);
  for (const k of ['civility', 'orgUnitId'] as const) if (k in (req.body || {})) (body as any)[k] = req.body[k] || null;
  res.json(await orgService.updatePosition(req.user.companyId, req.params.id, body, actorOf(req), req));
}));
positions.delete('/:id', admin, asyncHandler(async (req, res) => { await orgService.deletePosition(req.user.companyId, req.params.id, actorOf(req), req); res.status(204).send(); }));
positions.get('/:id/holders', admin, asyncHandler(async (req, res) => res.json(await orgService.holderHistory(req.user.companyId, req.params.id))));
positions.post('/:id/holders', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(HolderDto, req.body);
  res.status(201).json(await orgService.assignHolder(req.user.companyId, req.params.id, dto.userId, dto.startsAt ? new Date(dto.startsAt) : new Date(), actorOf(req), req));
}));
positions.post('/:id/holders/end', admin, asyncHandler(async (req, res) => {
  const dto = await parseDto(EndHolderDto, req.body);
  await orgService.endHolder(req.user.companyId, req.params.id, dto.endsAt ? new Date(dto.endsAt) : new Date(), actorOf(req), req);
  res.status(204).send();
}));

// --------------------------------------------------------------- /delegations
const delegations = Router();
delegations.use(authenticate, admin);
delegations.get('/', asyncHandler(async (req, res) => res.json(await orgService.listDelegations(req.user.companyId))));
delegations.post('/', asyncHandler(async (req, res) => {
  const dto = await parseDto(DelegationDto, req.body);
  res.status(201).json(await orgService.createDelegation(req.user.companyId, { ...dto, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) }, actorOf(req), req));
}));
delegations.delete('/:id', asyncHandler(async (req, res) => { await orgService.deleteDelegation(req.user.companyId, req.params.id, actorOf(req), req); res.status(204).send(); }));

export { units as orgUnitRouter, positions as positionRouter, delegations as delegationRouter };
