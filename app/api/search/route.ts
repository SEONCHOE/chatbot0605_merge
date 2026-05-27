import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

interface RagChunk { text: string; source?: string; [key: string]: unknown; }
interface RagFigure { title: string; caption: string; [key: string]: unknown; }

let chunks: RagChunk[] | null = null;
let figures: RagFigure[] | null = null;

function loadData() {
  if (chunks) return;
  const base = join(process.cwd(), 'data_for_RAG', 'processed');
  chunks  = JSON.parse(readFileSync(join(base, 'rag_chunks.json'),  'utf8'));
  figures = JSON.parse(readFileSync(join(base, 'rag_figures.json'), 'utf8'));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function buildFreq(text: string): Record<string, number> {
  const f: Record<string, number> = {};
  tokenize(text).forEach(t => { f[t] = (f[t] || 0) + 1; });
  return f;
}

function cosineSim(qFreq: Record<string, number>, docText: string): number {
  const dFreq = buildFreq(docText);
  let dot = 0, qNorm = 0, dNorm = 0;
  for (const [t, qv] of Object.entries(qFreq)) {
    dot   += qv * (dFreq[t] || 0);
    qNorm += qv * qv;
  }
  for (const dv of Object.values(dFreq)) dNorm += dv * dv;
  if (!qNorm || !dNorm) return 0;
  return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
}

export async function POST(req: NextRequest) {
  try {
    loadData();
    const { query = '', topChunks = 5, topFigures = 3 } = await req.json();
    if (!query.trim()) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const qFreq = buildFreq(query);

    const resultChunks = (chunks || [])
      .map(c => ({ ...c, score: cosineSim(qFreq, c.text) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topChunks)
      .map(({ score: _s, ...c }) => c);

    const resultFigures = (figures || [])
      .map(f => ({ ...f, score: cosineSim(qFreq, f.title + ' ' + f.caption) }))
      .filter(f => f.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topFigures)
      .map(({ score: _s, ...f }) => f);

    return NextResponse.json({ chunks: resultChunks, figures: resultFigures });
  } catch (err) {
    console.error('[POST /api/search]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
