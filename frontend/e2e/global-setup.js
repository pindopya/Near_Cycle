import { runFixtureCommand } from './fixture-runtime.js';

export default async function globalSetup() {
  runFixtureCommand('setup');
}
