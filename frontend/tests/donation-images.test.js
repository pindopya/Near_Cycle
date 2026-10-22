import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_DONATION_IMAGES,
  remainingDonationImageSlots,
  selectDonationUploadFiles,
} from '../src/lib/donationImages.js';

test('new donation can select up to five images', () => {
  const files = ['1', '2', '3', '4', '5', '6'];
  assert.equal(MAX_DONATION_IMAGES, 5);
  assert.deepEqual(selectDonationUploadFiles(files), ['1', '2', '3', '4', '5']);
});

test('edit donation only allows the remaining image slots', () => {
  const donation = { images: [{ id: '1' }, { id: '2' }, { id: '3' }] };
  assert.equal(remainingDonationImageSlots(donation), 2);
  assert.deepEqual(selectDonationUploadFiles(['4', '5', '6'], donation), ['4', '5']);
});

test('donation with five images cannot select more files', () => {
  const donation = { images: Array.from({ length: 5 }, (_, index) => ({ id: String(index) })) };
  assert.equal(remainingDonationImageSlots(donation), 0);
  assert.deepEqual(selectDonationUploadFiles(['6'], donation), []);
});
