import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { auth } from '@/auth';
import type { Plan, Todo, Step, ChatMessage } from '@/types';

async function getUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureReady();

    const [plansRes, todosRes, stepsRes, chatRes] = await Promise.all([
      pool.query('SELECT id, title, is_my_day FROM plans WHERE user_id = $1 ORDER BY created_at ASC', [userId]),
      pool.query(
        `SELECT t.id, t.plan_id, t.text, t.completed, t.notes, t.due_date, t.due_time, t.priority,
                t.location, t.location_lat, t.location_lng, t.my_day, t.created_at, t.sort_order
         FROM todos t JOIN plans p ON p.id = t.plan_id WHERE p.user_id = $1 ORDER BY t.plan_id, t.sort_order ASC`,
        [userId]
      ),
      pool.query(
        `SELECT s.id, s.todo_id, s.text, s.completed, s.sort_order
         FROM steps s JOIN todos t ON t.id = s.todo_id JOIN plans p ON p.id = t.plan_id
         WHERE p.user_id = $1 ORDER BY s.todo_id, s.sort_order ASC`,
        [userId]
      ),
      pool.query(
        `SELECT cm.plan_id, cm.role, cm.text
         FROM chat_messages cm JOIN plans p ON p.id = cm.plan_id
         WHERE p.user_id = $1 ORDER BY cm.plan_id, cm.created_at ASC`,
        [userId]
      ),
    ]);

    const stepsByTodo = new Map<string, Step[]>();
    for (const r of stepsRes.rows) {
      const list = stepsByTodo.get(r.todo_id) ?? [];
      list.push({ id: r.id, text: r.text, completed: r.completed });
      stepsByTodo.set(r.todo_id, list);
    }

    const todosByPlan = new Map<string, Todo[]>();
    for (const r of todosRes.rows) {
      const list = todosByPlan.get(r.plan_id) ?? [];
      list.push({
        id: r.id,
        text: r.text,
        completed: r.completed,
        notes: r.notes,
        dueDate: r.due_date,
        dueTime: r.due_time,
        priority: r.priority,
        location: r.location,
        locationLat: r.location_lat,
        locationLng: r.location_lng,
        myDay: r.my_day,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        steps: stepsByTodo.get(r.id) ?? [],
      });
      todosByPlan.set(r.plan_id, list);
    }

    const chatByPlan = new Map<string, ChatMessage[]>();
    for (const r of chatRes.rows) {
      const list = chatByPlan.get(r.plan_id) ?? [];
      list.push({ role: r.role, text: r.text });
      chatByPlan.set(r.plan_id, list);
    }

    const plans: Plan[] = plansRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      isMyDay: r.is_my_day,
      todos: todosByPlan.get(r.id) ?? [],
      chat: chatByPlan.get(r.id) ?? [],
    }));

    return NextResponse.json(plans);
  } catch (e) {
    console.error('GET /api/plans:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureReady();
  const body = (await request.json()) as Plan;
  const { id, title, chat, isMyDay } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO plans (id, title, user_id, is_my_day) VALUES ($1, $2, $3, $4)',
      [id, title, userId, isMyDay ?? false]
    );
    for (const msg of chat ?? []) {
      await client.query(
        'INSERT INTO chat_messages (plan_id, role, text) VALUES ($1, $2, $3)',
        [id, msg.role, msg.text]
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ id, title, isMyDay: isMyDay ?? false, todos: [], chat: chat ?? [] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
