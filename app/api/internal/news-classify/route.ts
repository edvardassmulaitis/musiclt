// app/api/internal/news-classify/route.ts
//
// Batch AI TIPO klasifikacija — priskiria news_category (redakcinis tipas:
// naujiena/interviu/recenzija/foto/topai/koncertai/klipas/kita) dar
// neklasifikuotoms naujienoms, NAUJAUSIOS pirma (news_to_classify RPC). Naudoja
// Haiku (classifyNewsType) → reikia ANTHROPIC_API_KEY.
//
// Auth (bet kuris):
//   • Bearer INTERNAL_CRON_TOKEN  (klasifikuoti_naujienas.command loop'as)
//   • admin / super_admin sesija   (admin mygtukas /admin)
//
//   GET  → { total_uncategorized, remaining_legacy, remaining_modern }
//   POST { batch?: number } → { processed, remaining, done, sample[] }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { classifyNewsType } from '@/lib/ai-normalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  // 1) Bearer token (cron / .command)
  const expected = process.env.INTERNAL_CRON_TOKEN
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (expected && token && token === expected) return null
  // 2) Admin sesija
  const session = await getServerSession(authOptions)
  if (session?.user && ['admin', 'super_admin'].includes(session.user.role || '')) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const unauth = await authorize(req)
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
  const unauth = await authorize(req)
  if (unauth) return unauth

  let batch = 20
  const body = await req.json().catch(() => ({}))
  if (body?.batch) batch = Math.max(1, Math.min(40, parseInt(String(body.batch)) || 20))

  const sb = createAdminClient()

  // Neklasifikuoti, NAUJAUSI pirma (display data coalesce(first_post_at,created_at)).
  const { data: rows, error: rpcErr } = await sb.rpc('news_to_classify', { p_limit: batch })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  const cands = ((rows || []) as any[]).map((r) => ({
    id: r.id as number,
    source: r.source as 'legacy' | 'modern',
    title: (r.title || '') as string,
    summary: (r.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) as string,
  }))

  if (cands.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, done: true, sample: [] })
  }

  let results
  try {
    results = await classifyNewsType(cands.map((c, idx) => ({ idx, title: c.title, summary: c.summary })))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI classify failed' }, { status: 502 })
  }

  const typeByIdx = new Map<number, string>()
  for (const r of results) typeByIdx.set(r.idx, r.type || 'naujiena')

  const sample: Array<{ title: string; type: string }> = []
  let processed = 0
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    const type = typeByIdx.get(i) || 'naujiena'
    const table = c.source === 'legacy' ? 'discussions' : 'news'
    const { error } = await sb.from(table).update({ news_category: type }).eq('id', c.id)
    if (!error) {
      processed++
      if (sample.length < 6) sample.push({ title: c.title.slice(0, 55), type })
    }
  }

  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('naujienos:facets')
  } catch { /* noop */ }

  const rem = await countRemaining(sb)
  const remaining = rem.legacy + rem.modern
  return NextResponse.json({ processed, remaining, done: remaining === 0, sample })
}
