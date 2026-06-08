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
      `UPDATE logs SET type=?, log_date=?, start_time=?, end_time=?, log_time=?, amount=?, feed_type=?, color=?, reason=?, note=?
       WHERE id=?`,
      [
        log.type, log.date,
        log.startTime || null,
        log.endTime   || null,
        log.time      || null,
        log.amount    ?? null,
        log.feedType  || null,
        log.color     || null,
        log.reason    || null,
        log.note      || null,
        id,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    await pool.query(
      'UPDATE logs SET amount=?, note=? WHERE id=?',
      [body.amount ?? null, body.note ?? '', id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM logs WHERE id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/logs/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
