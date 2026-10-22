import { AppError } from '../utils/response.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `ไม่พบ endpoint ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'INVALID_JSON',
      message: 'JSON ไม่ถูกต้อง',
    });
    return;
  }

  if (error?.type === 'entity.too.large') {
    res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด',
    });
    return;
  }

  if (error?.status === 404) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'ไม่พบข้อมูลที่ร้องขอ',
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'เกิดข้อผิดพลาดภายในระบบ',
  });
}
