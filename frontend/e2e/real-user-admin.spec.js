import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eAdminPassword, e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

const ADMIN = {
  email: 'e2e-admin@example.test',
  password: e2eAdminPassword(),
};

async function registerUser(page, prefix) {
  const user = uniqueE2eIdentity(prefix);
  user.password = e2eUserPassword();
  const response = await page.request.post('/api/auth/register', { data: user });
  expect(response.status()).toBe(201);
  return { ...user, ...(await response.json()).user };
}

async function createDonation(page, overrides = {}) {
  const response = await page.request.post('/api/donations', {
    data: activeDonationPayload(overrides),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function loginAdmin(page, context) {
  await context.clearCookies();
  const authReady = page.waitForResponse((response) => (
    response.url().includes('/api/auth/me')
    && response.request().method() === 'GET'
  ));
  await page.goto('/login?next=/admin');
  await authReady;
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

function row(page, text) {
  return page.locator('.adminPortListRow').filter({ hasText: text });
}

test('admin moderation state remains truthful across reload and browser history', async ({ page, context }) => {
  const owner = await registerUser(page, 'real-admin-owner');
  const donation = await createDonation(page, {
    title: `E2E Admin stale donation ${Date.now()}`,
    category: 'E2E-ADMIN-REAL',
  });

  await context.clearCookies();
  const reporter = await registerUser(page, 'real-admin-reporter');
  const reportResponse = await page.request.post(`/api/donations/${donation.id}/reports`, {
    data: {
      reason: 'FRAUD',
      description: 'Real-user admin stale-state QA',
    },
  });
  expect(reportResponse.status()).toBe(201);
  const report = await reportResponse.json();

  await loginAdmin(page, context);

  await page.getByRole('link', { name: /ผู้ใช้ทั้งหมด/ }).click();
  const ownerRow = row(page, owner.email);
  await expect(ownerRow).toBeVisible();
  await ownerRow.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(ownerRow.getByText('SUSPENDED')).toBeVisible();

  await page.reload();
  const reloadedOwnerRow = row(page, owner.email);
  await expect(reloadedOwnerRow.getByText('SUSPENDED')).toBeVisible();
  await reloadedOwnerRow.getByRole('button', { name: 'เปิดใช้งาน' }).click();
  await expect(reloadedOwnerRow.getByText('ACTIVE')).toBeVisible();

  await page.getByRole('navigation', { name: 'ส่วนจัดการระบบ' })
    .getByRole('link', { name: 'ของบริจาค' }).click();
  const donationRow = row(page, donation.title);
  await donationRow.getByRole('button', { name: 'ซ่อน' }).click();
  await expect(donationRow.getByText('HIDDEN')).toBeVisible();

  await donationRow.getByRole('link', { name: donation.title }).click();
  await expect(page).toHaveURL(`/admin/donations/${donation.id}`);
  await expect(page.getByText('HIDDEN', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'แสดง Donation' }).click();
  await expect(page.getByText('VISIBLE', { exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/admin/donations');
  await expect(row(page, donation.title).getByText('VISIBLE')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(`/admin/donations/${donation.id}`);
  await expect(page.getByText('VISIBLE', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: /ดูรายละเอียด/ }).click();
  await expect(page).toHaveURL(`/admin/reports/${report.id}`);
  await page.getByRole('button', { name: 'ซ่อน Donation' }).click();
  await page.getByRole('button', { name: 'ระงับเจ้าของโพสต์' }).click();
  await page.getByRole('button', { name: 'ปิด Report' }).click();

  await expect(page.getByText('RESOLVED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('SUSPENDED', { exact: true })).toBeVisible();
  await expect(page.getByText('HIDDEN', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('RESOLVED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('SUSPENDED', { exact: true })).toBeVisible();
  await expect(page.getByText('HIDDEN', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '← กลับ Reports' }).click();
  await expect(page).toHaveURL('/admin/reports');
  await expect(row(page, donation.title).getByText('RESOLVED')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`/admin/reports/${report.id}`);
  await expect(page.getByText('RESOLVED', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: 'เปิด Donation Detail →' }).click();
  await expect(page.getByText('HIDDEN', { exact: true }).first()).toBeVisible();
});

test('admin delete and logout do not leave stale privileged pages in history', async ({ page, context }) => {
  await registerUser(page, 'real-admin-delete-owner');
  const donation = await createDonation(page, {
    title: `E2E Admin delete history ${Date.now()}`,
    category: 'E2E-ADMIN-DELETE',
  });

  await loginAdmin(page, context);

  await page.goto(`/admin/donations/${donation.id}`);
  await expect(page.getByRole('heading', { level: 1, name: donation.title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบ Donation' }).click();
  await expect(page).toHaveURL('/admin/donations');
  await expect(row(page, donation.title)).toHaveCount(0);

  await page.reload();
  await expect(row(page, donation.title)).toHaveCount(0);

  await page.goto(`/admin/donations/${donation.id}`);
  await expect(page.getByText('ไม่พบโพสต์บริจาค')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบ Donation' })).toHaveCount(0);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const mobileToggle = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await mobileToggle.isVisible().catch(() => false)) {
    await mobileToggle.click();
    await page.getByRole('navigation', { name: 'เมนู Admin บนมือถือ' })
      .getByRole('button', { name: 'ออกจากระบบ' }).click();
  } else {
    await page.getByRole('navigation', { name: 'เมนู Admin' })
      .getByRole('button', { name: 'ออกจากระบบ' }).click();
  }

  await expect(page).toHaveURL('/');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
});

test('non-admin direct admin URL never exposes moderation controls', async ({ page }) => {
  await registerUser(page, 'real-admin-denied');

  await page.goto('/admin/donations');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'ซ่อน' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลบ' })).toHaveCount(0);
});
