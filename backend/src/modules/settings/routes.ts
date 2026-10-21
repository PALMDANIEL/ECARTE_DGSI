import { Router } from 'express';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { asyncHandler, parseDto } from '../../shared/validation';
import { rulesService } from './rules.service';

class SetRuleDto {
  value!: number | string | boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsString() legalReference?: string;
  @IsOptional() @IsString() comment?: string;
}

const router = Router();
router.use(authenticate);

router.get('/rules', authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => res.json(await rulesService.list(req.user.companyId))));

router.put('/rules/:key', authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const dto = await parseDto(SetRuleDto, req.body);
  const created = await rulesService.set(req.user.companyId, req.params.key, req.body?.value, {
    validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, legalReference: dto.legalReference, comment: dto.comment
  }, { id: req.user.id, email: req.user.email }, req);
  res.json(created);
}));

router.delete('/rules/:key', authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  await rulesService.clearOverride(req.user.companyId, req.params.key, { id: req.user.id, email: req.user.email }, req);
  res.status(204).send();
}));

export { router as settingsRouter };
