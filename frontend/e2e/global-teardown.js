import { runFixtureCommand } from './fixture-runtime.js';

export default async function globalTeardown() {
  runFixtureCommand('cleanup');
}
