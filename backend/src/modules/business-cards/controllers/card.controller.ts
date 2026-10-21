import { Request, Response } from 'express';
import { BusinessCardService } from '../services/card.service';
import { CreateCardDto, UpdateCardDto } from '../dto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { cardPdfService } from '../services/card-pdf.service';
import { generateQrPngBuffer } from '../services/card-qr.util';
import { ScanService } from '../../scans/services/scan.service';
import { ScanRepository } from '../../scans/repositories/scan.repository';
import { BusinessCardRepository } from '../repositories/card.repository';

const scanService = new ScanService(new ScanRepository(), new BusinessCardRepository());

// Les formulaires envoient '' pour un champ vide : on le traite comme « non renseigné ».
const emptyToNull = (body: any) => Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, v === '' ? null : v]));

export class BusinessCardController {
  constructor(private service: BusinessCardService) {}

  async create(req: Request & { user?: any }, res: Response) {
    try {
      const dto = plainToClass(CreateCardDto, emptyToNull(req.body));
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ errors });
      const result = await this.service.create(req.user.id, req.user.companyId, dto);
      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Erreur creation carte:', error);
      return res.status(400).json({ message: error.message || 'Erreur de creation' });
    }
  }

  async findAll(req: Request & { user?: any }, res: Response) {
    try {
      const result = await this.service.findAll(req.user.companyId);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  async findOne(req: Request, res: Response) {
    try {
      const result = await this.service.findById(req.params.id);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const dto = plainToClass(UpdateCardDto, emptyToNull(req.body));
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ errors });
      const result = await this.service.update(req.params.id, dto);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.service.delete(req.params.id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  async getPublicCard(req: Request, res: Response) {
    try {
      const result = await this.service.getPublicCard(req.params.slug);
      // Enregistre le scan sans bloquer la réponse
      const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
      scanService.recordScan(req.params.slug, ip, req.headers['user-agent'] || '').catch(() => {});
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async exportPDF(req: Request, res: Response) {
    try {
      const card = await this.service.findById(req.params.id);
      if (!card) return res.status(404).json({ message: 'Card not found' });

      const pdfBuffer = await cardPdfService.generatePdf(card);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="carte-${card.slug}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('PDF export error:', error);
      return res.status(500).json({ message: 'PDF generation failed' });
    }
  }

  async exportPDFPublic(req: Request, res: Response) {
    try {
      const card = await this.service.getPublicCard(req.params.slug);
      if (!card) return res.status(404).json({ message: 'Card not found' });

      const pdfBuffer = await cardPdfService.generatePdf(card);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="carte-${card.slug}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('PDF export error:', error);
      return res.status(500).json({ message: 'PDF generation failed' });
    }
  }

  // Nouveau : QR autonome pour le bouton "QR Code" du dashboard.
  // Réutilise generateQrPngBuffer (basé sur le même buildVCard que le PDF) :
  // les deux QR sont donc strictement identiques en contenu.
  async exportQRCode(req: Request, res: Response) {
    try {
      const card = await this.service.findById(req.params.id);
      if (!card) return res.status(404).json({ message: 'Card not found' });

      const png = await generateQrPngBuffer(card);

      res.setHeader('Content-Type', 'image/png');
      res.send(png);
    } catch (error: any) {
      console.error('QR code export error:', error);
      return res.status(500).json({ message: 'QR code generation failed' });
    }
  }

  async exportVCard(req: Request, res: Response) {
    try {
      const vcard = await this.service.exportVCard(req.params.id);
      res.setHeader('Content-Type', 'text/vcard');
      res.setHeader('Content-Disposition', 'attachment; filename=card.vcf');
      res.send(vcard);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async exportVCardPublic(req: Request, res: Response) {
    try {
      const card = await this.service.getPublicCard(req.params.slug);
      if (!card) return res.status(404).json({ message: 'Card not found' });

      const vcard = await this.service.exportVCard(card.id);
      res.setHeader('Content-Type', 'text/vcard');
      res.setHeader('Content-Disposition', 'attachment; filename=card.vcf');
      res.send(vcard);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }
}
