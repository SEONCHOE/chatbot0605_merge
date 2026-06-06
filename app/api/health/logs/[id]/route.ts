import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const log = await req.json();
    await pool.query(
      'UPDATE health_logs SET type=?, detail=?, log_date=?, log_time=? WHERE id=?',
      [log.type, log.detail, log.date, log.time, id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/health/logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM health_logs WHERE id=?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/health/logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
