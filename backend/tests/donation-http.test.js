import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { registerUser } from '../src/services/auth.service.js';
import { signAuthToken } from '../src/utils/jwt.js';

const email = `donation-http-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`;
let user;
let token;
let server;
let baseUrl;
let donationId;

test('setup donation HTTP test', async () => {
  user = await registerUser({ name: 'HTTP Donation User', email, password: 'DonationHttpPass123!' });
  token = signAuthToken(user);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('POST /api/donations requires auth', async () => {
  const response = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 401);
});

test('POST /api/donations rejects impossible calendar dates', async () => {
  const response = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Invalid date item',
      category: 'OTHER',
      quantity: 1,
      latitude: 13.7291,
      longitude: 100.7789,
      startDate: '2026-02-30',
      endDate: '2026-03-10',
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'VALIDATION_ERROR');
});
test('authenticated user can create, update, mark out of stock, and delete donation', async () => {
  const authHeaders = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const createResponse = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'เสื้อผ้า',
      description: 'เสื้อผ้าสภาพดี',
      category: 'CLOTHING',
      quantity: 5,
      latitude: 13.7291,
      longitude: 100.7789,
      address: 'KMITL',
      startDate: '2026-09-11',
      endDate: '2099-09-30',
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  donationId = created.id;
  assert.equal(created.status, 'AVAILABLE');
  assert.equal(created.startDate, '2026-09-10T17:00:00.000Z');
  assert.equal(created.endDate, '2099-09-30T16:59:59.999Z');

  const detailResponse = await fetch(`${baseUrl}/api/donations/${donationId}`);
  assert.equal(detailResponse.status, 200);

  const updateResponse = await fetch(`${baseUrl}/api/donations/${donationId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ quantity: 4 }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).quantity, 4);

  const stockResponse = await fetch(`${baseUrl}/api/donations/${donationId}/out-of-stock`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(stockResponse.status, 200);
  assert.equal((await stockResponse.json()).status, 'OUT_OF_STOCK');

  const deleteResponse = await fetch(`${baseUrl}/api/donations/${donationId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(deleteResponse.status, 204);
  donationId = null;
});

test('cleanup donation HTTP test', async () => {
  if (donationId) await prisma.donation.deleteMany({ where: { id: donationId } });
  await prisma.user.deleteMany({ where: { email } });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
