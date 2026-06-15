// GET /api/cron/social-sync — periodinis auto-feed atnaujinimas.
// Auth: Bearer CRON_SECRET (Vercel cron) ARBA Bearer INTERNAL_CRON_TOKEN (rankinis).
import { NextRequest, NextResponse } from 'next/server'
import { syncAllConnections } from '@/lib/social/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok = (process.env.CRON_SECRET && token === process.env.CRON_SECRET) ||
             (process.env.INTERNAL_CRON_TOKEN && token === process.env.INTERNAL_CRON_TOKEN)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await syncAllConnections(500)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
