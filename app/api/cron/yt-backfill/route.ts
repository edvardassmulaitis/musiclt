/**
 * GET /api/cron/yt-backfill — foninis YouTube info backfill worker'is.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) ARBA Bearer INTERNAL_CRON_TOKEN (rankinis).
 *
 * Vienas iškvietimas apdoroja vieną mažą partiją (laiko biudžete), NEEIKVODAMAS
 * YouTube Data API kvotos (tik nemokami InnerTube šaltiniai). Resumable per
 * tracks.yt_backfill_at žymą. Žr. lib/yt-backfill.ts.
 *
 * Query (nebūtina, rankiniam valdymui):
 *   ?stats=1        — grąžina likučius pagal fazes (nieko neapdoroja)
 *   ?batch=N        — partijos dydis (default 40, max 100)
 *   ?phase=A|B|C    — priverstinai konkreti fazė (default — auto prioritetas A→B→C)
 */
import { NextRequest, NextResponse } from 'next/server'
import { runYtBackfill, backfillStats, type BackfillRun } from '@/lib/yt-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok = (process.env.CRON_SECRET && token === process.env.CRON_SECRET) ||
             (process.env.INTERNAL_CRON_TOKEN && token === process.env.INTERNAL_CRON_TOKEN)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  if (sp.get('stats') === '1') {
    return NextResponse.json(await backfillStats())
  }

  const batch = parseInt(sp.get('batch') || '40', 10) || 40
  const phaseParam = sp.get('phase')
  const phase = (phaseParam === 'A' || phaseParam === 'B' || phaseParam === 'C') ? phaseParam : null

  try {
    const r: BackfillRun = await runYtBackfill({ batch, phase })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
