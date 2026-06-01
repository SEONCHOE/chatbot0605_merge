import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const babyIdParam = searchParams.get('babyId');

    let babies: RowDataPacket[];
    if (babyIdParam) {
      [babies] = await pool.query<RowDataPacket[]>('SELECT * FROM babies WHERE id = ?', [Number(babyIdParam)]);
    } else {
      [babies] = await pool.query<RowDataPacket[]>('SELECT * FROM babies LIMIT 1');
    }

    if (babies.length === 0) {
      return NextResponse.json({ babyId: null, baby: null, logs: {}, todos: [], health: { logs: [], medications: [] }, development: {}, growth: [] });
    }
    const baby = babies[0];
    const babyId = baby.id;

    const [rows, todosRows, hlRows, medRows, devRows, growthRows] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT * FROM logs WHERE baby_id = ? ORDER BY log_date, COALESCE(start_time, log_time)', [babyId]),
      pool.query<RowDataPacket[]>('SELECT * FROM todos WHERE baby_id = ?', [babyId]),
      pool.query<RowDataPacket[]>('SELECT * FROM health_logs WHERE baby_id = ? ORDER BY log_date DESC, log_time DESC', [babyId]),
      pool.query<RowDataPacket[]>('SELECT * FROM medications WHERE baby_id = ? ORDER BY prescribed_date DESC', [babyId]),
      pool.query<RowDataPacket[]>('SELECT * FROM developments WHERE baby_id = ?', [babyId]),
      pool.query<RowDataPacket[]>('SELECT * FROM growth_records WHERE baby_id = ? ORDER BY record_date ASC', [babyId]),
    ]);

    const logsMap: Record<string, object[]> = {};
    for (const r of rows[0]) {
      const dateKey = String(r.log_date).slice(0, 10);
      if (!logsMap[dateKey]) logsMap[dateKey] = [];
      logsMap[dateKey].push({
        id:       r.id,
        type:     r.type,
        date:     dateKey,
        note:     r.note || '',
        startTime: r.start_time ? String(r.start_time).slice(0, 5) : undefined,
        endTime:   r.end_time   ? String(r.end_time).slice(0, 5)   : undefined,
        time:      r.log_time   ? String(r.log_time).slice(0, 5)   : undefined,
        amount:    r.amount ?? null,
        feedType:  r.feed_type  || undefined,
        color:     r.color      || undefined,
        reason:    r.reason     || undefined,
      });
    }

    const development: Record<string, boolean> = {};
    for (const d of devRows[0]) {
      development[d.milestone_id] = Boolean(d.completed);
    }

    return NextResponse.json({
      babyId,
      baby: { name: baby.name, birthDate: String(baby.birth_date).slice(0, 10), gender: baby.gender },
      logs: logsMap,
      todos: todosRows[0].map(t => ({
        id:        t.id,
        text:      t.text,
        category:  t.category,
        completed: Boolean(t.completed),
        createdAt: Number(t.created_at),
        date:      t.todo_date ? String(t.todo_date).slice(0, 10) : undefined,
      })),
      health: {
        logs: hlRows[0].map(l => ({
          id:     l.id,
          type:   l.type,
          detail: l.detail,
          date:   String(l.log_date).slice(0, 10),
          time:   String(l.log_time).slice(0, 5),
        })),
        medications: medRows[0].map(m => ({
          id:   m.id,
          name: m.name,
          dose: m.dose || '',
          freq: m.freq || '',
          note: m.note || '',
          date: m.prescribed_date ? String(m.prescribed_date).slice(0, 10) : '',
        })),
      },
      development,
      growth: growthRows[0].map(g => ({
        id:     g.id,
        date:   String(g.record_date).slice(0, 10),
        height: g.height ? Number(g.height) : undefined,
        weight: g.weight ? Number(g.weight) : undefined,
      })),
    });
  } catch (err) {
    console.error('[GET /api/state]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
