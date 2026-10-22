import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/app.js';

let server;
let baseUrl;

test('setup security HTTP test', async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('security headers are enabled and framework header is hidden', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('malformed JSON returns 400 instead of internal server error', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email":',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_JSON');
});

test('oversized JSON returns 413', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1024) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'PAYLOAD_TOO_LARGE');
});

test('CORS does not grant a foreign origin', async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'https://evil.example' },
  });
  assert.notEqual(response.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('cleanup security HTTP test', async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
