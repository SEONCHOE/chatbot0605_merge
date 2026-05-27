import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const { name, birthDate, gender } = await req.json();
    if (!name || !birthDate || !gender) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM babies WHERE name = ?',
      [name]
    );
    if (existing.length > 0) {
      await pool.query(
        'UPDATE babies SET birth_date = ?, gender = ? WHERE id = ?',
        [birthDate, gender, existing[0].id]
      );
      return NextResponse.json({ id: existing[0].id });
    }

    const [result] = await pool.query(
      'INSERT INTO babies (name, birth_date, gender) VALUES (?, ?, ?)',
      [name, birthDate, gender]
    ) as [{ insertId: number }, unknown];
    return NextResponse.json({ id: result.insertId }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/baby]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
