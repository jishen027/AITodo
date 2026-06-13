import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { auth } from '@/auth';
import type { Todo } from '@/types';

async function getAuthUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  await ensureReady();
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { todoId } = await params;
  const updates = (await request.json()) as Partial<Todo>;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.text !== undefined)      { fields.push(`text = $${idx++}`);      values.push(updates.text); }
    if (updates.completed !== undefined) { fields.push(`completed = $${idx++}`); values.push(updates.completed); }
    if (updates.notes !== undefined)     { fields.push(`notes = $${idx++}`);     values.push(updates.notes); }
    if (updates.dueDate !== undefined)   { fields.push(`due_date = $${idx++}`);  values.push(updates.dueDate); }
    if (updates.dueTime !== undefined)   { fields.push(`due_time = $${idx++}`);  values.push(updates.dueTime); }
    if (updates.priority !== undefined)  { fields.push(`priority = $${idx++}`);  values.push(updates.priority); }
    if (updates.location !== undefined)  { fields.push(`location = $${idx++}`);  values.push(updates.location); }
    if (updates.locationLat !== undefined) { fields.push(`location_lat = $${idx++}`); values.push(updates.locationLat); }
    if (updates.locationLng !== undefined) { fields.push(`location_lng = $${idx++}`); values.push(updates.locationLng); }
    if (updates.myDay !== undefined)     { fields.push(`my_day = $${idx++}`);     values.push(updates.myDay); }

    if (fields.length > 0) {
      values.push(todoId);
      await client.query(`UPDATE todos SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }

    if (updates.steps !== undefined) {
      await client.query('DELETE FROM steps WHERE todo_id = $1', [todoId]);
      for (let j = 0; j < updates.steps.length; j++) {
        const s = updates.steps[j];
        await client.query(
          'INSERT INTO steps (id, todo_id, text, completed, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [s.id, todoId, s.text, s.completed, j]
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ todoId: string }> }
) {
  await ensureReady();
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { todoId } = await params;
  await pool.query('DELETE FROM todos WHERE id = $1', [todoId]);
  return NextResponse.json({ ok: true });
}
