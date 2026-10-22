import { expect, test } from '@playwright/test';
import { e2eAdminPassword, e2eUserPassword } from './helpers/data';
import { watchPageDiagnostics } from './helpers/qa';

const DONATION_ID = 'e2e-diagnostic-donation';
const REPORT_ID = 'e2e-diagnostic-report';

const ACCOUNTS = {
  user: {
    email: 'e2e-diagnostic-owner@example.test',
    password: e2eUserPassword(),
  },
  admin: {
    email: 'e2e-diagnostic-admin@example.test',
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

function watchApiErrors(page) {
  const responses = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== 'http://localhost:3000') return;
    if (!url.pathname.startsWith('/api/')) return;
    if (response.status() < 400) return;

    responses.push({
      status: response.status(),
      method: response.request().method(),
      path: `${url.pathname}${url.search}`,
    });
  });
  return responses;
}

async function login(page, account, nextPath) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(nextPath);
}

async function assertInternalLinksReachable(page) {
  const hrefs = await page.locator('a[href]').evaluateAll((links) => (
    [...new Set(links
      .map((link) => link.getAttribute('href'))
      .filter((href) => href
        && href.startsWith('/')
        && !href.startsWith('//')
        && !href.startsWith('/api/')))]
  ));

  for (const href of hrefs) {
    const response = await page.request.get(href, { failOnStatusCode: false });
    expect(
      response.status(),
      `broken internal link ${href} from ${page.url()}`,
    ).toBeLessThan(400);
  }
}

function assertDiagnosticsClean(diagnostics, apiErrors, {
  allowApi = [],
  allowFailed = [],
  allowConsole = [],
} = {}) {
  const consoleErrors = diagnostics.consoleErrors.filter(
    (message) => !allowConsole.some((pattern) => pattern.test(message)),
  );
  const failedRequests = diagnostics.failedRequests.filter(
    (entry) => !/tile\.openstreetmap\.org/.test(entry.url)
      && !allowFailed.some((pattern) => pattern.test(entry.url)),
  );
  const unexpectedApi = apiErrors.filter(
    (entry) => !allowApi.some((predicate) => predicate(entry)),
  );

  expect(consoleErrors, 'unexpected console.error messages').toEqual([]);
  expect(diagnostics.pageErrors, 'uncaught page errors').toEqual([]);
  expect(failedRequests, 'unexpected failed network requests').toEqual([]);
  expect(unexpectedApi, 'unexpected API 4xx/5xx responses').toEqual([]);
}

async function installStableNavigationRoute(page) {
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
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 13.7291, longitude: 100.7789 });
  await installStableNavigationRoute(page);
});

test('public routes have clean console/network diagnostics and reachable links', async ({ page, context }) => {
  await context.clearCookies();

  for (const path of PUBLIC_ROUTES) {
    const diagnostics = watchPageDiagnostics(page);
    const apiErrors = watchApiErrors(page);

    await page.goto(path);
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForTimeout(180);
    await assertInternalLinksReachable(page);

    assertDiagnosticsClean(diagnostics, apiErrors, {
      allowApi: [
        (entry) => entry.status === 401 && entry.path === '/api/auth/me',
      ],
      allowConsole: [
        /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/,
      ],
    });
  }
});
test('USER routes have clean console/network diagnostics and reachable links', async ({ page }) => {
  await login(page, ACCOUNTS.user, '/donations/new');

  for (const path of USER_ROUTES) {
    const diagnostics = watchPageDiagnostics(page);
    const apiErrors = watchApiErrors(page);

    await page.goto(path);
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForTimeout(180);
    await assertInternalLinksReachable(page);

    assertDiagnosticsClean(diagnostics, apiErrors);
  }
});

test('ADMIN routes have clean console/network diagnostics and reachable links', async ({ page }) => {
  await login(page, ACCOUNTS.admin, '/admin');

  for (const path of ADMIN_ROUTES) {
    const diagnostics = watchPageDiagnostics(page);
    const apiErrors = watchApiErrors(page);

    await page.goto(path);
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForTimeout(180);
    await assertInternalLinksReachable(page);

    assertDiagnosticsClean(diagnostics, apiErrors);
  }
});

test('representative API failures render recoverable error states without crashing', async ({ page, context }) => {
  await context.clearCookies();

  let failNearby = true;
  await page.route('**/api/donations/nearby?*', async (route) => {
    if (failNearby) {
      failNearby = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'E2E_NEARBY_FAILURE',
          message: 'E2E forced nearby failure',
        }),
      });
      return;
    }
    await route.continue();
  });

  const diagnostics = watchPageDiagnostics(page);
  const apiErrors = watchApiErrors(page);

  await page.goto('/');
  await expect(page.getByText('E2E forced nearby failure')).toBeVisible();
  const locateButton = page.getByRole('button', { name: 'ตำแหน่งฉัน' });
  await expect(locateButton).toBeEnabled();
  await locateButton.click();
  await expect(page.locator('.mapSummary strong')).toBeVisible();
  expect(
    diagnostics.failedRequests.filter((entry) => !/tile\.openstreetmap\.org/.test(entry.url)),
  ).toEqual([]);
  expect(
    apiErrors.filter((entry) => !(
      entry.status === 401 && entry.path === '/api/auth/me'
    ) && !(
      entry.status === 500 && entry.path.startsWith('/api/donations/nearby?')
    )),
  ).toEqual([]);

  await context.clearCookies();
  await login(page, ACCOUNTS.admin, '/admin');

  await page.route('**/api/admin/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'E2E_ADMIN_FAILURE',
          message: 'E2E forced admin failure',
        }),
      });
      return;
    }
    await route.continue();
  });

  const adminDiagnostics = watchPageDiagnostics(page);
  const adminApiErrors = watchApiErrors(page);

  await page.goto('/admin/users');
  await expect(page.getByText('E2E forced admin failure')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ผู้ใช้' })).toBeVisible();

  expect(adminDiagnostics.pageErrors).toEqual([]);
  expect(
    adminDiagnostics.failedRequests.filter((entry) => !/tile\.openstreetmap\.org/.test(entry.url)),
  ).toEqual([]);
  expect(
    adminApiErrors.filter((entry) => !(
      entry.status === 503 && entry.path === '/api/admin/users'
    )),
  ).toEqual([]);
});
