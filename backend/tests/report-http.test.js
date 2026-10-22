import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { registerUser } from '../src/services/auth.service.js';
import { createDonation } from '../src/services/donation.service.js';
import { signAuthToken } from '../src/utils/jwt.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `report-${suffix}@example.test`;
let user;
let donation;
let token;
let server;
let baseUrl;

test('setup report HTTP test', async () => {
  user = await registerUser({ name: 'Report User', email, password: 'ReportPass123!' });
  token = signAuthToken(user);
  donation = await createDonation(user.id, {
    title: 'ของบริจาคสำหรับทดสอบ Report',
    description: 'test',
    category: 'OTHER',
    quantity: 1,
    latitude: 13.7291,
    longitude: 100.7789,
    address: 'KMITL',
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 86_400_000),
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('POST donation report requires auth', async () => {
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'OTHER' }),
  });
  assert.equal(response.status, 401);
});

test('POST donation report rejects invalid reason', async () => {
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/reports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'NOT_A_REASON' }),
  });
  assert.equal(response.status, 400);
});

test('authenticated user can report donation', async () => {
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/reports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'INAPPROPRIATE_CONTENT',
      description: 'รูปภาพไม่เหมาะสม',
    }),
  });

  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.reporterId, user.id);
  assert.equal(created.donationId, donation.id);
  assert.equal(created.reason, 'INAPPROPRIATE_CONTENT');
  assert.equal(created.status, 'PENDING');

  const stored = await prisma.report.findUnique({ where: { id: created.id } });
  assert.equal(stored.description, 'รูปภาพไม่เหมาะสม');
});

test('hidden donation cannot receive new reports', async () => {
  await prisma.donation.update({ where: { id: donation.id }, data: { isHidden: true } });
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/reports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'OTHER' }),
  });
  assert.equal(response.status, 404);
});

test('cleanup report HTTP test', async () => {
  await prisma.user.deleteMany({ where: { email } });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
