import assert from 'node:assert/strict';
import test from 'node:test';
import { canNavigateToDonation } from '../src/lib/donationAvailability.js';

const now = Date.parse('2026-09-11T12:00:00.000Z');
const active = {
  status: 'AVAILABLE',
  isHidden: false,
  startDate: '2026-09-11T11:00:00.000Z',
  endDate: '2026-09-11T13:00:00.000Z',
};

test('AVAILABLE donation inside active window can navigate', () => {
  assert.equal(canNavigateToDonation(active, now), true);
});

test('out-of-stock and expired donations cannot navigate', () => {
  assert.equal(canNavigateToDonation({ ...active, status: 'OUT_OF_STOCK' }, now), false);
  assert.equal(canNavigateToDonation({ ...active, status: 'EXPIRED' }, now), false);
});

test('future and past donation windows cannot navigate', () => {
  assert.equal(canNavigateToDonation({ ...active, startDate: '2026-09-11T13:00:00.000Z' }, now), false);
  assert.equal(canNavigateToDonation({ ...active, endDate: '2026-09-11T11:00:00.000Z' }, now), false);
});

test('hidden donation cannot navigate', () => {
  assert.equal(canNavigateToDonation({ ...active, isHidden: true }, now), false);
});
