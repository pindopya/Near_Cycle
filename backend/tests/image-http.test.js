import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { createDonation, deleteDonation } from '../src/services/donation.service.js';
import { registerUser } from '../src/services/auth.service.js';
import { signAuthToken } from '../src/utils/jwt.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const ownerEmail = `image-owner-${suffix}@example.test`;
const otherEmail = `image-other-${suffix}@example.test`;
let owner;
let other;
let donation;
let fiveImageDonation;
let incrementalDonation;
let overflowDonation;
let token;
let otherToken;
let image;
let server;
let baseUrl;

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function donationData(title) {
  return {
    title,
    category: 'OTHER',
    quantity: 1,
    latitude: 13.7291,
    longitude: 100.7789,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 86_400_000),
  };
}

function imageForm(count, prefix = 'donation') {
  const form = new FormData();
  for (let index = 0; index < count; index += 1) {
    form.append('images', new Blob([PNG_BYTES], { type: 'image/png' }), `${prefix}-${index}.png`);
  }
  return form;
}

function uploadImages(donationId, form, authToken = token) {
  return fetch(`${baseUrl}/api/donations/${donationId}/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${authToken}` },
    body: form,
  });
}

test('setup image HTTP test', async () => {
  owner = await registerUser({ name: 'Image Owner', email: ownerEmail, password: 'ImageOwnerPass123!' });
  other = await registerUser({ name: 'Image Other', email: otherEmail, password: 'ImageOtherPass123!' });
  token = signAuthToken(owner);
  otherToken = signAuthToken(other);

  [donation, fiveImageDonation, incrementalDonation, overflowDonation] = await Promise.all([
    createDonation(owner.id, donationData('ของบริจาคพร้อมรูป')),
    createDonation(owner.id, donationData('Five image donation')),
    createDonation(owner.id, donationData('Incremental image donation')),
    createDonation(owner.id, donationData('Overflow image donation')),
  ]);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('owner can upload an image and it is publicly served', async () => {
  const response = await uploadImages(donation.id, imageForm(1));

  assert.equal(response.status, 201);
  const images = await response.json();
  assert.equal(images.length, 1);
  image = images[0];
  assert.match(image.imageUrl, /^\/uploads\/donations\/.+\.png$/);

  const detailResponse = await fetch(`${baseUrl}/api/donations/${donation.id}`);
  const detail = await detailResponse.json();
  assert.ok(detail.images.some((item) => item.id === image.id));

  const staticResponse = await fetch(`${baseUrl}${image.imageUrl}`);
  assert.equal(staticResponse.status, 200);
});

test('donation accepts five images from empty state', async () => {
  const response = await uploadImages(fiveImageDonation.id, imageForm(5, 'five'));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).length, 5);
  assert.equal(await prisma.donationImage.count({ where: { donationId: fiveImageDonation.id } }), 5);
});

test('donation accepts three images then two remaining images', async () => {
  const firstResponse = await uploadImages(incrementalDonation.id, imageForm(3, 'incremental-a'));
  assert.equal(firstResponse.status, 201);

  const secondResponse = await uploadImages(incrementalDonation.id, imageForm(2, 'incremental-b'));
  assert.equal(secondResponse.status, 201);
  assert.equal(await prisma.donationImage.count({ where: { donationId: incrementalDonation.id } }), 5);
});

test('donation rejects upload that would exceed five total images', async () => {
  const firstResponse = await uploadImages(overflowDonation.id, imageForm(4, 'overflow-a'));
  assert.equal(firstResponse.status, 201);

  const overflowResponse = await uploadImages(overflowDonation.id, imageForm(2, 'overflow-b'));
  assert.equal(overflowResponse.status, 400);
  const body = await overflowResponse.json();
  assert.equal(body.error, 'TOO_MANY_DONATION_IMAGES');
  assert.equal(await prisma.donationImage.count({ where: { donationId: overflowDonation.id } }), 4);
});

test('non-owner cannot delete donation image', async () => {
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/images/${image.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(response.status, 403);
});

test('upload rejects unsupported file type', async () => {
  const form = new FormData();
  form.append('images', new Blob(['not-an-image'], { type: 'application/pdf' }), 'file.pdf');
  const response = await uploadImages(donation.id, form);
  assert.equal(response.status, 400);
});

test('upload rejects spoofed image MIME type', async () => {
  const form = new FormData();
  form.append('images', new Blob(['not-really-a-png'], { type: 'image/png' }), 'fake.png');
  const response = await uploadImages(donation.id, form);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_IMAGE_CONTENT');
});

test('owner can delete donation image', async () => {
  const response = await fetch(`${baseUrl}/api/donations/${donation.id}/images/${image.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 204);
  const stored = await prisma.donationImage.findUnique({ where: { id: image.id } });
  assert.equal(stored, null);
});

test('cleanup image HTTP test', async () => {
  for (const item of [donation, fiveImageDonation, incrementalDonation, overflowDonation]) {
    if (item) await deleteDonation(item.id, owner.id);
  }
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
