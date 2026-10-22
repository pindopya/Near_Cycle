import { expect, test } from '@playwright/test';
import { activeDonationPayload, uniqueE2eIdentity } from './helpers/data';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  watchPageDiagnostics,
} from './helpers/qa';

const TILE_HOST = /tile\.openstreetmap\.org/;

async function registerViaApi(page, identity = uniqueE2eIdentity('api')) {
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

async function fillRegisterForm(page, identity, confirm = identity.password) {
  const inputs = page.locator('.authCard input');
  await inputs.nth(0).fill(identity.name);
  await inputs.nth(1).fill(identity.email);
  await inputs.nth(2).fill(identity.password);
  await inputs.nth(3).fill(confirm);
}

async function fillLoginForm(page, email, password) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
}

test('register creates a session and leaves the auth screen', async ({ page }) => {
  const identity = uniqueE2eIdentity('register');
  const diagnostics = watchPageDiagnostics(page);

  await page.goto('/register');
  await fillRegisterForm(page, identity);
  await page.getByRole('button', { name: 'สร้างบัญชี' }).click();

  await expect(page).toHaveURL('/');
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('register mismatch and invalid login show usable errors', async ({ page }) => {
  const identity = uniqueE2eIdentity('validation');

  await page.goto('/register');
  await fillRegisterForm(page, identity, 'DifferentPass123!');
  await page.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(page.getByText('รหัสผ่านยืนยันไม่ตรงกัน')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL('/login');

  await fillLoginForm(page, identity.email, identity.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง')).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
});

test('login respects a protected next redirect', async ({ page, context }) => {
  const identity = await registerViaApi(page, uniqueE2eIdentity('next'));
  await context.clearCookies();

  await page.goto('/login?next=/donations/new');
  await fillLoginForm(page, identity.email, identity.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

  await expect(page).toHaveURL('/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
});

test('guest map filters and opens a public donation detail', async ({ page, context }) => {
  const identity = await registerViaApi(page, uniqueE2eIdentity('map-owner'));
  const categoryValue = `E2E-MAP-${Date.now()}`;
  const donation = await createDonationViaApi(page, {
    title: `E2E Map Donation ${Date.now()}`,
    category: categoryValue,
  });
  await context.clearCookies();

  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789 });

  const diagnostics = watchPageDiagnostics(page);
  const nearbyResponse = page.waitForResponse((response) => (
    response.url().includes('/api/donations/nearby')
    && response.request().method() === 'GET'
  ));

  await page.goto('/');
  await nearbyResponse;
  await expect(page.locator('.mapSummary strong')).not.toHaveText('0');

  const category = page.getByLabel('กรองตามประเภทของบริจาค');
  const filtered = page.waitForResponse((response) => (
    response.url().includes(`category=${encodeURIComponent(categoryValue)}`)
  ));
  await category.fill(categoryValue);
  await filtered;
  await expect(page.locator('.mapSummary strong')).toHaveText('1');

  await page.getByLabel('ล้างตัวกรองประเภท').click();
  await expect(category).toHaveValue('');

  const radius = page.getByRole('slider', { name: 'รัศมีค้นหา' });
  await radius.fill('70');
  await expect(page.locator('.radiusFilterValue')).not.toHaveText('5 กม.');

  const refiltered = page.waitForResponse((response) => (
    response.url().includes(`category=${encodeURIComponent(categoryValue)}`)
  ));
  await category.fill(categoryValue);
  await refiltered;
  const targetMarker = page.locator('.mapAnimalMarker--donation');
  await expect(targetMarker).toHaveCount(1);
  await targetMarker.click();
  await expect(page.getByText(donation.title)).toBeVisible();
  await page.getByRole('link', { name: /ดูรายละเอียด/ }).click();

  await expect(page).toHaveURL(`/donations/${donation.id}`);
  await expect(page.getByRole('heading', { name: donation.title })).toBeVisible();
  const reportLink = page.getByRole('link', { name: 'รายงานโพสต์' });
  await expect(reportLink).toHaveAttribute('href', `/login?next=/donations/${donation.id}/report`);

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.failedRequests.filter((entry) => !TILE_HOST.test(entry.url)),
  ).toEqual([]);

  expect(identity.email).toContain('@example.test');
});

test('denied geolocation leaves the public map usable', async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto('/');

  await expect(page.getByText('ไม่สามารถอ่านตำแหน่งได้ กรุณาอนุญาต Location แล้วลองอีกครั้ง')).toBeVisible();
  await expect(page.getByLabel('กรองตามประเภทของบริจาค')).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'รัศมีค้นหา' })).toBeDisabled();

  const mobileMenu = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    await expect(page.getByRole('navigation', { name: 'เมนูมือถือ' })).toBeVisible();
    await page.getByRole('button', { name: 'ปิดเมนู' }).click();
    await expect(page.getByRole('navigation', { name: 'เมนูมือถือ' })).toHaveCount(0);
  }

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
});