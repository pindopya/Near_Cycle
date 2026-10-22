import {
  deleteDonationAsAdmin,
  getAdminDonation,
  getAdminReport,
  listAdminDonations,
  listAdminReports,
  listAdminUsers,
  setDonationHidden,
  setReportStatus,
  setUserActive,
} from '../services/admin.service.js';
import { AppError } from '../utils/response.js';

function booleanBody(value, field) {
  if (typeof value !== 'boolean') {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} ต้องเป็น boolean`);
  }
  return value;
}

function reportStatus(value) {
  if (!['PENDING', 'RESOLVED'].includes(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status ต้องเป็น PENDING หรือ RESOLVED');
  }
  return value;
}

export async function users(_req, res, next) {
  try {
    res.json(await listAdminUsers());
  } catch (error) {
    next(error);
  }
}

export async function updateUserStatus(req, res, next) {
  try {
    const isActive = booleanBody(req.body?.isActive, 'isActive');
    res.json(await setUserActive(req.params.id, isActive, req.user.id));
  } catch (error) {
    next(error);
  }
}

export async function donations(_req, res, next) {
  try {
    res.json(await listAdminDonations());
  } catch (error) {
    next(error);
  }
}

export async function donationDetail(req, res, next) {
  try {
    res.json(await getAdminDonation(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function updateDonationVisibility(req, res, next) {
  try {
    const isHidden = booleanBody(req.body?.isHidden, 'isHidden');
    res.json(await setDonationHidden(req.params.id, isHidden));
  } catch (error) {
    next(error);
  }
}

export async function removeDonation(req, res, next) {
  try {
    await deleteDonationAsAdmin(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function reports(_req, res, next) {
  try {
    res.json(await listAdminReports());
  } catch (error) {
    next(error);
  }
}

export async function reportDetail(req, res, next) {
  try {
    res.json(await getAdminReport(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function updateReport(req, res, next) {
  try {
    res.json(await setReportStatus(req.params.id, reportStatus(req.body?.status)));
  } catch (error) {
    next(error);
  }
}
