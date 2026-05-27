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
      'INSERT INTO health_logs (id, baby_id, type, detail, log_date, log_time) VALUES (?, ?, ?, ?, ?, ?)',
      [log.id, babyId, log.type, log.detail, log.date, log.time]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/health/logs]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
