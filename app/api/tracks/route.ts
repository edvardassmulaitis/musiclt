import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

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
      const { data } = await supabase
        .from('tracks')
        .select('id, title')
        .eq('artist_id', parseInt(artist_id))
        .in('title', titles)
      const found: Record<string, number> = {}
      for (const row of data || []) found[row.title.toLowerCase()] = row.id
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

  // ── Pilnas select su release_month, release_day ──
  const SELECT_FIELDS = `id, title, type, release_date, release_year, release_month, release_day, video_url, video_views, video_views_checked_at, spotify_id, is_single, is_new, is_new_date, cover_url, lyrics, artists!tracks_artist_id_fkey(id, name, slug), track_artists(artist_id), album_tracks(position, albums(id, title, year))`

  if (search) {
    const { data: artistMatches } = await supabase
      .from('artists').select('id').ilike('name', `%${search}%`).limit(20)
    const artistIds = (artistMatches || []).map((a: any) => a.id)
    let query = supabase
      .from('tracks')
      .select(SELECT_FIELDS, { count: 'exact' })
      .order('title', { ascending: true })
      .range(offset, offset + limit - 1)
    if (artistIds.length > 0) query = query.or(`title.ilike.%${search}%,artist_id.in.(${artistIds.join(',')})`)
    else query = query.ilike('title', `%${search}%`)
    if (artist_id) query = query.eq('artist_id', parseInt(artist_id))
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tracks: (data || []).map(mapTrack).filter(isRealTrack), total: (data || []).length })
  }

  let query = supabase
    .from('tracks')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order('title', { ascending: true })
    .range(offset, offset + limit - 1)
  if (artist_id) query = query.eq('artist_id', parseInt(artist_id))
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tracks: (data || []).map(mapTrack), total: count || 0 })
}

function isRealTrack(t: any): boolean {
  return t.title !== t.artists?.name
}

function mapTrack(t: any) {
  const albumList = (t.album_tracks || [])
    .map((at: any) => at.albums ? { id: at.albums.id, title: at.albums.title, year: at.albums.year, position: at.position } : null)
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
    spotify_id: t.spotify_id,
    is_new: t.is_new,
    is_new_date: t.is_new_date,
    cover_url: t.cover_url || null,
    has_lyrics: !!(t.lyrics),
    artists: t.artists,
    artist_name: t.artists?.name || '',
    artist_slug: t.artists?.slug || '',
    featuring_count: (t.track_artists || []).length,
    album_count: albumList.length,
    albums_list: albumList,
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

  return NextResponse.json(track, { status: 201 })
}
