function requiredPassword(name) {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(`${name} must be set to at least 8 characters`);
  }
  return value;
}

export function e2eUserPassword() {
  return requiredPassword('E2E_USER_PASSWORD');
}

export function e2eAdminPassword() {
  return requiredPassword('E2E_ADMIN_PASSWORD');
}

export function uniqueE2eIdentity(prefix = 'user') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    name: `E2E ${prefix} ${suffix}`,
    email: `e2e-${prefix}-${suffix}@example.test`,
    password: e2eUserPassword(),
  };
}

export function activeDonationPayload(overrides = {}) {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  return {
    title: `E2E Donation ${Date.now()}`,
    description: 'Created by the Playwright QA harness',
    category: 'E2E',
    quantity: 2,
    latitude: 13.7291,
    longitude: 100.7789,
    address: 'KMITL E2E Test Point',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    ...overrides,
  };
}
