import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const rec = await req.json();

    let babyId = rec.babyId;
    if (!babyId) {
      const [babies] = await pool.query<RowDataPacket[]>('SELECT id FROM babies LIMIT 1');
      if (babies.length === 0) return NextResponse.json({ error: 'No baby' }, { status: 404 });
      babyId = babies[0].id;
    }

    await pool.query(
      'INSERT INTO growth_records (id, baby_id, record_date, height, weight) VALUES (?, ?, ?, ?, ?)',
      [rec.id, babyId, rec.date, rec.height ?? null, rec.weight ?? null]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/growth]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
