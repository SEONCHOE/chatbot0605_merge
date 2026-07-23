import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

async function ensureTable() {
  // Postgres 문법 (테이블 인덱스는 별도 문장). 이미 마이그레이션 스키마로 생성돼 있으면 no-op.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dev_memos (
      id VARCHAR(36) PRIMARY KEY,
      baby_id INT NOT NULL,
      memo_date DATE NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_devmemos_baby ON dev_memos (baby_id)');
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const babyId = searchParams.get('babyId');
    if (!babyId) return NextResponse.json([], { status: 200 });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM dev_memos WHERE baby_id = ? ORDER BY memo_date DESC, created_at DESC',
      [Number(babyId)]
    );
    return NextResponse.json(rows.map(r => ({
      id:   r.id,
      date: String(r.memo_date).slice(0, 10),
      text: r.text,
    })));
  } catch (err) {
    console.error('[GET /api/dev-memos]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const { id, babyId, date, text } = await req.json();
    await pool.query(
      'INSERT INTO dev_memos (id, baby_id, memo_date, text, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, Number(babyId), date, text, Date.now()]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/dev-memos]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
