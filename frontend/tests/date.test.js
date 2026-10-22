import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDateInputValue, todayBangkokDateInputValue } from '../src/lib/date.js';

test('Bangkok date input keeps the intended start calendar date', () => {
  assert.equal(bangkokDateInputValue('2026-09-10T17:00:00.000Z'), '2026-09-11');
});

test('Bangkok date input keeps the intended end calendar date', () => {
  assert.equal(bangkokDateInputValue('2026-09-11T16:59:59.999Z'), '2026-09-11');
});

test('default donation date follows Bangkok calendar day instead of UTC day', () => {
  assert.equal(todayBangkokDateInputValue(new Date('2026-09-10T18:00:00.000Z')), '2026-09-11');
});
