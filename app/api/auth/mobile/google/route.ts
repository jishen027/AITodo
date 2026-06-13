import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { signMobileToken } from '@/lib/mobileAuth';

// Allowed Google OAuth client IDs (the token's `aud`). The mobile app uses its
// own iOS/Android/Web client IDs; the web app uses AUTH_GOOGLE_ID. Configure
// GOOGLE_MOBILE_CLIENT_IDS (comma-separated) for the native client IDs.
function allowedAudiences(): string[] {
  const ids = [
    process.env.AUTH_GOOGLE_ID,
    ...(process.env.GOOGLE_MOBILE_CLIENT_IDS ?? '').split(','),
  ];
  return ids.map((s) => s?.trim()).filter((s): s is string => !!s);
}

interface TokenInfo {
  aud: string;
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
}

// Native clients sign in with Google, then POST the resulting id_token here.
export async function POST(request: Request) {
  const { idToken } = await request.json();
  if (!idToken) {
    return NextResponse.json({ error: 'Missing idToken.' }, { status: 400 });
  }

  // Verify the token with Google (no extra dependency needed).
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    return NextResponse.json({ error: 'Invalid Google token.' }, { status: 401 });
  }
  const info = (await res.json()) as TokenInfo;

  const email = info.email?.toLowerCase();
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!email || !verified) {
    return NextResponse.json({ error: 'Google account email not verified.' }, { status: 401 });
  }

  const allowed = allowedAudiences();
  if (allowed.length > 0 && !allowed.includes(info.aud)) {
    return NextResponse.json({ error: 'Token audience not allowed.' }, { status: 401 });
  }

  await ensureReady();

  // Find or create the user — mirrors the NextAuth google jwt callback.
  const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  let user = rows[0];
  if (!user) {
    const id = crypto.randomUUID();
    const name = info.name ?? email;
    await pool.query('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [id, name, email]);
    user = { id, name, email };
  }

  const token = await signMobileToken(user.id);
  return NextResponse.json({ token, user: { id: user.id, name: user.name, email: user.email } });
}
