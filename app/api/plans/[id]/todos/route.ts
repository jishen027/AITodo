import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
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

    // todos.id and steps.id are GLOBAL primary keys, but AI-generated plans reuse
    // terse ids ("t10"/"s1") that repeat across plans — so an incoming id can
    // collide with a row in ANOTHER plan, not just within this payload. After
    // clearing this plan's rows, seed the "used" sets with every id still in the
    // tables (i.e. other plans') plus what we insert here, and give any colliding
    // or blank id a fresh unique one. This way a single clash can't roll back the
    // whole save (which silently dropped the user's plan).
    const usedTodoIds = new Set<string>(
      (await client.query('SELECT id FROM todos')).rows.map((r) => r.id as string)
    );
    const usedStepIds = new Set<string>(
      (await client.query('SELECT id FROM steps')).rows.map((r) => r.id as string)
    );

    for (let i = 0; i < todos.length; i++) {
      const t = todos[i];
      const todoId = !t.id || usedTodoIds.has(t.id) ? randomUUID() : t.id;
      usedTodoIds.add(todoId);
      // Preserve an explicit completedAt; otherwise stamp NOW() for a task that's
      // completed but has no timestamp yet, and NULL for incomplete tasks.
      const completedAt = t.completed ? (t.completedAt ?? new Date().toISOString()) : null;
      await client.query(
        `INSERT INTO todos (id, plan_id, text, completed, notes, due_date, due_time, priority, location, location_lat, location_lng, my_day, my_day_order, created_at, completed_at, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14::timestamptz, NOW()), $15::timestamptz, $16)`,
        [todoId, planId, t.text, t.completed, t.notes, t.dueDate, t.dueTime, t.priority, t.location ?? '', t.locationLat ?? null, t.locationLng ?? null, t.myDay ?? false, t.myDayOrder ?? 0, t.createdAt ?? null, completedAt, i]
      );
      for (let j = 0; j < (t.steps ?? []).length; j++) {
        const s = t.steps[j];
        // Reference the (possibly regenerated) todoId so the FK never orphans.
        const stepId = !s.id || usedStepIds.has(s.id) ? randomUUID() : s.id;
        usedStepIds.add(stepId);
        await client.query(
          'INSERT INTO steps (id, todo_id, text, completed, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [stepId, todoId, s.text, s.completed, j]
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
