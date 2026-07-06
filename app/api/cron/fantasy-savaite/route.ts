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
import { authorizeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  if (!authorizeCron(req, { allowQueryKey: true })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const live = url.searchParams.get('live') === '1'
  const explicit = url.searchParams.get('week')
  // Validuojam `week` — kad nebūtų perrašomos/kuriamos savaitės iš bet kokios įvesties.
  if (explicit && !/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return NextResponse.json({ error: 'invalid week (YYYY-MM-DD)' }, { status: 400 })
  }
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
