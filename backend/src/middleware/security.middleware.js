import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

function rateLimitResponse(_req, res) {
  res.status(429).json({
    error: 'TOO_MANY_REQUESTS',
    message: 'มีการเรียกใช้งานมากเกินไป กรุณาลองใหม่ภายหลัง',
  });
}

function e2eAwareRateLimit(options) {
  const limiter = rateLimit(options);

  return (req, res, next) => {
    if (env.disableRateLimitForE2e) {
      next();
      return;
    }
    limiter(req, res, next);
  };
}

export const apiRateLimiter = e2eAwareRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse,
});

export const authRateLimiter = e2eAwareRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse,
});

export const reportRateLimiter = e2eAwareRateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitResponse,
});
