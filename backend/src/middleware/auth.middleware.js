import { prisma } from '../config/database.js';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/jwt.js';
import { AppError, publicUser } from '../utils/response.js';

function getToken(req) {
  if (req.cookies?.[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }

  const authorization = req.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  return null;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');
    }

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      throw new AppError(401, 'INVALID_SESSION', 'Session ไม่ถูกต้องหรือหมดอายุ');
    }

    if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string') {
      throw new AppError(401, 'INVALID_SESSION', 'Session ไม่ถูกต้องหรือหมดอายุ');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_SESSION', 'ไม่พบบัญชีผู้ใช้ที่ใช้งานได้');
    }

    req.user = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}
