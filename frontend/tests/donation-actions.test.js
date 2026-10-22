import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDonationWithImages,
  updateDonationWithImages,
  uploadDonationImages,
} from '../src/lib/donationActions.js';

function imageBlob() {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
}

test('create keeps the created donation when image upload fails', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/donations') return { id: 'donation-1', title: 'Food' };
    throw new Error('image upload failed');
  };

  const result = await createDonationWithImages(
    { title: 'Food' },
    [imageBlob()],
    request,
  );

  assert.equal(result.donation.id, 'donation-1');
  assert.equal(result.imageUploadError?.message, 'image upload failed');
  assert.equal(calls.filter((call) => call.path === '/api/donations').length, 1);
  assert.equal(calls.filter((call) => call.path === '/api/donations/donation-1/images').length, 1);
});

test('retrying images does not create a second donation', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    return [{ id: 'image-1' }];
  };

  await uploadDonationImages('donation-1', [imageBlob()], request);

  assert.deepEqual(calls.map((call) => call.path), ['/api/donations/donation-1/images']);
});

test('edit reports image failure separately after donation data was saved', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/donations/donation-2') return { id: 'donation-2', title: 'Updated' };
    throw new Error('image upload failed');
  };

  const result = await updateDonationWithImages(
    'donation-2',
    { title: 'Updated' },
    [imageBlob()],
    request,
  );

  assert.equal(result.donation.title, 'Updated');
  assert.equal(result.imageUploadError?.message, 'image upload failed');
  assert.equal(calls.filter((call) => call.path === '/api/donations/donation-2').length, 1);
  assert.equal(calls.filter((call) => call.path === '/api/donations/donation-2/images').length, 1);
});

test('create without images completes without an upload request', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    return { id: 'donation-3' };
  };

  const result = await createDonationWithImages({ title: 'Book' }, [], request);

  assert.equal(result.donation.id, 'donation-3');
  assert.equal(result.imageUploadError, null);
  assert.deepEqual(calls.map((call) => call.path), ['/api/donations']);
});
