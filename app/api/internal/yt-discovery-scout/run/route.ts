/**
 * YouTube velocity discovery scout endpoint — punktas A.
 * Kviečiamas iš GitHub Actions cron'o (NE Cowork scheduled task — žr.
 * EXTERNAL_CHARTS_PLAN.md §9 dingusio task'o pamoką). Logika:
 * lib/yt-discovery-run.ts `runYtDiscovery()` (ta pati funkcija kviečiama ir iš
 * admin „Paleisti dabar" mygtuko be HTTP self-call'o).
 *
 * DORMANT: sukasi tik per scout_sources WHERE category='yt_discovery' AND
 * is_active=true. Kol nė vieno aktyvaus — grąžina no-op.
 *
 * Smoke: curl -X POST '.../api/internal/yt-discovery-scout/run?dry_run=1' -H "Authorization: Bearer $INTERNAL_CRON_TOKEN"
 */

import { NextRequest, NextResponse } from 'next/server'
import { runYtDiscovery } from '@/lib/yt-discovery-run'

export const runtime = 'nodejs'
export const maxDuration = 300

function baseUrl(): string {
  return process.env.MUSICLT_BASE_URL || `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('source_id')
  const dryRun = searchParams.get('dry_run') === '1'

  const { status, body } = await runYtDiscovery({ sourceId, dryRun, origin: baseUrl() })
  return NextResponse.json(body, { status })
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!process.env.INTERNAL_CRON_TOKEN || token !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, msg: 'yt-discovery-scout endpoint healthy. Use POST to run.' })
}
