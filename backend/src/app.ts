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
import { orgUnitRouter, positionRouter, delegationRouter } from './modules/org/routes';
import { agentRouter } from './modules/agents/routes';
import { statsRouter } from './modules/stats/routes';
import { notificationRouter } from './modules/notifications/routes';
import { auditRouter } from './modules/audit/routes';
import { settingsRouter } from './modules/settings/routes';
import { accessRouter } from './modules/access/routes';
import { leaveRouter, holidayRouter } from './modules/leave/routes';
import { requestTypeRouter, absenceTypeRouter, workflowRouter, formTemplateRouter, requestRouter, escalationRouter } from './modules/requests/routes';
import swaggerSpec from './infrastructure/swagger';
import { cardPdfService } from './modules/business-cards/services/card-pdf.service';

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
  // 100 requêtes / 15 min bloquaient les écrans d'administration ; les routes sensibles ont leurs propres limiteurs (/api/access).
  max: process.env.NODE_ENV === 'test' ? 100000 : 1000,
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

// Module demandes administratives
app.use('/api/org-units', orgUnitRouter);
app.use('/api/positions', positionRouter);
app.use('/api/delegations', delegationRouter);
app.use('/api/agents', agentRouter);
app.use('/api/audit', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/access', accessRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/holidays', holidayRouter);
app.use('/api/request-types', requestTypeRouter);
app.use('/api/absence-types', absenceTypeRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/form-templates', formTemplateRouter);
app.use('/api/requests', requestRouter);
app.use('/api/escalations', escalationRouter);
app.use('/api/stats', statsRouter);
app.use('/api/notifications', notificationRouter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

export { app };
