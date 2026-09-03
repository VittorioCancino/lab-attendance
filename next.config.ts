import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), clipboard-write=(self), geolocation=(), microphone=(), payment=(), usb=()',
  },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-XSS-Protection', value: '0' },
];
const noStoreHeaders = [{ key: 'Cache-Control', value: 'private, no-store' }];
const noStoreRoutes = [
  '/',
  '/admin/:path*',
  '/api/:path*',
  '/attendance/:path*',
  '/auth/:path*',
  '/display/:path*',
  '/invite/:path*',
  '/manager/:path*',
  '/scan/:path*',
];
const publicInstanceUrl = process.env.LAB_INSTANCE_PUBLIC_URL;
const allowedDevOrigins =
  process.env.NODE_ENV === 'development' && publicInstanceUrl !== undefined
    ? [new URL(publicInstanceUrl).hostname]
    : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins,
  headers() {
    return Promise.resolve([
      {
        headers: securityHeaders,
        source: '/:path*',
      },
      ...noStoreRoutes.map((source) => ({ headers: noStoreHeaders, source })),
    ]);
  },
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
