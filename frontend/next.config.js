import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';

const nextConfig = {
  // Pin the project root: a stray package-lock.json in a parent/home folder otherwise makes
  // Turbopack pick the wrong root and fail on node_modules CSS assets (leaflet images/*.png).
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  // Don't write AGENTS.md into the project on every `next dev`.
  agentRules: false,
  // Next 16.4 can stop `next dev` (exit 0, no error) to show an upgrade recommendation; never in this app.
  experimental: { agentUpgrade: false },
  // HTTPS quick tunnels proxy the development server through a *.trycloudflare.com
  // hostname. Allow that origin so Next.js HMR/WebSocket requests are not blocked.
  allowedDevOrigins: ['**.trycloudflare.com'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendInternalUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendInternalUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
