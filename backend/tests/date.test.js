import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBangkokDateOnly } from '../src/utils/date.js';

test('Bangkok start date begins at 00:00 local time', () => {
  const date = parseBangkokDateOnly('2026-09-11');
  assert.equal(date.toISOString(), '2026-09-10T17:00:00.000Z');
});

test('Bangkok end date ends at 23:59:59.999 local time', () => {
  const date = parseBangkokDateOnly('2026-09-11', { endOfDay: true });
  assert.equal(date.toISOString(), '2026-09-11T16:59:59.999Z');
});

test('Bangkok date parser rejects impossible calendar dates', () => {
  assert.equal(parseBangkokDateOnly('2026-02-30'), null);
});
