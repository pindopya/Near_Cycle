import { expect } from '@playwright/test';

export function e2eAccounts() {
  return {
    user: {
      email: process.env.E2E_USER_EMAIL || 'user@ogtb.local',
      password: process.env.E2E_USER_PASSWORD || '',
    },
    admin: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@ogtb.local',
      password: process.env.E2E_ADMIN_PASSWORD || '',
    },
  };
}

export async function login(page, account) {
  if (!account?.email || !account?.password) {
    throw new Error('E2E account email/password is required');
  }
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByLabel('อีเมล').fill(account.email);
  await page.getByLabel('รหัสผ่าน').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function logout(page) {
  const desktopButton = page.getByRole('button', { name: 'ออกจากระบบ' }).first();
  if (await desktopButton.isVisible().catch(() => false)) {
    await desktopButton.click();
    return;
  }

  const menu = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  }
}
