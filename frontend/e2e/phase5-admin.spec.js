import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eAdminPassword, uniqueE2eIdentity } from './helpers/data';
import {
  expectInteractiveCentersUnobscured,
  expectNoHorizontalOverflow,
  watchPageDiagnostics,
} from './helpers/qa';

const ADMIN = {
  email: 'e2e-admin@example.test',
  password: e2eAdminPassword(),
};

async function registerViaApi(page, identity) {
  const response = await page.request.post('/api/auth/register', {
    data: {
      name: identity.name,
      email: identity.email,
      password: identity.password,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createDonationViaApi(page, overrides = {}) {
  const response = await page.request.post('/api/donations', {
    data: activeDonationPayload(overrides),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function loginAdmin(page) {
  await page.goto('/login?next=/admin');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

function adminRow(page, text) {
  return page.locator('.adminPortListRow').filter({ hasText: text });
}

test('ADMIN dashboard and moderation actions work end to end', async ({ page, context }) => {
  const owner = uniqueE2eIdentity('admin-owner');
  const reporter = uniqueE2eIdentity('admin-reporter');

  const ownerUser = await registerViaApi(page, owner);
  const primaryDonation = await createDonationViaApi(page, {
    title: `E2E Admin Primary ${Date.now()}`,
    category: 'E2E-ADMIN',
  });
  const deleteDonation = await createDonationViaApi(page, {
    title: `E2E Admin Delete ${Date.now()}`,
    category: 'E2E-ADMIN',
  });

  await context.clearCookies();
  await registerViaApi(page, reporter);
  const reportResponse = await page.request.post(`/api/donations/${primaryDonation.id}/reports`, {
    data: {
      reason: 'FRAUD',
      description: `E2E admin moderation report ${Date.now()}`,
    },
  });
  expect(reportResponse.status()).toBe(201);
  const report = await reportResponse.json();

  await context.clearCookies();

  const diagnostics = watchPageDiagnostics(page);
  await loginAdmin(page);

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);

  const mobileMenu = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    await expect(page.getByRole('navigation', { name: 'เมนู Admin บนมือถือ' })).toBeVisible();
    await page.getByRole('button', { name: 'ปิดเมนู' }).click();
    await expect(page.getByRole('navigation', { name: 'เมนู Admin บนมือถือ' })).toHaveCount(0);
  }

  await page.getByRole('link', { name: /ผู้ใช้ทั้งหมด/ }).click();
  await expect(page).toHaveURL('/admin/users');
  await expect(page.getByRole('heading', { name: 'ผู้ใช้' })).toBeVisible();

  const ownerRow = adminRow(page, owner.email);
  await expect(ownerRow).toBeVisible();
  await ownerRow.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(ownerRow.getByText('SUSPENDED')).toBeVisible();
  await ownerRow.getByRole('button', { name: 'เปิดใช้งาน' }).click();
  await expect(ownerRow.getByText('ACTIVE')).toBeVisible();

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' }).getByRole('link', { name: 'ของบริจาค' }).click();
  await expect(page).toHaveURL('/admin/donations');

  const primaryRow = adminRow(page, primaryDonation.title);
  await expect(primaryRow).toBeVisible();

  await primaryRow.getByRole('button', { name: 'ซ่อน' }).click();
  await expect(primaryRow.getByText('HIDDEN')).toBeVisible();
  await primaryRow.getByRole('button', { name: 'แสดง' }).click();
  await expect(primaryRow.getByText('VISIBLE')).toBeVisible();

  await primaryRow.getByRole('link', { name: primaryDonation.title }).click();
  await expect(page).toHaveURL(`/admin/donations/${primaryDonation.id}`);
  await expect(page.getByRole('heading', { level: 1, name: primaryDonation.title })).toBeVisible();
  await expect(page.getByRole('link', { name: /ดูรายละเอียด/ })).toHaveAttribute('href', `/admin/reports/${report.id}`);

  await page.getByRole('link', { name: /ดูรายละเอียด/ }).click();
  await expect(page).toHaveURL(`/admin/reports/${report.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'ข้อมูลหลอกลวง' })).toBeVisible();

  await page.getByRole('button', { name: 'ซ่อน Donation' }).click();
  await expect(page.getByRole('button', { name: 'ซ่อนอยู่แล้ว' })).toBeDisabled();

  await page.getByRole('button', { name: 'ระงับเจ้าของโพสต์' }).click();
  await expect(page.getByText('SUSPENDED', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เจ้าของถูกระงับแล้ว' })).toBeDisabled();

  await page.getByRole('button', { name: 'ปิด Report' }).click();
  await expect(page.getByText('RESOLVED', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'ตรวจสอบแล้ว' })).toBeDisabled();

  await page.getByRole('link', { name: 'เปิด Donation Detail →' }).click();
  await expect(page).toHaveURL(`/admin/donations/${primaryDonation.id}`);
  await expect(page.getByText('HIDDEN', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'แสดง Donation' }).click();
  await expect(page.getByText('VISIBLE', { exact: true }).first()).toBeVisible();

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' }).getByRole('link', { name: 'ผู้ใช้' }).click();
  const suspendedOwnerRow = adminRow(page, owner.email);
  await expect(suspendedOwnerRow.getByText('SUSPENDED')).toBeVisible();
  await suspendedOwnerRow.getByRole('button', { name: 'เปิดใช้งาน' }).click();
  await expect(suspendedOwnerRow.getByText('ACTIVE')).toBeVisible();

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' }).getByRole('link', { name: 'รายงาน' }).click();
  await expect(page).toHaveURL('/admin/reports');
  const reportRow = adminRow(page, primaryDonation.title);
  await expect(reportRow.getByText('RESOLVED')).toBeVisible();

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' }).getByRole('link', { name: 'ของบริจาค' }).click();
  const deleteRow = adminRow(page, deleteDonation.title);
  await expect(deleteRow).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await deleteRow.getByRole('button', { name: 'ลบ' }).click();
  await expect(adminRow(page, deleteDonation.title)).toHaveCount(0);

  const deleted = await page.request.get(`/api/admin/donations/${deleteDonation.id}`);
  expect(deleted.status()).toBe(404);

  await expectNoHorizontalOverflow(page);
  await expectInteractiveCentersUnobscured(page);
  const unexpectedFailedRequests = diagnostics.failedRequests.filter((entry) => {
    if (/tile\.openstreetmap\.org/.test(entry.url)) return false;
    const adminDelete204ProxyAbort = entry.method === 'DELETE'
      && entry.error.includes('ERR_ABORTED')
      && /\/api\/admin\/donations\//.test(entry.url);
    return !adminDelete204ProxyAbort;
  });
  expect(unexpectedFailedRequests).toEqual([]);

  expect(ownerUser.user.role).toBe('USER');

  const desktopLogout = page.getByRole('button', { name: 'ออกจากระบบ' }).first();
  if (await desktopLogout.isVisible().catch(() => false)) {
    await desktopLogout.click();
  } else {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    await page.getByRole('navigation', { name: 'เมนู Admin บนมือถือ' }).getByRole('button', { name: 'ออกจากระบบ' }).click();
  }
  await expect(page).toHaveURL('/');
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});

test('non-admin user cannot stay on admin pages', async ({ page }) => {
  const user = uniqueE2eIdentity('admin-denied');
  await registerViaApi(page, user);

  const response = await page.request.get('/api/admin/users');
  expect(response.status()).toBe(403);

  await page.goto('/admin');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
});
