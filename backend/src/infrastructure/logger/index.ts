import winston from 'winston';

// Sur Vercel (disque en lecture seule), la console suffit : Vercel conserve ces journaux. Ailleurs, aussi dans logs/.
const serverless = !!process.env.VERCEL;
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  silent: process.env.NODE_ENV === 'test',
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.splat(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: serverless ? winston.format.json() : winston.format.combine(winston.format.colorize(), winston.format.simple()) }),
    ...(serverless ? [] : [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ]),
  ],
});
