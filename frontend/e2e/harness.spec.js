import { expect, test } from '@playwright/test';
import { activeDonationPayload, uniqueE2eIdentity } from './helpers/data';

test('QA harness utilities are loadable', async () => {
  const identity = uniqueE2eIdentity('harness');
  const donation = activeDonationPayload();

  expect(identity.email).toContain('@example.test');
  expect(identity.password.length).toBeGreaterThanOrEqual(8);
  expect(donation.endDate).toBeTruthy();
  expect(donation.latitude).toBe(13.7291);
});
