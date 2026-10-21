import { Request, Response } from 'express';
import { BusinessCardService } from '../services/card.service';
import { CreateCardDto, UpdateCardDto } from '../dto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

export class BusinessCardController {
  constructor(private service: BusinessCardService) {}

  async create(req: Request & { user?: any }, res: Response) {
    try {
      const dto = plainToClass(CreateCardDto, req.body);
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
      const result = await this.service.findById(req.params.id as string);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const dto = plainToClass(UpdateCardDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ errors });
      const result = await this.service.update(req.params.id as string, dto);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.service.delete(req.params.id as string);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  async getPublicCard(req: Request, res: Response) {
    try {
      const result = await this.service.getPublicCard(req.params.slug as string);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async exportPDF(req: Request, res: Response) {
    try {
      const pdf = await this.service.exportPDF(req.params.id as string);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=card.pdf');
      res.send(pdf);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  async exportVCard(req: Request, res: Response) {
    try {
      const vcard = await this.service.exportVCard(req.params.id as string);
      res.setHeader('Content-Type', 'text/vcard');
      res.setHeader('Content-Disposition', 'attachment; filename=card.vcf');
      res.send(vcard);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }
}
