import { parseBangkokDateOnly } from '../utils/date.js';
import { AppError } from '../utils/response.js';

const MAX_TITLE = 120;
const MAX_CATEGORY = 60;
const MAX_DESCRIPTION = 2000;
const MAX_ADDRESS = 500;

function parseDate(value, field, { endOfDay = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} ต้องเป็นวันที่ที่ถูกต้อง`);
  }

  const normalized = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);

  if (dateOnly) {
    const date = parseBangkokDateOnly(normalized, { endOfDay });
    if (!date) {
      throw new AppError(400, 'VALIDATION_ERROR', `${field} ต้องเป็นวันที่ที่ถูกต้อง`);
    }
    return date;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} ต้องเป็นวันที่ที่ถูกต้อง`);
  }
  return date;
}

function validateCommon(body, { partial = false } = {}) {
  const output = {};
  const required = (key) => !partial && body[key] === undefined;

  if (required('title')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุชื่อสิ่งของ');
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > MAX_TITLE) {
      throw new AppError(400, 'VALIDATION_ERROR', `title ต้องมีความยาว 1-${MAX_TITLE} ตัวอักษร`);
    }
    output.title = body.title.trim();
  }

  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.trim().length > MAX_DESCRIPTION)) {
      throw new AppError(400, 'VALIDATION_ERROR', `description ต้องไม่เกิน ${MAX_DESCRIPTION} ตัวอักษร`);
    }
    output.description = body.description === null ? null : body.description.trim() || null;
  }

  if (required('category')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุประเภทของบริจาค');
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !body.category.trim() || body.category.trim().length > MAX_CATEGORY) {
      throw new AppError(400, 'VALIDATION_ERROR', `category ต้องมีความยาว 1-${MAX_CATEGORY} ตัวอักษร`);
    }
    output.category = body.category.trim();
  }

  if (required('quantity')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุจำนวน');
  if (body.quantity !== undefined) {
    if (!Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'quantity ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
    }
    output.quantity = body.quantity;
  }

  if (required('latitude')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุ latitude');
  if (body.latitude !== undefined) {
    if (typeof body.latitude !== 'number' || !Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90) {
      throw new AppError(400, 'VALIDATION_ERROR', 'latitude ต้องอยู่ระหว่าง -90 ถึง 90');
    }
    output.latitude = body.latitude;
  }

  if (required('longitude')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุ longitude');
  if (body.longitude !== undefined) {
    if (typeof body.longitude !== 'number' || !Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180) {
      throw new AppError(400, 'VALIDATION_ERROR', 'longitude ต้องอยู่ระหว่าง -180 ถึง 180');
    }
    output.longitude = body.longitude;
  }

  if (body.address !== undefined) {
    if (body.address !== null && (typeof body.address !== 'string' || body.address.trim().length > MAX_ADDRESS)) {
      throw new AppError(400, 'VALIDATION_ERROR', `address ต้องไม่เกิน ${MAX_ADDRESS} ตัวอักษร`);
    }
    output.address = body.address === null ? null : body.address.trim() || null;
  }

  if (required('startDate')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุวันที่เริ่มบริจาค');
  if (body.startDate !== undefined) output.startDate = parseDate(body.startDate, 'startDate');

  if (required('endDate')) throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุวันที่สิ้นสุด');
  if (body.endDate !== undefined) output.endDate = parseDate(body.endDate, 'endDate', { endOfDay: true });

  if (output.startDate && output.endDate && output.startDate > output.endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startDate ต้องไม่เกิน endDate');
  }

  return output;
}

export function validateCreateDonation(req, _res, next) {
  try {
    req.validatedBody = validateCommon(req.body);
    next();
  } catch (error) {
    next(error);
  }
}

export function validateUpdateDonation(req, _res, next) {
  try {
    const validated = validateCommon(req.body, { partial: true });
    if (Object.keys(validated).length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ไม่มีข้อมูลที่อนุญาตให้แก้ไข');
    }
    req.validatedBody = validated;
    next();
  } catch (error) {
    next(error);
  }
}

export function validateNearbySearch(req, _res, next) {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const radiusKm = req.query.radius === undefined ? 5 : Number(req.query.radius);
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new AppError(400, 'VALIDATION_ERROR', 'lat ต้องอยู่ระหว่าง -90 ถึง 90');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new AppError(400, 'VALIDATION_ERROR', 'lng ต้องอยู่ระหว่าง -180 ถึง 180');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500) {
      throw new AppError(400, 'VALIDATION_ERROR', 'radius ต้องมากกว่า 0 และไม่เกิน 500 กิโลเมตร');
    }
    if (category.length > MAX_CATEGORY) {
      throw new AppError(400, 'VALIDATION_ERROR', `category ต้องไม่เกิน ${MAX_CATEGORY} ตัวอักษร`);
    }

    req.validatedQuery = {
      latitude,
      longitude,
      radiusKm,
      category: category || undefined,
    };
    next();
  } catch (error) {
    next(error);
  }
}
