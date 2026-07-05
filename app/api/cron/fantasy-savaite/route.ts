// app/api/cron/fantasy-savaite/route.ts
//
// Savaitinis fantasy lygos skaičiavimas (vercel.json cron — pirmadieniais).
//   GET ?key=fliga_9d2c41 [&week=YYYY-MM-DD] [&live=1]
//
// Be parametrų skaičiuoja KĄ TIK PASIBAIGUSIĄ savaitę (praėjęs pirmadienis).
// ?week — perskaičiuoti konkrečią savaitę (backfill). ?live=1 — einamąją
// savaitę su šios dienos duomenimis (naudinga testams/preview snapshot'ui).

import { NextRequest, NextResponse } from 'next/server'
import { computeFantasyWeek, weekStartOf, prevWeekStart } from '@/lib/fantasy'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_KEY = 'fliga_9d2c41'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== CRON_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const live = url.searchParams.get('live') === '1'
  const explicit = url.searchParams.get('week')
  const week = explicit || (live ? weekStartOf() : prevWeekStart(weekStartOf()))

  const started = Date.now()
  const result = await computeFantasyWeek(week, live)

  return NextResponse.json({
    ok: true,
    week,
    live,
    ...result,
    tookMs: Date.now() - started,
  })
}
