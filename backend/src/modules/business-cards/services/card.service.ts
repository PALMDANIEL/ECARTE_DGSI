import { BusinessCardRepository } from '../repositories/card.repository';
import { CreateCardDto, UpdateCardDto } from '../dto';
import { AppError } from '../../../shared/errors/app-error';
import { generateSlug } from '../../../shared/utils/slugify';
import { QRCodeService } from '../../qr-codes/services/qr-code.service';
import { PDFService } from '../../../infrastructure/pdf';
import { VCARDService } from '../../../infrastructure/vcard';
import { config } from '../../../infrastructure/config';
import { logger } from '../../../infrastructure/logger';
import { prisma } from '../../../database/client';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];

export class BusinessCardService {
  constructor(private cardRepo: BusinessCardRepository, private qrService: QRCodeService, private pdfService: PDFService, private vcardService: VCARDService) {}

  async create(userId: string, companyId: string, dto: CreateCardDto, role = 'EMPLOYEE') {
    // Titulaire de la carte : un gestionnaire peut désigner n'importe quel agent de sa société ; sinon c'est l'utilisateur lui-même.
    let agentId: string | null = userId;
    if (MANAGER_ROLES.includes(role)) {
      agentId = dto.agentId || null;
      if (agentId && !(await prisma.user.findFirst({ where: { id: agentId, companyId } }))) throw new AppError('Agent introuvable', 400);
    }
    let slug = generateSlug(dto.fullName);
    let existing = await this.cardRepo.findBySlug(slug);
    if (existing) slug = slug + '-' + Math.random().toString(36).substring(2, 7);
    const card = await this.cardRepo.create({ slug, fullName: dto.fullName, photo: dto.photo, ...(agentId ? { agent: { connect: { id: agentId } } } : {}), jobTitle: dto.jobTitle, ministry: dto.ministry, direction: dto.direction, service: dto.service, phoneMobile: dto.phoneMobile, phoneWork: dto.phoneWork, email: dto.email, whatsapp: dto.whatsapp, website: dto.website, linkedin: dto.linkedin, facebook: dto.facebook, instagram: dto.instagram, tiktok: dto.tiktok, address: dto.address, gpsLat: dto.gpsLat, gpsLng: dto.gpsLng, user: { connect: { id: userId } }, company: { connect: { id: companyId } } });
    try {
      const qrUrl = config.qrBaseUrl + card.slug;
      const qrPath = await this.qrService.generateAndStore(card.id, qrUrl);
      await this.cardRepo.update(card.id, { qrCodeUrl: qrPath });
    } catch (error) { logger.error('QR error:', error); }
    return card;
  }

  async findAll(companyId: string) { return this.cardRepo.findMany({ companyId, isArchived: false }); }
  async findById(id: string) { const card = await this.cardRepo.findById(id); if (!card) throw new AppError('Card not found', 404); return card; }

  async getPublicCard(slug: string) { return this.getPublicCardOrThrow(slug); }

  async getPublicCardOrThrow(slug: string) {
    const card = await this.cardRepo.findBySlugWithCompany(slug);
    if (!card || !card.isActive) throw new AppError('Card not found', 404);
    // Les informations administratives (numéro, statut, titulaire) ne sont jamais publiques
    const { agentId, cardNumber, status, issuedAt, expiresAt, replacedById, userId, ...publicCard } = card as any;
    return publicCard as typeof card;
  }

  async update(id: string, dto: UpdateCardDto, actor?: { role: string; companyId: string }) {
    // Liste blanche : on ne laisse pas le client modifier companyId, userId, slug, etc.
    const fields = ['fullName', 'photo', 'jobTitle', 'ministry', 'direction', 'service', 'phoneMobile', 'phoneWork', 'email', 'whatsapp', 'website', 'linkedin', 'facebook', 'instagram', 'tiktok', 'address', 'gpsLat', 'gpsLng', 'isActive', 'isArchived'] as const;
    const data: any = {};
    if (dto.agentId !== undefined) {
      if (!actor || !MANAGER_ROLES.includes(actor.role)) throw new AppError('Seul un gestionnaire peut changer le titulaire', 403);
      const current = await this.cardRepo.findById(id);
      if (current && current.agentId !== dto.agentId && ['ACTIVE', 'SUSPENDED'].includes(current.status)) throw new AppError('Le titulaire d\'une carte émise ne peut pas être changé : révoquez-la puis créez une nouvelle carte', 409);
      if (dto.agentId && !(await prisma.user.findFirst({ where: { id: dto.agentId, companyId: actor.companyId } }))) throw new AppError('Agent introuvable', 400);
      data.agentId = dto.agentId || null;
    }
    for (const f of fields) if ((dto as any)[f] !== undefined) data[f] = (dto as any)[f];
    for (const f of ['gpsLat', 'gpsLng'] as const) if (data[f] !== undefined && data[f] !== null) data[f] = parseFloat(data[f]);
    const card = await this.cardRepo.update(id, data);
    try {
      const qrUrl = config.qrBaseUrl + card.slug;
      const qrPath = await this.qrService.generateAndStore(card.id, qrUrl);
      await this.cardRepo.update(card.id, { qrCodeUrl: qrPath });
    } catch (error) { logger.error('QR error:', error); }
    return card;
  }

  async delete(id: string) { await this.cardRepo.update(id, { isArchived: true, isActive: false }); }

  async exportPDF(cardId: string): Promise<Buffer> { const card = await this.cardRepo.findById(cardId); if (!card) throw new AppError('Card not found', 404); return this.pdfService.generateCardPDF(card); }
  async exportVCard(cardId: string): Promise<string> { const card = await this.cardRepo.findById(cardId); if (!card) throw new AppError('Card not found', 404); return this.vcardService.generate(card); }

  async exportPDFPublic(slug: string): Promise<Buffer> {
    const card = await this.getPublicCardOrThrow(slug);
    return this.pdfService.generateCardPDF(card);
  }

  async exportVCardPublic(slug: string): Promise<string> {
    const card = await this.getPublicCardOrThrow(slug);
    return this.vcardService.generate(card);
  }
}
