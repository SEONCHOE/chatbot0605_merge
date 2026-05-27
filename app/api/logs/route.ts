import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const log = await req.json();

    let babyId = log.babyId;
    if (!babyId) {
      const [babies] = await pool.query<RowDataPacket[]>('SELECT id FROM babies LIMIT 1');
      if (babies.length === 0) return NextResponse.json({ error: 'No baby' }, { status: 404 });
      babyId = babies[0].id;
    }

    await pool.query(
      `INSERT INTO logs (id, baby_id, type, log_date, start_time, end_time, log_time, amount, feed_type, color, reason, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id, babyId, log.type, log.date,
        log.startTime || null,
        log.endTime   || null,
        log.time      || null,
        log.amount    ?? null,
        log.feedType  || null,
        log.color     || null,
        log.reason    || null,
        log.note      || null,
      ]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/logs]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
