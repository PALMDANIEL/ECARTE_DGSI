import { Request, Response } from 'express';
import { FileService } from '../services/file.service';

export class FileController {
  constructor(private fileService: FileService) {}

  upload = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Aucun fichier fourni' });
      }
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
