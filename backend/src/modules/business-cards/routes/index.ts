import { Router } from 'express';
import { BusinessCardController } from '../controllers/card.controller';
import { BusinessCardService } from '../services/card.service';
import { BusinessCardRepository } from '../repositories/card.repository';
import { QRCodeService } from '../../qr-codes/services/qr-code.service';
import { PDFService } from '../../../infrastructure/pdf';
import { VCARDService } from '../../../infrastructure/vcard';
import { FileService } from '../../files/services/file.service';
import { authenticate, authorize } from '../../../middlewares/auth.middleware';
import { IsString, MinLength } from 'class-validator';
import { asyncHandler, parseDto } from '../../../shared/validation';
import { cardLifecycleService } from '../../card-lifecycle/card-lifecycle.service';
import { scopeByCompany, cardOwnerOrManager } from '../../../middlewares/scope';

const router = Router();
const cardRepo = new BusinessCardRepository();
const fileService = new FileService();
const qrService = new QRCodeService(fileService);
const pdfService = new PDFService();
const vcardService = new VCARDService();
const service = new BusinessCardService(cardRepo, qrService, pdfService, vcardService);
const controller = new BusinessCardController(service);

// Routes publiques (page carte scannée, pas de connexion requise)
router.get('/public/:slug', controller.getPublicCard.bind(controller));
router.get('/public/:slug/vcard', controller.exportVCardPublic.bind(controller));
router.get('/public/:slug/pdf', controller.exportPDFPublic.bind(controller));

router.use(authenticate);
router.param('id', scopeByCompany('businessCard'));
router.post('/', controller.create.bind(controller));
router.get('/', controller.findAll.bind(controller));
router.get('/:id', controller.findOne.bind(controller));
router.put('/:id', cardOwnerOrManager, controller.update.bind(controller));
router.delete('/:id', cardOwnerOrManager, controller.delete.bind(controller));
router.get('/:id/pdf', controller.exportPDF.bind(controller));
router.get('/:id/qrcode', controller.exportQRCode.bind(controller));
router.get('/:id/vcard', controller.exportVCard.bind(controller));

// --- Cycle de vie de la carte professionnelle (module demandes) ---
class ReasonDto { @IsString() @MinLength(3, { message: 'Le motif est obligatoire (3 caractères minimum)' }) reason!: string; }
const admin = authorize('ADMIN', 'SUPER_ADMIN');
const actorOf = (req: any) => ({ id: req.user.id, email: req.user.email });

router.get('/:id/lifecycle', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.summary(req.user.companyId, req.params.id))));
router.get('/:id/history', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.history(req.user.companyId, req.params.id))));
router.post('/:id/issue', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.issue(req.user.companyId, req.params.id, actorOf(req), req))));
router.post('/:id/renew', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.renew(req.user.companyId, req.params.id, actorOf(req), req))));
router.post('/:id/reactivate', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.reactivate(req.user.companyId, req.params.id, actorOf(req), req))));
router.post('/:id/suspend', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.suspend(req.user.companyId, req.params.id, (await parseDto(ReasonDto, req.body)).reason, actorOf(req), req))));
router.post('/:id/revoke', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.revoke(req.user.companyId, req.params.id, (await parseDto(ReasonDto, req.body)).reason, actorOf(req), req))));
router.post('/:id/replace', admin, asyncHandler(async (req, res) => res.json(await cardLifecycleService.replace(req.user.companyId, req.params.id, (await parseDto(ReasonDto, req.body)).reason, actorOf(req), req))));
router.get('/:id/access-qr', admin, asyncHandler(async (req, res) => {
  const png = await cardLifecycleService.accessQr(req.user.companyId, req.params.id, actorOf(req), req);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(png);
}));

export { router as cardRouter };
