import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DonationStatus,
  PrismaClient,
  ReportReason,
  ReportStatus,
  Role,
} from '@prisma/client';

const action = process.argv[2];
if (!['setup', 'cleanup'].includes(action)) {
  throw new Error('Usage: node scripts/e2e-fixtures.mjs <setup|cleanup>');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('E2E fixture mutation is disabled in production');
}

if (process.env.E2E_FIXTURES_ENABLED !== 'true') {
  throw new Error('E2E_FIXTURES_ENABLED=true is required');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'e2e-' } },
    select: {
      id: true,
      donations: {
        select: {
          images: { select: { imageUrl: true } },
        },
      },
    },
  });

  const imageUrls = users.flatMap((user) => user.donations.flatMap(
    (donation) => donation.images.map((image) => image.imageUrl),
  ));

  const deleted = await prisma.user.deleteMany({
    where: { id: { in: users.map((user) => user.id) } },
  });

  let removedFiles = 0;
  for (const imageUrl of imageUrls) {
    const filename = path.basename(imageUrl || '');
    if (!filename) continue;
    try {
      await fs.unlink(path.join('uploads', 'donations', filename));
      removedFiles += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return { deletedUsers: deleted.count, removedFiles };
}

function requiredPassword(name) {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(`${name} must be set to at least 8 characters`);
  }
  return value;
}

async function upsertUser({ id, name, email, role, passwordHash }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      isActive: true,
      passwordHash,
    },
    create: {
      id,
      name,
      email,
      role,
      isActive: true,
      passwordHash,
    },
  });
}

async function upsertFixtureSet(prefix, passwordHashes) {
  const adminId = `e2e-${prefix}-admin`;
  const ownerId = `e2e-${prefix}-owner`;
  const reporterId = `e2e-${prefix}-reporter`;
  const donationId = `e2e-${prefix}-donation`;
  const reportId = `e2e-${prefix}-report`;

  await upsertUser({
    id: adminId,
    name: `E2E ${prefix} Admin`,
    email: `e2e-${prefix}-admin@example.test`,
    role: Role.ADMIN,
    passwordHash: passwordHashes.admin,
  });
  await upsertUser({
    id: ownerId,
    name: `E2E ${prefix} Owner`,
    email: `e2e-${prefix}-owner@example.test`,
    role: Role.USER,
    passwordHash: passwordHashes.user,
  });
  await upsertUser({
    id: reporterId,
    name: `E2E ${prefix} Reporter`,
    email: `e2e-${prefix}-reporter@example.test`,
    role: Role.USER,
    passwordHash: passwordHashes.user,
  });

  const label = prefix === 'responsive' ? 'Responsive' : 'Diagnostic';
  const donation = await prisma.donation.upsert({
    where: { id: donationId },
    update: {
      ownerId,
      title: `E2E ${label} Donation`,
      description: `${label} E2E fixture`,
      category: `E2E-${prefix.toUpperCase()}`,
      quantity: 3,
      latitude: 13.7291,
      longitude: 100.7789,
      address: `KMITL ${label} Test Point, Bangkok, Thailand`,
      startDate: new Date(Date.now() - 60 * 60 * 1000),
      endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: DonationStatus.AVAILABLE,
      isHidden: false,
    },
    create: {
      id: donationId,
      ownerId,
      title: `E2E ${label} Donation`,
      description: `${label} E2E fixture`,
      category: `E2E-${prefix.toUpperCase()}`,
      quantity: 3,
      latitude: 13.7291,
      longitude: 100.7789,
      address: `KMITL ${label} Test Point, Bangkok, Thailand`,
      startDate: new Date(Date.now() - 60 * 60 * 1000),
      endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: DonationStatus.AVAILABLE,
      isHidden: false,
    },
  });

  await prisma.report.upsert({
    where: { id: reportId },
    update: {
      reporterId,
      donationId: donation.id,
      reason: ReportReason.FRAUD,
      description: `${label} E2E fixture report`,
      status: ReportStatus.PENDING,
    },
    create: {
      id: reportId,
      reporterId,
      donationId: donation.id,
      reason: ReportReason.FRAUD,
      description: `${label} E2E fixture report`,
      status: ReportStatus.PENDING,
    },
  });
}

async function setup() {
  const userPassword = requiredPassword('E2E_USER_PASSWORD');
  const adminPassword = requiredPassword('E2E_ADMIN_PASSWORD');
  const [userPasswordHash, adminPasswordHash] = await Promise.all([
    bcrypt.hash(userPassword, 12),
    bcrypt.hash(adminPassword, 12),
  ]);

  await cleanup();

  await upsertUser({
    id: 'e2e-admin',
    name: 'E2E Admin',
    email: 'e2e-admin@example.test',
    role: Role.ADMIN,
    passwordHash: adminPasswordHash,
  });

  await upsertFixtureSet('responsive', {
    user: userPasswordHash,
    admin: adminPasswordHash,
  });
  await upsertFixtureSet('diagnostic', {
    user: userPasswordHash,
    admin: adminPasswordHash,
  });

  return { ready: true };
}

try {
  const result = action === 'setup' ? await setup() : await cleanup();
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
