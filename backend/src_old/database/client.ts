import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const forcedUrl = 'postgresql://postgres:postgres@localhost:5434/smartcard_pro?schema=public';
if (process.env.DATABASE_URL !== forcedUrl) {
  console.warn(`DATABASE_URL etait defini a "${process.env.DATABASE_URL}" mais nous forcons la bonne URL.`);
  process.env.DATABASE_URL = forcedUrl;
}
console.log('DATABASE_URL utilisee par Prisma :', process.env.DATABASE_URL);

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
