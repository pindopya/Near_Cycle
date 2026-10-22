import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/database.js';
import { authenticateUser, registerUser } from '../src/services/auth.service.js';
import { signAuthToken, verifyAuthToken } from '../src/utils/jwt.js';

const email = `auth-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`;
const password = randomBytes(18).toString('base64url');
let user;

test('register creates a USER without exposing passwordHash', async () => {
  user = await registerUser({ name: 'Auth Test User', email, password });
  assert.equal(user.email, email);
  assert.equal(user.role, 'USER');
  assert.equal(Object.hasOwn(user, 'passwordHash'), false);
});

test('login accepts the registered credentials', async () => {
  const loggedIn = await authenticateUser({ email, password });
  assert.equal(loggedIn.id, user.id);
});

test('JWT keeps user id and role', () => {
  const token = signAuthToken(user);
  const payload = verifyAuthToken(token);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.role, 'USER');
});

test('cleanup auth test user', async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});
