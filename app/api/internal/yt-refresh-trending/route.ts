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

  // RPC: per atlikėją TIK top-10 naujausių dainų (pagal peržiūras) — kad
  // produktyvūs atlikėjai (YoungBoy 70 dainų) nesuvalgytų viso biudžeto ir
  // refresh'intume tik balui svarbiausias dainas. Tarp jų — seniausiai tikrintos
  // pirma (sąžininga rotacija, niekas neužsiloop'ina, niekas neužstringa).
  const { data: cand, error } = await supabase.rpc('trending_refresh_candidates', {
    p_budget: budget, p_min_trending: minTrending, p_min_year: curYear - 1,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let refreshed = 0, failed = 0
  const errs: string[] = []
  for (const row of (cand || []) as { id: number }[]) {
    try {
      const r: any = await enrichTrack(row.id, false)
      if (r && !r.error) refreshed++; else { failed++; if (errs.length < 5) errs.push(`${row.id}: ${r?.error || '?'}`) }
    } catch (e: any) { failed++; if (errs.length < 5) errs.push(`${row.id}: ${String(e?.message || e)}`) }
  }

  return NextResponse.json({ ok: true, candidates: (cand || []).length, refreshed, failed, errs })
}
