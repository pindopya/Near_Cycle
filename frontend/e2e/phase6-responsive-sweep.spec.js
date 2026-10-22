import { expect, test } from '@playwright/test';
import { e2eAdminPassword, e2eUserPassword } from './helpers/data';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  expectNoUnexpectedHorizontalClipping,
} from './helpers/qa';

const DONATION_ID = 'e2e-responsive-donation';
const REPORT_ID = 'e2e-responsive-report';

const ACCOUNTS = {
  user: {
    email: 'e2e-responsive-owner@example.test',
    password: e2eUserPassword(),
  },
  admin: {
    email: 'e2e-responsive-admin@example.test',
    password: e2eAdminPassword(),
  },
};
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  `/donations/${DONATION_ID}`,
  `/donations/${DONATION_ID}/navigate`,
];

const USER_ROUTES = [
  '/donations/new',
  `/donations/${DONATION_ID}/edit`,
  `/donations/${DONATION_ID}/report`,
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/donations',
  `/admin/donations/${DONATION_ID}`,
  '/admin/reports',
  `/admin/reports/${REPORT_ID}`,
];

async function login(page, account, nextPath = '/') {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(nextPath);
}

async function checkCurrentViewport(page) {
  await expectNoHorizontalOverflow(page);
  await expectNoUnexpectedHorizontalClipping(page);
  await expectInteractiveCentersUnobscured(page);
}

async function checkMobileMenuIfPresent(page) {
  const openMenu = page.getByRole('button', { name: 'เปิดเมนู' });
  if (!(await openMenu.isVisible().catch(() => false))) return;

  await openMenu.click();
  const menu = page.locator('.navMobileMenu');
  const closeMenu = page.getByRole('button', { name: 'ปิดเมนู' });
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport();
  await closeMenu.click({ trial: true });
  const firstMenuLink = menu.getByRole('link').first();
  if (await firstMenuLink.count()) await firstMenuLink.click({ trial: true });
  await closeMenu.click();
  await expect(openMenu).toBeVisible();
  await checkCurrentViewport(page);
}

async function scrollAndSweep(page) {
  const metrics = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    scrollHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
    ),
  }));

  const maxY = Math.max(0, metrics.scrollHeight - metrics.viewportHeight);
  const step = Math.max(220, Math.floor(metrics.viewportHeight * 0.62));
  const positions = new Set([0, maxY]);

  for (let y = step; y < maxY; y += step) positions.add(y);

  for (const y of [...positions].sort((a, b) => a - b)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(60);
    await checkCurrentViewport(page);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function gotoAndSweep(page, path) {
  await page.goto(path);
  await page.locator('body').waitFor({ state: 'visible' });

  if (path.includes('/navigate')) {
    await expect(page.getByText('KMITL Responsive Test Point, Bangkok, Thailand')).toBeVisible();
  } else if (path.includes('/admin/donations/') && path !== '/admin/donations') {
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Responsive Donation' })).toBeVisible();
  } else if (path.includes('/admin/reports/') && path !== '/admin/reports') {
    await expect(page.getByRole('heading', { level: 1, name: 'ข้อมูลหลอกลวง' })).toBeVisible();
  }

  await page.waitForTimeout(120);
  await checkMobileMenuIfPresent(page);
  await scrollAndSweep(page);
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789 });

  await page.route('**/api/routes?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        distanceMeters: 1200,
        durationSeconds: 300,
        geometry: {
          type: 'LineString',
          coordinates: [
            [100.7789, 13.7291],
            [100.7789, 13.7291],
          ],
        },
        steps: [],
      }),
    });
  });
});

test('public canonical routes have no responsive overlap or clipping', async ({ page, context }) => {
  await context.clearCookies();

  for (const path of PUBLIC_ROUTES) {
    await gotoAndSweep(page, path);
  }
});

test('authenticated USER routes have no responsive overlap or clipping', async ({ page }) => {
  await login(page, ACCOUNTS.user, '/donations/new');

  for (const path of USER_ROUTES) {
    await gotoAndSweep(page, path);
  }

  await page.goto('/donations/new');
  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  await expect(page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' })).toBeVisible();
  await checkCurrentViewport(page);
  await page.getByRole('button', { name: 'กลับ' }).click();
  await expect(page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' })).toHaveCount(0);
});

test('ADMIN canonical routes have no responsive overlap or clipping', async ({ page }) => {
  await login(page, ACCOUNTS.admin, '/admin');

  for (const path of ADMIN_ROUTES) {
    await gotoAndSweep(page, path);
  }
});
