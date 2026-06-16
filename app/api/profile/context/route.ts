import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';

// Cap the stored context so a single user can't bloat every AI prompt.
const MAX_CONTEXT_LENGTH = 4000;

// GET /api/profile/context — the authenticated user's personal context blurb.
export async function GET(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureReady();
    const { rows } = await pool.query(
      'SELECT personal_context FROM users WHERE id = $1',
      [userId]
    );
    if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ personalContext: rows[0].personal_context ?? '' });
  } catch (e) {
    console.error('GET /api/profile/context:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/profile/context — replace the user's personal context.
export async function PUT(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { personalContext } = await request.json();
    if (typeof personalContext !== 'string') {
      return NextResponse.json({ error: 'personalContext must be a string.' }, { status: 400 });
    }
    const trimmed = personalContext.trim();
    if (trimmed.length > MAX_CONTEXT_LENGTH) {
      return NextResponse.json(
        { error: `Context is too long (max ${MAX_CONTEXT_LENGTH} characters).` },
        { status: 400 }
      );
    }

    await ensureReady();
    await pool.query('UPDATE users SET personal_context = $1 WHERE id = $2', [trimmed, userId]);

    return NextResponse.json({ personalContext: trimmed });
  } catch (e) {
    console.error('PUT /api/profile/context:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
