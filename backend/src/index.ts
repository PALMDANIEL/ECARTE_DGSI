import 'dotenv/config';
import { app } from './app';
import { config } from './infrastructure/config';
import { logger } from './infrastructure/logger';
import { cardPdfService } from './modules/business-cards/services/card-pdf.service';

console.log('🚀 Démarrage du backend avec DATABASE_URL =', process.env.DATABASE_URL);

const PORT = config.port || 3001;
app.listen(PORT, '0.0.0.0', () => {
  logger.info('Server running on port ' + PORT);
});

// Fermeture propre de Puppeteer
process.on('SIGTERM', async () => {
  console.log('Fermeture de Puppeteer...');
  await cardPdfService.close();
  process.exit(0);
});
