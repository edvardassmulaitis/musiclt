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
  // BUG FIX: anksčiau `%` ir `_` buvo IŠTRINAMI — todėl vartotojai su
  // pabraukimais (pvz. legacy "p_ruta_") tapdavo nerandami (paieška
  // virsdavo "%pruta%"). Dabar wildcard'us ESCAPE'inam (ILIKE default escape
  // '\\'), kad `_`/`%` būtų ieškomi kaip tikri simboliai. Papildomai pašalinam
  // PostgREST `.or()` filtro struktūrinius simbolius, kad neaplaužtų užklausos.
  const safe = q.replace(/[(),.:*]/g, ' ').trim()
  const esc = safe.replace(/[\\%_]/g, (c) => `\\${c}`)
  const like = `%${esc}%`
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .or(`username.ilike.${like},full_name.ilike.${like}`)
    .not('username', 'is', null)
    .limit(12)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}
