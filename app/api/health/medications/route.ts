import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const med = await req.json();

    let babyId = med.babyId;
    if (!babyId) {
      const [babies] = await pool.query<RowDataPacket[]>('SELECT id FROM babies LIMIT 1');
      if (babies.length === 0) return NextResponse.json({ error: 'No baby' }, { status: 404 });
      babyId = babies[0].id;
    }

    await pool.query(
      'INSERT INTO medications (id, baby_id, name, dose, freq, note, prescribed_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [med.id, babyId, med.name, med.dose || null, med.freq || null, med.note || null, med.date || null]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/health/medications]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
