import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { pool, ensureReady } from '@/lib/db';
import { authConfig } from './auth.config';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        await ensureReady();
        const { rows } = await pool.query(
          'SELECT id, name, email, password FROM users WHERE email = $1',
          [email]
        );
        const user = rows[0];
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === 'credentials' && user?.id) {
        token.id = user.id;
      }

      if (account?.provider === 'google' && user?.email) {
        await ensureReady();
        const email = user.email;
        const name = user.name ?? email;

        const { rows } = await pool.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (rows.length > 0) {
          token.id = rows[0].id;
        } else {
          const id = crypto.randomUUID();
          await pool.query(
            'INSERT INTO users (id, name, email) VALUES ($1, $2, $3)',
            [id, name, email]
          );
          token.id = id;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
