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

    // 서버 레벨 중복 방지: 동일 baby_id + text 조합이 이미 있으면 skip
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM todos WHERE baby_id = ? AND text = ?',
      [babyId, todo.text]
    );
    if (existing.length > 0) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    await pool.query(
      'INSERT INTO todos (id, baby_id, text, category, completed, created_at, todo_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [todo.id, babyId, todo.text, todo.category, todo.completed ? 1 : 0, todo.createdAt, todo.date || null]
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/todos]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
