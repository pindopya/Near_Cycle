import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { registerUser } from '../src/services/auth.service.js';
import { getDonationDrivingRoute, getDrivingRoute } from '../src/services/map.service.js';

const samplePayload = {
  code: 'Ok',
  routes: [{
    distance: 2450.4,
    duration: 420.2,
    geometry: {
      type: 'LineString',
      coordinates: [[100.7789, 13.7291], [100.789, 13.735]],
    },
    legs: [{
      steps: [{
        distance: 200,
        duration: 30,
        name: 'ถนนตัวอย่าง',
        maneuver: { type: 'turn', modifier: 'left', location: [100.78, 13.73] },
      }],
    }],
  }],
};

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `route-${suffix}@example.test`;
let owner;
let activeDonation;
let outOfStockDonation;
let futureDonation;
let expiredDonation;
let hiddenDonation;
let server;
let baseUrl;

function donationData(overrides = {}) {
  const now = Date.now();
  return {
    ownerId: owner.id,
    title: `Route ${Math.random()}`,
    category: 'OTHER',
    quantity: 1,
    latitude: 13.735,
    longitude: 100.789,
    startDate: new Date(now - 60_000),
    endDate: new Date(now + 86_400_000),
    status: 'AVAILABLE',
    ...overrides,
  };
}

test('setup route fixtures', async () => {
  owner = await registerUser({ name: 'Route Owner', email, password: 'RoutePass123!' });
  activeDonation = await prisma.donation.create({ data: donationData() });
  outOfStockDonation = await prisma.donation.create({ data: donationData({ status: 'OUT_OF_STOCK' }) });
  futureDonation = await prisma.donation.create({
    data: donationData({
      startDate: new Date(Date.now() + 86_400_000),
      endDate: new Date(Date.now() + 172_800_000),
    }),
  });
  expiredDonation = await prisma.donation.create({
    data: donationData({
      startDate: new Date(Date.now() - 172_800_000),
      endDate: new Date(Date.now() - 86_400_000),
    }),
  });
  hiddenDonation = await prisma.donation.create({ data: donationData({ isHidden: true }) });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('route service normalizes routing provider response', async () => {
  const fakeFetch = async (url) => {
    assert.match(url, /route\/v1\/driving/);
    assert.match(url, /geometries=geojson/);
    return { ok: true, json: async () => samplePayload };
  };

  const route = await getDrivingRoute({
    fromLat: 13.7291,
    fromLng: 100.7789,
    toLat: 13.735,
    toLng: 100.789,
  }, fakeFetch);

  assert.equal(route.distanceMeters, 2450.4);
  assert.equal(route.durationSeconds, 420.2);
  assert.equal(route.geometry.type, 'LineString');
  assert.equal(route.steps[0].modifier, 'left');
});

test('route service retries transient provider failure before returning unavailable', async () => {
  let attempts = 0;
  const fakeFetch = async () => {
    attempts += 1;
    return { ok: false, status: 503 };
  };

  await assert.rejects(
    () => getDrivingRoute({ fromLat: 13.7, fromLng: 100.7, toLat: 13.8, toLng: 100.8 }, fakeFetch),
    (error) => error.status === 502 && error.code === 'ROUTING_UNAVAILABLE',
  );
  assert.equal(attempts, 2);
});

test('route service recovers when a transient network failure succeeds on retry', async () => {
  let attempts = 0;
  let receivedSignal = false;
  const fakeFetch = async (_url, options) => {
    attempts += 1;
    receivedSignal = options.signal instanceof AbortSignal;
    if (attempts === 1) throw new TypeError('temporary network failure');
    return { ok: true, json: async () => samplePayload };
  };

  const route = await getDrivingRoute({
    fromLat: 13.7,
    fromLng: 100.7,
    toLat: 13.8,
    toLng: 100.8,
  }, fakeFetch);

  assert.equal(attempts, 2);
  assert.equal(receivedSignal, true);
  assert.equal(route.distanceMeters, samplePayload.routes[0].distance);
});

test('route service returns a distinct timeout error after retrying', async () => {
  let attempts = 0;
  const fakeFetch = async () => {
    attempts += 1;
    const error = new Error('routing timeout');
    error.name = 'TimeoutError';
    throw error;
  };

  await assert.rejects(
    () => getDrivingRoute({ fromLat: 13.7, fromLng: 100.7, toLat: 13.8, toLng: 100.8 }, fakeFetch),
    (error) => error.status === 504 && error.code === 'ROUTING_TIMEOUT',
  );
  assert.equal(attempts, 2);
});

test('donation route uses destination stored in database', async () => {
  let providerUrl = '';
  const fakeFetch = async (url) => {
    providerUrl = url;
    return { ok: true, json: async () => samplePayload };
  };

  await getDonationDrivingRoute({
    donationId: activeDonation.id,
    fromLat: 13.7291,
    fromLng: 100.7789,
  }, fakeFetch);

  assert.match(providerUrl, new RegExp(`${activeDonation.longitude},${activeDonation.latitude}`));
});

test('out-of-stock donation cannot be used for navigation', async () => {
  await assert.rejects(
    () => getDonationDrivingRoute({ donationId: outOfStockDonation.id, fromLat: 13.7, fromLng: 100.7 }, async () => {
      throw new Error('provider must not be called');
    }),
    (error) => error.status === 409 && error.code === 'DONATION_NOT_AVAILABLE',
  );
});

test('future donation cannot be used for navigation', async () => {
  await assert.rejects(
    () => getDonationDrivingRoute({ donationId: futureDonation.id, fromLat: 13.7, fromLng: 100.7 }, async () => {
      throw new Error('provider must not be called');
    }),
    (error) => error.status === 409 && error.code === 'DONATION_NOT_AVAILABLE',
  );
});

test('expired AVAILABLE donation is persisted as EXPIRED and cannot navigate', async () => {
  await assert.rejects(
    () => getDonationDrivingRoute({ donationId: expiredDonation.id, fromLat: 13.7, fromLng: 100.7 }, async () => {
      throw new Error('provider must not be called');
    }),
    (error) => error.status === 409 && error.code === 'DONATION_NOT_AVAILABLE',
  );

  const stored = await prisma.donation.findUnique({ where: { id: expiredDonation.id } });
  assert.equal(stored.status, 'EXPIRED');
});

test('hidden donation cannot be used for navigation', async () => {
  await assert.rejects(
    () => getDonationDrivingRoute({ donationId: hiddenDonation.id, fromLat: 13.7, fromLng: 100.7 }),
    (error) => error.status === 404 && error.code === 'DONATION_NOT_FOUND',
  );
});

test('GET /api/routes validates donation id and current coordinates', async () => {
  const missingDonation = await fetch(`${baseUrl}/api/routes?fromLat=13&fromLng=100`);
  assert.equal(missingDonation.status, 400);

  const invalidCoordinate = await fetch(`${baseUrl}/api/routes?donationId=${activeDonation.id}&fromLat=&fromLng=100`);
  assert.equal(invalidCoordinate.status, 400);

  const unavailable = await fetch(`${baseUrl}/api/routes?donationId=${outOfStockDonation.id}&fromLat=13&fromLng=100`);
  assert.equal(unavailable.status, 409);
  assert.equal((await unavailable.json()).error, 'DONATION_NOT_AVAILABLE');
});

test('cleanup route fixtures', async () => {
  await prisma.user.deleteMany({ where: { email } });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});
