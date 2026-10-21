import PDFDocument from 'pdfkit';
import { BusinessCard } from '@prisma/client';

export class PDFService {
  generateCardPDF(card: BusinessCard): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.fontSize(24).text(card.fullName, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(16).text(card.jobTitle || '', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(12);
        doc.text('Email: ' + (card.email || '-'));
        doc.text('Mobile: ' + (card.phoneMobile || '-'));
        doc.text('Bureau: ' + (card.phoneWork || '-'));
        doc.text('WhatsApp: ' + (card.whatsapp || '-'));
        doc.text('Site: ' + (card.website || '-'));
        if (card.address) doc.text('Adresse: ' + card.address);
        if (card.qrCodeUrl) {
          try {
            doc.image(card.qrCodeUrl, { fit: [100, 100], align: 'center' });
          } catch (e) {}
        }
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
