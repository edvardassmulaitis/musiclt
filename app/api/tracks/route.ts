import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { searchTracksCore } from '@/lib/search-core'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const album_id = searchParams.get('album_id')
  const artist_id = searchParams.get('artist_id')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  const checkTitles = searchParams.get('check_titles')
  if (checkTitles && artist_id) {
    try {
      const titles: string[] = JSON.parse(checkTitles)
      // Case-insensitive + punctuation-normalized match (žr. albums route'o
      // analogiška logika). Anksčiau .in() darė exact case-sensitive match.
      // Per artist'ą paprastai < 500 tracks — paimam visus, match'inam kliente.
      // Naudojam pagination dėl artist'ų su 1000+ tracks (PostgREST 1000-row cap).
      // 2026-05-15: kai artist'as yra GROUP, plečiame search'ą įtraukti band
      // members tracks. Pvz Queen Greatest Hits III turi 'Living on My Own',
      // kuri yra Freddie Mercury solo daina. Jei Freddie'ui DB turi šitą track'ą,
      // norim jį pasinaudoti vietoj kuriant duplicate po Queen.
      const artistIdsToSearch: number[] = [parseInt(artist_id)]
      const { data: thisArtist } = await supabase
        .from('artists')
        .select('type')
        .eq('id', parseInt(artist_id))
        .maybeSingle()
      if ((thisArtist as any)?.type === 'group') {
        const { data: memberRows } = await supabase
          .from('artist_members')
          .select('member_id')
          .eq('group_id', parseInt(artist_id))
        for (const m of (memberRows || []) as any[]) {
          if (m.member_id && !artistIdsToSearch.includes(m.member_id)) {
            artistIdsToSearch.push(m.member_id)
          }
        }
      }

      const PAGE = 1000
      let allRows: { id: number; title: string; type: string | null; artist_id: number; wiki_aliases: string[] | null }[] = []
      let offsetT = 0
      while (true) {
        const { data } = await supabase
          .from('tracks')
          .select('id, title, type, artist_id, wiki_aliases')
          .in('artist_id', artistIdsToSearch)
          .range(offsetT, offsetT + PAGE - 1)
        const rows = (data || []) as { id: number; title: string; type: string | null; artist_id: number; wiki_aliases: string[] | null }[]
        allRows = allRows.concat(rows)
        if (rows.length < PAGE) break
        offsetT += PAGE
      }
      // Article-strip leading "a"/"the"/"an" — žr. albums route komentaro.
      // Visi non-alphanumeric → tarpas (ne strip), kad "Master-Stroke",
      // "Gods...Revisited", "AC/DC" virstų į kelis žodžius. Anksčiau buvo
      // tik [-_/] → tarpas + likę strip'inami → "Gods...Revisited" tapdavo
      // "godsrevisited" be tarpo, nesutapdavo su DB "Gods - Revisited".
      // 2026-05-15: trailing parens strip PIRMA (kad "Las palabras de amor
      // (the words of love)" virstų į tik "las palabras de amor", o ne
      // "las palabras de amor the words of love").
      const norm = (s: string) => s.toLowerCase()
        .replace(/\([^)]*\)\s*$/, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(the|a|an)\s+/, '')
      // 2026-05-15: priority kai keli DB tracks turi tą patį norm'intą title:
      //   1. Same artist (group_id) virš member artists (Queen track > Freddie's solo)
      //   2. type='normal' virš alt-versions (live/remix/instr/cover)
      // Tas pats artist'as svarbiau nei tipas — pvz Queen Greatest Hits III
      // turi 'Living on My Own (Julian Raymond Album Mix)' (remix tipas) — bet
      // šitas vis tiek geriau nei Freddie solo studio, nes jis YRA Queen
      // diskografijoj per kompiliaciją.
      const primaryArtistId = parseInt(artist_id)
      const dbByNorm: Record<string, { id: number; type: string; artist_id: number }> = {}
      // Helper: index'ina vieną norm'intą key'ą į DB row'ą su tiebreaker logic
      const indexKey = (k: string, row: typeof allRows[number]) => {
        if (!k) return
        const rowType = row.type || 'normal'
        const existing = dbByNorm[k]
        if (!existing) {
          dbByNorm[k] = { id: row.id, type: rowType, artist_id: row.artist_id }
          return
        }
        // Tiebreaker 1: same primary artist visada laimi
        const existingIsPrimary = existing.artist_id === primaryArtistId
        const rowIsPrimary = row.artist_id === primaryArtistId
        if (!existingIsPrimary && rowIsPrimary) {
          dbByNorm[k] = { id: row.id, type: rowType, artist_id: row.artist_id }
          return
        }
        if (existingIsPrimary && !rowIsPrimary) return
        // Tiebreaker 2: studio (normal) virš alt-versions
        if (existing.type !== 'normal' && rowType === 'normal') {
          dbByNorm[k] = { id: row.id, type: rowType, artist_id: row.artist_id }
        }
      }
      for (const row of allRows) {
        // Primary title
        indexKey(norm(row.title), row)
        // Wiki aliases — Wiki Singles section sometimes uses short form name
        // (`"Flash"`) while album tracklist uses full canonical (`"Flash's Theme"`).
        // wiki_aliases lentelėje admin saugo abu mapping'us, kad ateities
        // Wiki import'as nesiūlytų "+ kurti naują" duplikato. 2026-05-19.
        for (const alias of (row.wiki_aliases || [])) {
          if (typeof alias === 'string' && alias.trim()) indexKey(norm(alias), row)
        }
      }
      const found: Record<string, number> = {}
      for (const t of titles) {
        const k = norm(t)
        if (dbByNorm[k]) found[t.toLowerCase()] = dbByNorm[k].id
      }
      return NextResponse.json({ found })
    } catch {
      return NextResponse.json({ found: {} })
    }
  }

  if (album_id) {
    const { data, error } = await supabase
      .from('album_tracks')
      .select(`position, tracks(id, title, type, video_url, video_views, video_views_checked_at, spotify_id, lyrics, cover_url, is_single, release_year, release_month, release_day)`)
      .eq('album_id', parseInt(album_id))
      .order('position', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const tracks = (data || []).map((at: any) => ({
      id: at.tracks?.id,
      title: at.tracks?.title,
      type: at.tracks?.type,
      video_url: at.tracks?.video_url,
      video_views: at.tracks?.video_views ?? null,
      video_views_checked_at: at.tracks?.video_views_checked_at || null,
      spotify_id: at.tracks?.spotify_id,
      lyrics: at.tracks?.lyrics,
      cover_url: at.tracks?.cover_url,
      is_single: at.tracks?.is_single || false,
      release_year: at.tracks?.release_year || null,
      release_month: at.tracks?.release_month || null,
      release_day: at.tracks?.release_day || null,
      position: at.position,
    })).filter((t: any) => t.id)
    return NextResponse.json({ tracks, total: tracks.length })
  }

  // ── Pilnas select su release_month, release_day, video_uploaded_at ──
  const SELECT_FIELDS = `id, title, type, release_date, release_year, release_month, release_day, video_url, video_views, video_views_checked_at, video_uploaded_at, spotify_id, is_single, is_new, is_new_date, cover_url, lyrics, source, legacy_id, artists!tracks_artist_id_fkey(id, name, slug, cover_image_url, country), track_artists(artist_id, is_primary, artists(id, name, slug)), album_tracks(position, albums(id, title, year, cover_image_url))`

  if (search) {
    // BENDRAS paieškos variklis (lib/search-core): diakritikai nejautru
    // (title_norm/name_norm trigram), compound „atlikėjas + pavadinimas"
    // skaidymas, kandidatai pagal populiarumą (score desc). Ta pati logika
    // kaip /api/search-entities — naudoja dienos daina, admin topai, merge,
    // admin search modalas.
    const ids = await searchTracksCore(supabase, search, {
      limit: offset + Math.min(limit, 60),
      artistId: artist_id ? parseInt(artist_id) : undefined,
    })
    const pageIds = ids.slice(offset, offset + limit)
    if (pageIds.length === 0) return NextResponse.json({ tracks: [], total: 0 })
    const { data, error } = await supabase
      .from('tracks')
      .select(SELECT_FIELDS)
      .in('id', pageIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Atstatom variklio rikiavimą (.in() grąžina bet kokia tvarka).
    const pos = new Map(pageIds.map((id, i) => [id, i]))
    const rows = (data || []).slice().sort((a: any, b: any) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
    return NextResponse.json({ tracks: rows.map(mapTrack).filter(isRealTrack), total: rows.length })
  }

  let query = supabase
    .from('tracks')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order('title', { ascending: true })
    .range(offset, offset + limit - 1)
  if (artist_id) query = query.eq('artist_id', parseInt(artist_id))
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // CDN edge cache — homepage'o "Naujausios dainos" sekcija.
  return NextResponse.json({ tracks: (data || []).map(mapTrack), total: count || 0 }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}

function isRealTrack(t: any): boolean {
  return t.title !== t.artists?.name
}

function mapTrack(t: any) {
  const albumList = (t.album_tracks || [])
    .map((at: any) => at.albums ? { id: at.albums.id, title: at.albums.title, year: at.albums.year, position: at.position, cover_image_url: at.albums.cover_image_url || null } : null)
    .filter(Boolean)
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    release_date: t.release_date,
    release_year: t.release_year || (t.release_date ? new Date(t.release_date).getFullYear() : (albumList[0]?.year || null)),
    release_month: t.release_month || null,
    release_day: t.release_day || null,
    is_single: t.is_single || false,
    video_url: t.video_url,
    video_views: t.video_views ?? null,
    video_views_checked_at: t.video_views_checked_at || null,
    video_uploaded_at: t.video_uploaded_at || null,
    spotify_id: t.spotify_id,
    is_new: t.is_new,
    is_new_date: t.is_new_date,
    cover_url: t.cover_url || null,
    has_lyrics: !!(t.lyrics),
    artists: t.artists,
    artist_name: t.artists?.name || '',
    artist_slug: t.artists?.slug || '',
    featuring_count: (t.track_artists || []).filter((ta: any) => !ta.is_primary).length,
    // Featuring artist names — non-primary track_artists. Primary artist
    // jau yra `artists` field'e (FK iš tracks.artist_id), tad praleidžiam.
    featuring: (t.track_artists || [])
      .filter((ta: any) => !ta.is_primary && ta.artists)
      .map((ta: any) => ({
        artist_id: ta.artist_id,
        name: ta.artists?.name || '',
        slug: ta.artists?.slug || '',
      })),
    album_count: albumList.length,
    albums_list: albumList,
    // source + legacy_id — admin debug + filter'ams (pending tracks atskirti
    // nuo Wiki canonical). Anksčiau SELECT'e buvo, bet mapTrack output'e ne
    // → client'as visada gauna source=undefined.
    source: t.source || null,
    legacy_id: t.legacy_id || null,
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await req.json()
  if (!data.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!data.artist_id) return NextResponse.json({ error: 'Artist required' }, { status: 400 })

  // release_date — sukuriamas kai yra bent metai
  let release_date = data.release_date || null
  if (!release_date && data.release_year) {
    const y = data.release_year
    const m = String(data.release_month || 1).padStart(2, '0')
    const d = String(data.release_day || 1).padStart(2, '0')
    release_date = `${y}-${m}-${d}`
  }

  // Generuoti unikalų slug
  const baseSlug = data.slug?.trim() || generateSlug(data.title.trim())
  let slug = baseSlug
  let suffix = 1
  while (true) {
    const { data: existing } = await supabase
      .from('tracks').select('id').eq('slug', slug).maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${suffix++}`
  }

  const { data: track, error } = await supabase
    .from('tracks')
    .insert({
      title: data.title.trim(),
      slug,
      artist_id: Number(data.artist_id),
      type: data.type || 'normal',
      is_single: data.is_single ?? false,
      release_date,
      release_year: data.release_year || null,
      release_month: data.release_month || null,
      release_day: data.release_day || null,
      video_url: data.video_url || null,
      spotify_id: data.spotify_id || null,
      lyrics: data.lyrics || null,
      description: data.description || null,
      is_new: data.is_new ?? false,
      is_new_date: data.is_new ? (data.is_new_date || new Date().toISOString().slice(0, 10)) : null,
      cover_url: data.cover_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.featuring?.length > 0) {
    await supabase.from('track_artists').insert(
      data.featuring.map((f: any) => ({ track_id: track.id, artist_id: f.artist_id || f }))
    )
  }

  // Naujas track'as → išvalom homepage cache'ą, kad atsirastų iš karto „Naujos
  // dainos" sekcijoje (kitaip CDN 5 min nelaiks naujausią versiją).
  try {
    const { revalidateHomeTag } = await import('@/lib/home-latest')
    revalidateHomeTag('tracks')
  } catch {}

  return NextResponse.json(track, { status: 201 })
}
