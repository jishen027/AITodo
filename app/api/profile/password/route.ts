import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';

// PUT /api/profile/password — change the password for a credentials account.
// Requires the current password; Google accounts (no password) are rejected.
export async function PUT(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Both current and new passwords are required.' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
    }

    await ensureReady();
    const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.password) {
      return NextResponse.json(
        { error: 'Password change is not available for accounts that sign in with Google.' },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/profile/password:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
