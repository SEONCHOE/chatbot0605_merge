import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { completed } = await req.json();
    await pool.query('UPDATE todos SET completed = ? WHERE id = ?', [completed ? 1 : 0, id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/todos/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM todos WHERE id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/todos/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
