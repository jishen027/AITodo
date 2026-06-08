import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { auth } from '@/auth';
import type { ChatMessage } from '@/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: planId } = await params;
  const body = (await request.json()) as ChatMessage | ChatMessage[];
  const messages = Array.isArray(body) ? body : [body];

  for (const msg of messages) {
    await pool.query(
      'INSERT INTO chat_messages (plan_id, role, text) VALUES ($1, $2, $3)',
      [planId, msg.role, msg.text]
    );
  }

  return NextResponse.json({ ok: true });
}
