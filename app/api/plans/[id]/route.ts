import { NextResponse } from 'next/server';
import { pool, ensureReady } from '@/lib/db';
import { resolveUserId } from '@/lib/mobileAuth';

async function verifyOwnership(planId: string, req: Request): Promise<string | null> {
  const userId = await resolveUserId(req);
  if (!userId) return null;
  const { rows } = await pool.query(
    'SELECT id FROM plans WHERE id = $1 AND user_id = $2',
    [planId, userId]
  );
  return rows.length > 0 ? userId : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const owner = await verifyOwnership(id, request);
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title } = await request.json();
  await pool.query('UPDATE plans SET title = $1 WHERE id = $2', [title, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureReady();
  const { id } = await params;
  const owner = await verifyOwnership(id, request);
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await pool.query('DELETE FROM plans WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
