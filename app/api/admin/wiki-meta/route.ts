// Per-artist Wiki import metadata — aliases ir ignores vienu fetch'u.
// WikipediaImportDiscography naudoja jį handleSearch metu, kad single
// suggestions list'e atfiltruotų ignored ir markintų alias matches kaip
// duplicate.
//
// GET    /api/admin/wiki-meta?artist_id=X       — grąžina { aliases, ignores }
// POST   /api/admin/wiki-meta/alias             — { track_id, alias }
// DELETE /api/admin/wiki-meta/alias             — { track_id, alias }
// POST   /api/admin/wiki-meta/ignore            — { artist_id, wiki_title }
// DELETE /api/admin/wiki-meta/ignore            — { artist_id, wiki_title }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

// GET — load both for a single artist
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const artistId = parseInt(searchParams.get('artist_id') || '0')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const supabase = createAdminClient()
  // Aliases — visi tracker'iai, kurie turi non-empty wiki_aliases
  const [aliasesRes, ignoresRes] = await Promise.all([
    supabase
      .from('tracks')
      .select('id, title, wiki_aliases')
      .eq('artist_id', artistId)
      .not('wiki_aliases', 'eq', '{}'),
    supabase
      .from('wiki_single_ignores')
      .select('wiki_title')
      .eq('artist_id', artistId),
  ])

  // Flatten aliases → { lowercase_alias: track_id }
  const aliases: Record<string, { trackId: number; trackTitle: string }> = {}
  for (const row of aliasesRes.data || []) {
    for (const alias of (row.wiki_aliases || [])) {
      if (alias) aliases[alias.toLowerCase()] = { trackId: row.id, trackTitle: row.title }
    }
  }
  const ignores: string[] = (ignoresRes.data || []).map((r: any) => r.wiki_title)

  return NextResponse.json({ aliases, ignores })
}
