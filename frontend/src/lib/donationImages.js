export const MAX_DONATION_IMAGES = 5;

export function remainingDonationImageSlots(donation) {
  const currentCount = Array.isArray(donation?.images) ? donation.images.length : 0;
  return Math.max(0, MAX_DONATION_IMAGES - currentCount);
}

export function selectDonationUploadFiles(fileList, donation) {
  const remaining = remainingDonationImageSlots(donation);
  return Array.from(fileList || []).slice(0, remaining);
}
