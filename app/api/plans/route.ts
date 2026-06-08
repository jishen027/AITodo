import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { auth } from '@/auth';
import type { Plan, Todo, Step, ChatMessage } from '@/types';

async function getUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureReady();

  const [plansRes, todosRes, stepsRes, chatRes] = await Promise.all([
    pool.query('SELECT id, title FROM plans WHERE user_id = $1 ORDER BY created_at ASC', [userId]),
    pool.query(
      `SELECT t.id, t.plan_id, t.text, t.completed, t.notes, t.due_date, t.due_time, t.priority, t.sort_order
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
    todos: todosByPlan.get(r.id) ?? [],
    chat: chatByPlan.get(r.id) ?? [],
  }));

  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureReady();
  const body = (await request.json()) as Plan;
  const { id, title, chat } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO plans (id, title, user_id) VALUES ($1, $2, $3)', [id, title, userId]);
    for (const msg of chat ?? []) {
      await client.query(
        'INSERT INTO chat_messages (plan_id, role, text) VALUES ($1, $2, $3)',
        [id, msg.role, msg.text]
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ id, title, todos: [], chat: chat ?? [] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
