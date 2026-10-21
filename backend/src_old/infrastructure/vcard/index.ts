import { BusinessCard } from '@prisma/client';

export class VCARDService {
  generate(card: BusinessCard): string {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:' + card.fullName,
      'ORG:SmartCard Pro',
      'TITLE:' + (card.jobTitle || ''),
      'TEL:' + (card.phoneMobile || ''),
      'TEL;WORK:' + (card.phoneWork || ''),
      'EMAIL:' + (card.email || ''),
      'URL:' + (card.website || ''),
      'ADR:' + (card.address || ''),
      'END:VCARD',
    ];
    return lines.join('\n');
  }
}
