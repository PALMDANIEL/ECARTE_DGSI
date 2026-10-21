import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

export class FileService {
  /**
   * Sauvegarde un fichier uploadé (Multer, memoryStorage) sur disque
   * dans uploads/<subfolder>/, avec un nom aléatoire pour éviter les collisions.
   * Retourne l'URL RELATIVE (ex: /uploads/photos/ab12cd34.jpg),
   * que le contrôleur transforme ensuite en URL absolue.
   */
  async saveFile(file: Express.Multer.File, subfolder: string): Promise<string> {
    const targetDir = path.join(UPLOAD_ROOT, subfolder);
    await fs.mkdir(targetDir, { recursive: true });

    const ext = this.getSafeExtension(file.mimetype, file.originalname);
    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const fullPath = path.join(targetDir, filename);

    await fs.writeFile(fullPath, file.buffer);

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
    const targetDir = path.join(UPLOAD_ROOT, 'qrcodes');
    await fs.mkdir(targetDir, { recursive: true });

    // Sécurité : on ignore tout chemin dans le filename fourni,
    // on ne garde que le nom de base pour empêcher un path traversal.
    const safeName = path.basename(filename);
    const fullPath = path.join(targetDir, safeName);

    await fs.writeFile(fullPath, buffer);

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
