import { ReportReason } from '@prisma/client';
import { AppError } from '../utils/response.js';

const MAX_DESCRIPTION = 1000;
const ALLOWED_REASONS = new Set(Object.values(ReportReason));

export function validateCreateReport(req, _res, next) {
  try {
    const { reason, description } = req.body || {};

    if (!ALLOWED_REASONS.has(reason)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'reason ไม่ถูกต้อง');
    }

    let normalizedDescription = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.trim().length > MAX_DESCRIPTION) {
        throw new AppError(400, 'VALIDATION_ERROR', `description ต้องไม่เกิน ${MAX_DESCRIPTION} ตัวอักษร`);
      }
      normalizedDescription = description.trim() || null;
    }

    req.validatedBody = {
      reason,
      description: normalizedDescription,
    };
    next();
  } catch (error) {
    next(error);
  }
}
