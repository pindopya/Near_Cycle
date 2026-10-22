import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

async function registerIdentity(page, prefix) {
  const identity = uniqueE2eIdentity(prefix);
  identity.password = e2eUserPassword();
  const response = await page.request.post('/api/auth/register', { data: identity });
  expect(response.status()).toBe(201);
  return identity;
}

async function loginViaUi(page, identity, nextPath = '/') {
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

async function expectAuthenticatedHeader(page) {
  const desktopNav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  if (await desktopNav.isVisible().catch(() => false)) {
    await expect(desktopNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toBeVisible();
    await expect(desktopNav.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);
  await page.getByRole('button', { name: 'ปิดเมนู' }).click();
}

async function expectGuestHeader(page) {
  const desktopNav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  if (await desktopNav.isVisible().catch(() => false)) {
    await expect(desktopNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
    await expect(desktopNav.getByRole('button', { name: 'ออกจากระบบ' })).toHaveCount(0);
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
  await expect(mobileNav.getByRole('button', { name: 'ออกจากระบบ' })).toHaveCount(0);
  await page.getByRole('button', { name: 'ปิดเมนู' }).click();
}

async function clickLogout(page) {
  const desktopLogout = page.getByRole('navigation', { name: 'เมนูหลัก' })
    .getByRole('button', { name: 'ออกจากระบบ' });
  if (await desktopLogout.isVisible().catch(() => false)) {
    await desktopLogout.click();
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await page.getByRole('navigation', { name: 'เมนูมือถือ' })
    .getByRole('button', { name: 'ออกจากระบบ' }).click();
}

test('same-session tabs stay synchronized when login and logout change the shared session', async ({ page, context }) => {
  const identity = await registerIdentity(page, 'browser-tabs');
  await context.clearCookies();

  await loginViaUi(page, identity);
  await expectAuthenticatedHeader(page);

  const second = await context.newPage();
  await second.goto('/');
  await expectAuthenticatedHeader(second);

  await clickLogout(page);
  await expect(page).toHaveURL('/');
  await expectGuestHeader(page);

  await expectGuestHeader(second);

  await loginViaUi(page, identity);
  await expectAuthenticatedHeader(page);
  await expectAuthenticatedHeader(second);

  await clickLogout(page);
  await expectGuestHeader(page);
  await expectGuestHeader(second);

  await second.close();
});

test('logout does not let browser Back restore a protected donation form', async ({ page, context }) => {
  const identity = await registerIdentity(page, 'browser-history');
  await context.clearCookies();

  await loginViaUi(page, identity, '/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toBeVisible();

  await clickLogout(page);
  await expect(page).toHaveURL('/');
  await expectGuestHeader(page);

  await page.goBack();
  await expect(page).not.toHaveURL('/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toHaveCount(0);
});

test('browser Back revalidates donation state after backend truth changes', async ({ page, context }) => {
  const identity = await registerIdentity(page, 'browser-resource');
  const create = await page.request.post('/api/donations', {
    data: activeDonationPayload({
      title: `E2E browser resource ${Date.now()}`,
      category: 'E2E-BROWSER-STATE',
      quantity: 2,
    }),
  });
  expect(create.status()).toBe(201);
  const donation = await create.json();

  await page.goto(`/donations/${donation.id}`);
  await expect(page.getByRole('link', { name: 'นำทางไปจุดนี้' })).toBeVisible();

  await page.goto('/');
  const outOfStock = await page.request.patch(`/api/donations/${donation.id}/out-of-stock`);
  expect(outOfStock.status()).toBe(200);

  await page.goBack();
  await expect(page).toHaveURL(`/donations/${donation.id}`);
  await expect(page.locator('.pointStatusBadge')).toHaveText('ของหมดแล้ว');
  await expect(page.getByRole('link', { name: 'นำทางไปจุดนี้' })).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.pointStatusBadge')).toHaveText('ของหมดแล้ว');

  await context.clearCookies();
});
