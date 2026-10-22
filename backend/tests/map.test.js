import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/database.js';
import { registerUser } from '../src/services/auth.service.js';
import { listNearbyDonations } from '../src/services/map.service.js';

const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `map-${suffix}@example.test`;
let owner;

const center = { latitude: 13.7291, longitude: 100.7789 };
const now = Date.now();
const activeDates = {
  startDate: new Date(now - 86_400_000),
  endDate: new Date(now + 86_400_000),
};

async function createMapDonation(overrides = {}) {
  return prisma.donation.create({
    data: {
      ownerId: owner.id,
      title: 'Map item',
      category: 'FOOD',
      quantity: 1,
      latitude: center.latitude,
      longitude: center.longitude,
      status: 'AVAILABLE',
      ...activeDates,
      ...overrides,
    },
  });
}

test('setup nearby search fixtures', async () => {
  owner = await registerUser({ name: 'Map Owner', email, password: 'MapTestPass123!' });
  await createMapDonation({ title: 'Nearby food' });
  await createMapDonation({ title: 'Nearby clothes', category: 'CLOTHES', latitude: 13.731 });
  await createMapDonation({ title: 'Far item', latitude: 14.2, longitude: 101.2 });
  await createMapDonation({ title: 'Out item', status: 'OUT_OF_STOCK' });
  await createMapDonation({ title: 'Hidden item', isHidden: true });
  await createMapDonation({ title: 'Future item', startDate: new Date(now + 86_400_000), endDate: new Date(now + 172_800_000) });
  await createMapDonation({ title: 'Expired item', startDate: new Date(now - 172_800_000), endDate: new Date(now - 86_400_000) });
});

test('nearby search returns only active visible donations in radius', async () => {
  const results = await listNearbyDonations({ ...center, radiusKm: 5 });
  const fixtureResults = results.filter((item) => item.ownerId === owner.id);
  const titles = fixtureResults.map((item) => item.title);

  assert.deepEqual(titles.sort(), ['Nearby clothes', 'Nearby food'].sort());
  assert.ok(fixtureResults.every((item) => item.distanceKm <= 5));
});

test('nearby search filters category case-insensitively', async () => {
  const results = await listNearbyDonations({ ...center, radiusKm: 5, category: 'clothes' });
  const fixtureResults = results.filter((item) => item.ownerId === owner.id);
  assert.equal(fixtureResults.length, 1);
  assert.equal(fixtureResults[0].title, 'Nearby clothes');
});

test('nearby search marks past AVAILABLE donations as EXPIRED', async () => {
  await listNearbyDonations({ ...center, radiusKm: 5 });
  const expired = await prisma.donation.findFirst({ where: { ownerId: owner.id, title: 'Expired item' } });
  assert.equal(expired.status, 'EXPIRED');
});

test('cleanup nearby search fixtures', async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});
