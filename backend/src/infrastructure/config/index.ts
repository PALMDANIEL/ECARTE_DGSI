import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'default_secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  email: { host: process.env.EMAIL_HOST || 'smtp.example.com', port: parseInt(process.env.EMAIL_PORT || '587', 10), user: process.env.EMAIL_USER || 'user@example.com', pass: process.env.EMAIL_PASS || 'password' },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  qrBaseUrl: process.env.QR_BASE_URL || 'http://localhost:4200/card/',
  // Clé de chiffrement des jetons QR (AES-256-GCM). À définir en production ; à défaut dérivée de JWT_SECRET.
  cardTokenKey: process.env.CARD_TOKEN_KEY || process.env.JWT_SECRET || 'default_secret',
  accessBaseUrl: process.env.ACCESS_BASE_URL || ((process.env.FRONTEND_URL || 'http://localhost:4200') + '/q/'),
  maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10),
  lockDuration: parseInt(process.env.LOCK_DURATION || '900000', 10),
};

console.log('🔧 QR_BASE_URL utilise:', config.qrBaseUrl);
