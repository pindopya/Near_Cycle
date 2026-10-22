import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests`);
  return value;
}

export function runFixtureCommand(action) {
  const args = [
    'compose',
    'exec',
    '-T',
    '-e',
    'E2E_FIXTURES_ENABLED=true',
  ];

  if (action === 'setup') {
    args.push(
      '-e',
      `E2E_USER_PASSWORD=${requiredEnv('E2E_USER_PASSWORD')}`,
      '-e',
      `E2E_ADMIN_PASSWORD=${requiredEnv('E2E_ADMIN_PASSWORD')}`,
    );
  }

  args.push(
    'backend',
    'npm',
    'run',
    action === 'setup' ? 'e2e:fixtures:setup' : 'e2e:fixtures:cleanup',
  );

  execFileSync('docker', args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}
