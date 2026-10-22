import { authenticateUser, registerUser } from '../services/auth.service.js';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_TTL_SECONDS, signAuthToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: AUTH_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  };
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(req.validatedBody);
    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const user = await authenticateUser(req.validatedBody);
    const token = signAuthToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
  });
  res.status(204).send();
}

export function me(req, res) {
  res.json({ user: req.user });
}
