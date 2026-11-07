import { unlink } from 'node:fs/promises';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/response.js';
import { expirePastDonations, imageDiskPath } from './donation.service.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      donations: true,
      reports: true,
    },
  },
};

const adminDonationInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  },
  images: {
    orderBy: { createdAt: 'asc' },
  },
  _count: {
    select: {
      reports: true,
    },
  },
};

const adminDonationDetailInclude = {
  ...adminDonationInclude,
  reports: {
    orderBy: { createdAt: 'desc' },
    include: {
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
    },
  },
};

const adminReportInclude = {
  reporter: {
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  },
  donation: {
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
      images: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
};

export async function getAdminSummary() {
  // Dashboard only needs counts; COUNT(*) avoids shipping every row (with joins) to the browser.
  const [users, donations, reports, pendingReports] = await prisma.$transaction([
    prisma.user.count(),
    prisma.donation.count(),
    prisma.report.count(),
    prisma.report.count({ where: { status: 'PENDING' } }),
  ]);
  return { users, donations, reports, pendingReports };
}

export function listAdminUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function setUserActive(userId, isActive, actingAdminId) {
  if (userId === actingAdminId && !isActive) {
    throw new AppError(400, 'CANNOT_SUSPEND_SELF', 'Admin ไม่สามารถระงับบัญชีตัวเองได้');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: userSelect,
  });
}

export async function listAdminDonations() {
  await expirePastDonations();
  return prisma.donation.findMany({
    include: adminDonationInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getAdminDonation(donationId) {
  await expirePastDonations();
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    include: adminDonationDetailInclude,
  });

  if (!donation) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }

  return donation;
}

export async function setDonationHidden(donationId, isHidden) {
  await expirePastDonations();
  const donation = await prisma.donation.findUnique({ where: { id: donationId } });
  if (!donation) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }

  return prisma.donation.update({
    where: { id: donationId },
    data: { isHidden },
    include: adminDonationInclude,
  });
}

export async function deleteDonationAsAdmin(donationId) {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    include: { images: true },
  });

  if (!donation) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }

  await prisma.donation.delete({ where: { id: donationId } });
  await Promise.all(
    donation.images.map((image) => unlink(imageDiskPath(image.imageUrl)).catch(() => {})),
  );
}

export async function listAdminReports() {
  await expirePastDonations();
  return prisma.report.findMany({
    include: adminReportInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getAdminReport(reportId) {
  await expirePastDonations();
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: adminReportInclude,
  });

  if (!report) {
    throw new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงาน');
  }

  return report;
}

export async function setReportStatus(reportId, status) {
  await expirePastDonations();
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงาน');
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status },
    include: adminReportInclude,
  });
}
