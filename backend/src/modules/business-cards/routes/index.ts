import { Router } from 'express';
import { BusinessCardController } from '../controllers/card.controller';
import { BusinessCardService } from '../services/card.service';
import { BusinessCardRepository } from '../repositories/card.repository';
import { QRCodeService } from '../../qr-codes/services/qr-code.service';
import { PDFService } from '../../../infrastructure/pdf';
import { VCARDService } from '../../../infrastructure/vcard';
import { FileService } from '../../files/services/file.service';
import { authenticate } from '../../../middlewares/auth.middleware';
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

export { router as cardRouter };
