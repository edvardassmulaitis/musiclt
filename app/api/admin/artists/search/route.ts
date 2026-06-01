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
  const safe = q.replace(/[%_,]/g, '')
  if (!safe) return NextResponse.json({ ok: true, results: [] })

  const { data, error } = await sb
    .from('artists')
    .select('id, name, slug, country, cover_image_url')
    .ilike('name', `%${safe}%`)
    .limit(25)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const lower = q.toLowerCase()
  const rank = (name: string) => {
    const n = (name || '').toLowerCase()
    if (n === lower) return 0
    if (n.startsWith(lower)) return 1
    return 2
  }
  const results = (data || [])
    .sort((a: any, b: any) => rank(a.name) - rank(b.name) || (a.name || '').length - (b.name || '').length)
    .slice(0, 8)

  return NextResponse.json({ ok: true, results })
}
