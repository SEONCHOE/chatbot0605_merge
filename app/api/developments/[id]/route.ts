import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: milestoneId } = await params;
    const body = await req.json();
    const { completed } = body;

    let babyId = body.babyId;
    if (!babyId) {
      const [babies] = await pool.query<RowDataPacket[]>('SELECT id FROM babies LIMIT 1');
      if (babies.length === 0) return NextResponse.json({ error: 'No baby' }, { status: 404 });
      babyId = babies[0].id;
    }

    await pool.query(
      `INSERT INTO developments (baby_id, milestone_id, completed)
       VALUES (?, ?, ?)
       ON CONFLICT (baby_id, milestone_id) DO UPDATE SET completed = EXCLUDED.completed`,
      [babyId, milestoneId, completed ? 1 : 0]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/developments/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
