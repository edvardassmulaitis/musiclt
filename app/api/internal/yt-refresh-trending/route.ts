// ── GET /api/internal/yt-refresh-trending ─────────────────────────────────
// Periodiškai (cron) ATNAUJINA YouTube peržiūras NAUJOMS dainoms, kurias
// išleido TRENDING atlikėjai. Be šito YT info būtų vienkartinis snapshot'as ir
// trending „per dieną" nyktų dirbtinai (peržiūros nesikeistų, amžius augtų).
//
// Taupom requestus: tik (a) naujausios (šių/pernai metų) dainos, (b) tik trending
// atlikėjų (score_trending aukštas), (c) seniausiai tikrintos pirma, (d) biudžetas
// N per paleidimą. Atskira (retesnė) logika nei score-recalc (kuris tik DB, be API).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichTrack } from '@/lib/yt-enrich'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const sec = req.headers.get('x-internal-secret')
  if (sec && process.env.INTERNAL_API_SECRET && sec === process.env.INTERNAL_API_SECRET) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const budget = Math.min(40, Math.max(1, Number(url.searchParams.get('budget') || 25)))
  const minTrending = Number(url.searchParams.get('min_trending') || 35)
  const curYear = new Date().getFullYear()

  // Naujausios dainos (šiemet/pernai) iš trending atlikėjų; seniausiai tikrintos pirma.
  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('id, video_views_checked_at, artists!inner(score_trending)')
    .gte('release_year', curYear - 1)
    .gte('artists.score_trending', minTrending)
    .order('video_views_checked_at', { ascending: true, nullsFirst: true })
    .limit(budget)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let refreshed = 0, failed = 0
  const errs: string[] = []
  for (const t of tracks || []) {
    try {
      const r: any = await enrichTrack((t as any).id, false)
      if (r && !r.error) refreshed++; else { failed++; if (errs.length < 5) errs.push(`${(t as any).id}: ${r?.error || '?'}`) }
    } catch (e: any) { failed++; if (errs.length < 5) errs.push(`${(t as any).id}: ${String(e?.message || e)}`) }
  }

  return NextResponse.json({ ok: true, candidates: (tracks || []).length, refreshed, failed, errs })
}
