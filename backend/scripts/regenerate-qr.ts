import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function regenerateAllQRCodes() {
  const cards = await prisma.businessCard.findMany({ where: { isArchived: false } });
  console.log('📇 ' + cards.length + ' cartes trouvees.');
  const qrBaseUrl = process.env.QR_BASE_URL || 'http://192.168.1.65:4200/card/';
  for (const card of cards) {
    const url = qrBaseUrl + card.slug;
    console.log('🔄 ' + card.fullName + ' -> ' + url);
    const pngBuffer = await QRCode.toBuffer(url, { type: 'png', width: 300 });
    const filename = 'qr-' + card.id + '.png';
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, pngBuffer);
    await prisma.businessCard.update({ where: { id: card.id }, data: { qrCodeUrl: '/uploads/' + filename } });
  }
  console.log('✅ Tous les QR codes regeneres.');
}

regenerateAllQRCodes().catch(console.error).finally(() => prisma.$disconnect());
