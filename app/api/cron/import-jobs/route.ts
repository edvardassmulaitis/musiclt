// GET /api/cron/import-jobs — foninių muzikos importo job'ų worker'is.
// Auth: Bearer CRON_SECRET (Vercel cron) ARBA Bearer INTERNAL_CRON_TOKEN (rankinis).
// Vienas iškvietimas apdoroja vieną job'ą per laiko biudžetą (resumable).
import { NextRequest, NextResponse } from 'next/server'
import { processJobs } from '@/lib/import-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const ok = (process.env.CRON_SECRET && token === process.env.CRON_SECRET) ||
             (process.env.INTERNAL_CRON_TOKEN && token === process.env.INTERNAL_CRON_TOKEN)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await processJobs(45000)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
