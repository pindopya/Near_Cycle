import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'ogtb_session';
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signAuthToken(user) {
  return jwt.sign(
    { role: user.role },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: AUTH_TOKEN_TTL_SECONDS,
      issuer: 'ogtb-donation-map',
      audience: 'ogtb-web',
    },
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret, {
    issuer: 'ogtb-donation-map',
    audience: 'ogtb-web',
  });
}
