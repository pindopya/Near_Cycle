import { getDonationDrivingRoute } from '../services/map.service.js';
import { AppError } from '../utils/response.js';

function coordinate(value, min, max, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', `${name} ไม่ถูกต้อง`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${name} ไม่ถูกต้อง`);
  }
  return parsed;
}

export async function route(req, res, next) {
  try {
    const donationId = typeof req.query.donationId === 'string' ? req.query.donationId.trim() : '';
    if (!donationId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'donationId ไม่ถูกต้อง');
    }

    const input = {
      donationId,
      fromLat: coordinate(req.query.fromLat, -90, 90, 'fromLat'),
      fromLng: coordinate(req.query.fromLng, -180, 180, 'fromLng'),
    };

    res.json(await getDonationDrivingRoute(input));
  } catch (error) {
    next(error);
  }
}
