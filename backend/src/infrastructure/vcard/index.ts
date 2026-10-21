import { BusinessCard } from '@prisma/client';
import { buildVCard } from '../../modules/business-cards/services/card-qr.util';

export class VCARDService {
  generate(card: BusinessCard, companyName?: string): string {
    return buildVCard(card, companyName);
  }
}
