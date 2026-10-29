import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@ecarte.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  const companyName = process.env.SEED_COMPANY_NAME || 'ECARTE';
  const company = await prisma.company.upsert({
    where: { name: companyName },
    update: {},
    create: { name: companyName, email },
  });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      firstName: 'Super',
      lastName: 'Admin',
      email,
      password: await bcrypt.hash(password, 10),
      role: 'SUPER_ADMIN',
      isVerified: true,
      companyId: company.id,
    },
  });
  console.log(`Seed OK -> ${email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
