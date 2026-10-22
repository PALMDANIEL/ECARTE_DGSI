import { Request, Response } from 'express';
import { FileService } from '../services/file.service';

const isImage = (b: Buffer) =>
  (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
  (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');

export class FileController {
  constructor(private fileService: FileService) {}

  upload = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Aucun fichier fourni' });
      }
      // Le type annoncé par le navigateur ne suffit pas : on vérifie la signature réelle du contenu
      if (!isImage(req.file.buffer)) return res.status(400).json({ message: 'Format non supporté. Utilisez JPG, PNG ou WebP.' });
      const relativeUrl = await this.fileService.saveFile(req.file, 'photo');
      // URL absolue construite depuis la requête : fonctionne quel que soit
      // l'hôte (IP locale, localhost, domaine de prod) sans config supplémentaire.
      const absoluteUrl = `${req.protocol}://${req.get('host')}${relativeUrl}`;
      return res.status(201).json({ url: absoluteUrl });
    } catch (error: any) {
      console.error('Upload error:', error);
      return res.status(500).json({ message: error.message || 'Échec de l\'envoi du fichier' });
    }
  };
}
