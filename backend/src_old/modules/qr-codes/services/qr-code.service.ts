import QRCode from 'qrcode';
import { FileService } from '../../files/services/file.service';
import { logger } from '../../../infrastructure/logger';

export class QRCodeService {
  constructor(private fileService: FileService) {}

  async generateAndStore(cardId: string, url: string): Promise<string> {
    try {
      const pngBuffer = await QRCode.toBuffer(url, { type: 'png', width: 300 });
      const filename = 'qr-' + cardId + '.png';
      const filePath = await this.fileService.saveQRCode(filename, pngBuffer);
      return filePath;
    } catch (error) {
      logger.error('Erreur generation QR:', error);
      throw error;
    }
  }

  async generatePNG(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, { type: 'png', width: 300 });
  }

  async generateSVG(url: string): Promise<string> {
    return QRCode.toString(url, { type: 'svg' });
  }
}
