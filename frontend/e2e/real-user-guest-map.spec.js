import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

const POSITION = { latitude: 13.7291, longitude: 100.7789 };

async function createGuestMapData(page, context) {
  const owner = uniqueE2eIdentity('guest-map-owner');
  owner.password = e2eUserPassword();

  const register = await page.request.post('/api/auth/register', {
    data: owner,
  });
  expect(register.status()).toBe(201);

  const suffix = Date.now().toString(36);
  const primaryCategory = `E2E-GUEST-PRIMARY-${suffix}`;
  const secondaryCategory = `E2E-GUEST-SECONDARY-${suffix}`;

  const primaryResponse = await page.request.post('/api/donations', {
    data: activeDonationPayload({
      title: `E2E Guest Primary ${suffix}`,
      category: primaryCategory,
      quantity: 3,
      latitude: POSITION.latitude,
      longitude: POSITION.longitude,
      address: 'KMITL Guest Map Primary',
    }),
  });
  expect(primaryResponse.status()).toBe(201);
  const primary = await primaryResponse.json();

  const secondaryResponse = await page.request.post('/api/donations', {
    data: activeDonationPayload({
      title: `E2E Guest Secondary ${suffix}`,
      category: secondaryCategory,
      quantity: 2,
      latitude: POSITION.latitude + 0.001,
      longitude: POSITION.longitude + 0.001,
      address: 'KMITL Guest Map Secondary',
    }),
  });
  expect(secondaryResponse.status()).toBe(201);
  const secondary = await secondaryResponse.json();

  await context.clearCookies();

  return {
    primary,
    secondary,
    primaryCategory,
    secondaryCategory,
  };
}

async function gotoGuestMap(page, context) {
  await context.clearCookies();
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(POSITION);

  const nearby = page.waitForResponse((response) => (
    response.url().includes('/api/donations/nearby?')
    && response.request().method() === 'GET'
    && response.ok()
  ));

  await page.goto('/');
  const response = await nearby;
  const body = await response.json();

  await expect(page.locator('.mapSummary strong')).toHaveText(String(body.length));
  await expect(page.getByRole('button', { name: 'ตำแหน่งฉัน' })).toBeEnabled();

  return body;
}

async function waitForCategoryRequest(page, category) {
  return page.waitForResponse((response) => {
    if (!response.url().includes('/api/donations/nearby?')) return false;
    const url = new URL(response.url());
    return (url.searchParams.get('category') || '') === category;
  });
}

async function expectGuestNavigation(page) {
  const desktopNav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  const desktopLogin = desktopNav.getByRole('link', { name: 'เข้าสู่ระบบ' });

  if (await desktopLogin.isVisible().catch(() => false)) {
    await expect(desktopLogin).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
  await page.getByRole('button', { name: 'ปิดเมนู' }).click();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.dismiss());
});

test('guest can locate, filter, clear, zoom, open marker, view detail and return', async ({ page, context }) => {
  const fixture = await createGuestMapData(page, context);
  const initial = await gotoGuestMap(page, context);
  expect(initial.some((item) => item.id === fixture.primary.id)).toBeTruthy();
  expect(initial.some((item) => item.id === fixture.secondary.id)).toBeTruthy();

  await expectGuestNavigation(page);

  const category = page.getByRole('textbox', { name: 'กรองตามประเภทของบริจาค' });
  const filteredResponse = waitForCategoryRequest(page, fixture.primaryCategory);
  await category.fill(fixture.primaryCategory);
  const filtered = await (await filteredResponse).json();

  expect(filtered).toHaveLength(1);
  expect(filtered[0].id).toBe(fixture.primary.id);
  await expect(page.locator('.mapSummary strong')).toHaveText('1');
  await expect(page.locator('.mapAnimalMarker--donation')).toHaveCount(1);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();

  const canvas = page.locator('.leaflet-container');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, { steps: 6 });
    await page.mouse.up();
  }

  await page.locator('.mapAnimalMarker--donation').click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup.getByText(fixture.primary.title)).toBeVisible();
  await expect(popup.getByText(/3 ชิ้น/)).toBeVisible();

  await popup.getByRole('link', { name: /ดูรายละเอียด/ }).click();
  await expect(page).toHaveURL(new RegExp(`/donations/${fixture.primary.id}\\?returnTo=`));
  await expect(page.getByRole('heading', { level: 1, name: fixture.primary.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'รายงานโพสต์' }))
    .toHaveAttribute('href', `/login?next=/donations/${fixture.primary.id}/report`);

  await page.getByRole('link', { name: '← กลับแผนที่' }).click();
  await expect(page).toHaveURL('/');

  const restoredCategory = page.getByRole('textbox', { name: 'กรองตามประเภทของบริจาค' });
  await expect(restoredCategory).toBeVisible();
  await expect(restoredCategory).toHaveValue(fixture.primaryCategory);

  const clearResponse = waitForCategoryRequest(page, '');
  await page.getByRole('button', { name: 'ล้างตัวกรองประเภท' }).click();
  const cleared = await (await clearResponse).json();
  expect(cleared.some((item) => item.id === fixture.primary.id)).toBeTruthy();
  expect(cleared.some((item) => item.id === fixture.secondary.id)).toBeTruthy();
});

test('guest sees a useful location-denied state instead of misleading map results', async ({ page, context }) => {
  await context.clearCookies();
  await context.clearPermissions();

  await page.goto('/');

  await expect(page.locator('.mapStatus')).toContainText('ไม่สามารถอ่านตำแหน่งได้');
  await expect(page.getByRole('textbox', { name: 'กรองตามประเภทของบริจาค' })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'รัศมีค้นหา' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ตำแหน่งฉัน' })).toBeEnabled();
  await expect(page.locator('.mapSummary strong')).toHaveText('0');
});

test('failed filtered search clears stale markers and recovers on the next search', async ({ page, context }) => {
  const fixture = await createGuestMapData(page, context);
  await gotoGuestMap(page, context);
  const category = page.getByRole('textbox', { name: 'กรองตามประเภทของบริจาค' });

  const baselineResponse = waitForCategoryRequest(page, fixture.primaryCategory);
  await category.fill(fixture.primaryCategory);
  await baselineResponse;
  await expect(page.locator('.mapSummary strong')).toHaveText('1');
  await expect(page.locator('.mapAnimalMarker--donation')).toHaveCount(1);

  await page.route('**/api/donations/nearby?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('category') === fixture.secondaryCategory) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'โหลดจุดบริจาคชั่วคราวไม่สำเร็จ' }),
      });
      return;
    }
    await route.continue();
  });

  const failed = waitForCategoryRequest(page, fixture.secondaryCategory);
  await category.fill(fixture.secondaryCategory);
  const failedResponse = await failed;
  expect(failedResponse.status()).toBe(503);

  await expect(page.locator('.mapStatus')).toContainText('โหลดจุดบริจาคชั่วคราวไม่สำเร็จ');
  await expect(page.locator('.mapSummary strong')).toHaveText('0');
  await expect(page.locator('.mapAnimalMarker--donation')).toHaveCount(0);

  const recoveredResponse = waitForCategoryRequest(page, fixture.primaryCategory);
  await category.fill(fixture.primaryCategory);
  const recovered = await (await recoveredResponse).json();
  expect(recovered).toHaveLength(1);
  expect(recovered[0].id).toBe(fixture.primary.id);
  await expect(page.locator('.mapStatus')).toHaveCount(0);
  await expect(page.locator('.mapSummary strong')).toHaveText('1');
  await expect(page.locator('.mapAnimalMarker--donation')).toHaveCount(1);
});
