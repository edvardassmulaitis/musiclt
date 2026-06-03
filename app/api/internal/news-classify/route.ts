// app/api/internal/news-classify/route.ts
//
// Batch AI klasifikacija — priskiria news_category (release/tour/performance/
// career_step/other) neklasifikuotoms naujienoms (modern + legacy). Naudoja
// Haiku (lib/ai-normalize classifyMusicRelevance) → reikia ANTHROPIC_API_KEY.
//
// Auth: Bearer INTERNAL_CRON_TOKEN (tas pats kaip news/events scout cron'ams),
// kad būtų galima paleisti loop'ą iš klasifikuoti_naujienas.command be NextAuth
// sesijos.
//
//   GET  → { remaining_legacy, remaining_modern, total_uncategorized }
//   POST { batch?: number } → { processed, remaining, done, sample[] }
//
// Resumable: kiekvienas POST apdoroja `batch` (default 20, max 40) įrašų ir
// grąžina kiek liko. Loop kviečia kol done=true.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { classifyMusicRelevance } from '@/lib/ai-normalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function checkAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

type Cand = { id: number; source: 'legacy' | 'modern'; title: string; summary: string }

function stripBody(body: string | null | undefined): string {
  if (!body) return ''
  return body.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280)
}

async function countRemaining(sb: ReturnType<typeof createAdminClient>) {
  const legacy = await sb
    .from('discussions')
    .select('id', { count: 'exact', head: true })
    .eq('legacy_kind', 'news').eq('is_legacy', true).eq('is_deleted', false)
    .is('news_category', null)
  const modern = await sb
    .from('news')
    .select('id', { count: 'exact', head: true })
    .is('news_category', null)
  return { legacy: legacy.count || 0, modern: modern.count || 0 }
}

export async function GET(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth
  const sb = createAdminClient()
  const r = await countRemaining(sb)
  return NextResponse.json({
    remaining_legacy: r.legacy,
    remaining_modern: r.modern,
    total_uncategorized: r.legacy + r.modern,
  })
}

export async function POST(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth

  let batch = 20
  const body = await req.json().catch(() => ({}))
  if (body?.batch) batch = Math.max(1, Math.min(40, parseInt(String(body.batch)) || 20))

  const sb = createAdminClient()

  // Neklasifikuoti — legacy pirma (bulk ~20k), tada modern (6).
  const cands: Cand[] = []
  const { data: legacyRows } = await sb
    .from('discussions')
    .select('id, title, body')
    .eq('legacy_kind', 'news').eq('is_legacy', true).eq('is_deleted', false)
    .is('news_category', null)
    .order('first_post_at', { ascending: false, nullsFirst: false })
    .limit(batch)
  for (const r of (legacyRows || []) as any[]) {
    cands.push({ id: r.id, source: 'legacy', title: r.title || '', summary: stripBody(r.body) })
  }
  if (cands.length < batch) {
    const { data: modernRows } = await sb
      .from('news')
      .select('id, title, body')
      .is('news_category', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(batch - cands.length)
    for (const r of (modernRows || []) as any[]) {
      cands.push({ id: r.id, source: 'modern', title: r.title || '', summary: stripBody(r.body) })
    }
  }

  if (cands.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, done: true, sample: [] })
  }

  let results
  try {
    results = await classifyMusicRelevance(
      cands.map((c, idx) => ({ idx, title: c.title, summary: c.summary }))
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI classify failed' }, { status: 502 })
  }

  const catByIdx = new Map<number, string>()
  for (const r of results) {
    // Šios naujienos JAU muzikinės — 'none' → 'other'.
    const cat = r.category === 'none' || !r.category ? 'other' : r.category
    catByIdx.set(r.idx, cat)
  }

  const sample: Array<{ title: string; category: string }> = []
  let processed = 0
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    const cat = catByIdx.get(i) || 'other'
    const table = c.source === 'legacy' ? 'discussions' : 'news'
    const { error } = await sb.from(table).update({ news_category: cat }).eq('id', c.id)
    if (!error) {
      processed++
      if (sample.length < 5) sample.push({ title: c.title.slice(0, 60), category: cat })
    }
  }

  // Facet cache'ą reikia perskaičiuoti, kad chip skaičiai atsinaujintų.
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('naujienos:facets')
  } catch { /* noop */ }

  const rem = await countRemaining(sb)
  const remaining = rem.legacy + rem.modern
  return NextResponse.json({ processed, remaining, done: remaining === 0, sample })
}
