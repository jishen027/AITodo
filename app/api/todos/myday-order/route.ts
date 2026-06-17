import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';

// Persist the user's manual ordering of the My Day view. My Day spans plans, so
// this order can't live in the per-plan sort_order — it has its own column. The
// body is the full ordered list of todo ids; each is stamped with its index.
// Updates are scoped to the caller's own todos, so an id from another user is a
// no-op.
export async function PUT(request: Request) {
  await ensureReady();
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderedIds } = (await request.json()) as { orderedIds: string[] };
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE todos t SET my_day_order = $1
         FROM plans p
         WHERE t.id = $2 AND t.plan_id = p.id AND p.user_id = $3`,
        [i, orderedIds[i], userId]
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
