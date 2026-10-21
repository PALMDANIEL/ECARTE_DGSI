import { BusinessCardRepository } from '../repositories/card.repository';
import { CreateCardDto, UpdateCardDto } from '../dto';
import { AppError } from '../../../shared/errors/app-error';
import { generateSlug } from '../../../shared/utils/slugify';
import { QRCodeService } from '../../qr-codes/services/qr-code.service';
import { PDFService } from '../../../infrastructure/pdf';
import { VCARDService } from '../../../infrastructure/vcard';
import { config } from '../../../infrastructure/config';
import { logger } from '../../../infrastructure/logger';

export class BusinessCardService {
  constructor(
    private cardRepo: BusinessCardRepository,
    private qrService: QRCodeService,
    private pdfService: PDFService,
    private vcardService: VCARDService
  ) {}

  async create(userId: string, companyId: string, dto: CreateCardDto) {
    let slug = generateSlug(dto.fullName);
    let existing = await this.cardRepo.findBySlug(slug);
    if (existing) {
      slug = slug + '-' + Math.random().toString(36).substring(2, 7);
    }

    const data: any = {
      slug,
      fullName: dto.fullName,
      jobTitle: dto.jobTitle,
      ministry: dto.ministry,
      direction: dto.direction,
      service: dto.service,
      phoneMobile: dto.phoneMobile,
      phoneWork: dto.phoneWork,
      email: dto.email,
      whatsapp: dto.whatsapp,
      website: dto.website,
      linkedin: dto.linkedin,
      facebook: dto.facebook,
      instagram: dto.instagram,
      tiktok: dto.tiktok,
      address: dto.address,
      gpsLat: dto.gpsLat,
      gpsLng: dto.gpsLng,
      user: { connect: { id: userId } },
      company: { connect: { id: companyId } },
    };

    const card = await this.cardRepo.create(data);
    try {
      const qrUrl = config.qrBaseUrl + card.slug;
      const qrPath = await this.qrService.generateAndStore(card.id, qrUrl);
      await this.cardRepo.update(card.id, { qrCodeUrl: qrPath });
    } catch (error) {
      logger.error('Erreur generation QR:', error);
    }
    return card;
  }

  async findAll(companyId: string) {
    return this.cardRepo.findMany({ companyId, isArchived: false });
  }

  async findById(id: string) {
    const card = await this.cardRepo.findById(id);
    if (!card) throw new AppError('Card not found', 404);
    return card;
  }

  async getPublicCard(slug: string) {
    const card = await this.cardRepo.findBySlugWithCompany(slug);
    if (!card || !card.isActive) throw new AppError('Card not found', 404);
    return card;
  }

  async update(id: string, dto: UpdateCardDto) {
    const data: any = { ...dto };
    if (dto.gpsLat !== undefined) data.gpsLat = parseFloat(dto.gpsLat as any);
    if (dto.gpsLng !== undefined) data.gpsLng = parseFloat(dto.gpsLng as any);
    const card = await this.cardRepo.update(id, data);
    try {
      const qrUrl = config.qrBaseUrl + card.slug;
      const qrPath = await this.qrService.generateAndStore(card.id, qrUrl);
      await this.cardRepo.update(card.id, { qrCodeUrl: qrPath });
    } catch (error) {
      logger.error('Erreur regeneration QR:', error);
    }
    return card;
  }

  async delete(id: string) {
    await this.cardRepo.update(id, { isArchived: true, isActive: false });
  }

  async exportPDF(cardId: string): Promise<Buffer> {
    const card = await this.cardRepo.findById(cardId);
    if (!card) throw new AppError('Card not found', 404);
    return this.pdfService.generateCardPDF(card);
  }

  async exportVCard(cardId: string): Promise<string> {
    const card = await this.cardRepo.findById(cardId);
    if (!card) throw new AppError('Card not found', 404);
    return this.vcardService.generate(card);
  }
}
