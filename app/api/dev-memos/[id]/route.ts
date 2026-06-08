import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { date, text } = await req.json();
    await pool.query(
      'UPDATE dev_memos SET memo_date = ?, text = ? WHERE id = ?',
      [date, text, id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/dev-memos/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM dev_memos WHERE id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/dev-memos/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
