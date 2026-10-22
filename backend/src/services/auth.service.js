import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';
import { AppError, publicUser } from '../utils/response.js';

const BCRYPT_ROUNDS = 12;

export async function registerUser({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'อีเมลนี้ถูกใช้งานแล้ว');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
    });

    return publicUser(user);
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'อีเมลนี้ถูกใช้งานแล้ว');
    }
    throw error;
  }
}

export async function authenticateUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }

  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'บัญชีนี้ถูกระงับการใช้งาน');
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }

  return publicUser(user);
}
