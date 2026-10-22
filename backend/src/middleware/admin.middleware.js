import { AppError } from '../utils/response.js';

export function requireAdmin(req, _res, next) {
  if (!req.user) {
    next(new AppError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ'));
    return;
  }

  if (req.user.role !== 'ADMIN') {
    next(new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้'));
    return;
  }

  next();
}
