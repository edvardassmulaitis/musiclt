// GET/POST /api/internal/verta-keliones-scout
// AI scout cron'ui — surenka 2026 turus iš Wikipedia → abroad_event_candidates.
// Auth: Bearer INTERNAL_CRON_TOKEN (tas pats kaip news/events scout).

import { NextRequest, NextResponse } from 'next/server'
import { runScout } from '@/lib/verta-keliones-scout'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(req: NextRequest) {
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await runScout({})
  return NextResponse.json({ ok: true, ...res })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
