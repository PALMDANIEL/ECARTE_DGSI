import { Router } from 'express';
import { QRCodeService } from '../services/qr-code.service';
import { FileService } from '../../files/services/file.service';
import { authenticate } from '../../../middlewares/auth.middleware';

const router = Router();
const fileService = new FileService();
const qrService = new QRCodeService(fileService);

router.get('/generate', authenticate, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ message: 'url parameter required' });
  try {
    const png = await qrService.generatePNG(url as string);
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    return res.status(500).json({ message: 'QR generation failed' });
  }
});

router.get('/public/:slug', async (req, res) => {
  const baseUrl = process.env.QR_BASE_URL || 'http://localhost:4200/card/';
  const url = baseUrl + req.params.slug;
  try {
    const png = await qrService.generatePNG(url);
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    return res.status(500).json({ message: 'QR generation failed' });
  }
});

export { router as qrRouter };
