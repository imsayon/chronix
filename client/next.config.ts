import type { NextConfig } from "next";

const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const isDevelopment = process.env.NODE_ENV !== 'production';
const apiOrigin = (() => {
  try {
    const parsed = new URL(apiUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src 'self' ${apiOrigin}`.trim(),
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

export default nextConfig;
