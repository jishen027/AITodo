import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';
import type { Todo } from '@/types';

async function isOwner(planId: string, req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return false;
  const { rows } = await pool.query('SELECT id FROM plans WHERE id = $1 AND user_id = $2', [planId, userId]);
  return rows.length > 0;
}

// Replace all todos for a plan (used after AI updates or manual add).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id: planId } = await params;
  if (!(await isOwner(planId, request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { todos } = (await request.json()) as { todos: Todo[] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM todos WHERE plan_id = $1', [planId]);
    for (let i = 0; i < todos.length; i++) {
      const t = todos[i];
      await client.query(
        `INSERT INTO todos (id, plan_id, text, completed, notes, due_date, due_time, priority, location, location_lat, location_lng, my_day, created_at, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()), $14)`,
        [t.id, planId, t.text, t.completed, t.notes, t.dueDate, t.dueTime, t.priority, t.location ?? '', t.locationLat ?? null, t.locationLng ?? null, t.myDay ?? false, t.createdAt ?? null, i]
      );
      for (let j = 0; j < (t.steps ?? []).length; j++) {
        const s = t.steps[j];
        await client.query(
          'INSERT INTO steps (id, todo_id, text, completed, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [s.id, t.id, s.text, s.completed, j]
        );
      }
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
