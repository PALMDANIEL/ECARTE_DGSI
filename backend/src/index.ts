import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { config } from './infrastructure/config';
import { logger } from './infrastructure/logger';
import { errorHandler } from './middlewares/error-handler';
import { authRouter } from './modules/auth/routes';
import { userRouter } from './modules/users/routes';
import { companyRouter } from './modules/companies/routes';
import { teamRouter } from './modules/teams/routes';
import { cardRouter } from './modules/business-cards/routes';
import { qrRouter } from './modules/qr-codes/routes';
import { filesRouter } from './modules/files/routes';
import { analyticsRouter } from './modules/analytics/routes';
import swaggerSpec from './infrastructure/swagger';
import { cardPdfService } from './modules/business-cards/services/card-pdf.service';

console.log('🚀 Démarrage du backend avec DATABASE_URL =', process.env.DATABASE_URL);

const app = express();

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/companies', companyRouter);
app.use('/api/teams', teamRouter);
app.use('/api/cards', cardRouter);
app.use('/api/qr', qrRouter);
app.use('/api/files', filesRouter);
app.use('/api/dashboard', analyticsRouter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

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
