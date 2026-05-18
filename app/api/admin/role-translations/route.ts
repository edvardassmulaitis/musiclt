// Role translations admin API.
//
// GET    → grąžina visus canonical role labels iš artists.roles
//          (deduplicated, lowercased) su LT vertimu + hidden flag'u +
//          usage count.
// PUT    → upsert vieno role'o vertimą / hidden flag'ą.
//          Body: { canonical: string, lt?: string|null, hidden?: boolean }
// DELETE → ištrina vertimo įrašą (canonical liks rodyti kaip-yra).
//          Body: { canonical: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) return null
  return session
}

export async function GET(_req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  // Fetch all artists.roles values + existing translations in parallel.
  // PostgREST nemoka GROUP BY ant array unnest'o per JSON API, todėl
  // paginuotai parsisiunčiame visus non-empty roles laukus ir agreguojam
  // serveryje. Daugumos atlikėjų roles[] eilutės yra trumpos (~3-5 vals),
  // ir visi atlikėjai dar tik ~12k, tad išlaikome RAM.
  const [rolesRes, translationsRes] = await Promise.all([
    (async () => {
      const all: any[] = []
      let from = 0
      const STEP = 1000
      while (true) {
        const { data, error } = await supabase
          .from('artists')
          .select('roles')
          .not('roles', 'is', null)
          .range(from, from + STEP - 1)
        if (error || !data || data.length === 0) break
        all.push(...data)
        if (data.length < STEP) break
        from += STEP
      }
      return all
    })(),
    supabase.from('role_translations').select('canonical, lt, hidden, updated_at'),
  ])

  // Aggregate canonical counts
  const counts: Record<string, number> = {}
  for (const row of rolesRes || []) {
    for (const v of (row.roles || [])) {
      const c = String(v || '').trim().toLowerCase()
      if (!c) continue
      counts[c] = (counts[c] || 0) + 1
    }
  }

  // Merge with translations
  const trMap: Record<string, { lt: string | null; hidden: boolean; updated_at: string }> = {}
  for (const t of (translationsRes.data || [])) {
    trMap[t.canonical] = { lt: t.lt, hidden: !!t.hidden, updated_at: t.updated_at }
  }

  // Final list: union(canonicals from artists, canonicals from translations)
  const allCanonicals = new Set([...Object.keys(counts), ...Object.keys(trMap)])
  const result = [...allCanonicals].map(c => ({
    canonical: c,
    count: counts[c] || 0,
    lt: trMap[c]?.lt || null,
    hidden: trMap[c]?.hidden || false,
    updated_at: trMap[c]?.updated_at || null,
  })).sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical))

  return NextResponse.json({ items: result })
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { canonical, lt, hidden } = await req.json()
  const c = String(canonical || '').trim().toLowerCase()
  if (!c) return NextResponse.json({ error: 'canonical required' }, { status: 400 })

  const supabase = createAdminClient()
  const payload: any = { canonical: c, updated_at: new Date().toISOString() }
  if (lt !== undefined) payload.lt = lt ? String(lt).trim() || null : null
  if (hidden !== undefined) payload.hidden = !!hidden

  const { error } = await supabase
    .from('role_translations')
    .upsert(payload, { onConflict: 'canonical' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { canonical } = await req.json()
  const c = String(canonical || '').trim().toLowerCase()
  if (!c) return NextResponse.json({ error: 'canonical required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('role_translations').delete().eq('canonical', c)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
