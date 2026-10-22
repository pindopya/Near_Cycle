import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { registerUser } from '../src/services/auth.service.js';
import { signAuthToken } from '../src/utils/jwt.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const adminEmail = `admin-${suffix}@example.test`;
const userEmail = `admin-user-${suffix}@example.test`;
let admin;
let user;
let adminToken;
let userToken;
let donation;
let report;
let server;
let baseUrl;

test('setup admin HTTP fixtures', async () => {
  admin = await registerUser({ name: 'Admin Test', email: adminEmail, password: 'AdminPass123!' });
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  admin = { ...admin, role: 'ADMIN' };
  adminToken = signAuthToken(admin);

  user = await registerUser({ name: 'Managed User', email: userEmail, password: 'ManagedPass123!' });
  userToken = signAuthToken(user);

  donation = await prisma.donation.create({
    data: {
      ownerId: user.id,
      title: 'Admin test donation',
      category: 'OTHER',
      quantity: 1,
      latitude: 13.7291,
      longitude: 100.7789,
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 86_400_000),
    },
  });

  report = await prisma.report.create({
    data: {
      reporterId: admin.id,
      donationId: donation.id,
      reason: 'FRAUD',
      description: 'Admin phase test',
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('admin APIs require admin role', async () => {
  const noAuth = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(noAuth.status, 401);

  const normalUser = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { authorization: `Bearer ${userToken}` },
  });
  assert.equal(normalUser.status, 403);
});

test('admin can list users, donations, and reports', async () => {
  const headers = { authorization: `Bearer ${adminToken}` };
  const [usersResponse, donationsResponse, reportsResponse] = await Promise.all([
    fetch(`${baseUrl}/api/admin/users`, { headers }),
    fetch(`${baseUrl}/api/admin/donations`, { headers }),
    fetch(`${baseUrl}/api/admin/reports`, { headers }),
  ]);

  assert.equal(usersResponse.status, 200);
  assert.equal(donationsResponse.status, 200);
  assert.equal(reportsResponse.status, 200);
  assert.ok((await usersResponse.json()).some((item) => item.id === user.id));
  assert.ok((await donationsResponse.json()).some((item) => item.id === donation.id));
  assert.ok((await reportsResponse.json()).some((item) => item.id === report.id));
});


test('admin listing refreshes past AVAILABLE donation to EXPIRED', async () => {
  const expiredDonation = await prisma.donation.create({
    data: {
      ownerId: user.id,
      title: 'Expired admin donation',
      category: 'OTHER',
      quantity: 1,
      latitude: 13.7291,
      longitude: 100.7789,
      status: 'AVAILABLE',
      startDate: new Date(Date.now() - 120_000),
      endDate: new Date(Date.now() - 60_000),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/donations`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 200);
  const listed = (await response.json()).find((item) => item.id === expiredDonation.id);
  assert.equal(listed?.status, 'EXPIRED');
  assert.equal((await prisma.donation.findUnique({ where: { id: expiredDonation.id } })).status, 'EXPIRED');
  await prisma.donation.delete({ where: { id: expiredDonation.id } });
});

test('admin can suspend user and hide donation', async () => {
  const headers = {
    authorization: `Bearer ${adminToken}`,
    'content-type': 'application/json',
  };

  const userResponse = await fetch(`${baseUrl}/api/admin/users/${user.id}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(userResponse.status, 200);
  assert.equal((await userResponse.json()).isActive, false);

  const donationResponse = await fetch(`${baseUrl}/api/admin/donations/${donation.id}/visibility`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isHidden: true }),
  });
  assert.equal(donationResponse.status, 200);
  assert.equal((await donationResponse.json()).isHidden, true);
});

test('admin can inspect hidden donation detail while public detail stays hidden', async () => {
  const publicResponse = await fetch(`${baseUrl}/api/donations/${donation.id}`);
  assert.equal(publicResponse.status, 404);
  const suspendedUserResponse = await fetch(`${baseUrl}/api/admin/donations/${donation.id}`, {
    headers: { authorization: `Bearer ${userToken}` },
  });
  assert.equal(suspendedUserResponse.status, 401);

  const adminResponse = await fetch(`${baseUrl}/api/admin/donations/${donation.id}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminResponse.status, 200);
  const detail = await adminResponse.json();
  assert.equal(detail.id, donation.id);
  assert.equal(detail.isHidden, true);
  assert.equal(detail.owner.id, user.id);
  assert.ok(detail.reports.some((item) => item.id === report.id));
  assert.equal(detail._count.reports, 1);
});

test('admin can inspect and resolve report', async () => {
  const headers = {
    authorization: `Bearer ${adminToken}`,
    'content-type': 'application/json',
  };

  const detailResponse = await fetch(`${baseUrl}/api/admin/reports/${report.id}`, { headers });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.donation.owner.id, user.id);

  const resolveResponse = await fetch(`${baseUrl}/api/admin/reports/${report.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'RESOLVED' }),
  });
  assert.equal(resolveResponse.status, 200);
  assert.equal((await resolveResponse.json()).status, 'RESOLVED');
});

test('admin can delete donation and its report', async () => {
  const response = await fetch(`${baseUrl}/api/admin/donations/${donation.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 204);
  assert.equal(await prisma.donation.findUnique({ where: { id: donation.id } }), null);
  assert.equal(await prisma.report.findUnique({ where: { id: report.id } }), null);
  donation = null;
  report = null;
});

test('admin cannot suspend own account', async () => {
  const response = await fetch(`${baseUrl}/api/admin/users/${admin.id}/status`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(response.status, 400);
});

test('cleanup admin HTTP fixtures', async () => {
  if (donation) await prisma.donation.deleteMany({ where: { id: donation.id } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail] } } });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
