/**
 * GET /api/admin/artists/search?q=foo
 *
 * Lengvas atlikėjų autocomplete admin pickeriams (quick-add „atlikėjas" ir
 * „featuring" laukai). Grąžina iki 8 atitikmenų, rikiuotų:
 *   1) tikslus name match (case-insensitive)
 *   2) prasideda nuo q
 *   3) turi q
 * Kiekvienas: { id, name, slug, country, cover_image_url }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { searchArtistsCore } from '@/lib/search-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] })

  const sb = createAdminClient()
  try {
    // BENDRAS paieškos variklis (lib/search-core): name_norm trigram
    // (diakritikai nejautru — „zveris" randa „Žvėris") + rikiavimas
    // exact > prefix > contains, tier'e pagal populiarumą (score desc).
    const results = await searchArtistsCore(sb, q, {
      limit: 8,
      select: 'id, name, slug, country, cover_image_url, score',
    })
    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Search failed' }, { status: 500 })
  }
}
