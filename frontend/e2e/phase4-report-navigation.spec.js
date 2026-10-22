import { expect, test } from '@playwright/test';
import { activeDonationPayload, uniqueE2eIdentity } from './helpers/data';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  watchPageDiagnostics,
} from './helpers/qa';

async function registerViaApi(page, identity = uniqueE2eIdentity('phase4')) {
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

async function loginViaUi(page, identity, nextPath) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.locator('input[type="email"]').fill(identity.email);
  await page.locator('input[type="password"]').fill(identity.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(nextPath);
}

async function createDonationViaApi(page, overrides = {}) {
  const response = await page.request.post('/api/donations', {
    data: activeDonationPayload(overrides),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

function fakeRoute(donation) {
  return {
    distanceMeters: 1450,
    durationSeconds: 360,
    geometry: {
      type: 'LineString',
      coordinates: [
        [100.7789, 13.7291],
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

test('report flow redirects guests, validates input and submits successfully', async ({ page, context }) => {
  const identity = await registerViaApi(page, uniqueE2eIdentity('report'));
  const donation = await createDonationViaApi(page, {
    title: `E2E Report Target ${Date.now()}`,
    category: 'E2E-REPORT',
  });

  await context.clearCookies();

  await page.goto(`/donations/${donation.id}/report`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=.*donations.*${donation.id}.*report`));

  await loginViaUi(page, identity, `/donations/${donation.id}/report`);
  await expect(page.getByRole('heading', { name: 'รายงานโพสต์' })).toBeVisible();

  await page.getByRole('button', { name: 'ส่งรายงาน' }).click();
  await expect(page.locator('.reportPortCard .errorBox')).toHaveText('กรุณาเลือกเหตุผลที่ต้องการรายงาน');

  await page.getByRole('radio', { name: 'ข้อมูลหลอกลวง' }).check();
  const description = `E2E report detail ${Date.now()}`;
  await page.getByLabel('รายละเอียดเพิ่มเติม').fill(description);
  await expect(page.getByText(`${description.length}/1000`)).toBeVisible();

  await page.getByRole('link', { name: '← กลับรายละเอียด' }).click({ trial: true });
  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);

  await page.getByRole('button', { name: 'ส่งรายงาน' }).click();
  await expect(page).toHaveURL(`/donations/${donation.id}?reported=1`);
  await expect(page.getByText('ส่งรายงานให้ Admin ตรวจสอบแล้ว')).toBeVisible();

  const reportsResponse = await page.request.get('/api/admin/reports');
  expect([200, 403]).toContain(reportsResponse.status());
});

test('navigation handles GPS denial, route recovery, active controls and unavailable donations', async ({ page, context }) => {
  await registerViaApi(page, uniqueE2eIdentity('navigation'));
  const donation = await createDonationViaApi(page, {
    title: `E2E Navigation ${Date.now()}`,
    category: 'E2E-NAV',
    latitude: 13.7360,
    longitude: 100.7900,
  });
  const unavailable = await createDonationViaApi(page, {
    title: `E2E Navigation Unavailable ${Date.now()}`,
    category: 'E2E-NAV',
    latitude: 13.7370,
    longitude: 100.7920,
  });

  const outOfStockResponse = await page.request.patch(`/api/donations/${unavailable.id}/out-of-stock`);
  expect(outOfStockResponse.status()).toBe(200);

  await context.clearCookies();

  let routeMode = 'timeout';
  await page.route('**/api/routes?*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    if (routeMode === 'timeout') {
      await route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ROUTING_TIMEOUT',
          message: 'E2E routing timeout',
        }),
      });
      return;
    }

    if (routeMode === 'unavailable') {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ROUTING_UNAVAILABLE',
          message: 'E2E routing unavailable',
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

  const diagnostics = watchPageDiagnostics(page);

  await context.clearPermissions();
  await page.goto(`/donations/${donation.id}/navigate`);
  await expect(page.getByRole('status').filter({ hasText: 'กรุณาอนุญาต Location เพื่อใช้งานการนำทาง' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลองตำแหน่งอีกครั้ง' })).toBeVisible();

  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789 });

  await page.getByRole('button', { name: 'ลองตำแหน่งอีกครั้ง' }).click();
  await expect(page.getByText('บริการคำนวณเส้นทางตอบสนองช้าเกินไป กรุณาลองอีกครั้ง')).toBeVisible();

  routeMode = 'success';
  await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เริ่มนำทาง' })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);

  await page.getByRole('button', { name: 'ย่อแผงข้อมูล' }).click();
  await expect(page.getByRole('button', { name: 'ขยายแผงข้อมูล' })).toBeVisible();
  await page.getByRole('button', { name: 'ขยายแผงข้อมูล' }).click();

  await page.getByRole('button', { name: 'กลับไปตำแหน่งปัจจุบัน' }).click();
  await page.getByRole('button', { name: 'เริ่มนำทาง' }).click();
  await expect(page.getByRole('button', { name: 'สิ้นสุดการนำทาง' })).toBeVisible();
  await page.getByRole('button', { name: 'สิ้นสุดการนำทาง' }).click();
  await expect(page.getByRole('button', { name: 'เริ่มนำทาง' })).toBeVisible();

  routeMode = 'unavailable';
  await page.reload();
  await expect(page.getByText('บริการคำนวณเส้นทางไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้ง')).toBeVisible();

  routeMode = 'success';
  await page.goto(`/donations/${unavailable.id}/navigate`);
  await expect(page.getByRole('status').filter({ hasText: 'จุดบริจาคนี้ไม่อยู่ในช่วงที่สามารถนำทางได้' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ไม่สามารถนำทางได้' })).toBeDisabled();

  await expectNoHorizontalOverflow(page);

  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.failedRequests.filter((entry) => !/tile\.openstreetmap\.org/.test(entry.url)),
  ).toEqual([]);
});
