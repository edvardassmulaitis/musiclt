// app/api/admin/kolekcijos/suggest/route.ts
//
// AI siūlo dainas dainų kolekcijai (flow B1): heuristika (title raktažodžiai +
// video_views) + Haiku patikslinimas. Grąžina kandidatus — adminas peržiūri ir
// patvirtina per /api/admin/kolekcijos/tracks (POST track_ids). Jokio auto-insert.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { suggestTracksForCollection } from '@/lib/collection-suggest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const slug = (body.slug || '').toString().trim()
  if (!slug) return NextResponse.json({ ok: false, error: 'Trūksta slug' }, { status: 400 })

  try {
    const sb = createAdminClient()
    const { data: coll } = await sb
      .from('collections')
      .select('slug, kind, title, intro, genre_name')
      .eq('slug', slug)
      .eq('kind', 'song')
      .maybeSingle()
    if (!coll) return NextResponse.json({ ok: false, error: 'Dainų kolekcija nerasta' }, { status: 404 })

    const manualKeywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: any) => String(k).toLowerCase().trim()).filter(Boolean)
      : undefined

    const result = await suggestTracksForCollection({
      slug: coll.slug, title: coll.title, intro: coll.intro || coll.title,
      genreName: coll.genre_name, manualKeywords,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
