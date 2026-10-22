import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const donorEmail = `flow-donor-${suffix}@example.test`;
const reporterEmail = `flow-reporter-${suffix}@example.test`;
const adminEmail = `flow-admin-${suffix}@example.test`;
const password = 'SystemFlowPass123!';

let server;
let baseUrl;
let donorCookie;
let reporterCookie;
let adminCookie;
let donorId;
let donationId;
let reportId;

function sessionCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'response should set session cookie');
  return header.split(';', 1)[0];
}

async function register(name, email) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  return { user: body.user, cookie: sessionCookie(response) };
}

test('setup end-to-end HTTP flow', async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('donor registers and authenticated session works', async () => {
  const registered = await register('Flow Donor', donorEmail);
  donorId = registered.user.id;
  donorCookie = registered.cookie;

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: donorCookie },
  });
  assert.equal(meResponse.status, 200);
  const me = await meResponse.json();
  assert.equal(me.user.email, donorEmail);
  assert.equal(me.user.role, 'USER');
});

test('donor creates donation and it appears in nearby search', async () => {
  const createResponse = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: {
      cookie: donorCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'System Flow Donation',
      description: 'ใช้ทดสอบ flow หลักของระบบ',
      category: 'TEST',
      quantity: 2,
      latitude: 13.7291,
      longitude: 100.7789,
      address: 'KMITL',
      startDate: new Date(Date.now() - 60_000).toISOString(),
      endDate: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  });
  assert.equal(createResponse.status, 201);
  const donation = await createResponse.json();
  donationId = donation.id;
  assert.equal(donation.ownerId, donorId);
  assert.equal(donation.status, 'AVAILABLE');

  const nearbyResponse = await fetch(
    `${baseUrl}/api/donations/nearby?lat=13.7291&lng=100.7789&radius=2&category=TEST`,
  );
  assert.equal(nearbyResponse.status, 200);
  const nearby = await nearbyResponse.json();
  assert.ok(nearby.some((item) => item.id === donationId));
});

test('second user reports donation', async () => {
  const registered = await register('Flow Reporter', reporterEmail);
  reporterCookie = registered.cookie;

  const reportResponse = await fetch(`${baseUrl}/api/donations/${donationId}/reports`, {
    method: 'POST',
    headers: {
      cookie: reporterCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'FRAUD',
      description: 'ทดสอบการส่งรายงานไปยัง Admin',
    }),
  });
  assert.equal(reportResponse.status, 201);
  const report = await reportResponse.json();
  reportId = report.id;
  assert.equal(report.status, 'PENDING');
  assert.equal(report.donationId, donationId);
});

test('admin can review report and hide donation', async () => {
  const registered = await register('Flow Admin', adminEmail);
  adminCookie = registered.cookie;
  await prisma.user.update({
    where: { id: registered.user.id },
    data: { role: 'ADMIN' },
  });

  const detailResponse = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.id, reportId);
  assert.equal(detail.donation.id, donationId);

  const hideResponse = await fetch(`${baseUrl}/api/admin/donations/${donationId}/visibility`, {
    method: 'PATCH',
    headers: {
      cookie: adminCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ isHidden: true }),
  });
  assert.equal(hideResponse.status, 200);
  assert.equal((await hideResponse.json()).isHidden, true);

  const resolveResponse = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      cookie: adminCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ status: 'RESOLVED' }),
  });
  assert.equal(resolveResponse.status, 200);
  assert.equal((await resolveResponse.json()).status, 'RESOLVED');
});

test('hidden donation disappears from map search', async () => {
  const nearbyResponse = await fetch(
    `${baseUrl}/api/donations/nearby?lat=13.7291&lng=100.7789&radius=2&category=TEST`,
  );
  assert.equal(nearbyResponse.status, 200);
  const nearby = await nearbyResponse.json();
  assert.equal(nearby.some((item) => item.id === donationId), false);
});

test('admin suspends donor and existing donor session is rejected', async () => {
  const suspendResponse = await fetch(`${baseUrl}/api/admin/users/${donorId}/status`, {
    method: 'PATCH',
    headers: {
      cookie: adminCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(suspendResponse.status, 200);
  assert.equal((await suspendResponse.json()).isActive, false);

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: donorCookie },
  });
  assert.equal(meResponse.status, 401);
});

test('cleanup end-to-end HTTP flow', async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [donorEmail, reporterEmail, adminEmail] } },
  });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
