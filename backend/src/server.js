import net from 'node:net';
import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
// Node 24's automatic address-family selection can intermittently time out
// against the public OSRM endpoint from inside Docker. Keep this workaround
// opt-in so other environments and outbound services retain Node's defaults.
if (env.disableAutoSelectFamily && typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

async function start() {
  await connectDatabase();

  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(async (error) => {
  console.error('Failed to start API:', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
