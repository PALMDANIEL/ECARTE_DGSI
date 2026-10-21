import { BusinessCard } from '@prisma/client';

export interface CardBranding {
  logoDataUrl: string;
}

const COLORS = {
  teal: '#41748E',
  navy: '#29345B',
  iconCyan: '#7BBCC3',
  white: '#FFFFFF',
};

export function generateCardHtml(
  card: BusinessCard,
  qrDataUrl: string,
  branding: CardBranding
): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { margin: 0; size: 89mm 51mm; }

  body {
    width: 89mm;
    height: 51mm;
    font-family: 'Poppins', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: 89mm;
    height: 51mm;
    display: flex;
    overflow: hidden;
    background: ${COLORS.white};
  }

  .left-panel {
    width: 34mm;
    background: ${COLORS.teal};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 3.5mm 3mm;
  }

  .logo-badge {
    width: 24mm;
    height: 24mm;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1mm;
  }

  .logo-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .qr-box {
    width: 17mm;
    height: 17mm;
    background: ${COLORS.white};
    padding: 1mm;
    border-radius: 1mm;
  }

  .qr-box img {
    width: 100%;
    height: 100%;
    display: block;
  }

  .right-panel {
    flex: 1;
    padding: 5.5mm 6mm 5.5mm 6.5mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .name {
    font-size: 13pt;
    font-weight: 700;
    color: ${COLORS.navy};
    line-height: 1.2;
  }

  .job-title {
    font-size: 7.8pt;
    font-weight: 400;
    color: ${COLORS.navy};
    line-height: 1.35;
    margin-top: 1.2mm;
  }

  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 2mm;
  }

  .contact-row {
    display: flex;
    align-items: center;
    gap: 2.5mm;
    font-size: 8pt;
    color: ${COLORS.navy};
    font-weight: 400;
  }

  .contact-row svg {
    width: 9pt;
    height: 9pt;
    flex-shrink: 0;
  }

  .contact-row svg path,
  .contact-row svg rect {
    fill: ${COLORS.iconCyan};
  }
</style>
</head>
<body>
  <div class="card">
    <div class="left-panel">
      <div class="logo-badge"><img src="${branding.logoDataUrl}" /></div>
      <div class="qr-box"><img src="${qrDataUrl}" /></div>
    </div>
    <div class="right-panel">
      <div>
        <div class="name">${escapeHtml(formatName(card.fullName))}</div>
        ${card.jobTitle ? `<div class="job-title">${escapeHtml(card.jobTitle)}</div>` : ''}
      </div>
      <div class="contact-list">
        ${card.phoneMobile ? `<div class="contact-row">${icon('phone')}${escapeHtml(card.phoneMobile)}</div>` : ''}
        ${card.phoneWork ? `<div class="contact-row">${icon('mobile')}${escapeHtml(card.phoneWork)}</div>` : ''}
        ${card.email ? `<div class="contact-row">${icon('mail')}${escapeHtml(card.email)}</div>` : ''}
        ${card.address ? `<div class="contact-row">${icon('home')}${escapeHtml(card.address)}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function formatName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length < 2) return fullName;
  const last = parts.pop();
  return `${parts.join(' ')} ${last?.toUpperCase()}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function icon(type: 'phone' | 'mobile' | 'mail' | 'home'): string {
  switch (type) {
    case 'phone':
      return `<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4.7c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.2 1.1L6.6 10.8z"/></svg>`;
    case 'mobile':
      return `<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/></svg>`;
    case 'mail':
      return `<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.4 2L12 12.5 19.6 7H4.4z"/></svg>`;
    case 'home':
      return `<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg>`;
  }
}
