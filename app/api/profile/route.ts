import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';

// GET /api/profile — the authenticated user's account details + task stats.
export async function GET(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureReady();

    const [userRes, planRes, todoRes] = await Promise.all([
      pool.query('SELECT id, name, email, password, created_at FROM users WHERE id = $1', [userId]),
      // Exclude the hidden "My Day" backing plan from the visible plan count.
      pool.query('SELECT COUNT(*)::int AS count FROM plans WHERE user_id = $1 AND is_my_day = FALSE', [userId]),
      pool.query(
        `SELECT
           COUNT(*)::int                                  AS total,
           COUNT(*) FILTER (WHERE t.completed)::int       AS completed
         FROM todos t JOIN plans p ON p.id = t.plan_id
         WHERE p.user_id = $1`,
        [userId]
      ),
    ]);

    const user = userRes.rows[0];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const total = todoRes.rows[0].total as number;
    const completed = todoRes.rows[0].completed as number;

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at,
      // A null password means the account was created via Google OAuth.
      authMethod: user.password ? 'credentials' : 'google',
      stats: {
        plans: planRes.rows[0].count as number,
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: total - completed,
      },
    });
  } catch (e) {
    console.error('GET /api/profile:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/profile — update the display name.
export async function PATCH(request: Request) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name } = await request.json();
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }
    if (trimmed.length > 255) {
      return NextResponse.json({ error: 'Name is too long (max 255 characters).' }, { status: 400 });
    }

    await ensureReady();
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [trimmed, userId]);

    return NextResponse.json({ name: trimmed });
  } catch (e) {
    console.error('PATCH /api/profile:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
