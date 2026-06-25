import { prisma } from '../../../shared/prisma-client';

export class ScanEvent {
  static async record(cardId: string, req: any) {
    // Capture asynchrone pour ne pas bloquer la redirection
    await prisma.scan.create({
      data: {
        cardId,
        ip: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
      }
    }).catch(err => console.error("Erreur log analytics:", err));
  }
}
