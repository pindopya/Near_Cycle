import { expect, test } from '@playwright/test';
import { activeDonationPayload, e2eUserPassword, uniqueE2eIdentity } from './helpers/data';

const A = { latitude: 13.7291, longitude: 100.7789, accuracy: 18 };
const B = { latitude: 13.7362, longitude: 100.7854, accuracy: 12 };
const LOW_ACCURACY = { latitude: 13.7291, longitude: 100.7789, accuracy: 350 };
const TOLERANCE = 0.000001;

function expectCoordinate(actual, expected) {
  expect(Math.abs(Number(actual) - Number(expected))).toBeLessThanOrEqual(TOLERANCE);
}

async function registerOwner(page, prefix) {
  const owner = uniqueE2eIdentity(prefix);
  owner.password = e2eUserPassword();
  const response = await page.request.post('/api/auth/register', { data: owner });
  expect(response.status()).toBe(201);
  return owner;
}

async function waitForNearby(page, expected) {
  const response = await page.waitForResponse((candidate) => {
    if (!candidate.url().includes('/api/donations/nearby?')) return false;
    const url = new URL(candidate.url());
    return Math.abs(Number(url.searchParams.get('lat')) - expected.latitude) <= TOLERANCE
      && Math.abs(Number(url.searchParams.get('lng')) - expected.longitude) <= TOLERANCE;
  });
  expect(response.ok()).toBeTruthy();
  return response;
}

test('explicit current-location request asks for a fresh fix and uses the newest coordinates', async ({ page }) => {
  await page.addInitScript(({ first, second }) => {
    const geolocation = {
      getCurrentPosition(success, _error, options = {}) {
        const fresh = options.maximumAge === 0;
        const point = fresh ? second : first;
        setTimeout(() => success({
          coords: {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
          },
        }), 0);
      },
      watchPosition() {
        return 1;
      },
      clearWatch() {},
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: geolocation,
    });
  }, { first: A, second: B });

  const initialNearby = waitForNearby(page, A);
  await page.goto('/');
  await initialNearby;

  const freshNearby = waitForNearby(page, B);
  await page.getByRole('button', { name: 'ตำแหน่งฉัน' }).click();
  await freshNearby;
});

test('low-accuracy map location is visibly identified as approximate', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(LOW_ACCURACY);

  const nearby = waitForNearby(page, LOW_ACCURACY);
  await page.goto('/');
  await nearby;

  await expect(page.locator('.mapAccuracyNotice')).toContainText('±350 ม.');
  await expect(page.locator('.mapAccuracyNotice')).toContainText('อาจคลาดเคลื่อน');
  await expect(page.locator('.mapAccuracyCircle')).toHaveCount(1);
});

test('donation current location is only committed after confirmation and submits exact coordinates', async ({ page, context }) => {
  await registerOwner(page, 'gps-form');
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(B);

  await page.goto('/donations/new');
  await expect(page.getByRole('heading', { name: 'เพิ่มของบริจาค' })).toBeVisible();

  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  const dialog = page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mapPickerMarker')).toBeVisible();

  await page.waitForTimeout(850);
  const mapBox = await dialog.locator('.leaflet-container').boundingBox();
  const markerBox = await dialog.locator('.mapPickerMarker').boundingBox();
  expect(mapBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  if (mapBox && markerBox) {
    const mapCenterX = mapBox.x + mapBox.width / 2;
    const mapCenterY = mapBox.y + mapBox.height / 2;
    const markerCenterX = markerBox.x + markerBox.width / 2;
    const markerAnchorY = markerBox.y + markerBox.height - 4;
    expect(Math.abs(markerCenterX - mapCenterX)).toBeLessThan(16);
    expect(Math.abs(markerAnchorY - mapCenterY)).toBeLessThan(20);
  }

  await dialog.getByRole('button', { name: 'กลับไปหน้าฟอร์ม' }).click();
  await expect(page.getByText('ยังไม่ได้เลือก')).toBeVisible();

  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'ยืนยันตำแหน่งนี้' }).click();
  await expect(page.getByText('เลือกตำแหน่งแล้ว')).toBeVisible();

  await page.getByPlaceholder('เช่น เสื้อผ้าสภาพดี').fill('GPS exact coordinate donation');
  await page.getByPlaceholder('เช่น เสื้อผ้า', { exact: true }).fill('GPS-QA');
  await page.getByRole('spinbutton').fill('1');
  await page.locator('input[type="date"]').nth(1).fill('2026-10-05');

  const requestPromise = page.waitForRequest((request) => (
    request.url().endsWith('/api/donations') && request.method() === 'POST'
  ));
  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/donations') && response.request().method() === 'POST'
  ));

  await page.getByRole('button', { name: 'สร้างจุดบริจาค' }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON();
  const response = await responsePromise;

  expect(response.status()).toBe(201);
  expectCoordinate(payload.latitude, B.latitude);
  expectCoordinate(payload.longitude, B.longitude);
});

test('low-accuracy donation GPS warns before the user confirms a pickup point', async ({ page, context }) => {
  await registerOwner(page, 'gps-low-form');
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(LOW_ACCURACY);

  await page.goto('/donations/new');
  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();

  const dialog = page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' });
  await expect(dialog.locator('.locationAccuracyNotice')).toContainText('±350 ม.');
  await expect(dialog.locator('.locationAccuracyNotice')).toContainText('อาจคลาดเคลื่อน');
});
test('denied donation GPS never leaves a confirmable default marker or commits a location', async ({ page, context }) => {
  await registerOwner(page, 'gps-denied-form');
  await context.clearPermissions();

  await page.goto('/donations/new');
  await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();

  await expect(page.getByRole('dialog', { name: 'เลือกตำแหน่งจุดรับของ' })).toHaveCount(0);
  await expect(page.locator('.locationErrorBox')).toHaveCount(1);
  await expect(page.locator('.locationErrorBox')).toContainText('ไม่สามารถอ่านตำแหน่งปัจจุบันได้');
  await expect(page.getByText('ยังไม่ได้เลือก')).toBeVisible();
  await expect(page.getByText('เลือกตำแหน่งแล้ว')).toHaveCount(0);
});

test('navigation sends latitude and longitude in the correct order and reports GPS accuracy', async ({ page, context }) => {
  await registerOwner(page, 'gps-navigation');

  const destination = {
    latitude: 13.7412,
    longitude: 100.7923,
  };

  const create = await page.request.post('/api/donations', {
    data: activeDonationPayload({
      title: 'GPS navigation target',
      category: 'GPS-QA',
      quantity: 1,
      latitude: destination.latitude,
      longitude: destination.longitude,
      address: 'GPS navigation target',
    }),
  });
  expect(create.status()).toBe(201);
  const donation = await create.json();

  await context.clearCookies();
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation(A);

  let routeOrigin = null;
  await page.route('**/api/routes?*', async (route) => {
    const url = new URL(route.request().url());
    routeOrigin = {
      latitude: Number(url.searchParams.get('fromLat')),
      longitude: Number(url.searchParams.get('fromLng')),
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        distanceMeters: 1800,
        durationSeconds: 420,
        geometry: {
          type: 'LineString',
          coordinates: [
            [A.longitude, A.latitude],
            [destination.longitude, destination.latitude],
          ],
        },
        steps: [],
      }),
    });
  });

  await page.goto(`/donations/${donation.id}/navigate`);
  await expect(page.locator('.navGpsPill')).toContainText('GPS ดี');
  await expect(page.locator('.navGpsPill')).toContainText('±18 ม.');

  expect(routeOrigin).not.toBeNull();
  expectCoordinate(routeOrigin.latitude, A.latitude);
  expectCoordinate(routeOrigin.longitude, A.longitude);

  await context.setGeolocation(LOW_ACCURACY);
  await expect(page.locator('.navGpsPill')).toContainText('GPS ต่ำ');
  await expect(page.locator('.navGpsPill')).toContainText('±350 ม.');
});
