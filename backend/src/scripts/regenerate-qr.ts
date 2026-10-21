import { PrismaClient } from '@prisma/client';
import { FileService } from '../modules/files/services/file.service';
import { QRCodeService } from '../modules/qr-codes/services/qr-code.service';
import { config } from '../infrastructure/config';

const prisma = new PrismaClient();
const fileService = new FileService();
const qrService = new QRCodeService(fileService);

async function main() {
  const cards = await prisma.businessCard.findMany({ where: { isArchived: false } });
  console.log(`🔍 ${cards.length} carte(s) trouvée(s). Base URL: ${config.qrBaseUrl}`);

  let success = 0, failed = 0;
  for (const card of cards) {
    try {
      const qrUrl = config.qrBaseUrl + card.slug;
      await qrService.generateAndStore(card.id, qrUrl);
      console.log(`✅ ${card.fullName} (${card.slug}) → ${qrUrl}`);
      success++;
    } catch (error) {
      console.error(`❌ Échec pour ${card.fullName} (${card.id}):`, error);
      failed++;
    }
  }
  console.log(`\n🎉 Terminé : ${success} régénérées, ${failed} échecs.`);
  await prisma.$disconnect();
}

main();
