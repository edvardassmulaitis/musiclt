/**
 * GET /api/admin/rehost-scan
 *
 * Suskaičiuoja kiek atlikėjų turi external (Wikimedia ar kt) URL'us:
 *   - cover_image_url / cover_image_wide_url
 *   - artist_photos.url
 *
 * Default skip'inami: Supabase Storage URL'ai (jau pas mus), music.lt
 * legacy URL'ai (jie stabilūs per weserv).
 *
 * Query params:
 *   includeMusicLt=1   — įtrauk ir music.lt URL'us į scan'ą
 *   list=1             — grąžink IDų sąrašą (max 500), ne tik count
 *
 * Response:
 *   { ok, artistsCount, photosCount, sampleIds[] (jei list=1) }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const supabase = createAdminClient()

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

// PostgREST `not.ilike` neturi `like ALL/ANY` operatorius. Filter'inam
// reverse: ne *.supabase.co (ir, jei reikia, ne music.lt). Naudojam
// PostgREST `not.ilike` su prefix wildcard'u.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const includeMusicLt = searchParams.get('includeMusicLt') === '1'
  const wantList = searchParams.get('list') === '1'

  // Surenkam visus artists su HTTP URL'ais (be filtrų), tada filtruojam in-memory.
  // 12k atlikėjų — toleruotina (~3 stulpeliai per row, ~50-200B kiekvienas).
  const PAGE = 1000
  let allArtists: { id: number; name: string; cover_image_url: string | null; cover_image_wide_url: string | null }[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('artists')
      .select('id, name, cover_image_url, cover_image_wide_url')
      .or('cover_image_url.ilike.http%,cover_image_wide_url.ilike.http%')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    const arr = (data || []) as typeof allArtists
    allArtists.push(...arr)
    if (arr.length < PAGE) break
  }

  const SUPABASE_RE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\//i
  const MUSIC_LT_RE = /^https?:\/\/(?:www\.)?music\.lt\//i
  const isExternal = (u: string | null): boolean => {
    if (!u) return false
    if (SUPABASE_RE.test(u)) return false
    if (!includeMusicLt && MUSIC_LT_RE.test(u)) return false
    return /^https?:\/\//i.test(u)
  }

  const matchingArtists = allArtists.filter(
    (a) => isExternal(a.cover_image_url) || isExternal(a.cover_image_wide_url),
  )

  // artist_photos count'as — count(*) head request'u, mums tik orientyrui
  let photosCount = 0
  let photoArtistIds = new Set<number>()
  {
    let offset = 0
    while (true) {
      const { data } = await supabase
        .from('artist_photos')
        .select('artist_id, url')
        .ilike('url', 'http%')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      const arr = (data || []) as { artist_id: number; url: string | null }[]
      for (const p of arr) {
        if (isExternal(p.url)) {
          photosCount++
          photoArtistIds.add(p.artist_id)
        }
      }
      if (arr.length < PAGE) break
      offset += PAGE
    }
  }

  // Union: artistai, kuriems reik rehost (arba cover, arba gallery)
  const unionIds = new Set<number>([...matchingArtists.map((a) => a.id), ...photoArtistIds])

  return NextResponse.json({
    ok: true,
    artistsCount: unionIds.size,
    coverExternalCount: matchingArtists.length,
    photosCount,
    ...(wantList ? {
      sampleIds: matchingArtists.slice(0, 500).map((a) => ({ id: a.id, name: a.name })),
      allArtistIds: Array.from(unionIds).slice(0, 2000),
    } : {}),
  })
}
