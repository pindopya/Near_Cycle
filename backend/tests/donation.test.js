import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/database.js';
import {
  createDonation,
  deleteDonation,
  getDonationById,
  listDonations,
  markDonationOutOfStock,
  updateDonation,
} from '../src/services/donation.service.js';
import { registerUser } from '../src/services/auth.service.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `donation-${suffix}@example.test`;
const otherEmail = `donation-other-${suffix}@example.test`;
let owner;
let other;
let donation;

const futureStart = new Date(Date.now() + 60_000);
const futureEnd = new Date(Date.now() + 86_400_000);

test('setup donation test users', async () => {
  owner = await registerUser({ name: 'Donation Owner', email, password: 'DonationPass123!' });
  other = await registerUser({ name: 'Other User', email: otherEmail, password: 'DonationPass123!' });
});

test('owner can create and read donation', async () => {
  donation = await createDonation(owner.id, {
    title: 'หนังสือเรียน',
    description: 'หนังสือสภาพดี',
    category: 'BOOK',
    quantity: 3,
    latitude: 13.7291,
    longitude: 100.7789,
    address: 'KMITL',
    startDate: futureStart,
    endDate: futureEnd,
  });

  assert.equal(donation.ownerId, owner.id);
  assert.equal(donation.status, 'AVAILABLE');

  const found = await getDonationById(donation.id);
  assert.equal(found.id, donation.id);

  const list = await listDonations();
  assert.ok(list.some((item) => item.id === donation.id));
});

test('owner can update own donation', async () => {
  const updated = await updateDonation(donation.id, owner.id, { quantity: 2, title: 'หนังสือเรียน ม.ปลาย' });
  assert.equal(updated.quantity, 2);
  assert.equal(updated.title, 'หนังสือเรียน ม.ปลาย');
});

test('other user cannot update donation', async () => {
  await assert.rejects(
    () => updateDonation(donation.id, other.id, { quantity: 1 }),
    (error) => error.status === 403 && error.code === 'FORBIDDEN',
  );
});

test('owner can mark donation out of stock', async () => {
  const updated = await markDonationOutOfStock(donation.id, owner.id);
  assert.equal(updated.status, 'OUT_OF_STOCK');
});

test('expired AVAILABLE donation becomes EXPIRED when listed', async () => {
  const expired = await prisma.donation.create({
    data: {
      ownerId: owner.id,
      title: 'Expired item',
      category: 'OTHER',
      quantity: 1,
      latitude: 13.7,
      longitude: 100.7,
      startDate: new Date(Date.now() - 172_800_000),
      endDate: new Date(Date.now() - 86_400_000),
      status: 'AVAILABLE',
    },
  });

  await listDonations();
  const refreshed = await prisma.donation.findUnique({ where: { id: expired.id } });
  assert.equal(refreshed.status, 'EXPIRED');
});

test('owner can delete own donation', async () => {
  await deleteDonation(donation.id, owner.id);
  const removed = await prisma.donation.findUnique({ where: { id: donation.id } });
  assert.equal(removed, null);
});

test('cleanup donation test data', async () => {
  await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  await prisma.$disconnect();
});
