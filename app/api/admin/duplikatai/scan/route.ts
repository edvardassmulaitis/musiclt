import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * POST /api/admin/duplikatai/scan
 *   Body: { step: 'reset' | 'spotify' | 'youtube' | 'same_artist' | 'cross_artist' }
 *
 * Re-runs ONE detection signal (each is a separate Postgres function that
 * raises its own statement_timeout). The client calls the steps in sequence so
 * no single request approaches the API gateway limit. 'reset' clears pending
 * groups first; merged/dismissed history is preserved.
 */
const FN: Record<string, string> = {
  reset: 'dup_scan_reset',
  spotify: 'dup_scan_spotify',
  youtube: 'dup_scan_youtube',
  same_artist: 'dup_scan_same_artist',
  cross_artist: 'dup_scan_cross',
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const step = String(body.step || '')
  const fn = FN[step]
  if (!fn) return NextResponse.json({ error: 'Unknown step' }, { status: 400 })

  const sb = createAdminClient()
  const { data, error } = await sb.rpc(fn)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, step, count: data })
}
