import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for seed');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function passwordHashFromEnv(name) {
  const password = process.env[name] || randomBytes(32).toString('hex');
  return bcrypt.hash(password, 12);
}

async function main() {
  const [adminPasswordHash, userPasswordHash] = await Promise.all([
    passwordHashFromEnv('SEED_ADMIN_PASSWORD'),
    passwordHashFromEnv('SEED_USER_PASSWORD'),
  ]);

  await prisma.user.upsert({
    where: { email: 'admin@ogtb.local' },
    update: {
      name: 'OGTB Admin',
      role: Role.ADMIN,
      isActive: true,
      ...(process.env.SEED_ADMIN_PASSWORD ? { passwordHash: adminPasswordHash } : {}),
    },
    create: {
      name: 'OGTB Admin',
      email: 'admin@ogtb.local',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'user@ogtb.local' },
    update: {
      name: 'OGTB User',
      role: Role.USER,
      isActive: true,
      ...(process.env.SEED_USER_PASSWORD ? { passwordHash: userPasswordHash } : {}),
    },
    create: {
      name: 'OGTB User',
      email: 'user@ogtb.local',
      passwordHash: userPasswordHash,
      role: Role.USER,
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
