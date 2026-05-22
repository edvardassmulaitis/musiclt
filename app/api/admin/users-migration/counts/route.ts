// app/api/admin/users-migration/counts/route.ts
//
// Light count'ai admin homepage badge'ui:
//   migrated — kiek ghost user'ių jau turi >=1 fazę paliestą
//   total    — kiek viso ghost user'ių (legacy_user_id IS NOT NULL)
//
// Be RLS — adminams skirtas read-only summary.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()

  // Migration view turi phases_touched stulpelį — count >= 1
  const [migratedQ, totalQ] = await Promise.all([
    sb.from('v_user_migration_status').select('*', { count: 'exact', head: true })
      .gte('phases_touched', 1),
    sb.from('v_user_migration_status').select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    migrated: migratedQ.count ?? 0,
    total: totalQ.count ?? 0,
  })
}
