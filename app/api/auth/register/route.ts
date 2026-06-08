import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureReady } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  await ensureReady();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);
  const id = generateId();
  await pool.query(
    'INSERT INTO users (id, name, email, password) VALUES ($1, $2, $3, $4)',
    [id, name.trim(), email.toLowerCase(), hashed]
  );

  return NextResponse.json({ id, name: name.trim(), email: email.toLowerCase() }, { status: 201 });
}
