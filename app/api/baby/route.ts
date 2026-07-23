import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

function generateShareCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function getUserId(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: number })?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.id, b.name, b.birth_date, b.gender, b.share_code
       FROM babies b
       JOIN baby_users bu ON b.id = bu.baby_id
       WHERE bu.user_id = ?
       ORDER BY b.id ASC`,
      [userId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/baby]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, birthDate, gender } = await req.json();
    if (!name || !birthDate || !gender) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    let shareCode = generateShareCode();
    let retry = 0;
    while (retry < 5) {
      const [dup] = await pool.query<RowDataPacket[]>('SELECT id FROM babies WHERE share_code = ?', [shareCode]);
      if (dup.length === 0) break;
      shareCode = generateShareCode();
      retry++;
    }

    const [rows] = await pool.query<{ id: number }[]>(
      'INSERT INTO babies (name, birth_date, gender, user_id, share_code) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [name, birthDate, gender, userId, shareCode]
    );
    const babyId = rows[0].id;
    await pool.query('INSERT INTO baby_users (baby_id, user_id) VALUES (?, ?)', [babyId, userId]);

    return NextResponse.json({ id: babyId, shareCode }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/baby]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
