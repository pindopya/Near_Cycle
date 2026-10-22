/** @type {import('next').NextConfig} */
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';

const nextConfig = {
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
