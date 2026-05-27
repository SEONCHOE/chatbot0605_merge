import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const todo = await req.json();

    let babyId = todo.babyId;
    if (!babyId) {
      const [babies] = await pool.query<RowDataPacket[]>('SELECT id FROM babies LIMIT 1');
      if (babies.length === 0) return NextResponse.json({ error: 'No baby' }, { status: 404 });
      babyId = babies[0].id;
    }

    await pool.query(
      'INSERT INTO todos (id, baby_id, text, category, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [todo.id, babyId, todo.text, todo.category, todo.completed ? 1 : 0, todo.createdAt]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/todos]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
