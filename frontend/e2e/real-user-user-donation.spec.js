import { expect, test } from '@playwright/test';
import { e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

const A = { latitude: 13.7291, longitude: 100.7789, accuracy: 15 };
const B = { latitude: 13.7362, longitude: 100.7854, accuracy: 10 };
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=',
  'base64',
);

async function registerUser(page, prefix) {
  const user = uniqueE2eIdentity(prefix);
  user.password = e2eUserPassword();
  const response = await page.request.post('/api/auth/register', { data: user });
  expect(response.status()).toBe(201);
  return (await response.json()).user;
}

async function chooseCurrentLocation(page) {
  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  const dialog = page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mapPickerMarker')).toBeVisible();
  await dialog.getByRole('button', { name: 'ยืนยันตำแหน่งนี้' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('เลือกตำแหน่งแล้ว')).toBeVisible();
}

async function fillDonationForm(page, { title, category, quantity = '2', address }) {
  if (address != null) {
    await page.getByPlaceholder('เช่น อาคาร A หน้าประตูทางเข้า').fill(address);
  }
  await page.getByPlaceholder('เช่น เสื้อผ้าสภาพดี').fill(title);
  await page.getByPlaceholder('เช่น เสื้อผ้า', { exact: true }).fill(category);
  await page.getByRole('spinbutton').fill(quantity);
  await page.getByPlaceholder('สภาพของ รายละเอียดการรับ หรือข้อมูลเพิ่มเติม').fill('Real user lifecycle QA');
  await page.locator('input[type="date"]').nth(1).fill('2026-10-05');
}

async function attachPng(page, name) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await expect(page.getByText('รูปใหม่')).toBeVisible();
}

test('owner can create with image, edit location/image/content, mark out of stock, and delete without stale UI', async ({ page, context }) => {
  const suffix = Date.now().toString(36);
  const originalTitle = `E2E USER original ${suffix}`;
  const editedTitle = `E2E USER edited ${suffix}`;
  const originalCategory = `E2E-USER-ORIGINAL-${suffix}`;
  const editedCategory = `E2E-USER-EDITED-${suffix}`;

  await registerUser(page, 'real-user-lifecycle');
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(A);

  await page.goto('/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toBeVisible();
  await chooseCurrentLocation(page);
  await fillDonationForm(page, {
    title: originalTitle,
    category: originalCategory,
    quantity: '2',
    address: 'E2E original pickup point',
  });
  await attachPng(page, 'original.png');

  const createResponsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/donations')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();

  await expect(page).toHaveURL(`/donations/${created.id}`);
  await expect(page.getByRole('heading', { level: 1, name: originalTitle })).toBeVisible();
  await expect(page.locator('.pointSeenBadge')).toHaveText(originalCategory);
  await expect(page.getByText('จำนวน 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดรูปของบริจาคแบบเต็มจอ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'แก้ไขโพสต์' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ของหมดแล้ว' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบโพสต์' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'รายงานโพสต์' })).toHaveCount(0);

  const createdDetail = await (await page.request.get(`/api/donations/${created.id}`)).json();
  expect(createdDetail.images).toHaveLength(1);
  const originalImageId = createdDetail.images[0].id;

  await page.getByRole('link', { name: 'แก้ไขโพสต์' }).click();
  await expect(page).toHaveURL(`/donations/${created.id}/edit`);
  await expect(page.getByRole('heading', { name: 'แก้ไขของบริจาค' })).toBeVisible();
  await expect(page.getByText('รูปในโพสต์')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบรูป' }).click();
  await expect(page.getByText('รูปในโพสต์')).toHaveCount(0);

  await context.setGeolocation(B);
  await chooseCurrentLocation(page);
  await page.getByPlaceholder('เช่น อาคาร A หน้าประตูทางเข้า').fill('E2E edited pickup point');
  await page.getByPlaceholder('เช่น เสื้อผ้าสภาพดี').fill(editedTitle);
  await page.getByPlaceholder('เช่น เสื้อผ้า', { exact: true }).fill(editedCategory);
  await page.getByRole('spinbutton').fill('5');
  await attachPng(page, 'replacement.png');

  const patchRequestPromise = page.waitForRequest((request) => (
    request.url().endsWith(`/api/donations/${created.id}`)
    && request.method() === 'PATCH'
  ));
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  const patchRequest = await patchRequestPromise;
  const patchPayload = patchRequest.postDataJSON();
  expect(patchPayload.latitude).toBeCloseTo(B.latitude, 6);
  expect(patchPayload.longitude).toBeCloseTo(B.longitude, 6);

  await expect(page).toHaveURL(`/donations/${created.id}`);
  await expect(page.getByRole('heading', { level: 1, name: editedTitle })).toBeVisible();
  await expect(page.locator('.pointSeenBadge')).toHaveText(editedCategory);
  await expect(page.getByText('จำนวน 5')).toBeVisible();
  await expect(page.getByText('E2E edited pickup point')).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดรูปของบริจาคแบบเต็มจอ' })).toBeVisible();

  const editedDetail = await (await page.request.get(`/api/donations/${created.id}`)).json();
  expect(editedDetail.images).toHaveLength(1);
  expect(editedDetail.images[0].id).not.toBe(originalImageId);
  expect(editedDetail.latitude).toBeCloseTo(B.latitude, 6);
  expect(editedDetail.longitude).toBeCloseTo(B.longitude, 6);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: editedTitle })).toBeVisible();
  await expect(page.getByText('จำนวน 5')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ของหมดแล้ว' }).click();
  await expect(page.locator('.pointStatusBadge')).toHaveText('ของหมดแล้ว');
  await expect(page.getByRole('button', { name: 'ของหมดแล้ว' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'นำทางไปจุดนี้' })).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.pointStatusBadge')).toHaveText('ของหมดแล้ว');
  await expect(page.getByRole('link', { name: 'แก้ไขโพสต์' })).toBeVisible();

  const nearby = await page.request.get(
    `/api/donations/nearby?lat=${B.latitude}&lng=${B.longitude}&radius=5&category=${encodeURIComponent(editedCategory)}`,
  );
  expect(nearby.status()).toBe(200);
  expect((await nearby.json()).some((item) => item.id === created.id)).toBeFalsy();

  await page.goto('/');
  await page.goBack();
  await expect(page).toHaveURL(`/donations/${created.id}`);
  await expect(page.locator('.pointStatusBadge')).toHaveText('ของหมดแล้ว');
  await page.goForward();
  await expect(page).toHaveURL('/');

  await page.goto(`/donations/${created.id}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบโพสต์' }).click();
  await expect(page).toHaveURL('/');

  const deleted = await page.request.get(`/api/donations/${created.id}`);
  expect(deleted.status()).toBe(404);
  await page.goto(`/donations/${created.id}`);
  await expect(page.getByText('ไม่พบโพสต์บริจาค')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบโพสต์' })).toHaveCount(0);
});

test('non-owner sees safety/report actions but never owner management actions', async ({ page, context }) => {
  await registerUser(page, 'real-user-owner');
  const create = await page.request.post('/api/donations', {
    data: {
      title: `E2E ownership visibility ${Date.now()}`,
      description: 'Ownership visibility QA',
      category: 'E2E-OWNERSHIP',
      quantity: 1,
      latitude: A.latitude,
      longitude: A.longitude,
      address: 'Ownership QA point',
      startDate: '2026-10-03',
      endDate: '2026-10-05',
    },
  });
  expect(create.status()).toBe(201);
  const donation = await create.json();

  await context.clearCookies();
  await registerUser(page, 'real-user-viewer');

  await page.goto(`/donations/${donation.id}`);
  await expect(page.getByText('พบข้อมูลมีปัญหา?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'รายงานโพสต์' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'แก้ไขโพสต์' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ของหมดแล้ว' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลบโพสต์' })).toHaveCount(0);

  await page.goto(`/donations/${donation.id}/edit`);
  await expect(page.getByText('คุณไม่มีสิทธิ์แก้ไขโพสต์นี้')).toBeVisible();
  await expect(page.getByRole('link', { name: 'กลับไปหน้ารายละเอียด' }))
    .toHaveAttribute('href', `/donations/${donation.id}`);
});
