import { prisma } from '../config/database.js';
import { AppError } from '../utils/response.js';

const reportInclude = {
  reporter: {
    select: {
      id: true,
      name: true,
    },
  },
  donation: {
    select: {
      id: true,
      title: true,
      category: true,
      ownerId: true,
      isHidden: true,
      status: true,
    },
  },
};

export async function createReport(reporterId, donationId, data) {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { id: true, isHidden: true },
  });

  if (!donation || donation.isHidden) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }

  return prisma.report.create({
    data: {
      reporterId,
      donationId,
      reason: data.reason,
      description: data.description,
    },
    include: reportInclude,
  });
}
