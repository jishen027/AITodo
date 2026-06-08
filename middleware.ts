import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Use only the Edge-compatible config (no pg, no bcryptjs) in middleware
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
