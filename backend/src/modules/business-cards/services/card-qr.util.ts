import QRCode from 'qrcode';
import { BusinessCard } from '@prisma/client';

// Échappement vCard 3.0 (RFC 2426) : \\ , ; et sauts de ligne
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

// Source unique du vCard : utilisée par l'export .vcf, le QR code et le PDF.
export function buildVCard(card: BusinessCard, companyName?: string): string {
  const parts = card.fullName.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const org = [card.ministry, card.direction, card.service].filter(Boolean) as string[];
  if (!org.length && companyName) org.push(companyName);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:' + esc(card.fullName),
    `N:${esc(family)};${esc(given)};;;`,
    org.length ? 'ORG:' + org.map(esc).join(';') : '',
    card.jobTitle ? 'TITLE:' + esc(card.jobTitle) : '',
    card.phoneMobile ? 'TEL;TYPE=CELL:' + card.phoneMobile : '',
    card.phoneWork ? 'TEL;TYPE=WORK:' + card.phoneWork : '',
    card.whatsapp ? 'TEL;TYPE=CELL,VOICE:' + card.whatsapp : '',
    card.email ? 'EMAIL:' + card.email : '',
    card.website ? 'URL:' + card.website : '',
    card.address ? 'ADR;TYPE=WORK:;;' + esc(card.address) + ';;;;' : '',
    card.gpsLat != null && card.gpsLng != null ? `GEO:${card.gpsLat};${card.gpsLng}` : '',
    'END:VCARD'
  ].filter(l => l !== '');
  return lines.join('\r\n');
}

// Pour l'intégration dans le PDF (fond transparent, s'harmonise avec le design de la carte)
export async function generateQrDataUrl(card: BusinessCard): Promise<string> {
  const vcard = buildVCard(card);
  return QRCode.toDataURL(vcard, {
    margin: 0,
    color: { dark: '#29345B', light: '#00000000' },
    width: 300,
  });
}

// Pour l'endpoint QR autonome (fond blanc opaque, lisible tel quel dans le dialogue/téléchargement)
export async function generateQrPngBuffer(card: BusinessCard): Promise<Buffer> {
  const vcard = buildVCard(card);
  return QRCode.toBuffer(vcard, {
    margin: 1,
    color: { dark: '#29345B', light: '#FFFFFF' },
    width: 300,
  });
}
