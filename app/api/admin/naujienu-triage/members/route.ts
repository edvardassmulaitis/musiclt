import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/naujienu-triage/members?q=<paieška>
//
// Narių paieška autocomplete'ui (susiejant autorių → narį). Ieško pagal
// username ir full_name. Grąžina iki 12 rezultatų.
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ members: [] })

  const sb = createAdminClient()
  const like = `%${q.replace(/[%_]/g, '')}%`
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .or(`username.ilike.${like},full_name.ilike.${like}`)
    .not('username', 'is', null)
    .limit(12)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}
