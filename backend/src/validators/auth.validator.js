import { AppError } from '../utils/response.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validationError(fields) {
  return new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', fields);
}

export function validateRegister(req, _res, next) {
  const { name, email, password } = req.body ?? {};
  const fields = {};

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    fields.name = 'ชื่อต้องมีความยาว 2-80 ตัวอักษร';
  }

  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    fields.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    fields.password = 'รหัสผ่านต้องมีความยาว 8-72 ตัวอักษร';
  }

  if (Object.keys(fields).length > 0) {
    next(validationError(fields));
    return;
  }

  req.validatedBody = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
  next();
}

export function validateLogin(req, _res, next) {
  const { email, password } = req.body ?? {};
  const fields = {};

  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    fields.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  }

  if (typeof password !== 'string' || password.length === 0 || password.length > 72) {
    fields.password = 'กรุณากรอกรหัสผ่าน';
  }

  if (Object.keys(fields).length > 0) {
    next(validationError(fields));
    return;
  }

  req.validatedBody = {
    email: email.trim().toLowerCase(),
    password,
  };
  next();
}
