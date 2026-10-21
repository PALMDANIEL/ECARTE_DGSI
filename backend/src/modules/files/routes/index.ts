import { Router } from 'express';
import { FileController } from '../controllers/file.controller';
import { FileService } from '../services/file.service';
import { uploadPhoto } from '../middlewares/upload.middleware';
import { authenticate } from '../../../middlewares/auth.middleware';

const router = Router();
const fileService = new FileService();
const controller = new FileController(fileService);

router.use(authenticate);
router.post('/upload', uploadPhoto, controller.upload);

export { router as filesRouter };
