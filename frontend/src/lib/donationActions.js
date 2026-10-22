import { api } from './api.js';

export async function uploadDonationImages(donationId, files, request = api) {
  if (!files?.length) return [];

  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));

  return request(`/api/donations/${donationId}/images`, {
    method: 'POST',
    body: formData,
  });
}

export async function createDonationWithImages(data, files, request = api) {
  const donation = await request('/api/donations', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!files?.length) {
    return { donation, imageUploadError: null };
  }

  try {
    await uploadDonationImages(donation.id, files, request);
    return { donation, imageUploadError: null };
  } catch (imageUploadError) {
    return { donation, imageUploadError };
  }
}

export async function updateDonationWithImages(donationId, data, files, request = api) {
  const donation = await request(`/api/donations/${donationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!files?.length) {
    return { donation, imageUploadError: null };
  }

  try {
    await uploadDonationImages(donationId, files, request);
    return { donation, imageUploadError: null };
  } catch (imageUploadError) {
    return { donation, imageUploadError };
  }
}
