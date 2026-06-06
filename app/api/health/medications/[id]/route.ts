import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const med = await req.json();
    await pool.query(
      'UPDATE medications SET name=?, dose=?, freq=?, note=?, prescribed_date=? WHERE id=?',
      [med.name, med.dose || null, med.freq || null, med.note || null, med.date || null, id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/health/medications/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM medications WHERE id=?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/health/medications/[id]]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
