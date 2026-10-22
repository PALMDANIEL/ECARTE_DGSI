import 'dotenv/config';
import { app } from './app';
import { config } from './infrastructure/config';
import { logger } from './infrastructure/logger';
import { htmlPdfService } from './infrastructure/pdf/html-pdf.service';
import { escalationService } from './modules/requests/escalation.service';
import { cardPdfService } from './modules/business-cards/services/card-pdf.service';


const PORT = config.port || 3001;
app.listen(PORT, '0.0.0.0', () => {
  logger.info('Server running on port ' + PORT);
});

// Rappels et escalades de délais : un balayage toutes les 15 minutes (idempotent), désactivable par ESCALATION_SWEEP_MINUTES=0
const sweepMinutes = parseInt(process.env.ESCALATION_SWEEP_MINUTES || '15', 10);
if (sweepMinutes > 0) {
  const sweep = () => escalationService.runAll().then(r => { if (r.reminders || r.escalations) logger.info('Balayage des délais', r); }).catch(e => logger.error('Balayage des délais échoué', { error: (e as Error).message }));
  setTimeout(sweep, 30_000).unref();
  setInterval(sweep, sweepMinutes * 60_000).unref();
}

// Fermeture propre de Puppeteer
process.on('SIGTERM', async () => {
  console.log('Fermeture de Puppeteer...');
  await cardPdfService.close();
  await htmlPdfService.close();
  process.exit(0);
});
