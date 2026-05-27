import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join, extname, basename } from 'path';

const ALLOWED_EXT = new Set(['.jpeg', '.jpg', '.png', '.gif', '.webp']);
const MIME: Record<string, string> = {
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const safe = basename(filename);
  const ext = extname(safe).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const filePath = join(process.cwd(), 'data_for_RAG', 'processed', 'figures', safe);
    const buf = readFileSync(filePath);
    return new NextResponse(buf, { headers: { 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
