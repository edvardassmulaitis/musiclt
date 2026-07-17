/**
 * Bendras inbox count'ų endpoint'as.
 *
 * GET /api/admin/inbox-counts → { news, events, albums, total }
 *
 * Vienintelis šaltinis viršutiniam "📥 Inbox" badge'ui (grand total) IR
 * InboxTabs per-tab skaičiams, kad jie visada sutaptų tarpusavyje ir su
 * dashboard'u (visi naudoja tuos pačius lib/inbox-counts.ts helper'ius).
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getInboxCounts } from '@/lib/inbox-counts'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const counts = await getInboxCounts(supabase)
  return NextResponse.json(counts)
}
