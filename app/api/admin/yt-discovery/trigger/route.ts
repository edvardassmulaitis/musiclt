/**
 * POST /api/admin/yt-discovery/trigger
 * Admin „Paleisti scan'ą dabar" — ta pati runYtDiscovery() logika, session-auth
 * (nereikia INTERNAL_CRON_TOKEN). ?dry_run=1 palaikomas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runYtDiscovery } from '@/lib/yt-discovery-run'

export const runtime = 'nodejs'
export const maxDuration = 300

function baseUrl(): string {
  return process.env.MUSICLT_BASE_URL || `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('source_id')
  const dryRun = searchParams.get('dry_run') === '1'
  const { status, body } = await runYtDiscovery({ sourceId, dryRun, origin: baseUrl() })
  return NextResponse.json(body, { status })
}
