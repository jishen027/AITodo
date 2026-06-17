import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Use only the Edge-compatible config (no pg, no bcryptjs) in middleware
export default NextAuth(authConfig).auth;

export const config = {
  // Skip auth on framework internals AND on the public SEO/PWA surfaces and
  // static images — otherwise an unauthenticated crawler fetching /robots.txt,
  // /sitemap.xml, /opengraph-image, or the manifest gets redirected to /login,
  // which would hide them from search engines.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image|twitter-image|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)).*)',
  ],
};
