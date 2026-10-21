import puppeteer, { Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { BusinessCard } from '@prisma/client';
import { generateCardHtml, CardBranding } from './card-pdf-template';
import { generateQrDataUrl } from './card-qr.util';

const LOGO_PATH = process.env.LOGO_PATH || path.join(__dirname, '../../../assets/logo.png');

export class CardPdfService {
  private browserPromise: Promise<Browser> | null = null;
  private logoDataUrlCache: string | null = null;

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  private getLogoDataUrl(): string {
    if (!this.logoDataUrlCache) {
      try {
        const buffer = fs.readFileSync(LOGO_PATH);
        const ext = LOGO_PATH.endsWith('.svg') ? 'svg+xml' : 'png';
        this.logoDataUrlCache = `data:image/${ext};base64,${buffer.toString('base64')}`;
      } catch (e) {
        console.warn('⚠️ Logo non trouvé, utilisation d\'un logo par défaut.');
        this.logoDataUrlCache = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNDQ0NDQ0MiLz48L3N2Zz4=';
      }
    }
    return this.logoDataUrlCache;
  }

  // publicUrl retiré : le QR encode désormais directement les coordonnées
  // du contact (vCard), pas une URL vers le serveur. Fonctionne hors ligne.
  async generatePdf(card: BusinessCard): Promise<Buffer> {
    const qrDataUrl = await generateQrDataUrl(card);

    const branding: CardBranding = { logoDataUrl: this.getLogoDataUrl() };
    const html = generateCardHtml(card, qrDataUrl, branding);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' as any });
      const pdfBuffer = await page.pdf({
        printBackground: true,
        width: '89mm',
        height: '51mm',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}

export const cardPdfService = new CardPdfService();
