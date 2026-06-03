// app/api/internal/blog-classify/route.ts
//
// Batch redakcinio TIPO klasifikacija narių dienoraščio įrašams (post_type=
// 'article') — priskiria blog_posts.editorial_type (recenzija/koncertai/nuomone/
// dienorastis), NAUJAUSI pirma, tik RECENT langas (blog_to_classify RPC).
// Hibridas: heuristika (nemokama) išsprendžia aiškius, Haiku (classifyMemberType)
// — likusius. Analogiškai /api/internal/news-classify.
//
// Auth (bet kuris):
//   • Bearer INTERNAL_CRON_TOKEN
//   • admin / super_admin sesija (admin mygtukas)
//
//   GET  → { remaining }
//   POST { batch?, recent_days? } → { processed, heuristic, ai, remaining, done, sample[] }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { classifyMemberType } from '@/lib/ai-normalize'
import { heuristicMemberType } from '@/lib/member-classify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.INTERNAL_CRON_TOKEN
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (expected && token && token === expected) return null
  const session = await getServerSession(authOptions)
  if (session?.user && ['admin', 'super_admin'].includes(session.user.role || '')) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function countRemaining(sb: ReturnType<typeof createAdminClient>, recentDays: number) {
  const sinceIso = new Date(Date.now() - recentDays * 86400000).toISOString()
  const { count } = await sb
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('post_type', 'article')
    .eq('status', 'published')
    .is('editorial_type', null)
    .gte('published_at', sinceIso)
  return count || 0
}

export async function GET(req: NextRequest) {
  const unauth = await authorize(req)
  if (unauth) return unauth
  const sb = createAdminClient()
  const recentDays = Math.max(1, Math.min(3650, parseInt(req.nextUrl.searchParams.get('recent_days') || '540')))
  try {
    const remaining = await countRemaining(sb, recentDays)
    return NextResponse.json({ remaining, recent_days: recentDays })
  } catch (e: any) {
    return NextResponse.json({ remaining: 0, error: e?.message || 'error' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const unauth = await authorize(req)
  if (unauth) return unauth

  const body = await req.json().catch(() => ({}))
  const batch = Math.max(1, Math.min(40, parseInt(String(body?.batch ?? 20)) || 20))
  const recentDays = Math.max(1, Math.min(3650, parseInt(String(body?.recent_days ?? 540)) || 540))

  const sb = createAdminClient()

  const { data: rows, error: rpcErr } = await sb.rpc('blog_to_classify', { p_limit: batch, p_recent_days: recentDays })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  const cands = ((rows || []) as any[]).map((r) => ({
    id: Number(r.id),
    title: (r.title || '') as string,
    summary: (r.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260) as string,
    has_album: !!r.has_album,
    has_track: !!r.has_track,
  }))

  if (cands.length === 0) {
    return NextResponse.json({ processed: 0, heuristic: 0, ai: 0, remaining: 0, done: true, sample: [] })
  }

  // 1) Heuristika — aiškūs atvejai be LLM.
  const resolved = new Map<number, string>()
  const needAI: typeof cands = []
  for (const c of cands) {
    const h = heuristicMemberType(c)
    if (h) resolved.set(c.id, h)
    else needAI.push(c)
  }
  let heuristicCount = resolved.size

  // 2) Haiku — likusieji. Jei AI nukrenta (be kredito), default 'dienorastis',
  //    kad įrašas vis tiek būtų pažymėtas (neperdirbtume kiekvieną kartą).
  let aiCount = 0
  if (needAI.length > 0) {
    try {
      const results = await classifyMemberType(needAI.map((c, idx) => ({ idx, title: c.title, summary: c.summary })))
      const byIdx = new Map<number, string>()
      for (const r of results) byIdx.set(r.idx, r.type || 'dienorastis')
      needAI.forEach((c, idx) => { resolved.set(c.id, byIdx.get(idx) || 'dienorastis'); aiCount++ })
    } catch {
      // AI nepasiekiamas — pažymim default'u, kad nebūtų stuck loop.
      for (const c of needAI) resolved.set(c.id, 'dienorastis')
    }
  }

  // 3) Įrašom (editorial_type + classified_at).
  const nowIso = new Date().toISOString()
  const sample: Array<{ title: string; type: string }> = []
  let processed = 0
  for (const c of cands) {
    const type = resolved.get(c.id) || 'dienorastis'
    const { error } = await sb.from('blog_posts').update({ editorial_type: type, editorial_classified_at: nowIso }).eq('id', c.id)
    if (!error) {
      processed++
      if (sample.length < 8) sample.push({ title: c.title.slice(0, 50), type })
    }
  }

  const remaining = await countRemaining(sb, recentDays)
  return NextResponse.json({ processed, heuristic: heuristicCount, ai: aiCount, remaining, done: remaining === 0, sample })
}
