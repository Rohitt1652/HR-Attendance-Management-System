/** @type {import('next').NextConfig} */

// /api and /uploads are proxied server-side via app/api/[...path]/route.js
// and app/uploads/[...path]/route.js — defaults to http://127.0.0.1:5000 (same server, no .env needed).

const nextConfig = {
  allowedDevOrigins: ['192.168.1.123'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
