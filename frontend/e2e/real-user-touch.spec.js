import { expect, test } from '@playwright/test';
import { e2eAdminPassword, e2eUserPassword } from './helpers/data';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  expectNoUnexpectedHorizontalClipping,
} from './helpers/qa';

const OWNER = {
  email: 'e2e-responsive-owner@example.test',
  password: e2eUserPassword(),
};

const ADMIN = {
  email: 'e2e-responsive-admin@example.test',
  password: e2eAdminPassword(),
};

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=',
  'base64',
);

async function login(page, account, nextPath) {
  const authReady = page.waitForResponse((response) => (
    response.url().includes('/api/auth/me')
    && response.request().method() === 'GET'
  ));
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await authReady;
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(nextPath);
}

async function expectTouchTargets(page, selector, minSize = 40) {
  const issues = await page.locator(selector).evaluateAll((elements, minimum) => elements
    .filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if ('disabled' in element && element.disabled) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.top < window.innerHeight;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label')
          || element.textContent?.trim().replace(/\s+/g, ' ')
          || element.className,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter((item) => item.width < minimum || item.height < minimum), minSize);

  expect(
    issues,
    `touch targets smaller than ${minSize}px: ${JSON.stringify(issues, null, 2)}`,
  ).toEqual([]);
}

async function sweepViewport(page) {
  await expectNoHorizontalOverflow(page);
  await expectNoUnexpectedHorizontalClipping(page);
  await expectInteractiveCentersUnobscured(page);
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789, accuracy: 18 });

  await page.route('**/api/routes?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        distanceMeters: 1000,
        durationSeconds: 240,
        geometry: {
          type: 'LineString',
          coordinates: [[100.7789, 13.7291], [100.7789, 13.7291]],
        },
        steps: [],
      }),
    });
  });
});

test('map and hamburger controls remain reachable with touch-sized targets', async ({ page, context }) => {
  await context.clearCookies();
  const nearby = page.waitForResponse((response) => response.url().includes('/api/donations/nearby?'));
  await page.goto('/');
  await nearby;

  await sweepViewport(page);
  await expectTouchTargets(page, '.navMenuButton, .mapLocateButton, .leaflet-control-zoom a');

  const menuButton = page.getByRole('button', { name: 'เปิดเมนู' });
  await menuButton.click();
  await expect(page.getByRole('navigation', { name: 'เมนูมือถือ' })).toBeVisible();
  await expectTouchTargets(page, '.navMobileItem');

  await page.getByRole('button', { name: 'ปิดเมนู' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await sweepViewport(page);
});

test('donation form image and location-picker controls are touch friendly', async ({ page }) => {
  await login(page, OWNER, '/donations/new');
  await sweepViewport(page);
  await expectTouchTargets(page, '.locationActionGrid .button, .formActions .button');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'touch.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await expect(page.getByRole('button', { name: 'ลบรูป' })).toBeVisible();
  await expectTouchTargets(page, '.donationImageRemove');

  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  const dialog = page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' });
  await expect(dialog).toBeVisible();

  await expectTouchTargets(
    page,
    '.locationPickerBack, .locationPickerGps, .locationPickerFooter .button, .pickerMap .leaflet-control-zoom a',
  );
  await sweepViewport(page);

  await dialog.getByRole('button', { name: 'ยืนยันตำแหน่งนี้' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('เลือกตำแหน่งแล้ว')).toBeVisible();
});

test('admin touch navigation and moderation controls remain reachable while scrolling', async ({ page }) => {
  await login(page, ADMIN, '/admin/users');

  await expectTouchTargets(page, '.profileMiniNavItem, .adminPortListRow .button, .navMenuButton');
  await sweepViewport(page);

  const firstAction = page.locator('.adminPortListRow .button').first();
  await firstAction.scrollIntoViewIfNeeded();
  await expect(firstAction).toBeInViewport();
  await firstAction.click({ trial: true });

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' })
    .getByRole('link', { name: 'ของบริจาค' }).click();
  await expect(page).toHaveURL('/admin/donations');
  await expectTouchTargets(page, '.profileMiniNavItem, .adminPortRowActions .button');
  await sweepViewport(page);

  const menuButton = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await menuButton.isVisible().catch(() => false)) {
    await menuButton.click();
    await expectTouchTargets(page, '.navMobileItem');
    await page.getByRole('button', { name: 'ปิดเมนู' }).click();
  }
});
