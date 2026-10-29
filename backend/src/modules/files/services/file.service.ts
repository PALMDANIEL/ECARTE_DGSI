import path from 'path';
import crypto from 'crypto';
import { putFile } from '../../../infrastructure/storage';

export class FileService {
  /**
   * Sauvegarde un fichier uploadé (Multer, memoryStorage) sur disque
   * dans uploads/<subfolder>/, avec un nom aléatoire pour éviter les collisions.
   * Retourne l'URL RELATIVE (ex: /uploads/photos/ab12cd34.jpg),
   * que le contrôleur transforme ensuite en URL absolue.
   */
  async saveFile(file: Express.Multer.File, subfolder: string): Promise<string> {
    const ext = this.getSafeExtension(file.mimetype, file.originalname);
    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    await putFile('public', `${subfolder}/${filename}`, file.buffer, file.mimetype);

    return `/uploads/${subfolder}/${filename}`;
  }

  /**
   * Sauvegarde un buffer déjà généré en mémoire (ex: PNG de QR code)
   * sous un nom de fichier donné, dans uploads/qrcodes/.
   * Retourne l'URL RELATIVE (ex: /uploads/qrcodes/qr-<cardId>.png).
   * Écrase le fichier existant si le même cardId régénère son QR
   * (utile pour garder une URL stable par carte).
   */
  async saveQRCode(filename: string, buffer: Buffer): Promise<string> {
    // Sécurité : on ignore tout chemin dans le filename fourni,
    // on ne garde que le nom de base pour empêcher un path traversal.
    const safeName = path.basename(filename);
    await putFile('public', `qrcodes/${safeName}`, buffer, 'image/png');

    return `/uploads/qrcodes/${safeName}`;
  }

  private getSafeExtension(mimetype: string, originalname: string): string {
    const mimeMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp'
    };
    if (mimeMap[mimetype]) return mimeMap[mimetype];

    const ext = path.extname(originalname).toLowerCase();
    return ext || '.bin';
  }
}
