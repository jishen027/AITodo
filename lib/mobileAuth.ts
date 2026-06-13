import { SignJWT, jwtVerify } from 'jose';
import { auth } from '@/auth';

// Mobile clients can't easily obtain the NextAuth httpOnly session cookie, so
// they authenticate with a Bearer JWT instead. The token is signed with the
// same AUTH_SECRET NextAuth uses, carrying the user id as the `sub` claim.

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me'
);

const MOBILE_TOKEN_TTL = '30d';

export async function signMobileToken(userId: string): Promise<string> {
  return new SignJWT({ scope: 'mobile' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(MOBILE_TOKEN_TTL)
    .sign(secret);
}

async function userIdFromBearer(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7).trim(), secret);
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated user id from either a mobile Bearer token (when a
 * Request is supplied) or the NextAuth session cookie (web). Returns null when
 * neither is present/valid.
 */
export async function resolveUserId(req?: Request): Promise<string | null> {
  if (req) {
    const fromBearer = await userIdFromBearer(req);
    if (fromBearer) return fromBearer;
  }
  const session = await auth();
  return session?.user?.id ?? null;
}
