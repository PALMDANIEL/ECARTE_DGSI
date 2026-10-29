import type { Browser } from 'puppeteer-core';
import { launchBrowser } from './browser';

/** Rendu HTML → PDF A4 (marges 2,5 cm comme les formulaires d'origine) avec pied de page « référence — page x/y ». */
export class HtmlPdfService {
  private browserPromise: Promise<Browser> | null = null;
  /** En test, le rendu est simulé (PDF minimal) sauf si on active le vrai moteur explicitement. */
  useRealRenderer = process.env.NODE_ENV !== 'test';

  private browser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = launchBrowser();
      this.browserPromise.catch(() => { this.browserPromise = null; });
    }
    return this.browserPromise;
  }

  async render(html: string, footerLeft: string): Promise<Buffer> {
    if (!this.useRealRenderer) return Buffer.from(`%PDF-1.4\n% rendu simulé (test)\n${footerLeft}\n${html.length}\n%%EOF`);
    const browser = await this.browser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '2.5cm', bottom: '2.5cm', left: '2.5cm', right: '2.5cm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:7.5px;color:#555;padding:0 2.5cm;font-family:Arial,sans-serif;display:flex;justify-content:space-between"><span>${esc(footerLeft)}</span><span>Page <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browserPromise) {
      const b = await this.browserPromise.catch(() => null);
      this.browserPromise = null;
      await b?.close();
    }
  }
}

export const htmlPdfService = new HtmlPdfService();
