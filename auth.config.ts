import type { NextAuthConfig } from 'next-auth';

// Edge-compatible config — no Node.js-only imports (no pg, no bcryptjs).
// Used by middleware.ts so it can run in the Edge Runtime.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
      const isPublicPage = pathname === '/';

      // API routes handle their own 401 — don't redirect them to the login page
      if (pathname.startsWith('/api')) return true;

      if (!isLoggedIn && !isAuthPage && !isPublicPage) return false;
      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL('/dashboard', request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [], // Real providers are added in auth.ts (Node.js only)
};
