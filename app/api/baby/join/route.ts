import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: number })?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { shareCode } = await req.json();
    if (!shareCode) return NextResponse.json({ error: 'Missing shareCode' }, { status: 400 });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, birth_date, gender, share_code FROM babies WHERE share_code = ?',
      [shareCode.toUpperCase().trim()]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: '코드를 찾을 수 없어요. 다시 확인해주세요.' }, { status: 404 });
    }

    const baby = rows[0];

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM baby_users WHERE baby_id = ? AND user_id = ?',
      [baby.id, userId]
    );
    if (existing.length === 0) {
      await pool.query('INSERT INTO baby_users (baby_id, user_id) VALUES (?, ?)', [baby.id, userId]);
    }

    return NextResponse.json({ id: baby.id, name: baby.name, birth_date: baby.birth_date, gender: baby.gender, share_code: baby.share_code });
  } catch (err) {
    console.error('[POST /api/baby/join]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
