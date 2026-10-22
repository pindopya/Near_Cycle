import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DonationStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/response.js';

const donationInclude = {
  owner: {
    select: {
      id: true,
      name: true,
    },
  },
  images: {
    orderBy: { createdAt: 'asc' },
  },
};
const UPLOAD_ROOT = path.resolve('uploads');
const DONATION_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'donations');
const MAX_DONATION_IMAGES = 5;
const IMAGE_EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

async function expirePastDonations() {
  await prisma.donation.updateMany({
    where: {
      status: DonationStatus.AVAILABLE,
      endDate: { lt: new Date() },
    },
    data: { status: DonationStatus.EXPIRED },
  });
}

async function getOwnedDonation(id, ownerId) {
  const donation = await prisma.donation.findUnique({ where: { id } });
  if (!donation) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }
  if (donation.ownerId !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์จัดการโพสต์นี้');
  }
  return donation;
}

function imageDiskPath(imageUrl) {
  const filename = path.basename(imageUrl);
  return path.join(DONATION_UPLOAD_DIR, filename);
}

export async function listDonations() {
  await expirePastDonations();
  return prisma.donation.findMany({
    where: { isHidden: false },
    include: donationInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDonationById(id) {
  await expirePastDonations();
  const donation = await prisma.donation.findFirst({
    where: { id, isHidden: false },
    include: donationInclude,
  });
  if (!donation) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }
  return donation;
}

export async function createDonation(ownerId, data) {
  const status = data.endDate < new Date() ? DonationStatus.EXPIRED : DonationStatus.AVAILABLE;
  return prisma.donation.create({
    data: {
      ...data,
      ownerId,
      status,
    },
    include: donationInclude,
  });
}

export async function updateDonation(id, ownerId, data) {
  const current = await getOwnedDonation(id, ownerId);
  const startDate = data.startDate ?? current.startDate;
  const endDate = data.endDate ?? current.endDate;

  if (startDate > endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startDate ต้องไม่เกิน endDate');
  }

  let status = current.status;
  if (endDate < new Date()) {
    status = DonationStatus.EXPIRED;
  } else if (current.status === DonationStatus.EXPIRED) {
    status = DonationStatus.AVAILABLE;
  }

  return prisma.donation.update({
    where: { id },
    data: {
      ...data,
      status,
    },
    include: donationInclude,
  });
}

export async function deleteDonation(id, ownerId) {
  await getOwnedDonation(id, ownerId);
  const images = await prisma.donationImage.findMany({ where: { donationId: id } });
  await prisma.donation.delete({ where: { id } });
  await Promise.all(images.map((image) => unlink(imageDiskPath(image.imageUrl)).catch(() => {})));
}

export async function markDonationOutOfStock(id, ownerId) {
  await getOwnedDonation(id, ownerId);
  return prisma.donation.update({
    where: { id },
    data: { status: DonationStatus.OUT_OF_STOCK },
    include: donationInclude,
  });
}

export async function addDonationImages(id, ownerId, files) {
  await getOwnedDonation(id, ownerId);

  const existingImageCount = await prisma.donationImage.count({ where: { donationId: id } });
  const uploadCount = files?.length ?? 0;
  if (existingImageCount + uploadCount > MAX_DONATION_IMAGES) {
    throw new AppError(
      400,
      'TOO_MANY_DONATION_IMAGES',
      `Donation มีรูปได้สูงสุด ${MAX_DONATION_IMAGES} รูปรวม`,
    );
  }

  await mkdir(DONATION_UPLOAD_DIR, { recursive: true });

  const written = [];
  try {
    for (const file of files) {
      const extension = IMAGE_EXTENSION_BY_MIME[file.mimetype];
      if (!extension) {
        throw new AppError(400, 'INVALID_IMAGE_TYPE', 'รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
      }

      const filename = `${randomUUID()}${extension}`;
      const diskPath = path.join(DONATION_UPLOAD_DIR, filename);
      const imageUrl = `/uploads/donations/${filename}`;
      await writeFile(diskPath, file.buffer, { flag: 'wx' });
      written.push({ diskPath, imageUrl });
    }

    return await prisma.$transaction(
      written.map(({ imageUrl }) => prisma.donationImage.create({ data: { donationId: id, imageUrl } })),
    );
  } catch (error) {
    await Promise.all(written.map(({ diskPath }) => unlink(diskPath).catch(() => {})));
    throw error;
  }
}

export async function deleteDonationImage(donationId, imageId, ownerId) {
  await getOwnedDonation(donationId, ownerId);
  const image = await prisma.donationImage.findFirst({
    where: { id: imageId, donationId },
  });

  if (!image) {
    throw new AppError(404, 'IMAGE_NOT_FOUND', 'ไม่พบรูปที่ต้องการลบ');
  }

  await prisma.donationImage.delete({ where: { id: image.id } });
  await unlink(imageDiskPath(image.imageUrl)).catch(() => {});
}

export { UPLOAD_ROOT };
