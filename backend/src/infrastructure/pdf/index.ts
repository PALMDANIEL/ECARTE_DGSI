import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { BusinessCard } from '@prisma/client';
import { buildVCard } from '../../modules/business-cards/services/card-qr.util';

// ---------- Utilitaires ----------
function escapeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
}

// Format carte de visite standard US : 3.5in x 2in
const CARD_WIDTH_IN = 3.5;
const CARD_HEIGHT_IN = 2;

// ⚠️ Adaptez ces chemins vers les mêmes fichiers de police que votre
// renderer digital haute-fidélité (Fraunces / IBM Plex Sans / IBM Plex Mono).
// Si vous chargez déjà ces polices via un CDN pour l'export digital,
// vous pouvez remplacer les @font-face ci-dessous par les mêmes <link>.
const FONT_FACES = `
  @font-face {
    font-family: 'Fraunces';
    src: url('file://${process.cwd()}/assets/fonts/Fraunces-Italic-VariableFont.woff2') format('woff2');
    font-weight: 400 700;
    font-style: italic;
  }
  @font-face {
    font-family: 'IBM Plex Sans';
    src: url('file://${process.cwd()}/assets/fonts/IBMPlexSans-Regular.woff2') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'IBM Plex Sans';
    src: url('file://${process.cwd()}/assets/fonts/IBMPlexSans-Medium.woff2') format('woff2');
    font-weight: 500;
  }
  @font-face {
    font-family: 'IBM Plex Mono';
    src: url('file://${process.cwd()}/assets/fonts/IBMPlexMono-Medium.woff2') format('woff2');
    font-weight: 500;
  }
`;

function renderCardHtml(card: BusinessCard, qrDataUrl: string, orgLine: string): string {
  const initials = getInitials(card.fullName);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${FONT_FACES}

  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${CARD_WIDTH_IN}in ${CARD_HEIGHT_IN}in; margin: 0; }
  html, body { width: ${CARD_WIDTH_IN}in; height: ${CARD_HEIGHT_IN}in; }

  .card {
    position: relative;
    width: ${CARD_WIDTH_IN}in;
    height: ${CARD_HEIGHT_IN}in;
    background: radial-gradient(circle at 15% 0%, #1B2140 0%, #12172B 55%, #0D1122 100%);
    overflow: hidden;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  /* Texture papier / lin très subtile */
  .texture {
    position: absolute; inset: 0;
    opacity: 0.045;
    background-image: repeating-linear-gradient(115deg, #C89B3C 0px, transparent 1px 7px);
  }

  /* Filet doré façon estampe, en léger retrait du bord */
  .foil-frame {
    position: absolute;
    inset: 6pt;
    border-radius: 4pt;
    border: 0.75pt solid;
    border-image: linear-gradient(120deg, #C89B3C 0%, #8A6C25 35%, #E8D5A0 50%, #8A6C25 65%, #C89B3C 100%) 1;
    pointer-events: none;
  }

  /* Monogramme en filigrane, très discret */
  .monogram {
    position: absolute;
    right: -10pt;
    bottom: -22pt;
    font-family: 'Fraunces', serif;
    font-style: italic;
    font-weight: 600;
    font-size: 92pt;
    color: rgba(200, 155, 60, 0.055);
    line-height: 1;
    user-select: none;
  }

  .content {
    position: relative;
    z-index: 2;
    height: 100%;
    padding: 16pt 18pt 14pt;
    display: flex;
    flex-direction: column;
  }

  .gold-rule {
    width: 26pt;
    height: 1pt;
    background: linear-gradient(90deg, #C89B3C, transparent);
    margin: 5pt 0 7pt;
  }

  .name {
    font-family: 'Fraunces', serif;
    font-style: italic;
    font-weight: 600;
    font-size: 15.5pt;
    color: #FAFAF8;
    letter-spacing: 0.2pt;
  }

  .jobtitle {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 6.6pt;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    color: #4FC3C4;
    margin-top: 3pt;
  }

  .org {
    font-size: 6pt;
    color: #9CA3AF;
    margin-top: 2pt;
    max-width: 62%;
  }

  .contacts {
    margin-top: auto;
    font-size: 6.8pt;
    color: #E4E1D8;
    line-height: 1.7;
    max-width: 62%;
  }
  .contacts .row { display: flex; align-items: center; gap: 5pt; }
  .contacts .dot {
    width: 2.6pt; height: 2.6pt; border-radius: 50%;
    background: #C89B3C; flex-shrink: 0;
  }

  .qr-wrap {
    position: absolute;
    right: 13pt;
    bottom: 15pt;
    width: 46pt;
    height: 46pt;
    background: #FAFAF8;
    border-radius: 3pt;
    padding: 4pt;
    box-shadow: 0 2pt 8pt rgba(0,0,0,0.4);
  }
  .qr-wrap img { width: 100%; height: 100%; display: block; }

  .scan-label {
    position: absolute;
    right: 13pt;
    bottom: 6pt;
    width: 46pt;
    text-align: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 3.4pt;
    letter-spacing: 0.5pt;
    color: #6B7280;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="texture"></div>
    <div class="monogram">${escapeHtml(initials)}</div>
    <div class="foil-frame"></div>

    <div class="content">
      <div class="name">${escapeHtml(card.fullName)}</div>
      ${card.jobTitle ? `<div class="jobtitle">${escapeHtml(card.jobTitle)}</div>` : ''}
      ${orgLine ? `<div class="org">${escapeHtml(orgLine)}</div>` : ''}
      <div class="gold-rule"></div>

      <div class="contacts">
        ${card.phoneMobile ? `<div class="row"><span class="dot"></span>${escapeHtml(card.phoneMobile)}</div>` : ''}
        ${card.email ? `<div class="row"><span class="dot"></span>${escapeHtml(card.email)}</div>` : ''}
        ${card.website ? `<div class="row"><span class="dot"></span>${escapeHtml(card.website)}</div>` : ''}
      </div>
    </div>

    <div class="qr-wrap"><img src="${qrDataUrl}" /></div>
    <div class="scan-label">SCANNEZ POUR AJOUTER LE CONTACT</div>
  </div>
</body>
</html>`;
}

export class PDFService {
  async generateCardPDF(card: BusinessCard): Promise<Buffer> {
    const vcard = buildVCard(card);

    // QR 100% statique : encodé en base64, aucun appel réseau externe
    const qrDataUrl = await QRCode.toDataURL(vcard, {
      margin: 1,
      width: 300,
      color: { dark: '#12172B', light: '#FAFAF8' }
    });

    const orgParts = [(card as any).ministry, (card as any).direction, (card as any).service].filter(Boolean);
    const orgLine = orgParts.join(' · ');

    const html = renderCardHtml(card, qrDataUrl, orgLine);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdfBuffer = await page.pdf({
        width: `${CARD_WIDTH_IN}in`,
        height: `${CARD_HEIGHT_IN}in`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
      });

      return pdfBuffer as Buffer;
    } finally {
      await browser.close();
    }
  }
}
