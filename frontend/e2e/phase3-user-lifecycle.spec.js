import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  watchPageDiagnostics,
} from './helpers/qa';
import { activeDonationPayload, uniqueE2eIdentity } from './helpers/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, 'fixtures', 'test-donation.png');

function bangkokDateOffset(days = 0) {
  const bangkokNow = new Date(Date.now() + (7 * 60 * 60 * 1000) + (days * 24 * 60 * 60 * 1000));
  return bangkokNow.toISOString().slice(0, 10);
}

async function registerViaApi(page, identity = uniqueE2eIdentity('user')) {
  const response = await page.request.post('/api/auth/register', {
    data: {
      name: identity.name,
      email: identity.email,
      password: identity.password,
    },
  });
  expect(response.status()).toBe(201);
  return identity;
}

async function createDonationViaApi(page, overrides = {}) {
  const response = await page.request.post('/api/donations', {
    data: activeDonationPayload(overrides),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function setCreateFormFields(page, {
  title,
  category,
  quantity = '2',
  description = 'E2E lifecycle description',
  address = 'KMITL E2E Lifecycle Point',
} = {}) {
  await page.locator('input[placeholder="เช่น อาคาร A หน้าประตูทางเข้า"]').fill(address);
  await page.locator('input[placeholder="เช่น เสื้อผ้าสภาพดี"]').fill(title);
  await page.locator('input[placeholder="เช่น เสื้อผ้า"]').fill(category);
  await page.locator('input[type="number"]').fill(quantity);
  await page.locator('textarea').fill(description);
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill(bangkokDateOffset(0));
  await dates.nth(1).fill(bangkokDateOffset(3));
}

async function selectCurrentLocation(page, context) {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789 });
  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  await expect(page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' })).toBeVisible();
  await page.getByRole('button', { name: 'ยืนยันตำแหน่งนี้' }).click();
  await expect(page.getByText('เลือกตำแหน่งแล้ว')).toBeVisible();
}

test('USER completes donation create, image, edit, out-of-stock and delete lifecycle', async ({ page, context }) => {
  const identity = await registerViaApi(page, uniqueE2eIdentity('lifecycle'));
  expect(identity.email).toContain('@example.test');

  const title = `E2E Lifecycle ${Date.now()}`;
  const editedTitle = `${title} Edited`;
  const diagnostics = watchPageDiagnostics(page);

  await page.goto('/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toBeVisible();

  await setCreateFormFields(page, {
    title,
    category: 'E2E-LIFECYCLE',
  });
  await selectCurrentLocation(page, context);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(TEST_IMAGE);
  await expect(page.getByText('1 / 5 รูป')).toBeVisible();
  await expect(page.getByText('รูปใหม่')).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);

  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();
  await expect(page).toHaveURL(/\/donations\/[^/]+$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดรูปของบริจาคแบบเต็มจอ' })).toBeVisible();

  const detailUrl = new URL(page.url());
  const donationId = detailUrl.pathname.split('/').pop();

  await page.getByRole('button', { name: 'เปิดรูปของบริจาคแบบเต็มจอ' }).click();
  await expect(page.getByRole('dialog', { name: 'รูปของบริจาคแบบเต็มจอ' })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดรูป', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'รูปของบริจาคแบบเต็มจอ' })).toHaveCount(0);

  await page.getByRole('link', { name: 'แก้ไขโพสต์' }).click();
  await expect(page).toHaveURL(`/donations/${donationId}/edit`);
  await expect(page.getByRole('heading', { name: 'แก้ไขของบริจาค' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบรูป' }).click();
  await expect(page.getByText('0 / 5 รูป')).toBeVisible();

  const titleInput = page.locator('input[placeholder="เช่น เสื้อผ้าสภาพดี"]');
  await titleInput.fill(editedTitle);
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();

  await expect(page).toHaveURL(`/donations/${donationId}`);
  await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible();
  await expect(page.getByText('ไม่มีรูปภาพ')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ของหมดแล้ว' }).click();
  await expect(page.getByText('ของหมดแล้ว', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'นำทางไปจุดนี้' })).toHaveCount(0);

  const stateResponse = await page.request.get(`/api/donations/${donationId}`);
  expect(stateResponse.status()).toBe(200);
  expect((await stateResponse.json()).status).toBe('OUT_OF_STOCK');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบโพสต์' }).click();
  await expect(page).toHaveURL('/');

  const deletedResponse = await page.request.get(`/api/donations/${donationId}`);
  expect(deletedResponse.status()).toBe(404);

  expect(diagnostics.pageErrors).toEqual([]);
});

test('create validation and non-owner edit protection are usable', async ({ page, context }) => {
  await registerViaApi(page, uniqueE2eIdentity('validation-owner'));

  await page.goto('/donations/new');
  await setCreateFormFields(page, {
    title: `E2E Validation ${Date.now()}`,
    category: 'E2E-VALIDATION',
  });

  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();
  await expect(page.getByText('กรุณาเลือกตำแหน่งจุดรับของ')).toBeVisible();

  await selectCurrentLocation(page, context);

  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill(bangkokDateOffset(3));
  await dates.nth(1).fill(bangkokDateOffset(1));
  expect(await dates.nth(1).evaluate((element) => element.validity.rangeUnderflow)).toBe(true);
  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();
  await expect(page).toHaveURL('/donations/new');
  await dates.nth(0).fill(bangkokDateOffset(0));
  await dates.nth(1).fill(bangkokDateOffset(3));

  const ownedDonation = await createDonationViaApi(page, {
    title: `E2E Non Owner ${Date.now()}`,
    category: 'E2E-OWNER',
  });

  await context.clearCookies();
  await registerViaApi(page, uniqueE2eIdentity('non-owner'));

  await page.goto(`/donations/${ownedDonation.id}`);
  await expect(page.getByRole('link', { name: 'แก้ไขโพสต์' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลบโพสต์' })).toHaveCount(0);

  await page.goto(`/donations/${ownedDonation.id}/edit`);
  await expect(page.getByText('คุณไม่มีสิทธิ์แก้ไขโพสต์นี้')).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
});

test('image upload failure keeps the created Donation and retry does not duplicate it', async ({ page, context }) => {
  await registerViaApi(page, uniqueE2eIdentity('partial'));
  const title = `E2E Partial Upload ${Date.now()}`;

  let failOnce = true;
  await page.route('**/api/donations/*/images', async (route) => {
    if (failOnce && route.request().method() === 'POST') {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'E2E_UPLOAD_FAILURE', message: 'E2E forced upload failure' }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/donations/new');
  await setCreateFormFields(page, {
    title,
    category: 'E2E-PARTIAL',
  });
  await selectCurrentLocation(page, context);
  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();

  await expect(page.getByRole('heading', { name: 'อัปโหลดรูปยังไม่สำเร็จ' })).toBeVisible();
  await expect(page.getByText('E2E forced upload failure')).toBeVisible();

  const created = await page.request.get('/api/donations');
  expect(created.status()).toBe(200);
  const matchingBefore = (await created.json()).filter((donation) => donation.title === title);
  expect(matchingBefore).toHaveLength(1);

  await page.getByRole('button', { name: 'ลองอัปโหลดรูปอีกครั้ง' }).click();
  await expect(page).toHaveURL(/\/donations\/[^/]+$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดรูปของบริจาคแบบเต็มจอ' })).toBeVisible();

  const after = await page.request.get('/api/donations');
  const matchingAfter = (await after.json()).filter((donation) => donation.title === title);
  expect(matchingAfter).toHaveLength(1);
});
