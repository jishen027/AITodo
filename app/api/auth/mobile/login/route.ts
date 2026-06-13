import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureReady } from '@/lib/db';
import { signMobileToken } from '@/lib/mobileAuth';

// Email/password login for native clients. Returns a Bearer token plus the user.
export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  await ensureReady();

  const { rows } = await pool.query(
    'SELECT id, name, email, password FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !user.password) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const token = await signMobileToken(user.id);
  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
}
