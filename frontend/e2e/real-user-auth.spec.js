import { expect, test } from '@playwright/test';

function identity(prefix) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `Real User ${suffix}`,
    email: `e2e-${prefix}-${suffix}@example.test`,
    password: process.env.E2E_USER_PASSWORD,
  };
}

async function gotoAfterAuthBootstrap(page, path) {
  const authReady = page.waitForResponse((response) => (
    response.url().includes('/api/auth/me')
    && response.request().method() === 'GET'
  ));
  await page.goto(path);
  await authReady;
}

async function registerThroughUi(page, user) {
  await gotoAfterAuthBootstrap(page, '/register');
  const inputs = page.locator('.authCard input');
  await inputs.nth(0).fill(user.name);
  await inputs.nth(1).fill(user.email);
  await inputs.nth(2).fill(user.password);
  await inputs.nth(3).fill(user.password);
  await page.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await expect(page).toHaveURL('/');
}

async function loginThroughUi(page, user, next = '/') {
  await gotoAfterAuthBootstrap(page, `/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(next);
}

async function expectAuthenticatedHeader(page) {
  const desktopNav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  if (await desktopNav.isVisible().catch(() => false)) {
    await expect(desktopNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);
    await expect(desktopNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toBeVisible();
    await expect(desktopNav.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);
  await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
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

async function clickNavLink(page, name) {
  const desktopLink = page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name });
  if (await desktopLink.isVisible().catch(() => false)) {
    await desktopLink.click();
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await page.getByRole('navigation', { name: 'เมนูมือถือ' }).getByRole('link', { name }).click();
}

async function clickLogout(page) {
  const desktopLogout = page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ออกจากระบบ' });
  if (await desktopLogout.isVisible().catch(() => false)) {
    await desktopLogout.click();
    return;
  }

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await page.getByRole('navigation', { name: 'เมนูมือถือ' }).getByRole('button', { name: 'ออกจากระบบ' }).click();
}

test('register immediately updates visible auth navigation state', async ({ page }) => {
  const user = identity('real-register');
  await registerThroughUi(page, user);
  await expectAuthenticatedHeader(page);
});

test('login, refresh, navigation, back-forward and logout keep auth state coherent', async ({ page, context }) => {
  const user = identity('real-login');

  const register = await page.request.post('/api/auth/register', {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(register.status()).toBe(201);
  await context.clearCookies();

  await loginThroughUi(page, user);
  await expectAuthenticatedHeader(page);

  await page.reload();
  await expectAuthenticatedHeader(page);

  await clickNavLink(page, '+ เพิ่มของบริจาค');
  await expect(page).toHaveURL('/donations/new');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expectAuthenticatedHeader(page);
  await page.goForward();
  await expect(page).toHaveURL('/donations/new');

  await page.goto('/');
  await expectAuthenticatedHeader(page);
  await clickLogout(page);
  await expect(page).toHaveURL('/');
  await expectGuestHeader(page);

  await page.reload();
  await expectGuestHeader(page);
});

test('protected next redirect returns with authenticated header state', async ({ page, context }) => {
  const user = identity('real-next');
  const register = await page.request.post('/api/auth/register', {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(register.status()).toBe(201);
  await context.clearCookies();

  await loginThroughUi(page, user, '/donations/new');
  await expect(page).toHaveURL('/donations/new');
  await page.goto('/');
  await expectAuthenticatedHeader(page);
});


test('guest direct protected URL redirects to login with return target', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/donations/new');
  await expect(page).toHaveURL('/login?next=/donations/new');

  const desktopLogin = page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'เข้าสู่ระบบ' });
  if (await desktopLogin.isVisible().catch(() => false)) {
    await expect(desktopLogin).toBeVisible();
  } else {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
    await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
  }
});

test('responsive navigation switches immediately between guest and authenticated actions', async ({ page }) => {
  const user = identity('real-mobile');
  await registerThroughUi(page, user);

  const openMenu = page.getByRole('button', { name: 'เปิดเมนู' });
  if (!(await openMenu.isVisible().catch(() => false))) {
    await expectAuthenticatedHeader(page);
    await page.getByRole('navigation', { name: 'เมนูหลัก' })
      .getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL('/');
    await expectGuestHeader(page);
    return;
  }

  await openMenu.click();

  const mobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(mobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);
  await expect(mobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toBeVisible();
  await expect(mobileNav.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();

  await mobileNav.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const guestMobileNav = page.getByRole('navigation', { name: 'เมนูมือถือ' });
  await expect(guestMobileNav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  await expect(guestMobileNav.getByRole('link', { name: '+ เพิ่มของบริจาค' })).toHaveCount(0);
  await expect(guestMobileNav.getByRole('button', { name: 'ออกจากระบบ' })).toHaveCount(0);
});

test('authenticated user does not stay on login or register screens', async ({ page }) => {
  const user = identity('real-auth-pages');
  await registerThroughUi(page, user);
  await expectAuthenticatedHeader(page);

  await page.goto('/login');
  await expect(page).toHaveURL('/');
  await expectAuthenticatedHeader(page);

  await page.goto('/register');
  await expect(page).toHaveURL('/');
  await expectAuthenticatedHeader(page);
});
