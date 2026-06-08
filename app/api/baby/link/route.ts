import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: number })?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { babyId } = await req.json();
    if (!babyId) return NextResponse.json({ error: 'Missing babyId' }, { status: 400 });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, birth_date, gender, share_code FROM babies WHERE id = ?',
      [babyId]
    );
    if (rows.length === 0) return NextResponse.json({ error: 'Baby not found' }, { status: 404 });

    const baby = rows[0];

    let shareCode = baby.share_code;
    if (!shareCode) {
      shareCode = generateShareCode();
      await pool.query('UPDATE babies SET share_code = ?, user_id = ? WHERE id = ?', [shareCode, userId, baby.id]);
    } else {
      await pool.query('UPDATE babies SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, baby.id]);
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM baby_users WHERE baby_id = ? AND user_id = ?',
      [baby.id, userId]
    );
    if (existing.length === 0) {
      await pool.query('INSERT INTO baby_users (baby_id, user_id) VALUES (?, ?)', [baby.id, userId]);
    }

    return NextResponse.json({ id: baby.id, name: baby.name, birth_date: baby.birth_date, gender: baby.gender, share_code: shareCode });
  } catch (err) {
    console.error('[POST /api/baby/link]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
