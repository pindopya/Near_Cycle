import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

const GPS = { latitude: 13.7291, longitude: 100.7789, accuracy: 18 };

async function registerIdentity(page, prefix) {
  const identity = uniqueE2eIdentity(prefix);
  identity.password = e2eUserPassword();
  const response = await page.request.post('/api/auth/register', { data: identity });
  expect(response.status()).toBe(201);
  return identity;
}

async function createDonation(page, overrides = {}) {
  const response = await page.request.post('/api/donations', {
    data: activeDonationPayload(overrides),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function loginViaUi(page, identity, nextPath) {
  const authReady = page.waitForResponse((response) => (
    response.url().includes('/api/auth/me')
    && response.request().method() === 'GET'
  ));
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await authReady;

  await page.locator('input[type="email"]').fill(identity.email);
  await page.locator('input[type="password"]').fill(identity.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(nextPath);
}

function fakeRoute(donation) {
  return {
    distanceMeters: 1450,
    durationSeconds: 360,
    geometry: {
      type: 'LineString',
      coordinates: [
        [GPS.longitude, GPS.latitude],
        [100.7835, 13.7320],
        [donation.longitude, donation.latitude],
      ],
    },
    steps: [
      {
        distanceMeters: 700,
        durationSeconds: 160,
        name: 'E2E Road',
        instruction: 'turn',
        modifier: 'right',
        location: [100.7835, 13.7320],
      },
      {
        distanceMeters: 750,
        durationSeconds: 200,
        name: '',
        instruction: 'arrive',
        modifier: null,
        location: [donation.longitude, donation.latitude],
      },
    ],
  };
}

test('report success is visible once and does not become stale after refresh', async ({ page, context }) => {
  await registerIdentity(page, 'report-owner');
  const donation = await createDonation(page, {
    title: `E2E report stale state ${Date.now()}`,
    category: 'E2E-REPORT-REAL',
  });

  await context.clearCookies();
  const reporter = await registerIdentity(page, 'reporter');
  await context.clearCookies();

  await page.goto(`/donations/${donation.id}`);
  const reportLink = page.getByRole('link', { name: 'รายงานโพสต์' });
  await expect(reportLink).toHaveAttribute('href', `/login?next=/donations/${donation.id}/report`);
  await reportLink.click();

  await expect(page).toHaveURL(new RegExp(`/login\\?next=.*${donation.id}.*report`));
  await loginViaUi(page, reporter, `/donations/${donation.id}/report`);

  await page.getByRole('radio', { name: 'ข้อมูลหลอกลวง' }).check();
  await page.getByLabel('รายละเอียดเพิ่มเติม').fill('Real-user report success-state QA');
  await page.getByRole('button', { name: 'ส่งรายงาน' }).click();

  await expect(page).toHaveURL(`/donations/${donation.id}`);
  await expect(page.getByText('ส่งรายงานให้ Admin ตรวจสอบแล้ว')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: donation.title })).toBeVisible();
  await expect(page.getByText('ส่งรายงานให้ Admin ตรวจสอบแล้ว')).toHaveCount(0);

  await page.getByRole('link', { name: '← กลับแผนที่' }).click();
  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).toHaveURL(`/donations/${donation.id}`);
  await expect(page.getByText('ส่งรายงานให้ Admin ตรวจสอบแล้ว')).toHaveCount(0);
});

test('navigation recovery removes stale route errors and keeps controls coherent', async ({ page, context }) => {
  await registerIdentity(page, 'navigation-owner');
  const donation = await createDonation(page, {
    title: `E2E navigation recovery ${Date.now()}`,
    category: 'E2E-NAV-REAL',
    latitude: 13.7360,
    longitude: 100.7900,
  });

  await context.clearCookies();
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(GPS);

  let routeMode = 'timeout';
  await page.route('**/api/routes?*', async (route) => {
    if (routeMode === 'timeout') {
      await route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ROUTING_TIMEOUT',
          message: 'E2E route timeout',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeRoute(donation)),
    });
  });

  await page.goto(`/donations/${donation.id}/navigate`);
  const routeError = page.getByText('บริการคำนวณเส้นทางตอบสนองช้าเกินไป กรุณาลองอีกครั้ง');
  await expect(routeError).toBeVisible();

  routeMode = 'success';
  await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เริ่มนำทาง' })).toBeVisible();
  await expect(routeError).toHaveCount(0);

  await page.getByRole('button', { name: 'เริ่มนำทาง' }).click();
  await expect(page.getByRole('button', { name: 'สิ้นสุดการนำทาง' })).toBeVisible();
  await page.getByRole('button', { name: 'กลับไปตำแหน่งปัจจุบัน' }).click();

  await page.getByRole('button', { name: 'สิ้นสุดการนำทาง' }).click();
  await expect(page.getByRole('button', { name: 'เริ่มนำทาง' })).toBeVisible();

  await page.getByRole('link', { name: 'กลับหน้ารายละเอียด' }).click();
  await expect(page).toHaveURL(`/donations/${donation.id}`);
  await expect(page.getByRole('heading', { level: 1, name: donation.title })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`/donations/${donation.id}/navigate`);
  await expect(page.getByText('บริการคำนวณเส้นทางตอบสนองช้าเกินไป กรุณาลองอีกครั้ง')).toHaveCount(0);
});

test('unavailable donation never exposes an active navigation path', async ({ page, context }) => {
  await registerIdentity(page, 'navigation-unavailable-owner');
  const donation = await createDonation(page, {
    title: `E2E unavailable navigation ${Date.now()}`,
    category: 'E2E-NAV-UNAVAILABLE',
    latitude: 13.7370,
    longitude: 100.7920,
  });

  const outOfStock = await page.request.patch(`/api/donations/${donation.id}/out-of-stock`);
  expect(outOfStock.status()).toBe(200);

  await context.clearCookies();
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(GPS);

  let routeRequests = 0;
  await page.route('**/api/routes?*', async (route) => {
    routeRequests += 1;
    await route.continue();
  });

  await page.goto(`/donations/${donation.id}/navigate`);
  await expect(page.getByRole('status').filter({ hasText: 'จุดบริจาคนี้ไม่อยู่ในช่วงที่สามารถนำทางได้' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ไม่สามารถนำทางได้' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'เริ่มนำทาง' })).toHaveCount(0);

  await page.waitForTimeout(400);
  expect(routeRequests).toBe(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'ไม่สามารถนำทางได้' })).toBeDisabled();
  expect(routeRequests).toBe(0);
});
